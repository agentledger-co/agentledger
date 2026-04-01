'use client';

import React, { useState } from 'react';

interface TraceAction {
  id: string;
  agent_name: string;
  service: string;
  action: string;
  status: string;
  duration_ms: number;
  estimated_cost_cents: number;
  created_at: string;
  offsetMs: number;
  input?: unknown;
  output?: unknown;
}

interface TraceSummary {
  totalDuration: number;
  wallDuration: number;
  totalCost: number;
  actionCount: number;
  services: string[];
  hasErrors: boolean;
  parallelGroups: number[][];
}

interface TraceTimelineProps {
  traceId: string;
  actions: TraceAction[];
  summary: TraceSummary;
  onClose: () => void;
}

const SERVICE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  slack:   { bg: 'bg-violet-500/20', text: 'text-violet-400', bar: 'bg-violet-500' },
  gmail:   { bg: 'bg-rose-500/20',   text: 'text-rose-400',   bar: 'bg-rose-500' },
  stripe:  { bg: 'bg-sky-500/20',    text: 'text-sky-400',    bar: 'bg-sky-500' },
  github:  { bg: 'bg-white/20',      text: 'text-white/80',   bar: 'bg-white/70' },
  openai:  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', bar: 'bg-emerald-500' },
  anthropic: { bg: 'bg-orange-500/20', text: 'text-orange-400', bar: 'bg-orange-500' },
  supabase: { bg: 'bg-green-500/20', text: 'text-green-400',  bar: 'bg-green-500' },
  postgres: { bg: 'bg-blue-500/20',  text: 'text-blue-400',   bar: 'bg-blue-500' },
  redis:   { bg: 'bg-red-500/20',    text: 'text-red-400',    bar: 'bg-red-500' },
  aws:     { bg: 'bg-amber-500/20',  text: 'text-amber-400',  bar: 'bg-amber-500' },
  gcp:     { bg: 'bg-blue-400/20',   text: 'text-blue-300',   bar: 'bg-blue-400' },
  azure:   { bg: 'bg-cyan-500/20',   text: 'text-cyan-400',   bar: 'bg-cyan-500' },
};

const DEFAULT_COLOR = { bg: 'bg-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500' };

const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-400',
  allowed: 'bg-emerald-400',
  error:   'bg-red-400',
  blocked: 'bg-amber-400',
  pending: 'bg-gray-400',
};

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getServiceColor(service: string) {
  const key = service.toLowerCase();
  for (const [k, v] of Object.entries(SERVICE_COLORS)) {
    if (key.includes(k)) return v;
  }
  return DEFAULT_COLOR;
}

