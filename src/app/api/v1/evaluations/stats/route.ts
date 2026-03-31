import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

// GET /api/v1/evaluations/stats - Aggregated evaluation stats
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch all evaluations for this org joined with action_logs for agent_name
  // We'll do a single query pulling evaluations + action_logs agent_name
  const { data: evaluations, error } = await supabase
    .from('evaluations')
    .select('id, score, label, created_at, action_id')
    .eq('org_id', auth.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch evaluations', detail: error.message }, { status: 500 });
  }

  const evals = evaluations || [];
  const totalEvaluations = evals.length;

  if (totalEvaluations === 0) {
    return NextResponse.json({
      avgScore: 0,
      totalEvaluations: 0,
      byAgent: [],
      byLabel: [],
      trend: [],
    });
  }

  // Average score
  const avgScore = Math.round(evals.reduce((sum, e) => sum + e.score, 0) / totalEvaluations);

  // Get agent names for all action_ids in one query
  const actionIds = [...new Set(evals.map((e) => e.action_id))];
  const { data: actions } = await supabase
    .from('action_logs')
    .select('id, agent_name')
    .in('id', actionIds);

  const actionAgentMap: Record<string, string> = {};
  (actions || []).forEach((a: Record<string, unknown>) => {
    if (a?.id && a?.agent_name) {
      actionAgentMap[a.id as string] = a.agent_name as string;
    }
  });

  // By agent
  const agentScores: Record<string, { total: number; count: number }> = {};
  for (const e of evals) {
    const agentName = actionAgentMap[e.action_id] || 'unknown';
    if (!agentScores[agentName]) agentScores[agentName] = { total: 0, count: 0 };
    agentScores[agentName].total += e.score;
    agentScores[agentName].count++;
  }
  const byAgent = Object.entries(agentScores).map(([agent_name, s]) => ({
    agent_name,
    avg_score: Math.round(s.total / s.count),
    count: s.count,
  }));

  // By label
  const labelCounts: Record<string, number> = {};
  for (const e of evals) {
    if (e.label) {
      labelCounts[e.label] = (labelCounts[e.label] || 0) + 1;
    }
  }
  const byLabel = Object.entries(labelCounts).map(([label, count]) => ({ label, count }));

  // Trend: last 30 days grouped by day
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentEvals = evals.filter((e) => new Date(e.created_at) >= thirtyDaysAgo);

  const dailyBuckets: Record<string, { total: number; count: number }> = {};
  for (const e of recentEvals) {
    const date = new Date(e.created_at).toISOString().slice(0, 10); // YYYY-MM-DD
    if (!dailyBuckets[date]) dailyBuckets[date] = { total: 0, count: 0 };
    dailyBuckets[date].total += e.score;
    dailyBuckets[date].count++;
  }
  const trend = Object.entries(dailyBuckets)
    .map(([date, s]) => ({
      date,
      avg_score: Math.round(s.total / s.count),
      count: s.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    avgScore,
    totalEvaluations,
    byAgent,
    byLabel,
    trend,
  });
}
