'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AnalyticsData {
  summary: {
    days: number;
    granularity: string;
    totalActions: number;
    totalCostCents: number;
    totalErrors: number;
    totalBlocked: number;
    avgDurationMs: number;
    errorRate: number;
    costTrendPct: number;
    actionsTrendPct: number;
  };
  timeSeries: { period: string; actions: number; costCents: number; errors: number; blocked: number; avgDurationMs: number }[];
  serviceBreakdown: { service: string; actions: number; cost: number; errors: number }[];
  agentBreakdown: { agent: string; actions: number; costCents: number; errors: number; avgDurationMs: number }[];
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function trendIndicator(pct: number): string {
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return '0%';
}

export default function AnalyticsTab({ apiKey }: { apiKey: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [granularity, setGranularity] = useState<'daily' | 'hourly'>('daily');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/analytics?days=${days}&granularity=${granularity}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiKey, days, granularity]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading && !data) return <div className="text-white/60 text-center py-16">Loading analytics...</div>;
  if (!data) return <div className="text-white/60 text-center py-16">No data available</div>;

  const { summary, timeSeries, serviceBreakdown, agentBreakdown } = data;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-white/[0.08] p-1 rounded-lg">
          {[7, 14, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === d ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/50'}`}>
              {d}d
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white/[0.08] p-1 rounded-lg">
          {(['daily', 'hourly'] as const).map(g => (
            <button key={g} onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${granularity === g ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/50'}`}>
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4">
          <p className="text-[11px] text-white/60 mb-1">Total Actions</p>
          <p className="text-xl font-semibold">{summary.totalActions.toLocaleString()}</p>
          <p className={`text-[11px] mt-1 ${summary.actionsTrendPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trendIndicator(summary.actionsTrendPct)} vs prior period
          </p>
        </div>
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4">
          <p className="text-[11px] text-white/60 mb-1">Total Cost</p>
          <p className="text-xl font-semibold">{formatCost(summary.totalCostCents)}</p>
          <p className={`text-[11px] mt-1 ${summary.costTrendPct <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {trendIndicator(summary.costTrendPct)} vs prior period
          </p>
        </div>
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4">
          <p className="text-[11px] text-white/60 mb-1">Error Rate</p>
          <p className="text-xl font-semibold">{summary.errorRate}%</p>
          <p className="text-[11px] text-white/50 mt-1">{summary.totalErrors} errors / {summary.totalBlocked} blocked</p>
        </div>
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4">
          <p className="text-[11px] text-white/60 mb-1">Avg Duration</p>
          <p className="text-xl font-semibold">{summary.avgDurationMs}ms</p>
          <p className="text-[11px] text-white/50 mt-1">across all actions</p>
        </div>
      </div>

      {/* Time series chart */}
      <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-5">
        <h3 className="text-sm font-medium text-white/50 mb-4">Actions Over Time</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={timeSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="period" tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 11 }} tickFormatter={v => granularity === 'hourly' ? v.slice(11, 16) : v.slice(5)} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: 12 }} />
            <Area type="monotone" dataKey="actions" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
            <Area type="monotone" dataKey="errors" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Service breakdown */}
      <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.14]">
          <h3 className="text-sm font-medium text-white/50">Service Breakdown</h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-white/[0.14]">
              <th className="text-left text-[11px] text-white/60 font-medium px-4 py-2">Service</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Actions</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Cost</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {serviceBreakdown.map(s => (
              <tr key={s.service} className="hover:bg-white/[0.06]">
                <td className="px-4 py-2 text-white/70">{s.service}</td>
                <td className="px-4 py-2 text-right text-white/50">{s.actions.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-white/50">{formatCost(s.cost)}</td>
                <td className="px-4 py-2 text-right text-red-400/60">{s.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Agent breakdown */}
      <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.14]">
          <h3 className="text-sm font-medium text-white/50">Agent Breakdown</h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-white/[0.14]">
              <th className="text-left text-[11px] text-white/60 font-medium px-4 py-2">Agent</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Actions</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Cost</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Avg Duration</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {agentBreakdown.map(a => (
              <tr key={a.agent} className="hover:bg-white/[0.06]">
                <td className="px-4 py-2 text-white/70">{a.agent}</td>
                <td className="px-4 py-2 text-right text-white/50">{a.actions.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-white/50">{formatCost(a.costCents)}</td>
                <td className="px-4 py-2 text-right text-white/40">{a.avgDurationMs}ms</td>
                <td className="px-4 py-2 text-right text-red-400/60">{a.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
