'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import TraceTimeline from '@/components/TraceTimeline';
import PoliciesTab from '@/components/dashboard/PoliciesTab';
import ApprovalsTab from '@/components/dashboard/ApprovalsTab';
import EvaluationsTab from '@/components/dashboard/EvaluationsTab';
import RollbackHooksTab from '@/components/dashboard/RollbackHooksTab';
import TeamTab from '@/components/dashboard/TeamTab';
import EnvironmentSelector from '@/components/dashboard/EnvironmentSelector';
import AnalyticsTab from '@/components/dashboard/AnalyticsTab';
import ForecastTab from '@/components/dashboard/ForecastTab';
import PolicyTemplatesSection from '@/components/dashboard/PolicyTemplatesSection';
import TraceReplayView from '@/components/dashboard/TraceReplayView';
import WorkspaceSwitcher from '@/components/dashboard/WorkspaceSwitcher';

interface Agent {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'killed';
  total_actions: number;
  total_cost_cents: number;
  last_active_at: string;
}

interface ActionLog {
  id: string;
  agent_name: string;
  service: string;
  action: string;
  status: string;
  estimated_cost_cents: number;
  duration_ms: number;
  created_at: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
  request_meta?: Record<string, unknown>;
  trace_id?: string;
  input?: unknown;
  output?: unknown;
}

interface Alert {
  id: string;
  agent_name: string;
  alert_type: string;
  message: string;
  severity: string;
  created_at: string;
  acknowledged: boolean;
}

interface Budget {
  id: string;
  agent_id: string;
  agent_name: string;
  period: string;
  max_actions: number | null;
  max_cost_cents: number | null;
  current_actions: number;
  current_cost_cents: number;
  pct_actions: number | null;
  pct_cost: number | null;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
  period_start: string;
  created_at: string;
}

interface Stats {
  totalActions: number;
  todayActions: number;
  todayCostCents: number;
  weekCostCents: number;
  activeAgents: number;
  totalAgents: number;
  agents: Agent[];
  errorCount: number;
  blockedCount: number;
  serviceBreakdown: Record<string, number>;
  agentBreakdown: Record<string, number>;
  hourlyData: { hour: string; actions: number; cost: number }[];
  alerts: Alert[];
}

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#ef4444', '#a855f7'];

