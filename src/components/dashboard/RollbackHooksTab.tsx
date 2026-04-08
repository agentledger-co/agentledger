'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { analytics } from '@/lib/analytics';

interface RollbackHook {
  id: string;
  agent_name: string | null;
  service: string | null;
  action: string | null;
  rollback_webhook_url: string;
  enabled: boolean;
  created_at: string;
}

interface RollbackExecution {
  id: string;
  rollback_hook_id: string;
  trigger_reason: string;
  agent_name: string | null;
  trace_id: string | null;
  status: 'success' | 'failed';
  response_status: number | null;
  created_at: string;
}

interface RollbackHooksTabProps {
  apiKey: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function RollbackHooksTab({ apiKey, onToast }: RollbackHooksTabProps) {
  const [hooks, setHooks] = useState<RollbackHook[]>([]);
  const [executions, setExecutions] = useState<RollbackExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Form state
  const [formAgent, setFormAgent] = useState('');
  const [formService, setFormService] = useState('');
  const [formAction, setFormAction] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchHooks = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/rollback-hooks', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHooks(data.hooks || []);
      }
    } catch {
      // silent
    }
  }, [apiKey]);

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/rollback-hooks/executions', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.executions || []);
      }
    } catch {
      // silent
    }
  }, [apiKey]);

  useEffect(() => {
    Promise.all([fetchHooks(), fetchExecutions()]).finally(() => setLoading(false));
  }, [fetchHooks, fetchExecutions]);

  const createHook = async () => {
    if (!formUrl.startsWith('https://')) {
      onToast('Webhook URL must start with https://', 'error');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = { rollback_webhook_url: formUrl, enabled: formEnabled };
      if (formAgent.trim()) body.agent_name = formAgent.trim();
      if (formService.trim()) body.service = formService.trim();
      if (formAction.trim()) body.action = formAction.trim();

      const res = await fetch('/api/v1/rollback-hooks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        analytics.rollbackHookCreated();
        onToast('Rollback hook created', 'success');
        setShowCreate(false);
        resetForm();
        fetchHooks();
      } else {
        const err = await res.json().catch(() => ({}));
        onToast((err as Record<string, string>).error || 'Failed to create rollback hook', 'error');
      }
    } catch {
      onToast('Failed to create rollback hook', 'error');
    } finally {
      setCreating(false);
    }
  };

  const toggleHook = async (id: string, currentEnabled: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/v1/rollback-hooks`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: !currentEnabled }),
      });
      if (res.ok) {
        analytics.rollbackHookToggled(!currentEnabled);
        onToast(`Hook ${!currentEnabled ? 'enabled' : 'disabled'}`, 'success');
        fetchHooks();
      } else {
        onToast('Failed to update hook', 'error');
      }
    } catch {
      onToast('Failed to update hook', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const deleteHook = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/rollback-hooks?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        analytics.rollbackHookDeleted();
        onToast('Rollback hook deleted', 'success');
        setDeleteConfirm(null);
        fetchHooks();
      } else {
        onToast('Failed to delete hook', 'error');
      }
    } catch {
      onToast('Failed to delete hook', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (bulkDeleteConfirm) setBulkDeleteConfirm(false);
        else if (deleteConfirm) setDeleteConfirm(null);
        else if (showCreate) setShowCreate(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkDeleteConfirm, deleteConfirm, showCreate]);

  const resetForm = () => {
    setFormAgent('');
    setFormService('');
    setFormAction('');
    setFormUrl('');
    setFormEnabled(true);
  };

  const filteredHooks = hooks.filter(h => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (h.agent_name || 'any').toLowerCase().includes(q) ||
      (h.service || 'any').toLowerCase().includes(q) ||
      (h.action || 'any').toLowerCase().includes(q) ||
      h.rollback_webhook_url.toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredHooks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredHooks.map(h => h.id)));
    }
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(
        ids.map(id =>
          fetch(`/api/v1/rollback-hooks?id=${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${apiKey}` },
          })
        )
      );
      onToast(`${ids.length} ${ids.length === 1 ? 'hook' : 'hooks'} deleted`, 'success');
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      fetchHooks();
    } catch {
      onToast('Failed to delete some hooks', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  if (loading) {
    return <div className="text-white/60 text-center py-16">Loading rollback hooks...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Delete {selected.size} {selected.size === 1 ? 'Hook' : 'Hooks'}?</h3>
            <p className="text-sm text-white/40 mb-4">This will permanently remove the selected rollback hooks.</p>
            <div className="flex gap-3">
              <button onClick={bulkDelete} disabled={bulkDeleting} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors">{bulkDeleting ? 'Deleting...' : 'Delete All'}</button>
              <button onClick={() => setBulkDeleteConfirm(false)} className="flex-1 bg-white/[0.08] hover:bg-white/10 text-white/60 text-sm font-medium py-2 rounded-lg transition-colors border border-white/[0.14]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium text-white/70">Rollback Hooks</h3>
          <p className="text-xs text-white/60 mt-0.5">Automatically trigger rollback webhooks when actions fail or are blocked.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => setBulkDeleteConfirm(true)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-red-500/20">
              Delete {selected.size} selected
            </button>
          )}
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            + Create Rollback Hook
          </button>
        </div>
      </div>

      {/* Search */}
      {hooks.length > 3 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search hooks..."
          className="w-full bg-white/[0.06] border border-white/[0.12] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/30 focus:border-blue-500/50 focus:outline-none"
        />
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-white/60 block mb-1">Agent name (optional)</label>
              <input
                type="text"
                value={formAgent}
                onChange={e => setFormAgent(e.target.value)}
                placeholder="Any agent"
                className="w-full bg-white/[0.10] border border-white/[0.16] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/50 focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 block mb-1">Service (optional)</label>
              <input
                type="text"
                value={formService}
                onChange={e => setFormService(e.target.value)}
                placeholder="Any service"
                className="w-full bg-white/[0.10] border border-white/[0.16] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/50 focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-white/60 block mb-1">Action (optional)</label>
              <input
                type="text"
                value={formAction}
                onChange={e => setFormAction(e.target.value)}
                placeholder="Any action"
                className="w-full bg-white/[0.10] border border-white/[0.16] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/50 focus:border-blue-500/50 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-white/60 block mb-1">Webhook URL (required, must be https)</label>
            <input
              type="url"
              value={formUrl}
              onChange={e => setFormUrl(e.target.value)}
              placeholder="https://your-server.com/rollback"
              className="w-full bg-white/[0.10] border border-white/[0.16] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/50 focus:border-blue-500/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFormEnabled(!formEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${formEnabled ? 'bg-blue-500' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${formEnabled ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-xs text-white/40">{formEnabled ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={createHook}
              disabled={!formUrl || creating}
              className="bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-xs text-white/60 hover:text-white/50 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Hooks table */}
      {hooks.length === 0 && !showCreate ? (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-8 text-center">
          <div className="text-2xl mb-3 opacity-30">&#x21A9;</div>
          <p className="text-white/60 text-sm font-medium mb-2">No rollback hooks configured</p>
          <p className="text-white/50 text-xs mb-4">Create hooks to automatically trigger rollback webhooks on failures.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-4 py-2 rounded-lg transition-colors border border-blue-500/20"
          >
            Create your first rollback hook
          </button>
        </div>
      ) : filteredHooks.length > 0 ? (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.14]">
                  <th className="text-[11px] text-white/60 font-medium px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filteredHooks.length && filteredHooks.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-white/20 bg-white/[0.10] text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-[11px] text-white/60 font-medium px-4 py-3">Agent</th>
                  <th className="text-[11px] text-white/60 font-medium px-4 py-3">Service</th>
                  <th className="text-[11px] text-white/60 font-medium px-4 py-3">Action</th>
                  <th className="text-[11px] text-white/60 font-medium px-4 py-3">Webhook URL</th>
                  <th className="text-[11px] text-white/60 font-medium px-4 py-3">Enabled</th>
                  <th className="text-[11px] text-white/60 font-medium px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHooks.map(hook => (
                  <tr key={hook.id} className={`border-b border-white/[0.12] last:border-0 hover:bg-white/[0.06] transition-colors ${selected.has(hook.id) ? 'bg-blue-500/[0.04]' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(hook.id)}
                        onChange={() => toggleSelect(hook.id)}
                        className="rounded border-white/20 bg-white/[0.10] text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-white/70">{hook.agent_name || <span className="text-white/50">Any</span>}</td>
                    <td className="px-4 py-3 text-xs text-white/70">{hook.service || <span className="text-white/50">Any</span>}</td>
                    <td className="px-4 py-3 text-xs text-white/70">{hook.action || <span className="text-white/50">Any</span>}</td>
                    <td className="px-4 py-3">
                      <code className="text-[11px] text-blue-400 font-mono truncate block max-w-[280px]">{hook.rollback_webhook_url}</code>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleHook(hook.id, hook.enabled)}
                        disabled={togglingId === hook.id}
                        className={`relative w-9 h-5 rounded-full transition-colors ${togglingId === hook.id ? 'opacity-50 cursor-not-allowed' : ''} ${hook.enabled ? 'bg-emerald-500' : 'bg-white/10'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${hook.enabled ? 'translate-x-4' : ''}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deleteConfirm === hook.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => deleteHook(hook.id)}
                            disabled={!!deletingId}
                            className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50 px-2 py-1 bg-red-500/10 rounded"
                          >
                            {deletingId ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-[11px] text-white/60 hover:text-white/50 px-2 py-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(hook.id)}
                          className="text-[11px] text-red-400/40 hover:text-red-400 px-2 py-1"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : search && hooks.length > 0 ? (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-6 text-center">
          <p className="text-white/40 text-sm">No hooks match &ldquo;{search}&rdquo;</p>
        </div>
      ) : null}

      {/* Execution History */}
      <div>
        <h4 className="text-xs font-medium text-white/40 mb-3">Execution History</h4>
        {executions.length === 0 ? (
          <div className="bg-white/[0.06] rounded-xl border border-white/[0.12] p-6 text-center">
            <p className="text-white/50 text-xs">No rollback executions yet</p>
          </div>
        ) : (
          <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.14]">
                    <th className="text-[11px] text-white/60 font-medium px-4 py-3">Trigger Reason</th>
                    <th className="text-[11px] text-white/60 font-medium px-4 py-3">Agent</th>
                    <th className="text-[11px] text-white/60 font-medium px-4 py-3">Trace ID</th>
                    <th className="text-[11px] text-white/60 font-medium px-4 py-3">Status</th>
                    <th className="text-[11px] text-white/60 font-medium px-4 py-3">Response</th>
                    <th className="text-[11px] text-white/60 font-medium px-4 py-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map(exec => (
                    <tr key={exec.id} className="border-b border-white/[0.12] last:border-0 hover:bg-white/[0.06] transition-colors">
                      <td className="px-4 py-3 text-xs text-white/70 max-w-[200px] truncate">{exec.trigger_reason}</td>
                      <td className="px-4 py-3 text-xs text-white/70">{exec.agent_name || <span className="text-white/50">-</span>}</td>
                      <td className="px-4 py-3">
                        {exec.trace_id ? (
                          <code className="text-[11px] text-blue-400/60 font-mono">{exec.trace_id.slice(0, 12)}...</code>
                        ) : (
                          <span className="text-white/50 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          exec.status === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {exec.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/40">
                        {exec.response_status != null ? exec.response_status : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-white/60 text-right">{timeAgo(exec.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
