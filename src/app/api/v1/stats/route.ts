import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Parallel queries — wrapped for safety
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = (p: PromiseLike<any>, fallback: any) =>
    Promise.resolve(p).catch(() => fallback);

  const [totalResult, todayResult, agentsResult, todayLogsResult, weekLogsResult, alertsResult] = await Promise.all([
    safe(supabase.from('action_logs').select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId), { count: 0 }),
    safe(supabase.from('action_logs').select('*', { count: 'exact', head: true }).eq('org_id', auth.orgId).gte('created_at', todayStart.toISOString()), { count: 0 }),
    safe(supabase.from('agents').select('*').eq('org_id', auth.orgId), { data: [] }),
    safe(supabase.from('action_logs').select('estimated_cost_cents, service, status, created_at, agent_name').eq('org_id', auth.orgId).gte('created_at', todayStart.toISOString()).order('created_at', { ascending: false }), { data: [] }),
    safe(supabase.from('action_logs').select('estimated_cost_cents, service, created_at, agent_name').eq('org_id', auth.orgId).gte('created_at', weekAgo.toISOString()).order('created_at', { ascending: true }), { data: [] }),
    safe(supabase.from('anomaly_alerts').select('*').eq('org_id', auth.orgId).is('acknowledged_at', null).order('created_at', { ascending: false }).limit(10), { data: [] }),
  ]);

  const totalActions = totalResult?.count ?? 0;
  const todayActions = todayResult?.count ?? 0;
  const agents = agentsResult?.data ?? [];
  const todayLogs = todayLogsResult?.data ?? [];
  const weekLogs = weekLogsResult?.data ?? [];
  const alerts = alertsResult?.data ?? [];

  // Cost totals
  const todayCostCents = (todayLogs || []).reduce((sum: number, l: any) => sum + (l.estimated_cost_cents || 0), 0);
  const weekCostCents = (weekLogs || []).reduce((sum: number, l: any) => sum + (l.estimated_cost_cents || 0), 0);

  // Service breakdown
  const serviceBreakdown: Record<string, number> = {};
  (todayLogs || []).forEach((l: any) => {
    serviceBreakdown[l.service] = (serviceBreakdown[l.service] || 0) + 1;
  });

  // Agent breakdown
  const agentBreakdown: Record<string, number> = {};
  (todayLogs || []).forEach((l: any) => {
    agentBreakdown[l.agent_name] = (agentBreakdown[l.agent_name] || 0) + 1;
  });

  // Hourly chart data (last 24h)
  const hourlyData: { hour: string; actions: number; cost: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
    const hourLabel = hourStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const hourLogs = (weekLogs || []).filter((l: any) => {
      const t = new Date(l.created_at);
      return t >= hourStart && t < hourEnd;
    });
    hourlyData.push({
      hour: hourLabel,
      actions: hourLogs.length,
      cost: hourLogs.reduce((s: number, l: any) => s + (l.estimated_cost_cents || 0), 0) / 100,
    });
  }

  // Error rate
  const errorCount = (todayLogs || []).filter((l: any) => l.status === 'error').length;
  const blockedCount = (todayLogs || []).filter((l: any) => l.status === 'blocked').length;

  // Enrich agents with aggregated totals
  // Note: total_actions comes from agent's full history, not just 7 days
  const enrichedAgents = await Promise.all((agents || []).map(async (agent: any) => {
    // All-time count for this agent
    const { count: allTimeCount } = await safe(
      supabase.from('action_logs').select('*', { count: 'exact', head: true })
        .eq('org_id', auth.orgId).eq('agent_name', agent.name),
      { count: 0 }
    );
    // All-time cost for this agent
    const { data: allCostData } = await safe(
      supabase.from('action_logs').select('estimated_cost_cents')
        .eq('org_id', auth.orgId).eq('agent_name', agent.name),
      { data: [] }
    );
    const totalCost = (allCostData || []).reduce((s: number, l: any) => s + (l.estimated_cost_cents || 0), 0);
    
    return {
      ...agent,
      total_actions: allTimeCount || 0,
      total_cost_cents: totalCost,
      last_active_at: agent.last_active_at || agent.updated_at || agent.created_at,
    };
  }));

  return NextResponse.json({
    totalActions: totalActions || 0,
    todayActions: todayActions || 0,
    todayCostCents,
    weekCostCents,
    activeAgents: (agents || []).filter((a: any) => a.status === 'active').length,
    totalAgents: (agents || []).length,
    agents: enrichedAgents,
    errorCount,
    blockedCount,
    serviceBreakdown,
    agentBreakdown,
    hourlyData,
    alerts: (alerts || []).map((a: any) => ({
      ...a,
      acknowledged: !!a.acknowledged_at,
    })),
  });
}
