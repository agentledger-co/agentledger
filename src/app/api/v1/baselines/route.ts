import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

// GET /api/v1/baselines - List baselines for org, optionally filtered by agent
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(req.url);
  const agent = url.searchParams.get('agent');

  let query = supabase
    .from('agent_baselines')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('agent_name')
    .order('metric');

  if (agent) {
    query = query.eq('agent_name', agent);
  }

  const { data: baselines, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch baselines', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ baselines: baselines || [] });
}