export default function TraceTimeline({ traceId, actions, summary, onClose }: TraceTimelineProps) {
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  // Use wallDuration for positioning, fall back to totalDuration
  const timelineSpan = Math.max(summary.wallDuration || summary.totalDuration, 1);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-3xl bg-[#111] border-l border-white/[0.14] h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#111] border-b border-white/[0.14] px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-purple-400 text-sm">⟐</span>
              <span className="text-sm font-medium text-white/80">Trace Timeline</span>
              {summary.hasErrors && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-red-500/10 text-red-400">has errors</span>
              )}
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white/60 text-lg transition-colors">✕</button>
          </div>

          {/* Summary stats */}
          <div className="flex flex-wrap gap-4 text-xs">
            <div>
              <span className="text-white/55">Trace</span>
              <span className="ml-1.5 font-mono text-purple-400/70 text-[11px]">{traceId.length > 24 ? traceId.slice(0, 12) + '...' + traceId.slice(-8) : traceId}</span>
            </div>
            <div>
              <span className="text-white/55">Duration</span>
              <span className="ml-1.5 text-white/60">{formatDuration(timelineSpan)}</span>
            </div>
            <div>
              <span className="text-white/55">Cost</span>
              <span className="ml-1.5 text-white/60">{summary.totalCost > 0 ? formatCost(summary.totalCost) : '--'}</span>
            </div>
            <div>
              <span className="text-white/55">Actions</span>
              <span className="ml-1.5 text-white/60">{summary.actionCount}</span>
            </div>
            <div>
              <span className="text-white/55">Services</span>
              <span className="ml-1.5 text-white/60">{summary.services.join(', ')}</span>
            </div>
            {summary.parallelGroups.length > 0 && (
              <div>
                <span className="text-white/55">Parallel groups</span>
                <span className="ml-1.5 text-white/60">{summary.parallelGroups.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Waterfall chart */}
        <div className="px-6 py-5">
          {/* Time axis */}
          <div className="flex items-center justify-between text-[10px] text-white/50 mb-2 pl-[180px]">
            <span>0ms</span>
            <span>{formatDuration(Math.round(timelineSpan / 4))}</span>
            <span>{formatDuration(Math.round(timelineSpan / 2))}</span>
            <span>{formatDuration(Math.round(timelineSpan * 3 / 4))}</span>
            <span>{formatDuration(timelineSpan)}</span>
          </div>

          {/* Gridlines + rows */}
          <div className="space-y-1">
            {actions.map((action, idx) => {
              const color = getServiceColor(action.service);
              const leftPct = (action.offsetMs / timelineSpan) * 100;
              const widthPct = Math.max((action.duration_ms / timelineSpan) * 100, 0.3);
              const isExpanded = expandedAction === action.id;
              const isInParallelGroup = summary.parallelGroups.some(g => g.includes(idx));

              return (
                <div key={action.id}>
                  <div
                    className={`flex items-center gap-3 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                      isExpanded ? 'bg-white/[0.10]' : 'hover:bg-white/[0.06]'
                    }`}
                    onClick={() => setExpandedAction(isExpanded ? null : action.id)}
                  >
                    {/* Label */}
                    <div className="w-[168px] flex-shrink-0 flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[action.status] || 'bg-gray-400'}`} />
                      {isInParallelGroup && (
                        <span className="text-[9px] text-purple-400/50 flex-shrink-0" title="Parallel execution">||</span>
                      )}
                      <span className={`text-[11px] ${color.text} truncate flex-shrink-0`}>{action.service}</span>
                      <span className="text-[11px] text-white/60 truncate">{action.action}</span>
                    </div>

                    {/* Bar area */}
                    <div className="flex-1 relative h-6 bg-white/[0.06] rounded overflow-hidden">
                      {/* Gridlines */}
                      <div className="absolute inset-0 flex">
                        {[25, 50, 75].map(pct => (
                          <div key={pct} className="absolute top-0 bottom-0 w-px bg-white/[0.08]" style={{ left: `${pct}%` }} />
                        ))}
                      </div>

                      {/* Bar */}
                      <div
                        className={`absolute top-1 bottom-1 rounded ${color.bar} opacity-70 hover:opacity-90 transition-opacity`}
                        style={{
                          left: `${leftPct}%`,
                          width: `max(${widthPct}%, 2px)`,
                        }}
                      />

                      {/* Duration label on bar */}
                      {action.duration_ms > 0 && widthPct > 5 && (
                        <span
                          className="absolute top-0.5 text-[9px] text-white/60 font-mono pointer-events-none"
                          style={{ left: `calc(${leftPct}% + 4px)` }}
                        >
                          {formatDuration(action.duration_ms)}
                        </span>
                      )}
                    </div>

                    {/* Duration on right */}
                    <span className="text-[10px] text-white/50 w-14 text-right flex-shrink-0">
                      {action.duration_ms > 0 ? formatDuration(action.duration_ms) : '--'}
                    </span>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="ml-[180px] mr-14 mt-1 mb-3 bg-white/[0.06] rounded-lg border border-white/[0.14] p-4 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <p className="text-[10px] uppercase text-white/55 mb-0.5">Agent</p>
                          <p className="text-xs font-mono text-white/70">{action.agent_name}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-white/55 mb-0.5">Service</p>
                          <p className={`text-xs ${color.text}`}>{action.service}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-white/55 mb-0.5">Action</p>
                          <p className="text-xs text-white/60">{action.action}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-white/55 mb-0.5">Status</p>
                          <p className={`text-xs font-medium ${
                            action.status === 'success' || action.status === 'allowed' ? 'text-emerald-400' :
                            action.status === 'error' ? 'text-red-400' : 'text-amber-400'
                          }`}>{action.status}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-white/55 mb-0.5">Duration</p>
                          <p className="text-xs text-white/60">{action.duration_ms > 0 ? formatDuration(action.duration_ms) : '--'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-white/55 mb-0.5">Cost</p>
                          <p className="text-xs text-white/60">{action.estimated_cost_cents > 0 ? formatCost(action.estimated_cost_cents) : '--'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-white/55 mb-0.5">Offset</p>
                          <p className="text-xs text-white/40 font-mono">+{formatDuration(action.offsetMs)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-white/55 mb-0.5">Timestamp</p>
                          <p className="text-xs text-white/40">{new Date(action.created_at).toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Input */}
                      {action.input != null && typeof action.input === 'object' && Object.keys(action.input as Record<string, unknown>).length > 0 && (
                        <CollapsibleJson label="Input" data={action.input} colorClass="text-emerald-300/70" />
                      )}

                      {/* Output */}
                      {action.output != null && typeof action.output === 'object' && Object.keys(action.output as Record<string, unknown>).length > 0 && (
                        <CollapsibleJson label="Output" data={action.output} colorClass="text-blue-300/70" />
                      )}

                      <p className="text-[10px] font-mono text-white/15 break-all">ID: {action.id}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary bar at bottom */}
          <div className="mt-6 pt-4 border-t border-white/[0.14]">
            <div className="flex items-center gap-3">
              <div className="w-[168px] flex-shrink-0">
                <span className="text-[11px] text-white/60 font-medium">Total span</span>
              </div>
              <div className="flex-1 relative h-6 bg-white/[0.06] rounded overflow-hidden">
                <div className="absolute top-1 bottom-1 left-0 rounded bg-purple-500/30" style={{ width: '100%' }} />
                <span className="absolute top-0.5 left-1 text-[9px] text-white/40 font-mono">{formatDuration(timelineSpan)}</span>
              </div>
              <span className="text-[10px] text-white/50 w-14 text-right flex-shrink-0">{formatDuration(timelineSpan)}</span>
            </div>

            {/* Service legend */}
            <div className="flex flex-wrap gap-3 mt-4">
              {summary.services.map(svc => {
                const c = getServiceColor(svc);
                return (
                  <div key={svc} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-sm ${c.bar} opacity-70`} />
                    <span className="text-[10px] text-white/60">{svc}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapsibleJson({ label, data, colorClass }: { label: string; data: unknown; colorClass: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] uppercase text-white/55 mb-1 flex items-center gap-1 hover:text-white/40 transition-colors"
      >
        <span className="text-white/50 text-[9px]">{open ? '▾' : '▸'}</span>
        {label}
      </button>
      {open && (
        <pre className={`text-[11px] ${colorClass} font-mono bg-black/40 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words`}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
