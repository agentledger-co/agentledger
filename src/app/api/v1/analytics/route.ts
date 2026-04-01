import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeString } from '@/lib/validate';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7') || 7, 1), 90);
  const agent = sanitizeString(url.searchParams.get('agent') ?? undefined);
  const service = sanitizeString(url.searchParams.get('service') ?? undefined);
  const environment = sanitizeString(url.searchParams.get('environment') ?? undefined);
  const granularity = url.searchParams.get('granularity') === 'hourly' ? 'hourly' : 'daily';

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = (p: PromiseLike<any>, fallback: any) =>
    Promise.resolve(p).catch(() => fallback);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    if (agent) q = q.eq('agent_name', agent);
    if (service) q = q.eq('service', service);
    if (environment) q = q.eq('environment', environment);
    return q;
  };

  const [logsResult] = await Promise.all([
    safe(
      applyFilters(
        supabase
          .from('action_logs')
          .select('agent_name, service, action, status, estimated_cost_cents, duration_ms, created_at')
          .eq('org_id', auth.orgId)
          .gte('created_at', since)
          .order('created_at', { ascending: true })
          .limit(50000)
      ),
      { data: [] }
    ),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs: any[] = logsResult?.data ?? [];

  // Build time-series data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeSeriesMap = new Map<string, { actions: number; cost: number; errors: number; blocked: number; avgDuration: number; durations: number[] }>();

  for (const log of logs) {
    const date = new Date(log.created_at);
    const key = granularity === 'hourly'
      ? `${date.toISOString().slice(0, 13)}:00:00Z`
      : date.toISOString().slice(0, 10);

    if (!timeSeriesMap.has(key)) {
      timeSeriesMap.set(key, { actions: 0, cost: 0, errors: 0, blocked: 0, avgDuration: 0, durations: [] });
    }
    const bucket = timeSeriesMap.get(key)!;
    bucket.actions++;
    bucket.cost += log.estimated_cost_cents || 0;
    if (log.status === 'error') bucket.errors++;
    if (log.status === 'blocked') bucket.blocked++;
    bucket.durations.push(log.duration_ms || 0);
  }

  const timeSeries = Array.from(timeSeriesMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, data]) => ({
      period,
      actions: data.actions,
      costCents: data.cost,
      errors: data.errors,
      blocked: data.blocked,
      avgDurationMs: data.durations.length > 0 ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length) : 0,
    }));

  // Service breakdown over the full period
  const serviceStats = new Map<string, { actions: number; cost: number; errors: number }>();
  for (const log of logs) {
    if (!serviceStats.has(log.service)) {
      serviceStats.set(log.service, { actions: 0, cost: 0, errors: 0 });
    }
    const s = serviceStats.get(log.service)!;
    s.actions++;
    s.cost += log.estimated_cost_cents || 0;
    if (log.status === 'error') s.errors++;
  }

  // Agent breakdown over the full period
  const agentStats = new Map<string, { actions: number; cost: number; errors: number; avgDurationMs: number; durations: number[] }>();
  for (const log of logs) {
    if (!agentStats.has(log.agent_name)) {
      agentStats.set(log.agent_name, { actions: 0, cost: 0, errors: 0, avgDurationMs: 0, durations: [] });
    }
    const a = agentStats.get(log.agent_name)!;
    a.actions++;
    a.cost += log.estimated_cost_cents || 0;
    if (log.status === 'error') a.errors++;
    a.durations.push(log.duration_ms || 0);
  }

  // Summary stats
  const totalActions = logs.length;
  const totalCostCents = logs.reduce((sum, l) => sum + (l.estimated_cost_cents || 0), 0);
  const totalErrors = logs.filter(l => l.status === 'error').length;
  const totalBlocked = logs.filter(l => l.status === 'blocked').length;
  const allDurations = logs.map(l => l.duration_ms || 0);
  const avgDurationMs = allDurations.length > 0 ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length) : 0;

  // Day-over-day comparison (compare first half vs second half of the period)
  const midpoint = new Date(Date.now() - (days / 2) * 24 * 60 * 60 * 1000);
  const firstHalf = logs.filter(l => new Date(l.created_at) < midpoint);
  const secondHalf = logs.filter(l => new Date(l.created_at) >= midpoint);
  const firstHalfCost = firstHalf.reduce((sum, l) => sum + (l.estimated_cost_cents || 0), 0);
  const secondHalfCost = secondHalf.reduce((sum, l) => sum + (l.estimated_cost_cents || 0), 0);
  const costTrendPct = firstHalfCost > 0 ? Math.round(((secondHalfCost - firstHalfCost) / firstHalfCost) * 100) : 0;
  const actionsTrendPct = firstHalf.length > 0 ? Math.round(((secondHalf.length - firstHalf.length) / firstHalf.length) * 100) : 0;

  return NextResponse.json({
    summary: {
      days,
      granularity,
      totalActions,
      totalCostCents,
      totalErrors,
      totalBlocked,
      avgDurationMs,
      errorRate: totalActions > 0 ? Math.round((totalErrors / totalActions) * 1000) / 10 : 0,
      costTrendPct,
      actionsTrendPct,
    },
    timeSeries,
    serviceBreakdown: Array.from(serviceStats.entries())
      .map(([name, stats]) => ({ service: name, ...stats }))
      .sort((a, b) => b.cost - a.cost),
    agentBreakdown: Array.from(agentStats.entries())
      .map(([name, stats]) => ({
        agent: name,
        actions: stats.actions,
        costCents: stats.cost,
        errors: stats.errors,
        avgDurationMs: stats.durations.length > 0 ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length) : 0,
      }))
      .sort((a, b) => b.costCents - a.costCents),
  });
}
