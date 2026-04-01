'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AgentForecast {
  agent: string;
  currentPeriodCostCents: number;
  projectedCostCents: number;
  dailyAverageCostCents: number;
  daysAnalyzed: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPct: number;
  budgetWarning: boolean;
  budgetMaxCents: number | null;
  projectedExceedsAt: string | null;
}

interface ForecastData {
  totalProjectedCostCents: number;
  totalDailyAverageCents: number;
  agents: AgentForecast[];
  generatedAt: string;
  periodDays: number;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const TREND_COLORS = {
  increasing: 'text-amber-400',
  decreasing: 'text-emerald-400',
  stable: 'text-white/40',
};

const TREND_ICONS = {
  increasing: '\u2191',
  decreasing: '\u2193',
  stable: '\u2192',
};

export default function ForecastTab({ apiKey }: { apiKey: string }) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysBack, setDaysBack] = useState(30);
  const [forecastDays, setForecastDays] = useState(30);

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/forecast?days_back=${daysBack}&forecast_days=${forecastDays}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const result = await res.json();
        setData(result.forecast);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiKey, daysBack, forecastDays]);

  useEffect(() => { fetchForecast(); }, [fetchForecast]);

  if (loading && !data) return <div className="text-white/60 text-center py-16">Generating forecast...</div>;
  if (!data || data.agents.length === 0) return (
    <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-8 text-center">
      <p className="text-white/60 text-sm">No forecast data available. Agent cost history is needed to generate projections.</p>
    </div>
  );

  const warnings = data.agents.filter(a => a.budgetWarning);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">History:</span>
          <div className="flex gap-1 bg-white/[0.08] p-1 rounded-lg">
            {[14, 30, 60, 90].map(d => (
              <button key={d} onClick={() => setDaysBack(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${daysBack === d ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/50'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">Forecast:</span>
          <div className="flex gap-1 bg-white/[0.08] p-1 rounded-lg">
            {[7, 14, 30, 60].map(d => (
              <button key={d} onClick={() => setForecastDays(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${forecastDays === d ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/50'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4">
          <p className="text-[11px] text-white/60 mb-1">Projected Cost ({forecastDays}d)</p>
          <p className="text-xl font-semibold">{formatCost(data.totalProjectedCostCents)}</p>
        </div>
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4">
          <p className="text-[11px] text-white/60 mb-1">Daily Average</p>
          <p className="text-xl font-semibold">{formatCost(data.totalDailyAverageCents)}</p>
        </div>
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4">
          <p className="text-[11px] text-white/60 mb-1">Budget Warnings</p>
          <p className={`text-xl font-semibold ${warnings.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{warnings.length}</p>
          <p className="text-[11px] text-white/50 mt-1">{warnings.length > 0 ? 'agents may exceed budget' : 'all within budget'}</p>
        </div>
      </div>

      {/* Budget warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-medium text-amber-400">Budget Warnings</h4>
          {warnings.map(w => (
            <div key={w.agent} className="flex items-center justify-between text-xs">
              <span className="text-white/70">{w.agent}</span>
              <span className="text-amber-400/80">
                Projected to exceed {w.budgetMaxCents ? formatCost(w.budgetMaxCents) : 'budget'} budget
                {w.projectedExceedsAt && ` by ${new Date(w.projectedExceedsAt).toLocaleDateString()}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Agent forecast table */}
      <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.14]">
          <h3 className="text-sm font-medium text-white/50">Agent Forecasts</h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-white/[0.14]">
              <th className="text-left text-[11px] text-white/60 font-medium px-4 py-2">Agent</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Daily Avg</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Projected ({forecastDays}d)</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Trend</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2">Budget</th>
              <th className="text-right text-[11px] text-white/60 font-medium px-4 py-2 hidden md:table-cell">Days Analyzed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {data.agents.map(agent => (
              <tr key={agent.agent} className="hover:bg-white/[0.06]">
                <td className="px-4 py-2 text-white/70">{agent.agent}</td>
                <td className="px-4 py-2 text-right text-white/50">{formatCost(agent.dailyAverageCostCents)}</td>
                <td className="px-4 py-2 text-right text-white/50">{formatCost(agent.projectedCostCents)}</td>
                <td className={`px-4 py-2 text-right ${TREND_COLORS[agent.trend]}`}>
                  {TREND_ICONS[agent.trend]} {agent.trendPct > 0 ? '+' : ''}{agent.trendPct}%
                </td>
                <td className="px-4 py-2 text-right">
                  {agent.budgetWarning ? (
                    <span className="text-amber-400 text-[11px] bg-amber-500/10 px-2 py-0.5 rounded-full">Warning</span>
                  ) : agent.budgetMaxCents ? (
                    <span className="text-emerald-400/60 text-[11px]">OK</span>
                  ) : (
                    <span className="text-white/50 text-[11px]">No budget</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-white/60 hidden md:table-cell">{agent.daysAnalyzed}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
