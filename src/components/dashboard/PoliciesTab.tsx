'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { analytics } from '@/lib/analytics';

interface Policy {
  id: string;
  agent_name: string | null;
  rule_type: string;
  rule_config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
  created_at: string;
}

const RULE_TYPES = [
  'rate_limit',
  'service_allowlist',
  'service_blocklist',
  'cost_limit_per_action',
  'payload_regex_block',
  'require_approval',
] as const;

type RuleType = (typeof RULE_TYPES)[number];

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  rate_limit: 'Rate Limit',
  service_allowlist: 'Service Allowlist',
  service_blocklist: 'Service Blocklist',
  cost_limit_per_action: 'Cost Limit per Action',
  payload_regex_block: 'Payload Regex Block',
  require_approval: 'Require Approval',
};

function formatConfig(ruleType: string, config: Record<string, unknown> | undefined | null): string {
  if (!config) return '—';
  switch (ruleType) {
    case 'rate_limit':
      return `Max ${config.max_actions ?? '?'} actions / ${config.window_seconds ?? '?'}s`;
    case 'service_allowlist':
      return `Allow: ${(config.services as string[] | undefined)?.join(', ') ?? 'none'}`;
    case 'service_blocklist':
      return `Block: ${(config.services as string[] | undefined)?.join(', ') ?? 'none'}`;
    case 'cost_limit_per_action':
      return `Max $${((config.max_cost_cents as number) / 100).toFixed(2)} per action`;
    case 'payload_regex_block': {
      const patterns = config.patterns as string[] | undefined;
      const fields = config.fields as string[] | undefined;
      return `${patterns?.length ?? 0} pattern(s) on ${fields?.join(', ') || 'input, output'}`;
    }
    case 'require_approval': {
      const services = config.services as string[] | undefined;
      const actions = config.actions as string[] | undefined;
      const parts: string[] = [];
      if (services?.length) parts.push(`services: ${services.join(', ')}`);
      if (actions?.length) parts.push(`actions: ${actions.join(', ')}`);
      return parts.length ? parts.join('; ') : 'All services & actions';
    }
    default:
      return JSON.stringify(config);
  }
}

function getDefaultConfig(ruleType: RuleType): Record<string, string> {
  switch (ruleType) {
    case 'rate_limit':
      return { max_actions: '100', window_seconds: '60' };
    case 'service_allowlist':
    case 'service_blocklist':
      return { services: '' };
    case 'cost_limit_per_action':
      return { max_cost_cents: '100' };
    case 'payload_regex_block':
      return { patterns: '', fields_input: 'true', fields_output: 'true' };
    case 'require_approval':
      return { services: '', actions: '' };
    default:
      return {};
  }
}

