import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { createServiceClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';

// POST /api/v1/team/invite/accept — Accept an invite
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) {
    return NextResponse.json({ error: 'Missing required field: token' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Find invite by token
  const { data: invite, error: findError } = await supabase
    .from('team_invites')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single();

  if (findError || !invite) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 });
  }

  // Check not expired
  if (new Date(invite.expires_at) < new Date()) {
    await supabase
      .from('team_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });
  }

  // Check user not already a member
  const { data: existing } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', invite.org_id)
    .eq('user_id', userId)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'You are already a member of this organization' }, { status: 409 });
  }

  // Create org_members entry
  const { error: insertError } = await supabase
    .from('org_members')
    .insert({
      org_id: invite.org_id,
      user_id: userId,
      role: invite.role,
    });

  if (insertError) {
    return NextResponse.json({ error: 'Failed to join organization', detail: insertError.message }, { status: 500 });
  }

  // Mark invite as accepted
  await supabase
    .from('team_invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);

  logAudit({
    orgId: invite.org_id,
    userId,
    userEmail: invite.email,
    action: 'invite.accepted',
    resourceType: 'team_invite',
    resourceId: invite.id,
    details: { role: invite.role },
  });

  return NextResponse.json({ accepted: true, org_id: invite.org_id, role: invite.role });
}
