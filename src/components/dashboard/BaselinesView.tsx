'use client';

import React, { useEffect, useState } from 'react';

interface BaselineMetric {
  metric: string;
  baseline: number;
  stddev: number;
  sample_size: number;
  updated_at: string;
}

interface ServiceDistribution {
  service: string;
  percentage: number;
}

interface BaselinesData {
  metrics: BaselineMetric[];
  service_distribution?: ServiceDistribution[];
}

interface BaselinesViewProps {
  apiKey: string;
  agentName: string;
}

function formatMetricValue(metric: string, value: number): string {
  switch (metric) {
    case 'actions_per_hour':
      return value.toFixed(1);
    case 'cost_per_action':
      if (value < 1) return `${(value * 10).toFixed(2)}m`;
      return `$${(value / 100).toFixed(4)}`;
    case 'duration_per_action':
      if (value < 1000) return `${value.toFixed(0)}ms`;
      return `${(value / 1000).toFixed(1)}s`;
    case 'error_rate':
      return `${(value * 100).toFixed(1)}%`;
    default:
      return value.toFixed(2);
  }
}

function formatStddev(metric: string, stddev: number): string {
  switch (metric) {
    case 'actions_per_hour':
      return `\u00B1${stddev.toFixed(1)}`;
    case 'cost_per_action':
      if (stddev < 1) return `\u00B1${(stddev * 10).toFixed(2)}m`;
      return `\u00B1$${(stddev / 100).toFixed(4)}`;
    case 'duration_per_action':
      if (stddev < 1000) return `\u00B1${stddev.toFixed(0)}ms`;
      return `\u00B1${(stddev / 1000).toFixed(1)}s`;
    case 'error_rate':
      return `\u00B1${(stddev * 100).toFixed(1)}%`;
    default:
      return `\u00B1${stddev.toFixed(2)}`;
  }
}

