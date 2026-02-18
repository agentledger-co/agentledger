import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

// GET /api/v1/alerts - List unacknowledged alerts
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(req.url);
  const showAll = url.searchParams.get('all') === 'true';

  let query = supabase
    .from('anomaly_alerts')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!showAll) {
    query = query.is('acknowledged_at', null);
  }

  const { data: alerts, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch alerts', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: alerts || [] });
}
