import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

// GET /api/v1/rollback-hooks/executions - List rollback executions
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50') || 50, 1), 200);

  const { data: executions, error } = await supabase
    .from('rollback_executions')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch rollback executions', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ executions: executions || [] });
}