function metricLabel(metric: string): string {
  switch (metric) {
    case 'actions_per_hour': return 'Actions per Hour';
    case 'cost_per_action': return 'Cost per Action';
    case 'duration_per_action': return 'Duration per Action';
    case 'error_rate': return 'Error Rate';
    default: return metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

function RangeBar({ baseline, stddev }: { baseline: number; stddev: number }) {
  // Visualize the range: green (baseline +/- 1*stddev), yellow (1-2*stddev), red (>2*stddev)
  // We show a bar from (baseline - 3*stddev) to (baseline + 3*stddev)
  const rangeMin = Math.max(0, baseline - 3 * stddev);
  const rangeMax = baseline + 3 * stddev;
  const totalRange = rangeMax - rangeMin;

  if (totalRange <= 0 || stddev <= 0) {
    // No meaningful range to display
    return (
      <div className="w-full h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <div className="h-full bg-emerald-400/30 rounded-full" style={{ width: '100%' }} />
      </div>
    );
  }

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - rangeMin) / totalRange) * 100));

  const anomalyLeftEnd = pct(baseline - 2 * stddev);
  const warningLeftEnd = pct(baseline - 1 * stddev);
  const normalCenter = pct(baseline);
  const warningRightStart = pct(baseline + 1 * stddev);
  const anomalyRightStart = pct(baseline + 2 * stddev);

  return (
    <div className="relative w-full h-2 rounded-full bg-white/[0.04] overflow-hidden">
      {/* Red zones (anomaly) */}
      <div
        className="absolute top-0 h-full bg-red-400/25 rounded-l-full"
        style={{ left: 0, width: `${anomalyLeftEnd}%` }}
      />
      <div
        className="absolute top-0 h-full bg-red-400/25 rounded-r-full"
        style={{ left: `${anomalyRightStart}%`, width: `${100 - anomalyRightStart}%` }}
      />

      {/* Yellow zones (warning) */}
      <div
        className="absolute top-0 h-full bg-amber-400/25"
        style={{ left: `${anomalyLeftEnd}%`, width: `${warningLeftEnd - anomalyLeftEnd}%` }}
      />
      <div
        className="absolute top-0 h-full bg-amber-400/25"
        style={{ left: `${warningRightStart}%`, width: `${anomalyRightStart - warningRightStart}%` }}
      />

      {/* Green zone (normal) */}
      <div
        className="absolute top-0 h-full bg-emerald-400/30"
        style={{ left: `${warningLeftEnd}%`, width: `${warningRightStart - warningLeftEnd}%` }}
      />

      {/* Baseline marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-white/40"
        style={{ left: `${normalCenter}%` }}
      />
    </div>
  );
}

function ServiceDistributionBar({ distribution }: { distribution: ServiceDistribution[] }) {
  const COLORS = [
    'bg-blue-400', 'bg-emerald-400', 'bg-purple-400', 'bg-pink-400',
    'bg-amber-400', 'bg-cyan-400', 'bg-red-400', 'bg-violet-400',
  ];

  const sorted = [...distribution].sort((a, b) => b.percentage - a.percentage);

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="w-full h-3 rounded-full bg-white/[0.04] overflow-hidden flex">
        {sorted.map((item, i) => (
          <div
            key={item.service}
            className={`h-full ${COLORS[i % COLORS.length]} opacity-50 first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${item.percentage}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map((item, i) => (
          <div key={item.service} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${COLORS[i % COLORS.length]} opacity-50`} />
            <span className="text-[11px] text-white/40">{item.service}</span>
            <span className="text-[11px] text-white/20">{item.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BaselinesView({ apiKey, agentName }: BaselinesViewProps) {
  const [data, setData] = useState<BaselinesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBaselines = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `/api/v1/baselines?agent=${encodeURIComponent(agentName)}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (!res.ok) throw new Error('Failed to fetch baselines');
        const json = await res.json();
        setData(json);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load baselines');
      } finally {
        setLoading(false);
      }
    };

    fetchBaselines();
  }, [apiKey, agentName]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white/70">Baselines for {agentName}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
              <div className="h-3 w-24 bg-white/[0.04] rounded animate-pulse mb-3" />
              <div className="h-7 w-16 bg-white/[0.06] rounded animate-pulse mb-2" />
              <div className="h-2.5 w-32 bg-white/[0.03] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white/70">Baselines for {agentName}</h3>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!data || !data.metrics || data.metrics.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-white/70">Baselines for {agentName}</h3>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-8 text-center">
          <p className="text-white/30 text-sm mb-1">No baseline data yet.</p>
          <p className="text-white/15 text-xs">
            Baselines are computed hourly from the last 7 days of activity. Minimum 50 actions required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white/70">Baselines for {agentName}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.metrics.map(metric => (
          <div
            key={metric.metric}
            className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-3"
          >
            {/* Metric name */}
            <p className="text-xs font-medium text-white/40 uppercase tracking-wider">
              {metricLabel(metric.metric)}
            </p>

            {/* Big value + stddev */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white/90 tabular-nums">
                {formatMetricValue(metric.metric, metric.baseline)}
              </span>
              <span className="text-sm text-white/30 tabular-nums">
                {formatStddev(metric.metric, metric.stddev)}
              </span>
            </div>

            {/* Range bar */}
            <div className="pt-1">
              <RangeBar baseline={metric.baseline} stddev={metric.stddev} />
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-red-400/40">anomaly</span>
                <span className="text-[10px] text-amber-400/40">warning</span>
                <span className="text-[10px] text-emerald-400/50">normal</span>
                <span className="text-[10px] text-amber-400/40">warning</span>
                <span className="text-[10px] text-red-400/40">anomaly</span>
              </div>
            </div>

            {/* Sample size */}
            <p className="text-[11px] text-white/20">
              Based on {metric.sample_size.toLocaleString()} samples
            </p>
          </div>
        ))}

        {/* Service Distribution card */}
        {data.service_distribution && data.service_distribution.length > 0 && (
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-3 md:col-span-2">
            <p className="text-xs font-medium text-white/40 uppercase tracking-wider">
              Service Distribution
            </p>
            <ServiceDistributionBar distribution={data.service_distribution} />
          </div>
        )}
      </div>
    </div>
  );
}
