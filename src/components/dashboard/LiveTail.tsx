'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';

interface LiveAction {
  id: string;
  agent_name: string;
  service: string;
  action: string;
  status: string;
  estimated_cost_cents: number;
  duration_ms: number;
  created_at: string;
}

interface LiveTailProps {
  apiKey: string;
  environment?: string;
  agentFilter?: string;
}

const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-400',
  error: 'bg-red-400',
  blocked: 'bg-amber-400',
  pending: 'bg-gray-400',
};

const MAX_ACTIONS = 200;

function formatCost(cents: number): string {
  if (cents < 1) return `${(cents * 10).toFixed(1)}m`;
  return `$${(cents / 100).toFixed(4)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LiveTail({ apiKey, environment, agentFilter }: LiveTailProps) {
  const [actions, setActions] = useState<LiveAction[]>([]);
  const [paused, setPaused] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const [actionRate, setActionRate] = useState(0);

  const bufferRef = useRef<LiveAction[]>([]);
  const pausedRef = useRef(false);
  const actionsRef = useRef<LiveAction[]>([]);
  const rateTimestampsRef = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  // Rate calculation: count actions in the last 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 60_000;
      rateTimestampsRef.current = rateTimestampsRef.current.filter(t => t > cutoff);
      setActionRate(rateTimestampsRef.current.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const addAction = useCallback((action: LiveAction) => {
    rateTimestampsRef.current.push(Date.now());

    if (pausedRef.current) {
      bufferRef.current.push(action);
      return;
    }

    setActions(prev => {
      const next = [action, ...prev];
      return next.length > MAX_ACTIONS ? next.slice(0, MAX_ACTIONS) : next;
    });
  }, []);

  const connectSSE = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams({ key: apiKey });
    if (environment) params.set('environment', environment);
    if (agentFilter) params.set('agent', agentFilter);

    try {
      setConnectionStatus('reconnecting');

      const response = await fetch(`/api/v1/stream?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!response.ok || !response.body) {
        throw new Error('Stream connection failed');
      }

      setConnectionStatus('connected');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const message of messages) {
          if (!message.trim()) continue;

          const lines = message.split('\n');
          let eventType = '';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              data += line.slice(6);
            }
          }

          if (data && (eventType === 'action' || eventType === '' || !eventType)) {
            try {
              const parsed = JSON.parse(data) as LiveAction;
              if (parsed.agent_name && parsed.service) {
                addAction(parsed);
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }

      // Stream ended normally
      setConnectionStatus('disconnected');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return; // Intentional disconnect
      }
      setConnectionStatus('disconnected');
    }

    // Reconnect after 3 seconds if not aborted
    if (!controller.signal.aborted) {
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSSE();
      }, 3000);
    }
  }, [apiKey, environment, agentFilter, addAction]);

  useEffect(() => {
    connectSSE();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectSSE]);

  const handlePauseResume = () => {
    if (paused) {
      // Resume: flush buffer
      const buffered = bufferRef.current;
      bufferRef.current = [];
      setActions(prev => {
        const next = [...buffered.reverse(), ...prev];
        return next.length > MAX_ACTIONS ? next.slice(0, MAX_ACTIONS) : next;
      });
    }
    setPaused(!paused);
  };

  const handleClear = () => {
    setActions([]);
    bufferRef.current = [];
    rateTimestampsRef.current = [];
    setActionRate(0);
  };

  const connectionColor = connectionStatus === 'connected'
    ? 'bg-emerald-400'
    : connectionStatus === 'reconnecting'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-red-400';

  const connectionLabel = connectionStatus === 'connected'
    ? 'Connected'
    : connectionStatus === 'reconnecting'
      ? 'Reconnecting...'
      : 'Disconnected';

  return (
    <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] flex flex-col" style={{ maxHeight: '600px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.14]">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white/70">Live Tail</h3>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${connectionColor}`} />
            <span className="text-[11px] text-white/60">{connectionLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/60 tabular-nums">{actionRate} actions/min</span>

          <button
            onClick={handlePauseResume}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
              paused
                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'bg-white/[0.08] text-white/40 hover:text-white/60 hover:bg-white/[0.12]'
            }`}
          >
            {paused ? (
              <>
                <span>Resume</span>
                {bufferRef.current.length > 0 && (
                  <span className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full">
                    {bufferRef.current.length} buffered
                  </span>
                )}
              </>
            ) : (
              <span>Pause</span>
            )}
          </button>

          <button
            onClick={handleClear}
            className="text-xs text-white/60 hover:text-white/50 px-2.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {actions.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <p className="text-white/60 text-sm mb-1">Waiting for actions...</p>
              <p className="text-white/50 text-xs">Actions will appear here in real time as they are logged.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {actions.map((action, i) => (
              <div
                key={action.id || `${action.created_at}-${i}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-colors text-[13px]"
              >
                {/* Status dot */}
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[action.status] || 'bg-gray-400'}`} />

                {/* Timestamp */}
                <span className="text-white/60 font-mono text-xs tabular-nums w-[64px] flex-shrink-0">
                  {formatTimestamp(action.created_at)}
                </span>

                {/* Agent -> Service */}
                <span className="text-white/70 truncate min-w-0 max-w-[140px]">{action.agent_name}</span>
                <span className="text-white/50 flex-shrink-0">&rarr;</span>
                <span className="text-blue-400/70 truncate min-w-0 max-w-[100px]">{action.service}</span>

                {/* Action name */}
                <span className="text-white/50 truncate min-w-0 flex-1">{action.action}</span>

                {/* Duration */}
                <span className="text-white/60 font-mono text-xs tabular-nums w-[56px] text-right flex-shrink-0">
                  {formatDuration(action.duration_ms)}
                </span>

                {/* Cost */}
                <span className="text-white/60 font-mono text-xs tabular-nums w-[56px] text-right flex-shrink-0">
                  {formatCost(action.estimated_cost_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.14] px-4 py-2 flex items-center justify-between">
        <span className="text-[11px] text-white/50">{actions.length} actions in feed</span>
        {paused && bufferRef.current.length > 0 && (
          <span className="text-[11px] text-amber-400/60">{bufferRef.current.length} buffered</span>
        )}
      </div>
    </div>
  );
}
