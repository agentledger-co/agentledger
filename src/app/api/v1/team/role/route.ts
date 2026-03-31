import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { createServiceClient } from '@/lib/supabase';
import { canManageTeam } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';

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

// PATCH /api/v1/team/role — Change a member's role
export async function PATCH(req: NextRequest) {
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

  const targetUserId = typeof body.userId === 'string' ? body.userId : '';
  const newRole = typeof body.role === 'string' ? body.role : '';

  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing required field: userId' }, { status: 400 });
  }

  if (!VALID_ROLES.includes(newRole as typeof VALID_ROLES[number])) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check target is not owner
  const { data: targetMember } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', ctx.orgId)
    .eq('user_id', targetUserId)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (targetMember.role === 'owner') {
    return NextResponse.json({ error: 'Cannot change the owner role' }, { status: 403 });
  }

  const { error } = await supabase
    .from('org_members')
    .update({ role: newRole })
    .eq('org_id', ctx.orgId)
    .eq('user_id', targetUserId);

  if (error) {
    return NextResponse.json({ error: 'Failed to update role', detail: error.message }, { status: 500 });
  }

  logAudit({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: 'member.role_changed',
    resourceType: 'team',
    resourceId: targetUserId,
    details: { from: targetMember.role, to: newRole },
  });

  return NextResponse.json({ updated: true, role: newRole });
}