function buildConfigPayload(ruleType: RuleType, fields: Record<string, string>): Record<string, unknown> {
  switch (ruleType) {
    case 'rate_limit':
      return {
        max_actions: parseInt(fields.max_actions) || 100,
        window_seconds: parseInt(fields.window_seconds) || 60,
      };
    case 'service_allowlist':
    case 'service_blocklist':
      return {
        services: fields.services.split(',').map(s => s.trim()).filter(Boolean),
      };
    case 'cost_limit_per_action':
      return {
        max_cost_cents: parseInt(fields.max_cost_cents) || 100,
      };
    case 'payload_regex_block':
      return {
        patterns: fields.patterns.split('\n').map(s => s.trim()).filter(Boolean),
        fields: [
          ...(fields.fields_input === 'true' ? ['input'] : []),
          ...(fields.fields_output === 'true' ? ['output'] : []),
        ],
      };
    case 'require_approval':
      return {
        services: fields.services ? fields.services.split(',').map(s => s.trim()).filter(Boolean) : [],
        actions: fields.actions ? fields.actions.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
    default:
      return {};
  }
}

export default function PoliciesTab({ apiKey, onToast, refreshKey }: { apiKey: string; onToast: (msg: string, type: 'success' | 'error') => void; refreshKey?: number }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Create form state
  const [newAgent, setNewAgent] = useState('');
  const [newRuleType, setNewRuleType] = useState<RuleType>('rate_limit');
  const [newConfig, setNewConfig] = useState<Record<string, string>>(getDefaultConfig('rate_limit'));
  const [newPriority, setNewPriority] = useState('0');
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAgent, setEditAgent] = useState('');
  const [editRuleType, setEditRuleType] = useState<RuleType>('rate_limit');
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [editPriority, setEditPriority] = useState('0');

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/policies', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPolicies(data.policies || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiKey]);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies, refreshKey]);

  const createPolicy = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/v1/policies', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: newAgent || null,
          rule_type: newRuleType,
          rule_config: buildConfigPayload(newRuleType, newConfig),
          priority: parseInt(newPriority) || 0,
        }),
      });
      if (res.ok) {
        analytics.policyCreated(newRuleType);
        onToast('Policy created', 'success');
        setShowCreate(false);
        setNewAgent('');
        setNewRuleType('rate_limit');
        setNewConfig(getDefaultConfig('rate_limit'));
        setNewPriority('0');
        fetchPolicies();
      } else {
        const err = await res.json().catch(() => ({}));
        onToast(err.error || 'Failed to create policy', 'error');
      }
    } catch {
      onToast('Failed to create policy', 'error');
    }
    setCreating(false);
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch('/api/v1/policies', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: !enabled }),
      });
      if (res.ok) {
        analytics.policyToggled(!enabled);
        onToast(`Policy ${!enabled ? 'enabled' : 'disabled'}`, 'success');
        fetchPolicies();
      } else {
        onToast('Failed to update policy', 'error');
      }
    } finally {
      setTogglingId(null);
    }
  };

  const deletePolicy = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/policies?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        analytics.policyDeleted();
        onToast('Policy deleted', 'success');
        setDeleteConfirm(null);
        fetchPolicies();
      } else {
        onToast('Failed to delete policy', 'error');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(
        ids.map(id =>
          fetch(`/api/v1/policies?id=${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${apiKey}` },
          })
        )
      );
      onToast(`${ids.length} ${ids.length === 1 ? 'policy' : 'policies'} deleted`, 'success');
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      fetchPolicies();
    } catch {
      onToast('Failed to delete some policies', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredPolicies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredPolicies.map(p => p.id)));
    }
  };

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (bulkDeleteConfirm) setBulkDeleteConfirm(false);
        else if (deleteConfirm) setDeleteConfirm(null);
        else if (editingId) setEditingId(null);
        else if (showCreate) setShowCreate(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkDeleteConfirm, deleteConfirm, editingId, showCreate]);

  const filteredPolicies = policies.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.agent_name || 'all agents').toLowerCase().includes(q) ||
      (RULE_TYPE_LABELS[p.rule_type as RuleType] || p.rule_type).toLowerCase().includes(q) ||
      formatConfig(p.rule_type, p.rule_config).toLowerCase().includes(q)
    );
  });

  const startEdit = (policy: Policy) => {
    setEditingId(policy.id);
    setEditAgent(policy.agent_name || '');
    setEditRuleType(policy.rule_type as RuleType);
    setEditPriority(String(policy.priority));
    // Rebuild config fields from the policy config
    const cfg = policy.rule_config;
    switch (policy.rule_type) {
      case 'rate_limit':
        setEditConfig({
          max_actions: String(cfg.max_actions ?? ''),
          window_seconds: String(cfg.window_seconds ?? ''),
        });
        break;
      case 'service_allowlist':
      case 'service_blocklist':
        setEditConfig({ services: (cfg.services as string[])?.join(', ') ?? '' });
        break;
      case 'cost_limit_per_action':
        setEditConfig({ max_cost_cents: String(cfg.max_cost_cents ?? '') });
        break;
      case 'payload_regex_block':
        setEditConfig({
          patterns: (cfg.patterns as string[])?.join('\n') ?? '',
          fields_input: String((cfg.fields as string[])?.includes('input') ?? true),
          fields_output: String((cfg.fields as string[])?.includes('output') ?? true),
        });
        break;
      case 'require_approval':
        setEditConfig({
          services: (cfg.services as string[])?.join(', ') ?? '',
          actions: (cfg.actions as string[])?.join(', ') ?? '',
        });
        break;
      default:
        setEditConfig({});
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/policies', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          agent_name: editAgent || null,
          rule_type: editRuleType,
          rule_config: buildConfigPayload(editRuleType, editConfig),
          priority: parseInt(editPriority) || 0,
        }),
      });
      if (res.ok) {
        onToast('Policy updated', 'success');
        setEditingId(null);
        fetchPolicies();
      } else {
        onToast('Failed to update policy', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const renderConfigFields = (
    ruleType: RuleType,
    config: Record<string, string>,
    setConfig: (cfg: Record<string, string>) => void
  ) => {
    const inputClass = 'w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] placeholder-white/50 focus:border-blue-500/50 focus:outline-none';

    switch (ruleType) {
      case 'rate_limit':
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Max Actions</label>
              <input
                type="number"
                value={config.max_actions || ''}
                onChange={e => setConfig({ ...config, max_actions: e.target.value })}
                placeholder="100"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Window (seconds)</label>
              <input
                type="number"
                value={config.window_seconds || ''}
                onChange={e => setConfig({ ...config, window_seconds: e.target.value })}
                placeholder="60"
                className={inputClass}
              />
            </div>
          </div>
        );
      case 'service_allowlist':
      case 'service_blocklist':
        return (
          <div>
            <label className="text-[11px] text-white/60 mb-1 block">Services (comma-separated)</label>
            <input
              type="text"
              value={config.services || ''}
              onChange={e => setConfig({ ...config, services: e.target.value })}
              placeholder="openai, stripe, github"
              className={inputClass}
            />
          </div>
        );
      case 'cost_limit_per_action':
        return (
          <div>
            <label className="text-[11px] text-white/60 mb-1 block">Max Cost (cents)</label>
            <input
              type="number"
              value={config.max_cost_cents || ''}
              onChange={e => setConfig({ ...config, max_cost_cents: e.target.value })}
              placeholder="100"
              className={inputClass}
            />
          </div>
        );
      case 'payload_regex_block':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Patterns (one per line)</label>
              <textarea
                value={config.patterns || ''}
                onChange={e => setConfig({ ...config, patterns: e.target.value })}
                placeholder={"password.*\\ncredit_card.*"}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 mb-1.5 block">Apply to fields</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-[13px] text-white/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.fields_input === 'true'}
                    onChange={e => setConfig({ ...config, fields_input: String(e.target.checked) })}
                    className="rounded border-white/20 bg-white/[0.10] text-blue-500 focus:ring-blue-500/30"
                  />
                  Input
                </label>
                <label className="flex items-center gap-2 text-[13px] text-white/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.fields_output === 'true'}
                    onChange={e => setConfig({ ...config, fields_output: String(e.target.checked) })}
                    className="rounded border-white/20 bg-white/[0.10] text-blue-500 focus:ring-blue-500/30"
                  />
                  Output
                </label>
              </div>
            </div>
          </div>
        );
      case 'require_approval':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Services (comma-separated, empty = all)</label>
              <input
                type="text"
                value={config.services || ''}
                onChange={e => setConfig({ ...config, services: e.target.value })}
                placeholder="stripe, github"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Actions (comma-separated, empty = all)</label>
              <input
                type="text"
                value={config.actions || ''}
                onChange={e => setConfig({ ...config, actions: e.target.value })}
                placeholder="create, delete"
                className={inputClass}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) return <div className="text-white/60 text-center py-16">Loading policies...</div>;

  return (
    <div className="space-y-4">
      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setBulkDeleteConfirm(false)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Delete {selected.size} {selected.size === 1 ? 'Policy' : 'Policies'}?</h3>
            <p className="text-sm text-white/40 mb-4">This will permanently remove the selected policies. Agents will no longer be subject to these constraints.</p>
            <div className="flex gap-3">
              <button onClick={bulkDelete} disabled={bulkDeleting} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors">{bulkDeleting ? 'Deleting...' : 'Delete All'}</button>
              <button onClick={() => setBulkDeleteConfirm(false)} className="flex-1 bg-white/[0.08] hover:bg-white/10 text-white/60 text-sm font-medium py-2 rounded-lg transition-colors border border-white/[0.14]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Delete Policy?</h3>
            <p className="text-sm text-white/40 mb-4">This will permanently remove this policy rule. Agents will no longer be subject to this constraint.</p>
            <div className="flex gap-3">
              <button onClick={() => deletePolicy(deleteConfirm)} disabled={!!deletingId} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors">{deletingId ? 'Deleting...' : 'Delete'}</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-white/[0.08] hover:bg-white/10 text-white/60 text-sm font-medium py-2 rounded-lg transition-colors border border-white/[0.14]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setEditingId(null)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold">Edit Policy</h3>
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Agent Name (empty = all agents)</label>
              <input
                type="text"
                value={editAgent}
                onChange={e => setEditAgent(e.target.value)}
                placeholder="All agents"
                className="w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] placeholder-white/50 focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Rule Type</label>
              <select
                value={editRuleType}
                onChange={e => {
                  const rt = e.target.value as RuleType;
                  setEditRuleType(rt);
                  setEditConfig(getDefaultConfig(rt));
                }}
                className="w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] focus:border-blue-500/50 focus:outline-none"
              >
                {RULE_TYPES.map(rt => (
                  <option key={rt} value={rt} className="bg-[#1a1a1a]">{RULE_TYPE_LABELS[rt]}</option>
                ))}
              </select>
            </div>
            {renderConfigFields(editRuleType, editConfig, setEditConfig)}
            <div>
              <label className="text-[11px] text-white/60 mb-1 block">Priority</label>
              <input
                type="number"
                value={editPriority}
                onChange={e => setEditPriority(e.target.value)}
                className="w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} disabled={saving} className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditingId(null)} className="text-xs text-white/60 hover:text-white/50 px-3 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium text-white/70">Policies</h3>
          <p className="text-xs text-white/60 mt-0.5">Define rules that govern how agents can act: rate limits, service restrictions, cost caps, and approval flows.</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => setBulkDeleteConfirm(true)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-red-500/20">
              Delete {selected.size} selected
            </button>
          )}
          {policies.length > 0 && (
            <button onClick={() => { setSelected(new Set()); setBulkDeleteConfirm(true); setSelected(new Set(policies.map(p => p.id))); }} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1.5 transition-colors">
              Clear All
            </button>
          )}
          <button onClick={() => setShowCreate(!showCreate)} className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
            + Create Policy
          </button>
        </div>
      </div>

      {/* Search */}
      {policies.length > 3 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search policies..."
          className="w-full bg-white/[0.06] border border-white/[0.12] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/30 focus:border-blue-500/50 focus:outline-none"
        />
      )}

      {showCreate && (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4 space-y-3">
          <div>
            <label className="text-[11px] text-white/60 mb-1 block">Agent Name (empty = all agents)</label>
            <input
              type="text"
              value={newAgent}
              onChange={e => setNewAgent(e.target.value)}
              placeholder="All agents"
              className="w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] placeholder-white/50 focus:border-blue-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-white/60 mb-1 block">Rule Type</label>
            <select
              value={newRuleType}
              onChange={e => {
                const rt = e.target.value as RuleType;
                setNewRuleType(rt);
                setNewConfig(getDefaultConfig(rt));
              }}
              className="w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] focus:border-blue-500/50 focus:outline-none"
            >
              {RULE_TYPES.map(rt => (
                <option key={rt} value={rt} className="bg-[#1a1a1a]">{RULE_TYPE_LABELS[rt]}</option>
              ))}
            </select>
          </div>
          {renderConfigFields(newRuleType, newConfig, setNewConfig)}
          <div>
            <label className="text-[11px] text-white/60 mb-1 block">Priority</label>
            <input
              type="number"
              value={newPriority}
              onChange={e => setNewPriority(e.target.value)}
              placeholder="0"
              className="w-32 bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] focus:border-blue-500/50 focus:outline-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={createPolicy} disabled={creating} className="bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)} className="text-xs text-white/60 hover:text-white/50 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {policies.length === 0 && !showCreate ? (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-8 text-center">
          <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
          </div>
          <p className="text-white/50 text-sm font-medium mb-2">No policies configured</p>
          <p className="text-white/40 text-xs mb-4">Define rules to enforce rate limits, restrict services, cap costs, and require approvals.</p>
          <button onClick={() => setShowCreate(true)} className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-4 py-2 rounded-lg transition-colors border border-blue-500/20">
            Create your first policy
          </button>
        </div>
      ) : filteredPolicies.length > 0 ? (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.14]">
                <th className="text-left px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === filteredPolicies.length && filteredPolicies.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-white/20 bg-white/[0.10] text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                  />
                </th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Agent</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Rule Type</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3 hidden md:table-cell">Config</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Enabled</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3 hidden sm:table-cell">Priority</th>
                <th className="text-right text-[11px] text-white/60 font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredPolicies.map(policy => (
                <tr key={policy.id} className={`hover:bg-white/[0.06] transition-colors ${selected.has(policy.id) ? 'bg-blue-500/[0.04]' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(policy.id)}
                      onChange={() => toggleSelect(policy.id)}
                      className="rounded border-white/20 bg-white/[0.10] text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-white/70">{policy.agent_name || <span className="text-white/60 italic">All agents</span>}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] bg-white/[0.10] text-white/50 px-2 py-0.5 rounded-md">
                      {RULE_TYPE_LABELS[policy.rule_type as RuleType] || policy.rule_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/40 hidden md:table-cell max-w-[240px] truncate">
                    {formatConfig(policy.rule_type, policy.rule_config)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleEnabled(policy.id, policy.enabled)}
                      disabled={togglingId === policy.id}
                      className={`w-9 h-5 rounded-full transition-colors relative ${
                        togglingId === policy.id ? 'opacity-50 cursor-not-allowed' : ''
                      } ${policy.enabled ? 'bg-emerald-500' : 'bg-white/[0.08]'}`}
                    >
                      <span className={`block w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-transform ${
                        policy.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-white/40 hidden sm:table-cell">{policy.priority}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(policy)} className="text-[11px] text-blue-400/60 hover:text-blue-400 px-2 py-1 rounded-md">
                        Edit
                      </button>
                      <button onClick={() => setDeleteConfirm(policy.id)} className="text-[11px] text-red-400/40 hover:text-red-400 px-2 py-1">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : search && policies.length > 0 ? (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-6 text-center">
          <p className="text-white/40 text-sm">No policies match &ldquo;{search}&rdquo;</p>
        </div>
      ) : null}
    </div>
  );
}
