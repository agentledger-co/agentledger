'use client';

import React, { useState, useCallback } from 'react';

interface TraceAction {
  id: string;
  agent_name: string;
  service: string;
  action: string;
  status: string;
  estimated_cost_cents: number;
  duration_ms: number;
  input: unknown;
  output: unknown;
  created_at: string;
}

interface TraceReplayViewProps {
  apiKey: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  blocked: 'bg-amber-500',
};

function formatJson(data: unknown): string {
  if (data === null || data === undefined) return 'null';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export default function TraceReplayView({ apiKey, onToast }: TraceReplayViewProps) {
  const [traceId, setTraceId] = useState('');
  const [actions, setActions] = useState<TraceAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadTrace = useCallback(async () => {
    if (!traceId.trim()) {
      onToast('Enter a trace ID', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/traces/${encodeURIComponent(traceId.trim())}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        onToast('Trace not found', 'error');
        setLoading(false);
        return;
      }
      const data = await res.json();
      const traceActions = (data.actions || []).sort(
        (a: TraceAction, b: TraceAction) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setActions(traceActions);
      setCurrentStep(0);
      setLoaded(true);
      if (traceActions.length === 0) {
        onToast('Trace has no actions', 'error');
      }
    } catch {
      onToast('Failed to load trace', 'error');
    }
    setLoading(false);
  }, [apiKey, traceId, onToast]);

  const play = useCallback(() => {
    if (isPlaying || actions.length === 0) return;
    setIsPlaying(true);
    setCurrentStep(0);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= actions.length) {
        clearInterval(interval);
        setIsPlaying(false);
        setCurrentStep(actions.length - 1);
        return;
      }
      setCurrentStep(step);
    }, 1500);

    return () => clearInterval(interval);
  }, [actions, isPlaying]);

  const current = actions[currentStep];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-white/70">Trace Replay</h3>
        <p className="text-xs text-white/30 mt-0.5">Load a trace ID to step through each action with full input/output inspection.</p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={traceId}
          onChange={e => setTraceId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadTrace()}
          placeholder="Enter trace ID (e.g. tr_abc123)"
          className="flex-1 bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
        />
        <button
          onClick={loadTrace}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? 'Loading...' : 'Load'}
        </button>
      </div>

      {loaded && actions.length > 0 && (
        <>
          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0 || isPlaying}
              className="bg-white/[0.10] hover:bg-white/[0.08] disabled:opacity-30 text-white/60 text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              Prev
            </button>
            <button
              onClick={play}
              disabled={isPlaying}
              className="bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-30 text-blue-400 text-xs font-medium px-4 py-1.5 rounded-lg transition-colors border border-blue-500/20"
            >
              {isPlaying ? 'Playing...' : 'Play All'}
            </button>
            <button
              onClick={() => setCurrentStep(Math.min(actions.length - 1, currentStep + 1))}
              disabled={currentStep === actions.length - 1 || isPlaying}
              className="bg-white/[0.10] hover:bg-white/[0.08] disabled:opacity-30 text-white/60 text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              Next
            </button>
            <span className="text-xs text-white/30 ml-2">
              Step {currentStep + 1} of {actions.length}
            </span>
          </div>

          {/* Timeline */}
          <div className="flex gap-1 overflow-x-auto pb-2">
            {actions.map((a, i) => (
              <button
                key={a.id}
                onClick={() => { if (!isPlaying) setCurrentStep(i); }}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-all ${
                  i === currentStep
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : i < currentStep
                    ? 'bg-white/[0.10] text-white/40'
                    : 'bg-white/[0.06] text-white/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[a.status] || 'bg-white/20'}`} />
                {a.service}
              </button>
            ))}
          </div>

          {/* Current step detail */}
          {current && (
            <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.14] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[current.status] || 'bg-white/20'}`} />
                  <span className="text-sm font-medium text-white/80">{current.service}</span>
                  <span className="text-xs text-white/30">{current.action}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-white/30">
                  <span>{current.duration_ms}ms</span>
                  {current.estimated_cost_cents > 0 && (
                    <span>${(current.estimated_cost_cents / 100).toFixed(2)}</span>
                  )}
                  <span>{new Date(current.created_at).toLocaleTimeString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
                {/* Input */}
                <div className="p-4">
                  <p className="text-[11px] text-white/30 font-medium mb-2">Input</p>
                  <pre className="text-[12px] text-white/50 bg-white/[0.06] rounded-lg p-3 overflow-auto max-h-[300px] font-mono whitespace-pre-wrap">
                    {formatJson(current.input)}
                  </pre>
                </div>

                {/* Output */}
                <div className="p-4">
                  <p className="text-[11px] text-white/30 font-medium mb-2">Output</p>
                  <pre className={`text-[12px] bg-white/[0.06] rounded-lg p-3 overflow-auto max-h-[300px] font-mono whitespace-pre-wrap ${
                    current.status === 'error' ? 'text-red-400/70' : 'text-white/50'
                  }`}>
                    {formatJson(current.output)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {loaded && actions.length === 0 && (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-8 text-center">
          <p className="text-white/30 text-sm">No actions found for this trace.</p>
        </div>
      )}
    </div>
  );
}
