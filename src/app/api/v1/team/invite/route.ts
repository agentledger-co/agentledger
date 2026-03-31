import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { createServiceClient } from '@/lib/supabase';
import { canManageTeam } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import { randomBytes } from 'crypto';

async function getMemberContext(req: NextRequest) {
  const userId = await getAuthenticatedUser(req);
  if (!userId) return null;

  const supabase = createServiceClient();
  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', userId)
    .single();

  if (!member) return null;
  return { userId, orgId: member.org_id, role: member.role };
}

const VALID_ROLES = ['admin', 'member', 'viewer'] as const;

// POST /api/v1/team/invite — Create an invite
export async function POST(req: NextRequest) {
  const ctx = await getMemberContext(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageTeam(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body.role === 'string' ? body.role : 'member';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  const token = randomBytes(32).toString('hex');
  const supabase = createServiceClient();

  const { data: invite, error } = await supabase
    .from('team_invites')
    .insert({
      org_id: ctx.orgId,
      email,
      role,
      invited_by: ctx.userId,
      token,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create invite', detail: error.message }, { status: 500 });
  }

  logAudit({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: 'invite.created',
    resourceType: 'team_invite',
    resourceId: invite.id,
    details: { email, role },
  });

  return NextResponse.json({ invite }, { status: 201 });
}

// GET /api/v1/team/invite — List pending invites
export async function GET(req: NextRequest) {
  const ctx = await getMemberContext(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: invites, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('org_id', ctx.orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch invites', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ invites: invites || [] });
}

// DELETE /api/v1/team/invite?id=... — Revoke an invite
export async function DELETE(req: NextRequest) {
  const ctx = await getMemberContext(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageTeam(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: invite, error } = await supabase
    .from('team_invites')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error || !invite) {
    return NextResponse.json({ error: 'Invite not found or already processed' }, { status: 404 });
  }

  logAudit({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: 'invite.revoked',
    resourceType: 'team_invite',
    resourceId: id,
    details: { email: invite.email },
  });

  return NextResponse.json({ revoked: true });
}