const STATUS_COLORS: Record<string, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  blocked: 'text-amber-400',
  pending: 'text-gray-400',
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-400',
  paused: 'bg-amber-400',
  killed: 'bg-red-400',
};

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DashboardPage() {
  const [apiKey, setApiKey] = useState('');
  const [isSetup, setIsSetup] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'actions' | 'agents' | 'control' | 'insights' | 'settings'>('overview');
  const [subTab, setSubTab] = useState<string>('policies');
  const [environment, setEnvironment] = useState(() => typeof window !== 'undefined' ? sessionStorage.getItem('al_environment') || '' : '');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [drawerAction, setDrawerAction] = useState<ActionLog | null>(null);
  const [traceData, setTraceData] = useState<{ traceId: string; actions: unknown[]; summary: unknown } | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const openTrace = useCallback(async (traceId: string) => {
    if (!apiKey || traceLoading) return;
    setTraceLoading(true);
    try {
      const res = await fetch(`/api/v1/traces/${encodeURIComponent(traceId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        addToast('Failed to load trace', 'error');
        return;
      }
      const data = await res.json();
      setTraceData(data);
    } catch {
      addToast('Failed to load trace', 'error');
    } finally {
      setTraceLoading(false);
    }
  }, [apiKey, traceLoading, addToast]);

  // Initialize auth — get user session, look up org, get API key
  useEffect(() => {
    const init = async () => {
      // Try stored key first (for backward compat and speed)
      const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem('al_api_key') : null;
      if (stored) {
        setApiKey(stored);
        setIsSetup(true);
        setLoading(false);
        return;
      }

      // Otherwise, use Supabase auth
      try {
        const { createBrowserClient } = await import('@/lib/supabase');
        const supabase = createBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          // Not authenticated — show setup screen (legacy flow)
          setLoading(false);
          return;
        }

        setUserEmail(user.email || '');

        // Look up user's org and API key
        const res = await fetch('/api/v1/keys', {
          
        });

        if (res.ok) {
          const data = await res.json();
          if (data.orgId && data.keys?.length > 0) {
            // User has an org — check for stored key
            const storedKey = sessionStorage.getItem('al_api_key');
            if (storedKey) {
              setApiKey(storedKey);
              setIsSetup(true);
            } else {
              // Returning user without stored key — generate a new one
              const recoverRes = await fetch('/api/v1/keys/recover', {
                method: 'POST',
                
              });
              if (recoverRes.ok) {
                const recoverData = await recoverRes.json();
                if (recoverData.key) {
                  sessionStorage.setItem('al_api_key', recoverData.key);
                  setApiKey(recoverData.key);
                  setIsSetup(true);
                }
              } else {
                setError('Failed to recover API access. Please contact support.');
              }
            }
          } else {
            // No org yet — redirect to onboarding
            window.location.href = '/onboarding';
            return;
          }
        }
      } catch {
        // Supabase auth not configured — fall back to legacy setup
      }
      setLoading(false);
    };

    init();
  }, []);
  const fetchData = useCallback(async () => {
    if (!apiKey) return;
    try {
      const [statsRes, actionsRes] = await Promise.all([
        fetch('/api/v1/stats', { headers: { Authorization: `Bearer ${apiKey}` } }),
        fetch('/api/v1/actions?limit=50', { headers: { Authorization: `Bearer ${apiKey}` } }),
      ]);

      if (!statsRes.ok) throw new Error('Failed to fetch stats');

      const statsData = await statsRes.json();
      setStats({
        totalActions: statsData.totalActions ?? 0,
        todayActions: statsData.todayActions ?? 0,
        todayCostCents: statsData.todayCostCents ?? 0,
        weekCostCents: statsData.weekCostCents ?? 0,
        activeAgents: statsData.activeAgents ?? 0,
        totalAgents: statsData.totalAgents ?? 0,
        agents: statsData.agents ?? [],
        errorCount: statsData.errorCount ?? 0,
        blockedCount: statsData.blockedCount ?? 0,
        serviceBreakdown: statsData.serviceBreakdown ?? {},
        agentBreakdown: statsData.agentBreakdown ?? {},
        hourlyData: statsData.hourlyData ?? [],
        alerts: statsData.alerts ?? [],
      });

      if (actionsRes.ok) {
        const actionsData = await actionsRes.json();
        setActions(actionsData.actions || []);
      }
    } catch (e: unknown) {
      // Only show error if we don't have any data yet (first load failure)
      // Auto-refresh failures are silent — the existing data stays visible
      if (!stats) {
        setError(e instanceof Error ? e.message : 'Failed to fetch data');
      }
    }
  }, [apiKey]);

  useEffect(() => {
    if (isSetup && apiKey) {
      fetchData();
    }
  }, [isSetup, apiKey, fetchData]);

  // Auto refresh every 5s
  useEffect(() => {
    if (!autoRefresh || !isSetup) return;
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, isSetup, fetchData]);

  const handleSetup = async (existingKey?: string) => {
    setLoading(true);
    setError('');

    if (existingKey) {
      // Validate key
      const res = await fetch('/api/v1/stats', {
        headers: { Authorization: `Bearer ${existingKey}` },
      });
      if (res.ok) {
        setApiKey(existingKey);
        sessionStorage.setItem('al_api_key', existingKey);
        setIsSetup(true);
      } else {
        setError('Invalid API key');
      }
      setLoading(false);
      return;
    }

    // Create new org
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Organization' }),
      });
      const data = await res.json();
      if (data.apiKey) {
        setApiKey(data.apiKey);
        sessionStorage.setItem('al_api_key', data.apiKey);
        setIsSetup(true);
      } else {
        setError(data.error || 'Setup failed');
      }
    } catch {
      setError('Setup failed');
    }
    setLoading(false);
  };

  const toggleAgent = async (name: string, currentStatus: string) => {
    const endpoint = currentStatus === 'active' ? 'pause' : 'resume';
    const res = await fetch(`/api/v1/agents/${name}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      addToast(`Agent "${name}" ${endpoint === 'pause' ? 'paused' : 'resumed'}`, 'success');
    } else {
      addToast(`Failed to ${endpoint} agent`, 'error');
    }
    fetchData();
  };

  const killAgent = async (name: string) => {
    const res = await fetch(`/api/v1/agents/${name}/kill`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      addToast(`Agent "${name}" killed`, 'success');
    } else {
      addToast('Failed to kill agent', 'error');
    }
    fetchData();
  };

  const acknowledgeAlert = async (id?: string) => {
    await fetch('/api/v1/alerts/acknowledge', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    fetchData();
  };

  // Setup screen
  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080a] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 logo-heartbeat-glow">
            <svg className="logo-heartbeat" width="22" height="22" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <p className="text-white/30 text-[13px]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isSetup) {
    return <SetupScreen onSetup={handleSetup} loading={false} error={error} />;
  }

  return (
    <div className="min-h-screen bg-[#08080a] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center logo-heartbeat-glow">
              <svg className="logo-heartbeat" width="18" height="18" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="text-base md:text-lg font-semibold tracking-tight">AgentLedger</span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <WorkspaceSwitcher />
            <EnvironmentSelector apiKey={apiKey} environment={environment} onChange={(env) => { setEnvironment(env); sessionStorage.setItem('al_environment', env); }} />
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                autoRefresh ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.03] text-white/40'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <button onClick={fetchData} className="text-sm text-white/40 hover:text-white/60 transition-colors">
              ↻ Refresh
            </button>
            <button
              onClick={async () => {
                sessionStorage.removeItem('al_api_key');
                try {
                  const { createBrowserClient } = await import('@/lib/supabase');
                  const supabase = createBrowserClient();
                  await supabase.auth.signOut();
                } catch {}
                window.location.href = '/login';
              }}
              className="text-sm text-white/30 hover:text-white/50 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Tabs — scrollable on mobile */}
        <div className="flex gap-1 mb-6 bg-white/[0.03] p-1 rounded-lg overflow-x-auto scrollbar-hide w-full md:w-fit">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'actions', label: 'Actions' },
            { key: 'agents', label: 'Agents' },
            { key: 'control', label: 'Control' },
            { key: 'insights', label: 'Insights' },
            { key: 'settings', label: 'Settings' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                if (t.key === 'control') setSubTab('policies');
                if (t.key === 'insights') setSubTab('alerts');
                if (t.key === 'settings') setSubTab('general');
              }}
              className={`px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              {t.label}
              {t.key === 'insights' && stats && stats.alerts.length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {stats.alerts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {!stats ? (
          <div className="space-y-6">
            {/* Skeleton stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
                  <div className="h-3 w-20 bg-white/[0.04] rounded animate-pulse mb-3" />
                  <div className="h-7 w-16 bg-white/[0.06] rounded animate-pulse mb-2" />
                  <div className="h-2.5 w-24 bg-white/[0.03] rounded animate-pulse" />
                </div>
              ))}
            </div>
            {/* Skeleton chart */}
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 h-[280px]">
              <div className="h-3 w-24 bg-white/[0.04] rounded animate-pulse mb-6" />
              <div className="flex items-end gap-1 h-[200px] pt-8">
                {Array.from({length: 24}, (_, i) => (
                  <div key={i} className="flex-1 bg-white/[0.03] rounded-t animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
                ))}
              </div>
            </div>
            {/* Skeleton table */}
            <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 w-12 bg-white/[0.04] rounded animate-pulse" />
                  <div className="h-4 w-20 bg-white/[0.04] rounded animate-pulse" />
                  <div className="h-4 w-16 bg-white/[0.04] rounded animate-pulse" />
                  <div className="h-4 flex-1 bg-white/[0.03] rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ) : tab === 'overview' ? (
          <OverviewTab stats={stats} actions={actions} apiKey={apiKey} />
        ) : tab === 'actions' ? (
          <ActionsTab actions={actions} apiKey={apiKey} onOpenAction={setDrawerAction} onOpenTrace={openTrace} />
        ) : tab === 'agents' ? (
          <AgentsTab stats={stats} onToggle={toggleAgent} onKill={killAgent} onSelect={setSelectedAgent} selectedAgent={selectedAgent} actions={actions} apiKey={apiKey} onOpenAction={setDrawerAction} onOpenTrace={openTrace} />
        ) : tab === 'control' ? (
          <div>
            <div className="flex gap-1 mb-4 border-b border-white/[0.06] pb-2">
              {['policies', 'approvals', 'budgets'].map(st => (
                <button key={st} onClick={() => setSubTab(st)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                    subTab === st ? 'text-blue-400 border-b-2 border-blue-400' : 'text-white/30 hover:text-white/50'
                  }`}>
                  {st}
                </button>
              ))}
            </div>
            {subTab === 'policies' ? (
              <div className="space-y-8">
                <PolicyTemplatesSection apiKey={apiKey} onToast={addToast} onRefresh={fetchData} />
                <PoliciesTab apiKey={apiKey} onToast={addToast} />
              </div>
            ) : subTab === 'approvals' ? (
              <ApprovalsTab apiKey={apiKey} onToast={addToast} />
            ) : (
              <BudgetsTab stats={stats} apiKey={apiKey} onRefresh={fetchData} />
            )}
          </div>
        ) : tab === 'insights' ? (
          <div>
            <div className="flex gap-1 mb-4 border-b border-white/[0.06] pb-2">
              {['alerts', 'evaluations', 'analytics', 'forecast', 'replay'].map(st => (
                <button key={st} onClick={() => setSubTab(st)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                    subTab === st ? 'text-blue-400 border-b-2 border-blue-400' : 'text-white/30 hover:text-white/50'
                  }`}>
                  {st}
                  {st === 'alerts' && stats.alerts.length > 0 && (
                    <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                      {stats.alerts.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {subTab === 'alerts' ? (
              <AlertsTab stats={stats} apiKey={apiKey} onRefresh={fetchData} onAcknowledge={acknowledgeAlert} />
            ) : subTab === 'evaluations' ? (
              <EvaluationsTab apiKey={apiKey} onToast={addToast} />
            ) : subTab === 'analytics' ? (
              <AnalyticsTab apiKey={apiKey} />
            ) : subTab === 'forecast' ? (
              <ForecastTab apiKey={apiKey} />
            ) : (
              <TraceReplayView apiKey={apiKey} onToast={addToast} />
            )}
          </div>
        ) : tab === 'settings' ? (
          <div>
            <div className="flex gap-1 mb-4 border-b border-white/[0.06] pb-2">
              {['general', 'team', 'webhooks', 'rollbacks'].map(st => (
                <button key={st} onClick={() => setSubTab(st)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                    subTab === st ? 'text-blue-400 border-b-2 border-blue-400' : 'text-white/30 hover:text-white/50'
                  }`}>
                  {st}
                </button>
              ))}
            </div>
            {subTab === 'general' ? (
              <SettingsTab apiKey={apiKey} onToast={addToast} />
            ) : subTab === 'team' ? (
              <TeamTab onToast={addToast} />
            ) : subTab === 'webhooks' ? (
              <WebhooksTab apiKey={apiKey} onToast={addToast} />
            ) : (
              <RollbackHooksTab apiKey={apiKey} onToast={addToast} />
            )}
          </div>
        ) : null}

        {/* API Key display */}
        <div className="mt-8 p-3 md:p-4 bg-white/[0.03] rounded-lg border border-white/[0.06]">
          <p className="text-xs text-white/30 mb-1">Your API Key (keep secret)</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs text-blue-400 font-mono break-all">{apiKey.slice(0, 15)}...{apiKey.slice(-4)}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(apiKey); addToast('API key copied', 'info'); }}
              className="text-xs text-white/30 hover:text-white/50"
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      {/* Action Drawer */}
      {drawerAction && (
        <ActionDrawer action={drawerAction} onClose={() => setDrawerAction(null)} onOpenTrace={openTrace} />
      )}

      {/* Trace Timeline */}
      {traceData && (
        <TraceTimeline
          traceId={traceData.traceId}
          actions={traceData.actions as React.ComponentProps<typeof TraceTimeline>['actions']}
          summary={traceData.summary as React.ComponentProps<typeof TraceTimeline>['summary']}
          onClose={() => setTraceData(null)}
        />
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-2.5 rounded-lg text-[13px] font-medium shadow-lg animate-in slide-in-from-right fade-in duration-200 ${
              toast.type === 'success' ? 'bg-emerald-500/90 text-white' :
              toast.type === 'error' ? 'bg-red-500/90 text-white' :
              'bg-blue-500/90 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== SETUP SCREEN ====================
function SetupScreen({ onSetup, loading, error }: {
  onSetup: (key?: string) => void;
  loading: boolean;
  error: string;
}) {
  const [inputKey, setInputKey] = useState('');
  const [mode, setMode] = useState<'new' | 'existing'>('new');

  return (
    <div className="min-h-screen bg-[#08080a] text-white flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 logo-heartbeat-glow">
            <svg className="logo-heartbeat" width="36" height="36" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M24 10L36 16V26C36 32 30 37 24 39C18 37 12 32 12 26V16L24 10Z" stroke="white" strokeOpacity="0.12" strokeWidth="1" fill="none"/></svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">AgentLedger</h1>
          <p className="text-white/50">The missing observability layer for AI agents</p>
        </div>

        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-6">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode('new')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'new' ? 'bg-blue-500 text-white' : 'bg-white/[0.03] text-white/40'
              }`}
            >
              New Account
            </button>
            <button
              onClick={() => setMode('existing')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'existing' ? 'bg-blue-500 text-white' : 'bg-white/[0.03] text-white/40'
              }`}
            >
              I have a key
            </button>
          </div>

          {mode === 'existing' ? (
            <div>
              <input
                type="text"
                value={inputKey}
                onChange={e => setInputKey(e.target.value)}
                placeholder="al_..."
                className="w-full bg-black/50 border border-white/[0.06] rounded-lg px-4 py-3 text-sm font-mono text-white placeholder-white/20 focus:border-blue-500/50 focus:outline-none mb-4"
              />
              <button
                onClick={() => onSetup(inputKey)}
                disabled={loading || !inputKey.startsWith('al_')}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:text-white/30 text-white font-medium py-3 rounded-lg transition-colors"
              >
                {loading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-white/50 mb-4">
                Create a free account to start tracking your AI agents. You&apos;ll get an API key to integrate with your agents.
              </p>
              <button
                onClick={() => onSetup()}
                disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:text-white/30 text-white font-medium py-3 rounded-lg transition-colors"
              >
                {loading ? 'Creating...' : 'Create Free Account'}
              </button>
            </div>
          )}

          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ==================== OVERVIEW TAB ====================
function OverviewTab({ stats, actions, apiKey }: { stats: Stats; actions: ActionLog[]; apiKey: string }) {
  const [usage, setUsage] = useState<{ actions_used: number; actions_limit: number; percentage: number; plan: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/usage', { headers: { Authorization: `Bearer ${apiKey}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.usage) {
          setUsage({
            actions_used: d.usage.actionsThisMonth || 0,
            actions_limit: d.limits?.actionsPerMonth || 1000,
            percentage: d.percentages?.actions || 0,
            plan: d.plan || 'free',
          });
        }
      })
      .catch(() => {});
  }, [apiKey]);

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Actions" value={(stats.totalActions || 0).toLocaleString()} sub={`${stats.todayActions || 0} today`} />
        <StatCard
          label="Cost Today"
          value={formatCost(stats.todayCostCents || 0)}
          sub={`${formatCost(stats.weekCostCents || 0)} this week`}
          accent="orange"
          trend={(() => {
            const dailyAvg = (stats.weekCostCents || 0) / 7;
            const todayCost = stats.todayCostCents || 0;
            if (dailyAvg === 0 && todayCost === 0) return undefined;
            if (dailyAvg === 0) return { text: `\u2191 above avg`, color: 'red' as const };
            const pctDiff = Math.round(((todayCost - dailyAvg) / dailyAvg) * 100);
            if (pctDiff > 0) return { text: `\u2191 ${pctDiff}% vs avg`, color: 'red' as const };
            return { text: `\u2193 ${Math.abs(pctDiff)}% vs avg`, color: 'emerald' as const };
          })()}
        />
        <StatCard
          label="Active Agents"
          value={`${stats.activeAgents || 0}`}
          sub={`${stats.totalAgents || 0} total`}
          accent="emerald"
          trend={(() => {
            const pausedCount = stats.agents.filter(a => a.status === 'paused').length;
            const killedCount = stats.agents.filter(a => a.status === 'killed').length;
            if (killedCount > 0) return { text: `${killedCount} killed`, color: 'red' as const };
            if (pausedCount > 0) return { text: `${pausedCount} paused`, color: 'amber' as const };
            if (stats.activeAgents > 0) return { text: 'All healthy', color: 'emerald' as const };
            return undefined;
          })()}
        />
        <StatCard
          label="Error Rate"
          value={(() => {
            const rate = (stats.todayActions || 0) > 0 ? ((stats.errorCount || 0) / stats.todayActions) * 100 : 0;
            return `${rate.toFixed(1)}%`;
          })()}
          sub={`${stats.errorCount || 0} errors, ${stats.blockedCount || 0} blocked`}
          accent={(() => {
            const rate = (stats.todayActions || 0) > 0 ? ((stats.errorCount || 0) / stats.todayActions) * 100 : 0;
            if (rate > 5) return 'red';
            if (rate >= 1) return 'orange';
            return 'emerald';
          })()}
          trend={(() => {
            const rate = (stats.todayActions || 0) > 0 ? ((stats.errorCount || 0) / stats.todayActions) * 100 : 0;
            if (rate > 5) return { text: 'Above threshold', color: 'red' as const };
            if (rate >= 1) return { text: 'Elevated', color: 'amber' as const };
            if (stats.todayActions > 0) return { text: 'Healthy', color: 'emerald' as const };
            return undefined;
          })()}
        />
      </div>

      {/* Plan Usage Bar */}
      {usage && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Plan Usage</span>
              <span className="text-[10px] bg-white/[0.04] text-white/30 px-1.5 py-0.5 rounded-full uppercase">{usage.plan || 'free'}</span>
            </div>
            <span className="text-xs text-white/50">
              {usage.actions_used.toLocaleString()} / {usage.actions_limit.toLocaleString()} actions this month
            </span>
          </div>
          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usage.percentage > 90 ? 'bg-red-500' : usage.percentage > 70 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(usage.percentage, 100)}%` }}
            />
          </div>
          {usage.percentage > 80 && (
            <p className="text-[11px] text-amber-400/60 mt-1.5">
              {usage.percentage >= 100 ? 'Action limit reached. Upgrade for more.' : `${Math.round(100 - usage.percentage)}% remaining this month.`}
            </p>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Activity Timeline */}
        <div className="md:col-span-2 bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <h3 className="text-sm font-medium text-white/60 mb-4">Activity (24h)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.hourlyData}>
              <defs>
                <linearGradient id="colorActions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="hour" stroke="#ffffff30" fontSize={11} tickLine={false} />
              <YAxis stroke="#ffffff30" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#999' }}
              />
              <Area type="monotone" dataKey="actions" stroke="#3b82f6" fill="url(#colorActions)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Service Breakdown */}
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <h3 className="text-sm font-medium text-white/60 mb-4">Services</h3>
          {Object.keys(stats.serviceBreakdown).length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={Object.entries(stats.serviceBreakdown).map(([name, value]) => ({ name, value }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    dataKey="value"
                    stroke="none"
                  >
                    {Object.keys(stats.serviceBreakdown).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {Object.entries(stats.serviceBreakdown).slice(0, 5).map(([name, count], i) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-white/60">{name}</span>
                    </div>
                    <span className="text-white/40">{count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[200px] text-center">
              <div className="text-2xl mb-2 opacity-30">📊</div>
              <p className="text-white/30 text-sm">No service data yet</p>
              <p className="text-white/15 text-xs mt-1">Charts appear once your agents start logging actions</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Actions Feed */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06]">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-medium text-white/60">Recent Actions</h3>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {actions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="text-2xl mb-3 opacity-30">📡</div>
              <p className="text-white/30 text-sm font-medium mb-2">No actions yet</p>
              <p className="text-white/15 text-xs mb-4 max-w-sm mx-auto">Send a test action to see it appear here in real-time:</p>
              <div className="bg-black/30 rounded-lg p-3 max-w-md mx-auto mb-4">
                <code className="text-[11px] text-blue-400/70 font-mono whitespace-pre-wrap break-all">
                  {`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/actions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agent":"test-bot","service":"test","action":"hello"}'`}
                </code>
              </div>
              <a href="/docs#core-sdk" className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors">Read the SDK docs →</a>
            </div>
          ) : (
            actions.slice(0, 10).map(action => (
              <div key={action.id} className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.015] transition-colors">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  action.status === 'success' || action.status === 'allowed' ? 'bg-emerald-400' :
                  action.status === 'error' ? 'bg-red-400' : 'bg-amber-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white/80">{action.agent_name}</span>
                    <span className="text-white/20">→</span>
                    <span className="text-sm text-blue-400">{action.service}</span>
                    <span className="text-white/20">·</span>
                    <span className="text-sm text-white/40">{action.action}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  {action.estimated_cost_cents > 0 && (
                    <span className="text-xs text-white/30">{formatCost(action.estimated_cost_cents)}</span>
                  )}
                  {action.duration_ms > 0 && (
                    <span className="text-xs text-white/30">{action.duration_ms}ms</span>
                  )}
                  <span className="text-xs text-white/20">{timeAgo(action.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== ACTIONS TAB ====================
function ActionsTab({ actions, apiKey, onOpenAction, onOpenTrace }: { actions: ActionLog[]; apiKey: string; onOpenAction: (a: ActionLog) => void; onOpenTrace: (traceId: string) => void }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');

  // Derive unique values for filter dropdowns
  const services = [...new Set(actions.map(a => a.service))].sort();
  const agents = [...new Set(actions.map(a => a.agent_name))].sort();
  const statuses = [...new Set(actions.map(a => a.status))].sort();

  const filtered = actions.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (serviceFilter !== 'all' && a.service !== serviceFilter) return false;
    if (agentFilter !== 'all' && a.agent_name !== agentFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.agent_name.toLowerCase().includes(q) || a.service.toLowerCase().includes(q) || a.action.toLowerCase().includes(q);
    }
    return true;
  });

  const activeFilters = [statusFilter !== 'all', serviceFilter !== 'all', agentFilter !== 'all', search].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-sm">⌕</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search actions..."
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/60 focus:border-blue-500/50 focus:outline-none appearance-none cursor-pointer"
          >
            <option value="all">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/60 focus:border-blue-500/50 focus:outline-none appearance-none cursor-pointer"
          >
            <option value="all">All services</option>
            {services.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white/60 focus:border-blue-500/50 focus:outline-none appearance-none cursor-pointer"
          >
            <option value="all">All agents</option>
            {agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setServiceFilter('all'); setAgentFilter('all'); }}
              className="text-[11px] text-white/30 hover:text-white/50 px-2"
            >
              Clear ({activeFilters})
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-[11px] text-white/20">{filtered.length} of {actions.length} actions</p>

      {/* Table — scrollable on mobile */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-left">
                <th className="px-4 py-3 text-xs font-medium text-white/40">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-white/40">Agent</th>
                <th className="px-4 py-3 text-xs font-medium text-white/40">Service</th>
                <th className="px-4 py-3 text-xs font-medium text-white/40">Action</th>
                <th className="px-4 py-3 text-xs font-medium text-white/40">Cost</th>
                <th className="px-4 py-3 text-xs font-medium text-white/40">Duration</th>
                <th className="px-4 py-3 text-xs font-medium text-white/40">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/20 text-sm">
                    {actions.length === 0 ? (
                      <div>
                        <p className="text-white/30 mb-1">No actions recorded yet</p>
                        <p className="text-white/15 text-xs">Send your first event using the SDK or curl to see it here.</p>
                      </div>
                    ) : 'No matching actions'}
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 100).map(action => (
                  <tr
                    key={action.id}
                    onClick={() => onOpenAction(action)}
                    className="hover:bg-white/[0.015] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${STATUS_COLORS[action.status] || 'text-white/40'}`}>
                        {action.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/80 font-mono">{action.agent_name}</td>
                    <td className="px-4 py-3 text-sm text-blue-400">{action.service}</td>
                    <td className="px-4 py-3 text-sm text-white/60">{action.action}</td>
                    <td className="px-4 py-3 text-sm text-white/40">
                      {action.estimated_cost_cents > 0 ? formatCost(action.estimated_cost_cents) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/40">
                      {action.duration_ms > 0 ? `${action.duration_ms}ms` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/30">
                      {action.trace_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenTrace(action.trace_id!); }}
                          className="text-purple-400/50 hover:text-purple-400 mr-1.5 transition-colors"
                          title="View trace timeline"
                        >⟐</button>
                      )}
                      {timeAgo(action.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 100 && (
          <div className="px-4 py-2 border-t border-white/[0.04] text-xs text-white/20 text-center">
            Showing first 100 of {filtered.length} results
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== AGENTS TAB ====================
function AgentsTab({ stats, onToggle, onKill, onSelect, selectedAgent, actions, apiKey, onOpenAction, onOpenTrace }: {
  stats: Stats;
  onToggle: (name: string, status: string) => void;
  onKill: (name: string) => void;
  onSelect: (name: string | null) => void;
  selectedAgent: string | null;
  actions: ActionLog[];
  apiKey: string;
  onOpenAction: (a: ActionLog) => void;
  onOpenTrace: (traceId: string) => void;
}) {
  const [killConfirm, setKillConfirm] = useState<string | null>(null);

  // If an agent is selected, show detail view
  if (selectedAgent) {
    const agent = stats.agents.find(a => a.name === selectedAgent);
    if (!agent) {
      onSelect(null);
      return null;
    }
    return <AgentDetailView agent={agent} actions={actions} onBack={() => onSelect(null)} onToggle={onToggle} onKill={onKill} apiKey={apiKey} onOpenAction={onOpenAction} onOpenTrace={onOpenTrace} />;
  }

  return (
    <div className="space-y-4">
      {/* Kill confirmation modal */}
      {killConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setKillConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-red-500/30 rounded-xl p-6 max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="text-2xl mb-3">🚨</div>
            <h3 className="font-semibold text-lg mb-2">Kill Agent: {killConfirm}?</h3>
            <p className="text-sm text-white/50 mb-4">
              This will permanently stop the agent from performing any actions. 
              All future API calls through the SDK will be blocked. You can resume it later from this dashboard.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { onKill(killConfirm); setKillConfirm(null); }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                Kill Agent
              </button>
              <button
                onClick={() => setKillConfirm(null)}
                className="flex-1 bg-white/[0.03] hover:bg-white/10 text-white/60 font-medium py-2.5 rounded-lg transition-colors text-sm border border-white/[0.06]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {stats.agents.length === 0 ? (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-12 text-center">
          <div className="text-2xl mb-3 opacity-30">🤖</div>
          <p className="text-white/30 text-sm font-medium mb-2">No agents registered yet</p>
          <p className="text-white/15 text-xs mb-4">Agents are auto-registered when they first log an action. Use the SDK to get started:</p>
          <div className="bg-black/30 rounded-lg p-3 max-w-sm mx-auto mb-3">
            <code className="text-[11px] text-blue-400/70 font-mono">await ledger.track({'{'} agent: &apos;my-bot&apos;, service: &apos;slack&apos;, action: &apos;send&apos; {'}'}, fn)</code>
          </div>
          <a href="/docs#core-sdk" className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors">View integration guide →</a>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.agents.map(agent => {
            // Compute top services for this agent from actions
            const agentServices: Record<string, number> = {};
            actions.filter(a => a.agent_name === agent.name).forEach(a => {
              agentServices[a.service] = (agentServices[a.service] || 0) + 1;
            });
            const topServices = Object.entries(agentServices)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([name]) => name);

            return (
            <div
              key={agent.id}
              onClick={() => onSelect(agent.name)}
              className={`bg-white/[0.03] rounded-xl border p-5 transition-colors cursor-pointer hover:bg-white/[0.05] ${
              agent.status === 'killed' ? 'border-red-500/20 opacity-60' :
              agent.status === 'paused' ? 'border-amber-500/20' : 'border-white/[0.06]'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[agent.status]}`} />
                  <span className="font-medium font-mono text-sm">{agent.name}</span>
                  {agent.status === 'killed' && (
                    <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded uppercase font-medium">killed</span>
                  )}
                </div>
                <span className="text-xs text-white/20">→</span>
              </div>
              {topServices.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4 ml-[18px]">
                  {topServices.map(s => (
                    <span key={s} className="text-[10px] text-white/25 bg-white/[0.03] border border-white/[0.05] px-1.5 py-0.5 rounded font-mono">{s}</span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-xs text-white/30 mb-0.5">Total Actions</p>
                  <p className="text-lg font-semibold">{(agent.total_actions || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-white/30 mb-0.5">Total Cost</p>
                  <p className="text-lg font-semibold">{formatCost(agent.total_cost_cents || 0)}</p>
                </div>
              </div>
              {agent.last_active_at && (
                <p className="text-xs text-white/20 mb-3">Last active {timeAgo(agent.last_active_at)}</p>
              )}
              {/* Action buttons */}
              <div className="flex gap-2 pt-3 border-t border-white/[0.04]">
                {agent.status !== 'killed' ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggle(agent.name, agent.status); }}
                      className={`flex-1 text-xs py-2 rounded-lg font-medium transition-colors ${
                        agent.status === 'active'
                          ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                    >
                      {agent.status === 'active' ? '⏸ Pause' : '▶ Resume'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setKillConfirm(agent.name); }}
                      className="text-xs py-2 px-3 rounded-lg font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Kill this agent"
                    >
                      ⏹ Kill
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggle(agent.name, agent.status); }}
                    className="flex-1 text-xs py-2 rounded-lg font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    ▶ Revive Agent
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== AGENT DETAIL VIEW ====================
function AgentDetailView({ agent, actions, onBack, onToggle, onKill, apiKey, onOpenAction, onOpenTrace }: {
  agent: Agent;
  actions: ActionLog[];
  onBack: () => void;
  onToggle: (name: string, status: string) => void;
  onKill: (name: string) => void;
  apiKey: string;
  onOpenAction: (a: ActionLog) => void;
  onOpenTrace: (traceId: string) => void;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [killConfirm, setKillConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'traces'>('list');

  // Filter actions for this agent
  const agentActions = actions.filter(a => a.agent_name === agent.name);
  
  // Compute stats
  const successCount = agentActions.filter(a => a.status === 'success' || a.status === 'allowed').length;
  const errorCount = agentActions.filter(a => a.status === 'error').length;
  const blockedCount = agentActions.filter(a => a.status === 'blocked').length;
  const avgDuration = agentActions.length > 0 
    ? Math.round(agentActions.reduce((sum, a) => sum + (a.duration_ms || 0), 0) / agentActions.length)
    : 0;
  const totalCost = agentActions.reduce((sum, a) => sum + (a.estimated_cost_cents || 0), 0);
  const services = [...new Set(agentActions.map(a => a.service))];
  const actionTypes = [...new Set(agentActions.map(a => a.action))];
  
  // Success rate
  const successRate = agentActions.length > 0 
    ? Math.round((successCount / agentActions.length) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Kill confirmation modal */}
      {killConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setKillConfirm(false)}>
          <div className="bg-[#1a1a1a] border border-red-500/30 rounded-xl p-6 max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="text-2xl mb-3">🚨</div>
            <h3 className="font-semibold text-lg mb-2">Kill Agent: {agent.name}?</h3>
            <p className="text-sm text-white/50 mb-4">
              This will permanently stop the agent from performing any actions. 
              All future API calls through the SDK will be blocked.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { onKill(agent.name); setKillConfirm(false); }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                Kill Agent
              </button>
              <button
                onClick={() => setKillConfirm(false)}
                className="flex-1 bg-white/[0.03] hover:bg-white/10 text-white/60 font-medium py-2.5 rounded-lg transition-colors text-sm border border-white/[0.06]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            ← All Agents
          </button>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${STATUS_DOT[agent.status]}`} />
            <h2 className="text-xl font-semibold font-mono">{agent.name}</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-medium ${
              agent.status === 'killed' ? 'bg-red-500/10 text-red-400' :
              agent.status === 'paused' ? 'bg-amber-500/10 text-amber-400' :
              'bg-emerald-500/10 text-emerald-400'
            }`}>{agent.status}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {agent.status !== 'killed' ? (
            <>
              <button
                onClick={() => onToggle(agent.name, agent.status)}
                className={`text-xs py-2 px-4 rounded-lg font-medium transition-colors ${
                  agent.status === 'active'
                    ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                {agent.status === 'active' ? '⏸ Pause' : '▶ Resume'}
              </button>
              <button
                onClick={() => setKillConfirm(true)}
                className="text-xs py-2 px-4 rounded-lg font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                ⏹ Kill
              </button>
            </>
          ) : (
            <button
              onClick={() => onToggle(agent.name, agent.status)}
              className="text-xs py-2 px-4 rounded-lg font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              ▶ Revive Agent
            </button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
          <p className="text-xs text-white/30 mb-1">Total Actions</p>
          <p className="text-2xl font-semibold">{(agent.total_actions || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
          <p className="text-xs text-white/30 mb-1">Total Cost</p>
          <p className="text-2xl font-semibold">{formatCost(agent.total_cost_cents || 0)}</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
          <p className="text-xs text-white/30 mb-1">Success Rate</p>
          <p className={`text-2xl font-semibold ${successRate >= 95 ? 'text-emerald-400' : successRate >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
            {successRate}%
          </p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
          <p className="text-xs text-white/30 mb-1">Avg Duration</p>
          <p className="text-2xl font-semibold">{avgDuration > 0 ? `${avgDuration}ms` : '—'}</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
          <p className="text-xs text-white/30 mb-1">Errors</p>
          <p className={`text-2xl font-semibold ${errorCount > 0 ? 'text-red-400' : 'text-white/60'}`}>{errorCount}</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
          <p className="text-xs text-white/30 mb-1">Blocked</p>
          <p className={`text-2xl font-semibold ${blockedCount > 0 ? 'text-amber-400' : 'text-white/60'}`}>{blockedCount}</p>
        </div>
      </div>

      {/* Services & Action Types */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <h3 className="text-sm font-medium text-white/50 mb-3">Services Used</h3>
          {services.length === 0 ? (
            <p className="text-xs text-white/20">No services recorded</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map(s => {
                const count = agentActions.filter(a => a.service === s).length;
                return (
                  <span key={s} className="text-xs bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-lg">
                    {s} <span className="text-blue-400/50 ml-1">{count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <h3 className="text-sm font-medium text-white/50 mb-3">Action Types</h3>
          {actionTypes.length === 0 ? (
            <p className="text-xs text-white/20">No actions recorded</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {actionTypes.map(a => {
                const count = agentActions.filter(act => act.action === a).length;
                return (
                  <span key={a} className="text-xs bg-white/[0.05] text-white/50 px-2.5 py-1 rounded-lg">
                    {a} <span className="text-white/20 ml-1">{count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Last active */}
      {agent.last_active_at && (
        <p className="text-xs text-white/20">Last active {timeAgo(agent.last_active_at)} · {new Date(agent.last_active_at).toLocaleString()}</p>
      )}

      {/* Action history with trace/list toggle */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white/50">Action History</h3>
          {/* Show trace toggle if there are any traced actions */}
          {agentActions.some(a => a.trace_id) && (
            <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`text-[10px] px-2.5 py-1 rounded transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white/70' : 'text-white/30 hover:text-white/50'}`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('traces')}
                className={`text-[10px] px-2.5 py-1 rounded transition-colors ${viewMode === 'traces' ? 'bg-purple-500/20 text-purple-400' : 'text-white/30 hover:text-white/50'}`}
              >
                ⟐ Traces
              </button>
            </div>
          )}
        </div>

        {viewMode === 'traces' ? (
          // Trace view — group by trace_id
          <div>
            {(() => {
              const traced = agentActions.filter(a => a.trace_id);
              const untraced = agentActions.filter(a => !a.trace_id);
              const traceMap = new Map<string, ActionLog[]>();
              for (const a of traced) {
                const list = traceMap.get(a.trace_id!) || [];
                list.push(a);
                traceMap.set(a.trace_id!, list);
              }
              return (
                <>
                  {[...traceMap.entries()].map(([tid, acts]) => (
                    <TraceGroup key={tid} traceId={tid} actions={acts} onOpenAction={onOpenAction} onOpenTrace={onOpenTrace} />
                  ))}
                  {untraced.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] text-white/20 mb-2">Untraced actions ({untraced.length})</p>
                      {untraced.slice(0, 20).map(action => (
                        <div
                          key={action.id}
                          onClick={() => onOpenAction(action)}
                          className="px-3 py-2 flex items-center gap-3 hover:bg-white/[0.02] cursor-pointer rounded transition-colors"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            action.status === 'success' || action.status === 'allowed' ? 'bg-emerald-400' :
                            action.status === 'error' ? 'bg-red-400' : 'bg-amber-400'
                          }`} />
                          <span className="text-xs text-blue-400">{action.service}</span>
                          <span className="text-xs text-white/40">{action.action}</span>
                          <span className="text-[10px] text-white/20 ml-auto">{timeAgo(action.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        ) : (
        // List view — existing table
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-left">
                  <th className="px-4 py-3 text-xs font-medium text-white/40">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-white/40">Service</th>
                  <th className="px-4 py-3 text-xs font-medium text-white/40">Action</th>
                  <th className="px-4 py-3 text-xs font-medium text-white/40">Cost</th>
                  <th className="px-4 py-3 text-xs font-medium text-white/40">Duration</th>
                  <th className="px-4 py-3 text-xs font-medium text-white/40">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {agentActions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-white/20 text-sm">
                      No actions recorded for this agent yet.
                    </td>
                  </tr>
                ) : (
                  agentActions.slice(0, 100).map(action => (
                    <tr
                      key={action.id}
                      onClick={() => onOpenAction(action)}
                      className="hover:bg-white/[0.015] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${STATUS_COLORS[action.status] || 'text-white/40'}`}>
                          {action.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-400">{action.service}</td>
                      <td className="px-4 py-3 text-sm text-white/60">{action.action}</td>
                      <td className="px-4 py-3 text-sm text-white/40">
                        {action.estimated_cost_cents > 0 ? formatCost(action.estimated_cost_cents) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/40">
                        {action.duration_ms > 0 ? `${action.duration_ms}ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-white/30">
                        {action.trace_id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenTrace(action.trace_id!); }}
                            className="text-purple-400/50 hover:text-purple-400 mr-1.5 transition-colors"
                            title="View trace timeline"
                          >⟐</button>
                        )}
                        {timeAgo(action.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {agentActions.length > 100 && (
            <div className="px-4 py-2 border-t border-white/[0.04] text-xs text-white/20 text-center">
              Showing first 100 of {agentActions.length} actions
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// ==================== ALERTS TAB ====================
function AlertsTab({ stats, apiKey, onRefresh, onAcknowledge }: { stats: Stats; apiKey: string; onRefresh: () => void; onAcknowledge: (id?: string) => void }) {
  const SEVERITY_COLORS: Record<string, string> = {
    info: 'border-blue-500/20 bg-blue-500/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
    critical: 'border-red-500/20 bg-red-500/5',
  };
  const SEVERITY_ICON: Record<string, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
  };

  return (
    <div className="space-y-4">
      {stats.alerts.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => onAcknowledge()}
            className="text-xs text-white/40 hover:text-white/60 bg-white/[0.03] hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            ✓ Acknowledge All
          </button>
        </div>
      )}
      {stats.alerts.length === 0 ? (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-12 text-center">
          <div className="text-2xl mb-3 opacity-50">✓</div>
          <p className="text-white/30 text-sm font-medium mb-1">All clear</p>
          <p className="text-white/15 text-xs">No active alerts. Your agents are behaving normally.</p>
        </div>
      ) : (
        stats.alerts.map(alert => (
          <div key={alert.id} className={`rounded-xl border p-5 transition-all ${SEVERITY_COLORS[alert.severity || 'warning'] || SEVERITY_COLORS.warning}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{SEVERITY_ICON[alert.severity || 'warning'] || '⚠️'}</span>
                  <span className="font-medium text-sm capitalize">{alert.alert_type.replace(/_/g, ' ')}</span>
                  <span className="text-white/20 text-xs">·</span>
                  <span className="text-xs font-mono text-blue-400">{alert.agent_name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${
                    alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    alert.severity === 'info' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {alert.severity || 'warning'}
                  </span>
                </div>
                <p className="text-sm text-white/60">{alert.message}</p>
                <p className="text-xs text-white/20 mt-1">{timeAgo(alert.created_at)}</p>
              </div>
              <button
                onClick={() => onAcknowledge(alert.id)}
                className="text-xs text-white/30 hover:text-white/60 bg-white/[0.03] hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors ml-4 flex-shrink-0"
              >
                ✓ Ack
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ==================== BUDGETS TAB ====================
function BudgetsTab({ stats, apiKey, onRefresh }: { stats: Stats; apiKey: string; onRefresh: () => void }) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newBudget, setNewBudget] = useState({ agent: '', period: 'daily', maxActions: '', maxCostDollars: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/budgets', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBudgets(data.budgets || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiKey]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  const createBudget = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/v1/budgets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: newBudget.agent,
          period: newBudget.period,
          max_actions: newBudget.maxActions ? parseInt(newBudget.maxActions) : null,
          max_cost_cents: newBudget.maxCostDollars ? Math.round(parseFloat(newBudget.maxCostDollars) * 100) : null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreate(false);
        setNewBudget({ agent: '', period: 'daily', maxActions: '', maxCostDollars: '' });
        fetchBudgets();
        onRefresh();
      } else {
        setError(data.error || 'Failed to create budget');
      }
    } catch {
      setError('Failed to create budget');
    }
    setCreating(false);
  };

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const deleteBudget = async (id: string) => {
    await fetch(`/api/v1/budgets?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    setDeleteConfirm(null);
    fetchBudgets();
    onRefresh();
  };

  const resetBudget = async (id: string) => {
    await fetch('/api/v1/budgets', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchBudgets();
    onRefresh();
  };

  const BUDGET_STATUS_COLORS: Record<string, string> = {
    ok: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-blue-500',
    exceeded: 'bg-red-500',
  };

  const BUDGET_STATUS_BORDER: Record<string, string> = {
    ok: 'border-white/[0.06]',
    warning: 'border-amber-500/30',
    critical: 'border-blue-500/30',
    exceeded: 'border-red-500/30',
  };

  // Cost by agent for the spend chart
  const agentSpend = stats.agents.map(a => ({
    name: a.name,
    cost: (a.total_cost_cents || 0) / 100,
    actions: a.total_actions || 0,
  })).filter(a => a.cost > 0 || a.actions > 0).sort((a, b) => b.cost - a.cost);

  // Cost by service from hourly data
  const serviceCostData = Object.entries(stats.serviceBreakdown).map(([name, count], i) => ({
    name,
    count,
    fill: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Budget delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Delete Budget?</h3>
            <p className="text-sm text-white/40 mb-4">This will remove the budget and its tracking. The agent will no longer have spending limits.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteBudget(deleteConfirm)} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 rounded-lg transition-colors">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-white/[0.03] hover:bg-white/10 text-white/60 text-sm font-medium py-2 rounded-lg transition-colors border border-white/[0.06]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Spend Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Cost Today" value={formatCost(stats.todayCostCents || 0)} sub="current period" accent="orange" />
        <StatCard label="Cost This Week" value={formatCost(stats.weekCostCents || 0)} sub="last 7 days" accent="orange" />
        <StatCard label="Active Budgets" value={`${budgets.length}`} sub={`${budgets.filter(b => b.status === 'exceeded').length} exceeded`} accent={budgets.some(b => b.status === 'exceeded') ? 'red' : 'emerald'} />
        <StatCard label="Avg Cost/Action" value={stats.todayActions > 0 ? formatCost(Math.round(stats.todayCostCents / stats.todayActions)) : '$0.00'} sub={`${stats.todayActions} actions today`} />
      </div>

      {/* Spend by Agent Chart */}
      {agentSpend.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <h3 className="text-sm font-medium text-white/60 mb-4">Spend by Agent</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={agentSpend} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis type="number" stroke="#ffffff30" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v.toFixed(2)}`} />
              <YAxis type="category" dataKey="name" stroke="#ffffff30" fontSize={11} tickLine={false} width={120} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v) => [`$${Number(v || 0).toFixed(2)}`, 'Cost']}
              />
              <Bar dataKey="cost" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Budget List */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-medium text-white/60">Budget Controls</h3>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            + New Budget
          </button>
        </div>

        {/* Create Budget Form */}
        {showCreate && (
          <div className="px-5 py-4 border-b border-white/[0.06] bg-white/[0.015]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-xs text-white/40 mb-1 block">Agent</label>
                <select
                  value={newBudget.agent}
                  onChange={e => setNewBudget({ ...newBudget, agent: e.target.value })}
                  className="w-full bg-black/50 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                >
                  <option value="">Select agent...</option>
                  {stats.agents.map(a => (
                    <option key={a.id} value={a.name}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Period</label>
                <select
                  value={newBudget.period}
                  onChange={e => setNewBudget({ ...newBudget, period: e.target.value })}
                  className="w-full bg-black/50 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Max Actions</label>
                <input
                  type="number"
                  value={newBudget.maxActions}
                  onChange={e => setNewBudget({ ...newBudget, maxActions: e.target.value })}
                  placeholder="e.g. 100"
                  className="w-full bg-black/50 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">Max Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newBudget.maxCostDollars}
                  onChange={e => setNewBudget({ ...newBudget, maxCostDollars: e.target.value })}
                  placeholder="e.g. 5.00"
                  className="w-full bg-black/50 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={createBudget}
                disabled={creating || !newBudget.agent || (!newBudget.maxActions && !newBudget.maxCostDollars)}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {creating ? 'Creating...' : 'Create Budget'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setError(''); }}
                className="text-sm text-white/40 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
              {error && <span className="text-sm text-red-400">{error}</span>}
            </div>
          </div>
        )}

        {/* Budget Cards */}
        {loading ? (
          <div className="px-5 py-12 text-center text-white/20 text-sm">Loading budgets...</div>
        ) : budgets.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="text-2xl mb-3 opacity-30">💰</div>
            <p className="text-white/30 text-sm font-medium mb-2">No budgets configured</p>
            <p className="text-white/15 text-xs mb-4">Set spending limits to automatically pause agents when they exceed their budget.</p>
            <a href="/docs#budgets" className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors">Learn about budgets →</a>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {budgets.map(budget => {
              const pctMax = Math.max(budget.pct_actions || 0, budget.pct_cost || 0);
              return (
                <div key={budget.id} className={`px-5 py-4 hover:bg-white/[0.015] transition-colors border-l-2 ${BUDGET_STATUS_BORDER[budget.status]}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-medium font-mono text-sm text-white/80">{budget.agent_name}</span>
                      <span className="text-xs text-white/30 bg-white/[0.03] px-2 py-0.5 rounded capitalize">{budget.period}</span>
                      <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${
                        budget.status === 'ok' ? 'bg-emerald-500/10 text-emerald-400' :
                        budget.status === 'warning' ? 'bg-amber-500/10 text-amber-400' :
                        budget.status === 'critical' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {budget.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => resetBudget(budget.id)}
                        className="text-xs text-white/30 hover:text-white/50 transition-colors px-2 py-1"
                        title="Reset counters"
                      >
                        ↻ Reset
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(budget.id)}
                        className="text-xs text-red-400/50 hover:text-red-400 transition-colors px-2 py-1"
                      >
                        ✕ Delete
                      </button>
                    </div>
                  </div>

                  {/* Progress Bars */}
                  <div className="space-y-2">
                    {budget.max_actions && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-white/40">Actions</span>
                          <span className="text-white/60">{budget.current_actions.toLocaleString()} / {budget.max_actions.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-white/[0.03] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${BUDGET_STATUS_COLORS[budget.status]}`}
                            style={{ width: `${Math.min(budget.pct_actions || 0, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {budget.max_cost_cents && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-white/40">Cost</span>
                          <span className="text-white/60">{formatCost(budget.current_cost_cents)} / {formatCost(budget.max_cost_cents)}</span>
                        </div>
                        <div className="h-2 bg-white/[0.03] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${BUDGET_STATUS_COLORS[budget.status]}`}
                            style={{ width: `${Math.min(budget.pct_cost || 0, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cost Timeline from hourly data */}
      {stats.hourlyData.some(h => h.cost > 0) && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
          <h3 className="text-sm font-medium text-white/60 mb-4">Cost Timeline (24h)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={stats.hourlyData}>
              <defs>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="hour" stroke="#ffffff30" fontSize={11} tickLine={false} />
              <YAxis stroke="#ffffff30" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(2)}`} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v) => [`$${Number(v || 0).toFixed(3)}`, 'Cost']}
              />
              <Area type="monotone" dataKey="cost" stroke="#10b981" fill="url(#colorCost)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ==================== WEBHOOKS TAB ====================
function WebhooksTab({ apiKey, onToast }: { apiKey: string; onToast: (msg: string, type: 'success' | 'error' | 'info') => void }) {
  const [webhooks, setWebhooks] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [shownSecret, setShownSecret] = useState<string | null>(null);

  const EVENTS = ['action.logged', 'agent.paused', 'agent.killed', 'agent.resumed', 'budget.exceeded', 'budget.warning', 'alert.created'];

  const fetchWebhooks = useCallback(async () => {
    const res = await fetch('/api/v1/webhooks', { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      const data = await res.json();
      setWebhooks(data.webhooks || []);
    }
    setLoading(false);
  }, [apiKey]);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const createWebhook = async () => {
    const res = await fetch('/api/v1/webhooks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: newUrl, description: newDesc, events: selectedEvents.length ? selectedEvents : undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      onToast('Webhook created', 'success');
      setShowCreate(false);
      setNewUrl('');
      setNewDesc('');
      setSelectedEvents([]);
      fetchWebhooks();
      // Show the secret in a proper modal
      if (data.secret) {
        setShownSecret(data.secret);
      }
    } else {
      const err = await res.json();
      onToast(err.error || 'Failed to create webhook', 'error');
    }
  };

  const deleteWebhook = async (id: string) => {
    const res = await fetch(`/api/v1/webhooks?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) { onToast('Webhook deleted', 'success'); fetchWebhooks(); }
  };

  const toggleWebhook = async (id: string, active: boolean) => {
    await fetch('/api/v1/webhooks', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !active }),
    });
    onToast(`Webhook ${!active ? 'enabled' : 'disabled'}`, 'info');
    fetchWebhooks();
  };

  if (loading) return <div className="text-white/30 text-center py-16">Loading webhooks...</div>;

  return (
    <div className="space-y-4">
      {/* Webhook secret modal */}
      {shownSecret && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShownSecret(null)}>
          <div className="bg-[#1a1a1a] border border-blue-500/20 rounded-xl p-6 max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Webhook Secret</h3>
            <p className="text-sm text-white/40 mb-4">Save this secret now — you won&apos;t see it again. Use it to verify webhook signatures.</p>
            <div className="bg-black/50 rounded-lg p-3 mb-4 flex items-center justify-between gap-2">
              <code className="text-[13px] text-blue-400 font-mono break-all">{shownSecret}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(shownSecret); onToast('Secret copied', 'info'); }}
                className="text-xs text-white/30 hover:text-white/60 flex-shrink-0"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setShownSecret(null)}
              className="w-full bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white/70">Webhooks</h3>
          <p className="text-xs text-white/30 mt-0.5">Get notified when agents act, budgets exceed, or alerts fire.</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
          + Add Webhook
        </button>
      </div>

      {showCreate && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 space-y-3">
          <input
            type="url"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="https://your-server.com/webhook"
            className="w-full bg-black/50 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
          />
          <input
            type="text"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-black/50 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
          />
          <div>
            <p className="text-xs text-white/30 mb-2">Events (empty = all events)</p>
            <div className="flex flex-wrap gap-2">
              {EVENTS.map(evt => (
                <button
                  key={evt}
                  onClick={() => setSelectedEvents(prev => prev.includes(evt) ? prev.filter(e => e !== evt) : [...prev, evt])}
                  className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                    selectedEvents.includes(evt)
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-white/[0.03] text-white/30 border border-white/[0.06] hover:text-white/50'
                  }`}
                >
                  {evt}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={createWebhook} disabled={!newUrl} className="bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/30 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="text-xs text-white/30 hover:text-white/50 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {webhooks.length === 0 && !showCreate ? (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-8 text-center">
          <div className="text-2xl mb-3 opacity-30">🔗</div>
          <p className="text-white/30 text-sm font-medium mb-2">No webhooks configured</p>
          <p className="text-white/15 text-xs mb-4">Get HTTP notifications when agents act, budgets exceed, or alerts fire.</p>
          <button onClick={() => setShowCreate(true)} className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-4 py-2 rounded-lg transition-colors border border-blue-500/20">
            Create your first webhook
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map(wh => (
            <div key={wh.id as string} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${wh.active ? 'bg-emerald-400' : 'bg-white/20'}`} />
                    <code className="text-xs text-blue-400 font-mono truncate block">{wh.url as string}</code>
                  </div>
                  {wh.description ? <p className="text-xs text-white/30 mb-1.5">{String(wh.description)}</p> : null}
                  <div className="flex flex-wrap gap-1">
                    {(wh.events as string[])?.map(evt => (
                      <span key={evt} className="text-[10px] bg-white/[0.03] text-white/25 px-1.5 py-0.5 rounded">{evt}</span>
                    ))}
                  </div>
                  {(wh.failure_count as number) > 0 && (
                    <p className="text-[10px] text-amber-400/50 mt-1">{wh.failure_count as number} consecutive failures</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleWebhook(wh.id as string, wh.active as boolean)}
                    className={`text-[11px] px-2 py-1 rounded-md ${wh.active ? 'text-amber-400/60 hover:text-amber-400' : 'text-emerald-400/60 hover:text-emerald-400'}`}
                  >
                    {wh.active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deleteWebhook(wh.id as string)} className="text-[11px] text-red-400/40 hover:text-red-400 px-2 py-1">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HMAC Verification docs */}
      <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] p-4">
        <h4 className="text-xs font-medium text-white/40 mb-2">Verifying webhook signatures</h4>
        <code className="text-[11px] text-emerald-400/60 font-mono block whitespace-pre leading-relaxed">{`const crypto = require('crypto');
const signature = req.headers['x-agentledger-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');
const valid = signature === expected;`}</code>
      </div>
    </div>
  );
}

// ==================== SETTINGS TAB (API KEYS + USAGE) ====================
function SettingsTab({ apiKey, onToast }: { apiKey: string; onToast: (msg: string, type: 'success' | 'error' | 'info') => void }) {
  const [keys, setKeys] = useState<Record<string, unknown>[]>([]);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  const fetchKeys = useCallback(async () => {
    // Fetch usage stats
    const usageRes = await fetch('/api/v1/usage', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (usageRes.ok) {
      setUsage(await usageRes.json());
    }

    // Fetch via stats for key info
    const keysRes = await fetch('/api/v1/stats', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (keysRes.ok) {
      setKeys([{ id: 'current', key_prefix: apiKey.slice(0, 10), name: 'Current Key', created_at: new Date().toISOString() }]);
    }
    setLoading(false);
  }, [apiKey]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const createKey = async () => {
    const res = await fetch('/api/v1/keys/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName || 'New Key' }),
    });
    if (res.ok) {
      const data = await res.json();
      onToast('New API key created', 'success');
      setShowCreate(false);
      setNewKeyName('');
      fetchKeys();
      // Show key once
      if (data.key) {
        setTimeout(() => {
          if (confirm(`New API Key (save it now!):\n\n${data.key}\n\nClick OK to copy to clipboard.`)) {
            navigator.clipboard.writeText(data.key);
          }
        }, 100);
      }
    } else {
      const err = await res.json();
      onToast(err.error || 'Failed to create key', 'error');
    }
  };

  const revokeKey = async (keyId: string) => {
    const res = await fetch('/api/v1/keys/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId }),
    });
    if (res.ok) {
      onToast('Key revoked', 'success');
      fetchKeys();
    } else {
      const err = await res.json();
      onToast(err.error || 'Failed to revoke key', 'error');
    }
  };

  const rotateKey = async (keyId: string) => {
    const res = await fetch('/api/v1/keys/rotate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId }),
    });
    if (res.ok) {
      const data = await res.json();
      onToast('Key rotated', 'success');
      fetchKeys();
      if (data.key) {
        setTimeout(() => {
          if (confirm(`Rotated API Key (save it now!):\n\n${data.key}\n\nClick OK to copy to clipboard.`)) {
            navigator.clipboard.writeText(data.key);
            // If this was the key we were using, update sessionStorage
            sessionStorage.setItem('al_api_key', data.key);
            window.location.reload();
          }
        }, 100);
      }
    } else {
      const err = await res.json();
      onToast(err.error || 'Failed to rotate key', 'error');
    }
  };

  if (loading) return <div className="text-white/30 text-center py-16">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Usage Stats */}
      {usage && (
        <div>
          <h3 className="text-sm font-medium text-white/70 mb-3">Usage</h3>
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/40">Actions this month</span>
              <span className="text-xs text-white/60 font-mono">
                {((usage.usage as Record<string, number>)?.actionsThisMonth || 0).toLocaleString()} / {((usage.limits as Record<string, number>)?.actionsPerMonth || 0).toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all ${
                  ((usage.percentages as Record<string, number>)?.actions || 0) > 90 ? 'bg-red-500' :
                  ((usage.percentages as Record<string, number>)?.actions || 0) > 75 ? 'bg-amber-500' :
                  'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, (usage.percentages as Record<string, number>)?.actions || 0)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-lg font-semibold">{((usage.usage as Record<string, number>)?.actionsToday || 0).toLocaleString()}</p>
                <p className="text-[10px] text-white/25">Today</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{((usage.usage as Record<string, number>)?.actionsThisWeek || 0).toLocaleString()}</p>
                <p className="text-[10px] text-white/25">This Week</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{(usage.usage as Record<string, number>)?.agents || 0}</p>
                <p className="text-[10px] text-white/25">Agents ({((usage.limits as Record<string, number>)?.maxAgents || 0)} max)</p>
              </div>
              <div>
                <p className="text-sm font-semibold capitalize text-blue-400">{usage.plan as string}</p>
                <p className="text-[10px] text-white/25">Plan</p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.04]">
              <p className="text-[11px] text-white/20">
                Data retention: {((usage.limits as Record<string, number>)?.retentionDays || 1)} day{((usage.limits as Record<string, number>)?.retentionDays || 1) > 1 ? 's' : ''}.
                Actions older than this are automatically deleted.
                {((usage.percentages as Record<string, number>)?.actions || 0) > 75 && (
                  <span className="text-amber-400/60"> Approaching monthly limit.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-white/70">API Keys</h3>
            <p className="text-xs text-white/30 mt-0.5">Manage authentication keys for your organization. Max 5 active keys.</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
            + New Key
          </button>
        </div>

        {showCreate && (
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 mb-4 flex items-center gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g., production, staging)"
              className="flex-1 bg-black/50 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
            />
            <button onClick={createKey} className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="text-xs text-white/30 hover:text-white/50 px-2 py-2">Cancel</button>
          </div>
        )}

        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id as string} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm text-white/70 font-medium">{k.name as string}</span>
                  {k.id === 'current' && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">In Use</span>}
                </div>
                <code className="text-xs text-white/25 font-mono">{k.key_prefix as string}{'...'}</code>
                {k.description ? <p className="text-xs text-white/20 mt-0.5">{String(k.description)}</p> : null}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => rotateKey(k.id as string)} className="text-[11px] text-blue-400/60 hover:text-blue-400 px-2 py-1 rounded-md">
                  Rotate
                </button>
                {k.id !== 'current' && (
                  <button onClick={() => revokeKey(k.id as string)} className="text-[11px] text-red-400/40 hover:text-red-400 px-2 py-1 rounded-md">
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <NotificationsSection apiKey={apiKey} onToast={onToast} />

      {/* Danger Zone */}
      <div className="border border-red-500/10 rounded-xl p-4">
        <h3 className="text-sm font-medium text-red-400/60 mb-1">Danger Zone</h3>
        <p className="text-xs text-white/20 mb-3">Revoking all keys will lock you out of the API. You&apos;ll need to create a new key through the dashboard.</p>
        <button
          onClick={async () => {
            if (!confirm('Are you sure you want to revoke ALL API keys? This will lock you out of the API. You will need to create a new key through the dashboard.')) return;
            for (const k of keys) {
              if (k.id === 'current') continue;
              await fetch('/api/v1/keys/revoke', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyId: k.id }),
              });
            }
            onToast('All keys revoked', 'success');
            sessionStorage.removeItem('agentledger_api_key');
            window.location.href = '/login';
          }}
          className="text-xs text-red-400/40 hover:text-red-400 border border-red-500/10 hover:border-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
        >
          Revoke All Keys
        </button>
      </div>
    </div>
  );
}

// ==================== ACTION DRAWER ====================
function ActionDrawer({ action, onClose, onOpenTrace }: { action: ActionLog; onClose: () => void; onOpenTrace?: (traceId: string) => void }) {
  const meta = (action.metadata || action.request_meta || {}) as Record<string, unknown>;
  const hasInput = action.input != null && typeof action.input === 'object' && Object.keys(action.input as Record<string, unknown>).length > 0;
  const hasOutput = action.output != null && typeof action.output === 'object' && Object.keys(action.output as Record<string, unknown>).length > 0;
  const hasMeta = Object.keys(meta).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div 
        className="relative w-full max-w-lg bg-[#111] border-l border-white/[0.06] h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#111] border-b border-white/[0.06] px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              action.status === 'success' || action.status === 'allowed' ? 'bg-emerald-500/10 text-emerald-400' :
              action.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
            }`}>{action.status}</span>
            <span className="text-sm font-medium text-white/80">{action.action}</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg transition-colors">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase text-white/25 mb-1">Agent</p>
              <p className="text-sm font-mono text-white/80">{action.agent_name}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-white/25 mb-1">Service</p>
              <p className="text-sm text-blue-400">{action.service}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-white/25 mb-1">Duration</p>
              <p className="text-sm text-white/60">{action.duration_ms > 0 ? `${action.duration_ms}ms` : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-white/25 mb-1">Cost</p>
              <p className="text-sm text-white/60">{action.estimated_cost_cents > 0 ? formatCost(action.estimated_cost_cents) : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-white/25 mb-1">Timestamp</p>
              <p className="text-sm text-white/60">{new Date(action.created_at).toLocaleString()}</p>
            </div>
            {action.trace_id ? (
              <div>
                <p className="text-[10px] uppercase text-white/25 mb-1">Trace ID</p>
                {onOpenTrace ? (
                  <button
                    onClick={() => onOpenTrace(action.trace_id!)}
                    className="text-sm font-mono text-purple-400 hover:text-purple-300 underline decoration-purple-400/30 hover:decoration-purple-300/50 transition-colors"
                    title="View trace timeline"
                  >
                    {action.trace_id}
                  </button>
                ) : (
                  <p className="text-sm font-mono text-purple-400">{action.trace_id}</p>
                )}
              </div>
            ) : null}
          </div>

          {/* ID */}
          <div>
            <p className="text-[10px] uppercase text-white/25 mb-1">Action ID</p>
            <p className="text-xs font-mono text-white/30 break-all">{action.id}</p>
          </div>

          {/* Input */}
          {hasInput ? (
            <div>
              <p className="text-[10px] uppercase text-white/25 mb-2">Input</p>
              <pre className="text-[11px] text-emerald-300/70 font-mono bg-black/40 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                {JSON.stringify(action.input, null, 2)}
              </pre>
            </div>
          ) : null}

          {/* Output */}
          {hasOutput ? (
            <div>
              <p className="text-[10px] uppercase text-white/25 mb-2">Output</p>
              <pre className="text-[11px] text-blue-300/70 font-mono bg-black/40 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                {JSON.stringify(action.output, null, 2)}
              </pre>
            </div>
          ) : null}

          {/* Metadata */}
          {hasMeta ? (
            <div>
              <p className="text-[10px] uppercase text-white/25 mb-2">Metadata</p>
              <pre className="text-[11px] text-white/30 font-mono bg-black/40 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                {JSON.stringify(meta, null, 2)}
              </pre>
            </div>
          ) : null}

          {/* No data hint */}
          {!hasInput && !hasOutput && !hasMeta && (
            <div className="bg-white/[0.02] rounded-lg border border-white/[0.04] p-4 text-center">
              <p className="text-xs text-white/20 mb-2">No input/output data recorded</p>
              <p className="text-[10px] text-white/10">Tip: Pass <code className="text-blue-400/50">input</code> and <code className="text-blue-400/50">captureOutput: true</code> in the SDK to see request/response data here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== TRACE GROUP VIEW ====================
function TraceGroup({ traceId, actions, onOpenAction, onOpenTrace }: { traceId: string; actions: ActionLog[]; onOpenAction: (a: ActionLog) => void; onOpenTrace?: (traceId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...actions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const hasError = sorted.some(a => a.status === 'error');
  const totalDuration = sorted.reduce((sum, a) => sum + (a.duration_ms || 0), 0);

  return (
    <div className={`bg-white/[0.02] rounded-xl border ${hasError ? 'border-red-500/15' : 'border-purple-500/15'} mb-3 overflow-hidden`}>
      <div 
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-purple-400 text-xs">⟐</span>
          <span className="text-xs font-mono text-purple-400/70">{traceId}</span>
          <span className="text-[10px] text-white/20">{sorted.length} steps</span>
          <span className="text-[10px] text-white/20">{totalDuration}ms total</span>
          {hasError && <span className="text-[10px] text-red-400">has errors</span>}
        </div>
        <div className="flex items-center gap-2">
          {onOpenTrace && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenTrace(traceId); }}
              className="text-[10px] text-purple-400/50 hover:text-purple-400 hover:bg-purple-500/10 px-2 py-0.5 rounded transition-colors"
              title="View trace timeline"
            >
              Timeline
            </button>
          )}
          <span className="text-white/20 text-xs">{expanded ? '▾' : '▸'}</span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-white/[0.04]">
          {sorted.map((action, idx) => (
            <div 
              key={action.id}
              onClick={() => onOpenAction(action)}
              className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] cursor-pointer transition-colors border-b border-white/[0.02] last:border-0"
            >
              {/* Step indicator */}
              <div className="flex flex-col items-center w-6 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${
                  action.status === 'success' || action.status === 'allowed' ? 'bg-emerald-400' :
                  action.status === 'error' ? 'bg-red-400' : 'bg-amber-400'
                }`} />
                {idx < sorted.length - 1 && <div className="w-px h-4 bg-white/[0.06] mt-0.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-400">{action.service}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-xs text-white/50">{action.action}</span>
                </div>
              </div>
              <span className="text-[10px] text-white/20 flex-shrink-0">{action.duration_ms > 0 ? `${action.duration_ms}ms` : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== NOTIFICATIONS SECTION ====================
function NotificationsSection({ apiKey, onToast }: { apiKey: string; onToast: (msg: string, type: 'success' | 'error' | 'info') => void }) {
  const [slackUrl, setSlackUrl] = useState('');
  const [email, setEmail] = useState('');
  const [slackEvents, setSlackEvents] = useState<string[]>(['action.error', 'budget.exceeded', 'agent.killed']);
  const [emailEvents, setEmailEvents] = useState<string[]>(['action.error', 'budget.exceeded', 'agent.killed']);
  const [slackActive, setSlackActive] = useState(false);
  const [emailActive, setEmailActive] = useState(false);
  const [saving, setSaving] = useState(false);

  const ALL_EVENTS = [
    { key: 'action.error', label: 'Action Errors', desc: 'When an agent action fails' },
    { key: 'budget.exceeded', label: 'Budget Exceeded', desc: 'When an agent exceeds its budget' },
    { key: 'budget.warning', label: 'Budget Warning', desc: 'When an agent reaches 75% of budget' },
    { key: 'agent.killed', label: 'Agent Killed', desc: 'When an agent is killed' },
  ];

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/v1/notifications', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return;
      const { settings } = await res.json();
      for (const s of settings || []) {
        if (s.channel === 'slack') {
          setSlackUrl(s.config?.webhook_url || '');
          setSlackEvents(s.events || []);
          setSlackActive(s.active);
        }
        if (s.channel === 'email') {
          setEmail(s.config?.email || '');
          setEmailEvents(s.events || []);
          setEmailActive(s.active);
        }
      }
    };
    load();
  }, [apiKey]);

  const saveChannel = async (channel: 'slack' | 'email') => {
    setSaving(true);
    const config = channel === 'slack' ? { webhook_url: slackUrl } : { email };
    const events = channel === 'slack' ? slackEvents : emailEvents;
    const active = channel === 'slack' ? slackActive : emailActive;

    const res = await fetch('/api/v1/notifications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, config, events, active }),
    });

    if (res.ok) {
      onToast(`${channel === 'slack' ? 'Slack' : 'Email'} notifications saved`, 'success');
      if (channel === 'slack') setSlackActive(true);
      else setEmailActive(true);
    } else {
      const data = await res.json();
      onToast(data.error || 'Failed to save', 'error');
    }
    setSaving(false);
  };

  const toggleEvent = (list: string[], setList: (v: string[]) => void, event: string) => {
    setList(list.includes(event) ? list.filter(e => e !== event) : [...list, event]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-white/60 mb-1">Notifications</h3>
        <p className="text-xs text-white/20">Get alerted via Slack or email when things go wrong.</p>
      </div>

      {/* Slack */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h4 className="text-sm font-medium">Slack</h4>
            {slackActive && <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded uppercase">active</span>}
          </div>
        </div>
        <div>
          <label className="text-xs text-white/30 block mb-1">Webhook URL</label>
          <input
            type="url"
            value={slackUrl}
            onChange={e => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/15 focus:border-blue-500/50 focus:outline-none"
          />
          <p className="text-[10px] text-white/15 mt-1">Create an incoming webhook in your Slack workspace settings.</p>
        </div>
        <div>
          <label className="text-xs text-white/30 block mb-2">Events</label>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map(e => (
              <button
                key={e.key}
                onClick={() => toggleEvent(slackEvents, setSlackEvents, e.key)}
                className={`text-[11px] px-2.5 py-1 rounded-lg transition-colors ${
                  slackEvents.includes(e.key)
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                    : 'bg-white/[0.03] text-white/30 border border-white/[0.04] hover:border-white/10'
                }`}
                title={e.desc}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => saveChannel('slack')}
          disabled={!slackUrl || saving}
          className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-30 px-4 py-2 rounded-lg transition-colors font-medium"
        >
          {saving ? 'Saving...' : slackActive ? 'Update Slack' : 'Enable Slack'}
        </button>
      </div>

      {/* Email */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📧</span>
            <h4 className="text-sm font-medium">Email</h4>
            {emailActive && <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded uppercase">active</span>}
          </div>
        </div>
        <div>
          <label className="text-xs text-white/30 block mb-1">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="alerts@yourcompany.com"
            className="w-full bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/15 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-white/30 block mb-2">Events</label>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map(e => (
              <button
                key={e.key}
                onClick={() => toggleEvent(emailEvents, setEmailEvents, e.key)}
                className={`text-[11px] px-2.5 py-1 rounded-lg transition-colors ${
                  emailEvents.includes(e.key)
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                    : 'bg-white/[0.03] text-white/30 border border-white/[0.04] hover:border-white/10'
                }`}
                title={e.desc}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => saveChannel('email')}
          disabled={!email || saving}
          className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-30 px-4 py-2 rounded-lg transition-colors font-medium"
        >
          {saving ? 'Saving...' : emailActive ? 'Update Email' : 'Enable Email'}
        </button>
      </div>
    </div>
  );
}

// ==================== STAT CARD ====================
function StatCard({ label, value, sub, accent = 'white', trend }: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
  trend?: { text: string; color: 'emerald' | 'red' | 'amber' | 'white' };
}) {
  const accentColor = accent === 'orange' ? 'text-amber-400' :
    accent === 'emerald' ? 'text-emerald-400' :
    accent === 'red' ? 'text-red-400' : 'text-white';

  const trendColor = trend?.color === 'emerald' ? 'text-emerald-400' :
    trend?.color === 'red' ? 'text-red-400' :
    trend?.color === 'amber' ? 'text-amber-400' : 'text-white/30';

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
      <p className="text-xs text-white/40 mb-2">{label}</p>
      <p className={`text-2xl font-bold ${accentColor}`}>{value}</p>
      <p className="text-xs text-white/30 mt-1">{sub}</p>
      {trend && <p className={`text-[11px] ${trendColor} mt-1`}>{trend.text}</p>}
    </div>
  );
}
