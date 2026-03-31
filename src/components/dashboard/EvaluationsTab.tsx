'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface EvalStats {
  avgScore: number;
  totalEvaluations: number;
  trend: { date: string; avg_score: number; count: number }[];
  byAgent: { agent_name: string; avg_score: number; count: number }[];
  byLabel: { label: string; count: number }[];
}

interface Evaluation {
  id: string;
  action_id: string | null;
  agent_name: string;
  score: number;
  label: string | null;
  feedback: string | null;
  evaluated_by: string | null;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function scoreBgColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreBadgeBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (score >= 50) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-red-500/10 text-red-400 border-red-500/20';
}

const LABEL_COLORS: Record<string, string> = {
  good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  bad: 'bg-red-500/10 text-red-400 border-red-500/20',
  neutral: 'bg-white/[0.04] text-white/40 border-white/[0.06]',
  harmful: 'bg-red-500/10 text-red-400 border-red-500/20',
  helpful: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  accurate: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  inaccurate: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export default function EvaluationsTab({ apiKey, onToast }: { apiKey: string; onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [evalStats, setEvalStats] = useState<EvalStats | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, evalsRes] = await Promise.all([
        fetch('/api/v1/evaluations/stats', { headers: { Authorization: `Bearer ${apiKey}` } }),
        fetch('/api/v1/evaluations?limit=20', { headers: { Authorization: `Bearer ${apiKey}` } }),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setEvalStats(data);
      }

      if (evalsRes.ok) {
        const data = await evalsRes.json();
        setEvaluations(data.evaluations || []);
      }
    } catch {
      onToast('Failed to load evaluation data', 'error');
    }
    setLoading(false);
  }, [apiKey, onToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="text-white/30 text-center py-16">Loading evaluations...</div>;

  if (!evalStats || (evalStats.totalEvaluations === 0 && evaluations.length === 0)) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-white/70">Evaluations</h3>
          <p className="text-xs text-white/30 mt-0.5">Track agent quality scores, labels, and feedback over time.</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-8 text-center">
          <div className="text-2xl mb-3 opacity-30">&#x1F4CA;</div>
          <p className="text-white/30 text-sm font-medium mb-2">No evaluations yet</p>
          <p className="text-white/15 text-xs">Submit evaluations via the API to track agent quality and performance over time.</p>
        </div>
      </div>
    );
  }

  const labelCounts = (evalStats.byLabel || []).map(l => l.count);
  const agentCounts = (evalStats.byAgent || []).map(a => a.count);
  const maxLabelCount = labelCounts.length > 0 ? Math.max(...labelCounts) : 1;
  const maxAgentCount = agentCounts.length > 0 ? Math.max(...agentCounts) : 1;
  const topAgent = evalStats.byAgent?.length > 0
    ? [...evalStats.byAgent].sort((a, b) => b.avg_score - a.avg_score)[0]
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-white/70">Evaluations</h3>
        <p className="text-xs text-white/30 mt-0.5">Track agent quality scores, labels, and feedback over time.</p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Average Score</p>
          <p className={`text-3xl font-bold ${scoreColor(evalStats.avgScore)}`}>
            {evalStats.avgScore.toFixed(1)}
          </p>
          <p className="text-[11px] text-white/20 mt-1">out of 100</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Total Evaluations</p>
          <p className="text-3xl font-bold text-white/80">{evalStats.totalEvaluations.toLocaleString()}</p>
          <p className="text-[11px] text-white/20 mt-1">all time</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Top Agent</p>
          {topAgent ? (
            <>
              <p className="text-lg font-semibold text-white/70 truncate">{topAgent.agent_name}</p>
              <p className={`text-[13px] mt-0.5 ${scoreColor(topAgent.avg_score)}`}>
                {topAgent.avg_score.toFixed(1)} avg score
              </p>
            </>
          ) : (
            <p className="text-white/20 text-sm">No data</p>
          )}
        </div>
      </div>

      {/* Score trend chart */}
      {evalStats.trend && evalStats.trend.length > 1 && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <h4 className="text-sm font-medium text-white/60 mb-4">Score Trend</h4>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={evalStats.trend}>
              <defs>
                <linearGradient id="evalScoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis
                dataKey="date"
                stroke="#ffffff30"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="#ffffff30"
                fontSize={11}
                tickLine={false}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number | undefined) => [(value ?? 0).toFixed(1), 'Avg Score']}
              />
              <Area
                type="monotone"
                dataKey="avg_score"
                stroke="#3b82f6"
                fill="url(#evalScoreGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-agent breakdown */}
      {evalStats.byAgent && evalStats.byAgent.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h4 className="text-sm font-medium text-white/60">Per-Agent Breakdown</h4>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-[11px] text-white/30 font-medium px-4 py-3">Agent</th>
                <th className="text-left text-[11px] text-white/30 font-medium px-4 py-3">Avg Score</th>
                <th className="text-left text-[11px] text-white/30 font-medium px-4 py-3 hidden sm:table-cell">Evaluations</th>
                <th className="text-left text-[11px] text-white/30 font-medium px-4 py-3 w-1/3">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {evalStats.byAgent.map(agent => (
                <tr key={agent.agent_name} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white/70 font-medium">{agent.agent_name}</td>
                  <td className={`px-4 py-3 font-medium ${scoreColor(agent.avg_score)}`}>{agent.avg_score.toFixed(1)}</td>
                  <td className="px-4 py-3 text-white/40 hidden sm:table-cell">{agent.count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${scoreBgColor(agent.avg_score)}`}
                          style={{ width: `${agent.avg_score}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-white/30 w-8 text-right">{Math.round(agent.avg_score)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Label distribution */}
      {evalStats.byLabel && evalStats.byLabel.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <h4 className="text-sm font-medium text-white/60 mb-4">Label Distribution</h4>
          <div className="space-y-2.5">
            {evalStats.byLabel.map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-[13px] text-white/50 w-24 truncate">{item.label}</span>
                <div className="flex-1 h-5 bg-white/[0.04] rounded-md overflow-hidden">
                  <div
                    className="h-full bg-blue-500/40 rounded-md flex items-center px-2"
                    style={{ width: `${Math.max((item.count / maxLabelCount) * 100, 8)}%` }}
                  >
                    <span className="text-[10px] text-white/60 font-medium">{item.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent evaluations */}
      {evaluations.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h4 className="text-sm font-medium text-white/60">Recent Evaluations</h4>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {evaluations.map(evaluation => (
              <div key={evaluation.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[13px] text-white/60 font-medium">{evaluation.agent_name}</span>
                      {evaluation.action_id && (
                        <span className="text-[10px] text-white/20 font-mono">#{evaluation.action_id.slice(0, 8)}</span>
                      )}
                      {evaluation.label && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${LABEL_COLORS[evaluation.label.toLowerCase()] || 'bg-white/[0.04] text-white/40 border-white/[0.06]'}`}>
                          {evaluation.label}
                        </span>
                      )}
                    </div>
                    {evaluation.feedback && (
                      <p className="text-[12px] text-white/30 line-clamp-2">{evaluation.feedback}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-white/20">
                      {evaluation.evaluated_by && <span>by {evaluation.evaluated_by}</span>}
                      <span>{timeAgo(evaluation.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${scoreBadgeBg(evaluation.score)}`}>
                      {evaluation.score}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
