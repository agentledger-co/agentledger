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

  const [
    { count: totalActions },
    { count: todayActions },
    { data: costData },
    { data: todayCostData },
  ] = await Promise.all([
    supabase.from('action_logs').select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId).eq('agent_name', name),
    supabase.from('action_logs').select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId).eq('agent_name', name).gte('created_at', todayStart.toISOString()),
    supabase.from('action_logs').select('estimated_cost_cents').eq('org_id', auth.orgId).eq('agent_name', name),
    supabase.from('action_logs').select('estimated_cost_cents').eq('org_id', auth.orgId).eq('agent_name', name).gte('created_at', todayStart.toISOString()),
  ]);

  const totalCostCents = costData?.reduce((sum, row) => sum + (row.estimated_cost_cents || 0), 0) || 0;
  const todayCostCents = todayCostData?.reduce((sum, row) => sum + (row.estimated_cost_cents || 0), 0) || 0;

  return NextResponse.json({
    name: agent.name,
    status: agent.status,
    totalActions: totalActions || 0,
    totalCostCents,
    todayActions: todayActions || 0,
    todayCostCents,
  });
}
