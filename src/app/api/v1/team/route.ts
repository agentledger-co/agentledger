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

// GET /api/v1/team — List team members
export async function GET(req: NextRequest) {
  const ctx = await getMemberContext(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: members, error } = await supabase
    .from('org_members')
    .select('id, user_id, role, created_at')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch team members', detail: error.message }, { status: 500 });
  }

  // Fetch user emails from auth.users via admin API
  const enriched = await Promise.all(
    (members || []).map(async (m) => {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          email: user?.email || 'unknown',
          role: m.role,
          created_at: m.created_at,
        };
      } catch {
        return {
          id: m.id,
          user_id: m.user_id,
          email: 'unknown',
          role: m.role,
          created_at: m.created_at,
        };
      }
    })
  );

  return NextResponse.json({ members: enriched, currentRole: ctx.role });
}

// DELETE /api/v1/team?user_id=... — Remove a team member
export async function DELETE(req: NextRequest) {
  const ctx = await getMemberContext(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageTeam(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get('user_id');
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing required query param: user_id' }, { status: 400 });
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
    return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 403 });
  }

  const { error } = await supabase
    .from('org_members')
    .delete()
    .eq('org_id', ctx.orgId)
    .eq('user_id', targetUserId);

  if (error) {
    return NextResponse.json({ error: 'Failed to remove member', detail: error.message }, { status: 500 });
  }

  logAudit({
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: 'member.removed',
    resourceType: 'team',
    resourceId: targetUserId,
    details: { removed_user_id: targetUserId },
  });

  return NextResponse.json({ deleted: true });
}
