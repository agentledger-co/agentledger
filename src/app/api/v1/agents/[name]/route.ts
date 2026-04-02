import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await params;
  const supabase = createServiceClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('org_id', auth.orgId)
    .eq('name', name)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Single query: fetch all cost values, then partition in JS for today vs total
  const { data: allLogs, count: totalActions } = await supabase
    .from('action_logs')
    .select('estimated_cost_cents, created_at', { count: 'exact' })
    .eq('org_id', auth.orgId)
    .eq('agent_name', name);

  const rows = allLogs || [];
  let totalCostCents = 0;
  let todayActions = 0;
  let todayCostCents = 0;
  const todayIso = todayStart.toISOString();

  for (const row of rows) {
    const cost = row.estimated_cost_cents || 0;
    totalCostCents += cost;
    if (row.created_at >= todayIso) {
      todayActions++;
      todayCostCents += cost;
    }
  }

  return NextResponse.json({
    name: agent.name,
    status: agent.status,
    totalActions: totalActions || 0,
    totalCostCents,
    todayActions,
    todayCostCents,
  });
}
