import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

// GET /api/v1/audit — List audit logs (API key auth)
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50') || 50, 200);
  const resourceType = url.searchParams.get('resource_type');
  const action = url.searchParams.get('action');

  const supabase = createServiceClient();

  let query = supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (resourceType) {
    query = query.eq('resource_type', resourceType);
  }
  if (action) {
    query = query.eq('action', action);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch audit logs', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data || [] });
}
