import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { createServiceClient } from '@/lib/supabase';

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

// GET /api/v1/team/audit — List audit logs (admin/owner only, cookie auth for dashboard)
export async function GET(req: NextRequest) {
  const ctx = await getMemberContext(req);
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin or owner role required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50') || 50, 200);

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }

  return NextResponse.json({ logs: data || [] });
}
