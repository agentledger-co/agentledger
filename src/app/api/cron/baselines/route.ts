import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * Hourly cron job: Recompute statistical baselines for anomaly detection.
 *
 * For each org & active agent, computes rolling 7-day baselines:
 *   - actions_per_hour
 *   - cost_per_action
 *   - duration_per_action
 *   - error_rate
 *   - service_distribution
 *
 * Runs hourly via Vercel Cron.
 */
export async function GET(req: NextRequest) {
  // Auth: accept either CRON_SECRET or Vercel's built-in cron header
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const vercelCron = req.headers.get('x-vercel-cron-signature');

  const isAuthorized = (cronSecret && authHeader === `Bearer ${cronSecret}`) || vercelCron;
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!cronSecret && !vercelCron) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  let baselinesUpdated = 0;
  let agentsProcessed = 0;

  // Get all orgs
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('id');

  if (orgsError || !orgs) {
    return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
  }

  for (const org of orgs) {
    // Get distinct active agents for this org (active in last 7 days)
    const { data: agents, error: agentsError } = await supabase
      .from('action_logs')
      .select('agent_name')
      .eq('org_id', org.id)
      .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1000);

    if (agentsError || !agents) continue;
    if (agents.length === 1000) {
      console.warn(`[baselines] Org ${org.id} hit 1000 agent limit — some agents may be skipped`);
    }

    // Deduplicate agent names
    const agentNames = [...new Set(agents.map((a) => a.agent_name))];

    for (const agentName of agentNames) {
      agentsProcessed++;

      try {
        const upserts = await computeBaselines(supabase, org.id, agentName);
        if (upserts.length > 0) {
          const { error: upsertError } = await supabase
            .from('agent_baselines')
            .upsert(upserts, { onConflict: 'org_id,agent_name,metric' });

          if (!upsertError) {
            baselinesUpdated += upserts.length;
          }
        }
      } catch {
        // Continue processing other agents on failure
      }
    }
  }

  return NextResponse.json({
    message: 'Baselines computation complete.',
    agentsProcessed,
    baselinesUpdated,
    timestamp: now.toISOString(),
  });
}

