import { createServiceClient } from './supabase';

export interface ForecastResult {
  agent: string;
  currentPeriodCostCents: number;
  projectedCostCents: number;
  dailyAverageCostCents: number;
  daysAnalyzed: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPct: number; // percentage change
  budgetWarning: boolean;
  budgetMaxCents: number | null;
  projectedExceedsAt: string | null; // ISO date when budget will be exceeded
}

export interface OrgForecast {
  totalProjectedCostCents: number;
  totalDailyAverageCents: number;
  agents: ForecastResult[];
  generatedAt: string;
  periodDays: number;
}

/**
 * Generate cost forecasts for all agents in an org.
 * Uses linear regression on daily cost data from the past N days.
 */
export async function generateForecast(orgId: string, daysBack: number = 30, forecastDays: number = 30, environment?: string): Promise<OrgForecast> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  // Fetch action logs with cost data
  let query = supabase
    .from('action_logs')
    .select('agent_name, estimated_cost_cents, created_at')
    .eq('org_id', orgId)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (environment) query = query.eq('environment', environment);

  const { data: logs, error } = await query;
  if (error || !logs || logs.length === 0) {
    return { totalProjectedCostCents: 0, totalDailyAverageCents: 0, agents: [], generatedAt: new Date().toISOString(), periodDays: forecastDays };
  }

  // Fetch budgets for warning calculation
  const { data: budgets } = await supabase
    .from('budgets')
    .select('agent_id, max_cost_cents, period, current_cost_cents')
    .eq('org_id', orgId);

  // Fetch agent id mapping
  let agentQuery = supabase.from('agents').select('id, name').eq('org_id', orgId);
  if (environment) agentQuery = agentQuery.eq('environment', environment);
  const { data: agents } = await agentQuery;
  const agentIdMap = new Map<string, string>();
  (agents || []).forEach((a: any) => agentIdMap.set(a.name, a.id));

  // Group logs by agent and day
  const agentDailyData = new Map<string, Map<string, number>>();
  for (const log of logs) {
    const name = log.agent_name;
    const day = log.created_at.slice(0, 10); // YYYY-MM-DD
    if (!agentDailyData.has(name)) agentDailyData.set(name, new Map());
    const dayMap = agentDailyData.get(name)!;
    dayMap.set(day, (dayMap.get(day) || 0) + (log.estimated_cost_cents || 0));
  }

  const results: ForecastResult[] = [];

  for (const [agentName, dayMap] of agentDailyData) {
    const days = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const n = days.length;
    if (n === 0) continue;

    // Calculate daily average
    const totalCost = days.reduce((sum, [, cost]) => sum + cost, 0);
    const dailyAvg = totalCost / n;

    // Simple linear regression for trend
    const costs = days.map(([, cost]) => cost);
    const xMean = (n - 1) / 2;
    const yMean = costs.reduce((a, b) => a + b, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (costs[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Trend detection
    const trendPct = yMean > 0 ? (slope / yMean) * 100 : 0;
    const trend: 'increasing' | 'decreasing' | 'stable' =
      trendPct > 5 ? 'increasing' : trendPct < -5 ? 'decreasing' : 'stable';

    // Project forward using the trend line
    const projectedDailyAtEnd = yMean + slope * (n + forecastDays / 2);
    const projectedTotal = Math.max(0, Math.round(projectedDailyAtEnd * forecastDays));

    // Budget warning check
    const agentId = agentIdMap.get(agentName);
    const agentBudgets = (budgets || []).filter((b: any) => b.agent_id === agentId);
    const monthlyBudget = agentBudgets.find((b: any) => b.period === 'monthly');
    const budgetMaxCents = monthlyBudget?.max_cost_cents || null;
    const currentCost = monthlyBudget?.current_cost_cents || 0;
    let projectedExceedsAt: string | null = null;
    let budgetWarning = false;

    if (budgetMaxCents && dailyAvg > 0) {
      const remaining = budgetMaxCents - currentCost;
      if (remaining > 0) {
        const daysUntilExceeded = remaining / dailyAvg;
        if (daysUntilExceeded < forecastDays) {
          budgetWarning = true;
          const exceedDate = new Date(Date.now() + daysUntilExceeded * 24 * 60 * 60 * 1000);
          projectedExceedsAt = exceedDate.toISOString();
        }
      } else {
        budgetWarning = true;
        projectedExceedsAt = new Date().toISOString();
      }
    }

    results.push({
      agent: agentName,
      currentPeriodCostCents: currentCost,
      projectedCostCents: projectedTotal,
      dailyAverageCostCents: Math.round(dailyAvg),
      daysAnalyzed: n,
      trend,
      trendPct: Math.round(trendPct * 10) / 10,
      budgetWarning,
      budgetMaxCents,
      projectedExceedsAt,
    });
  }

  return {
    totalProjectedCostCents: results.reduce((sum, r) => sum + r.projectedCostCents, 0),
    totalDailyAverageCents: results.reduce((sum, r) => sum + r.dailyAverageCostCents, 0),
    agents: results.sort((a, b) => b.projectedCostCents - a.projectedCostCents),
    generatedAt: new Date().toISOString(),
    periodDays: forecastDays,
  };
}