interface BaselineRow {
  org_id: string;
  agent_name: string;
  metric: string;
  baseline_value: number;
  stddev: number;
  sample_size: number;
  metadata: Record<string, unknown>;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeBaselines(supabase: any, orgId: string, agentName: string): Promise<BaselineRow[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const upserts: BaselineRow[] = [];

  // 1. actions_per_hour: hourly counts over 7 days
  const { data: hourlyData } = await supabase.rpc('compute_actions_per_hour', {
    p_org_id: orgId,
    p_agent_name: agentName,
    p_since: sevenDaysAgo,
  });

  // Fallback: if RPC not available, compute in-app from raw query
  // We'll use a simpler approach with the Supabase client
  if (!hourlyData) {
    // Query raw data and compute in batches
    const actionsPerHour = await computeActionsPerHour(supabase, orgId, agentName, sevenDaysAgo);
    if (actionsPerHour) {
      upserts.push({
        org_id: orgId,
        agent_name: agentName,
        metric: 'actions_per_hour',
        baseline_value: actionsPerHour.avg,
        stddev: actionsPerHour.stddev,
        sample_size: actionsPerHour.samples,
        metadata: {},
        updated_at: now.toISOString(),
      });
    }
  } else if (hourlyData.length > 0) {
    const row = hourlyData[0];
    upserts.push({
      org_id: orgId,
      agent_name: agentName,
      metric: 'actions_per_hour',
      baseline_value: Number(row.avg_val) || 0,
      stddev: Number(row.std_val) || 0,
      sample_size: Number(row.samples) || 0,
      metadata: {},
      updated_at: now.toISOString(),
    });
  }

  // 2. cost_per_action: AVG and STDDEV of estimated_cost_cents
  const { data: costData } = await supabase
    .from('action_logs')
    .select('estimated_cost_cents')
    .eq('org_id', orgId)
    .eq('agent_name', agentName)
    .gte('created_at', sevenDaysAgo);

  if (costData && costData.length > 0) {
    const costs = costData.map((r: { estimated_cost_cents: number }) => r.estimated_cost_cents);
    const { avg, stddev } = computeStats(costs);
    upserts.push({
      org_id: orgId,
      agent_name: agentName,
      metric: 'cost_per_action',
      baseline_value: avg,
      stddev,
      sample_size: costs.length,
      metadata: {},
      updated_at: now.toISOString(),
    });
  }

  // 3. duration_per_action: AVG and STDDEV of duration_ms
  const { data: durationData } = await supabase
    .from('action_logs')
    .select('duration_ms')
    .eq('org_id', orgId)
    .eq('agent_name', agentName)
    .gte('created_at', sevenDaysAgo);

  if (durationData && durationData.length > 0) {
    const durations = durationData.map((r: { duration_ms: number }) => r.duration_ms);
    const { avg, stddev } = computeStats(durations);
    upserts.push({
      org_id: orgId,
      agent_name: agentName,
      metric: 'duration_per_action',
      baseline_value: avg,
      stddev,
      sample_size: durations.length,
      metadata: {},
      updated_at: now.toISOString(),
    });
  }

  // 4. error_rate: percentage of errors per hour
  const { data: statusData } = await supabase
    .from('action_logs')
    .select('status, created_at')
    .eq('org_id', orgId)
    .eq('agent_name', agentName)
    .gte('created_at', sevenDaysAgo);

  if (statusData && statusData.length > 0) {
    // Group by hour and compute error rate per hour
    const hourlyErrors = new Map<string, { total: number; errors: number }>();
    for (const row of statusData) {
      const hour = (row.created_at as string).slice(0, 13); // YYYY-MM-DDTHH
      const entry = hourlyErrors.get(hour) || { total: 0, errors: 0 };
      entry.total++;
      if (row.status === 'error') entry.errors++;
      hourlyErrors.set(hour, entry);
    }

    const rates = Array.from(hourlyErrors.values()).map((h) =>
      h.total > 0 ? (h.errors / h.total) * 100 : 0
    );
    const { avg, stddev } = computeStats(rates);
    upserts.push({
      org_id: orgId,
      agent_name: agentName,
      metric: 'error_rate',
      baseline_value: avg,
      stddev,
      sample_size: rates.length,
      metadata: {},
      updated_at: now.toISOString(),
    });
  }

  // 5. service_distribution: JSON of {service: percentage}
  const { data: serviceData } = await supabase
    .from('action_logs')
    .select('service')
    .eq('org_id', orgId)
    .eq('agent_name', agentName)
    .gte('created_at', sevenDaysAgo);

  if (serviceData && serviceData.length > 0) {
    const serviceCounts = new Map<string, number>();
    for (const row of serviceData) {
      serviceCounts.set(row.service, (serviceCounts.get(row.service) || 0) + 1);
    }
    const total = serviceData.length;
    const distribution: Record<string, number> = {};
    for (const [service, count] of serviceCounts) {
      distribution[service] = Math.round((count / total) * 10000) / 100; // percentage with 2 decimals
    }
    upserts.push({
      org_id: orgId,
      agent_name: agentName,
      metric: 'service_distribution',
      baseline_value: 0,
      stddev: 0,
      sample_size: total,
      metadata: distribution,
      updated_at: now.toISOString(),
    });
  }

  return upserts;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeActionsPerHour(supabase: any, orgId: string, agentName: string, since: string) {
  // Fetch created_at timestamps and bucket by hour client-side
  const { data } = await supabase
    .from('action_logs')
    .select('created_at')
    .eq('org_id', orgId)
    .eq('agent_name', agentName)
    .gte('created_at', since);

  if (!data || data.length === 0) return null;

  const hourlyCounts = new Map<string, number>();
  for (const row of data) {
    const hour = (row.created_at as string).slice(0, 13);
    hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
  }

  const counts = Array.from(hourlyCounts.values());
  const { avg, stddev } = computeStats(counts);
  return { avg, stddev, samples: counts.length };
}

function computeStats(values: number[]): { avg: number; stddev: number } {
  if (values.length === 0) return { avg: 0, stddev: 0 };
  const n = values.length;
  const avg = values.reduce((sum, v) => sum + v, 0) / n;
  if (n < 2) return { avg, stddev: 0 };
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (n - 1); // sample stddev
  return { avg, stddev: Math.sqrt(variance) };
}
