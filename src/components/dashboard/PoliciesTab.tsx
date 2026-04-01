'use client';

import React, { useEffect, useState, useCallback } from 'react';

interface Policy {
  id: string;
  agent_name: string | null;
  rule_type: string;
  config: Record<string, unknown>;
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

function formatConfig(ruleType: string, config: Record<string, unknown>): string {
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

export default function PoliciesTab({ apiKey, onToast }: { apiKey: string; onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const createPolicy = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/v1/policies', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: newAgent || null,
          rule_type: newRuleType,
          config: buildConfigPayload(newRuleType, newConfig),
          priority: parseInt(newPriority) || 0,
        }),
      });
      if (res.ok) {
        onToast('Policy created', 'success');
        setShowCreate(false);
        setNewAgent('');
        setNewRuleType('rate_limit');
        setNewConfig(getDefaultConfig('rate_limit'));
        setNewPriority('0');
        fetchPolicies();
      } else {
        const err = await res.json();
        onToast(err.error || 'Failed to create policy', 'error');
      }
    } catch {
      onToast('Failed to create policy', 'error');
    }
    setCreating(false);
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    const res = await fetch('/api/v1/policies', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    if (res.ok) {
      onToast(`Policy ${!enabled ? 'enabled' : 'disabled'}`, 'success');
      fetchPolicies();
    } else {
      onToast('Failed to update policy', 'error');
    }
  };

  const deletePolicy = async (id: string) => {
    const res = await fetch(`/api/v1/policies?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      onToast('Policy deleted', 'success');
      setDeleteConfirm(null);
      fetchPolicies();
    } else {
      onToast('Failed to delete policy', 'error');
    }
  };

  const startEdit = (policy: Policy) => {
    setEditingId(policy.id);
    setEditAgent(policy.agent_name || '');
    setEditRuleType(policy.rule_type as RuleType);
    setEditPriority(String(policy.priority));
    // Rebuild config fields from the policy config
    const cfg = policy.config;
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
    const res = await fetch('/api/v1/policies', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        agent_name: editAgent || null,
        rule_type: editRuleType,
        config: buildConfigPayload(editRuleType, editConfig),
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
  };

  const renderConfigFields = (
    ruleType: RuleType,
    config: Record<string, string>,
    setConfig: (cfg: Record<string, string>) => void
  ) => {
    const inputClass = 'w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] placeholder-white/20 focus:border-blue-500/50 focus:outline-none';

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
      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Delete Policy?</h3>
            <p className="text-sm text-white/40 mb-4">This will permanently remove this policy rule. Agents will no longer be subject to this constraint.</p>
            <div className="flex gap-3">
              <button onClick={() => deletePolicy(deleteConfirm)} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 rounded-lg transition-colors">Delete</button>
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
                className="w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
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
              <button onClick={saveEdit} className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
                Save Changes
              </button>
              <button onClick={() => setEditingId(null)} className="text-xs text-white/60 hover:text-white/50 px-3 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white/70">Policies</h3>
          <p className="text-xs text-white/60 mt-0.5">Define rules that govern how agents can act: rate limits, service restrictions, cost caps, and approval flows.</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-blue-500 hover:bg-blue-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
          + Create Policy
        </button>
      </div>

      {showCreate && (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4 space-y-3">
          <div>
            <label className="text-[11px] text-white/60 mb-1 block">Agent Name (empty = all agents)</label>
            <input
              type="text"
              value={newAgent}
              onChange={e => setNewAgent(e.target.value)}
              placeholder="All agents"
              className="w-full bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
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
          <div className="text-2xl mb-3 opacity-30">&#x1F6E1;</div>
          <p className="text-white/60 text-sm font-medium mb-2">No policies configured</p>
          <p className="text-white/50 text-xs mb-4">Policies let you enforce rate limits, restrict services, cap costs, and require approvals for agent actions.</p>
          <button onClick={() => setShowCreate(true)} className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-4 py-2 rounded-lg transition-colors border border-blue-500/20">
            Create your first policy
          </button>
        </div>
      ) : policies.length > 0 ? (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.14]">
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Agent</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Rule Type</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3 hidden md:table-cell">Config</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Enabled</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3 hidden sm:table-cell">Priority</th>
                <th className="text-right text-[11px] text-white/60 font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {policies.map(policy => (
                <tr key={policy.id} className="hover:bg-white/[0.06] transition-colors">
                  <td className="px-4 py-3 text-white/70">{policy.agent_name || <span className="text-white/60 italic">All agents</span>}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] bg-white/[0.10] text-white/50 px-2 py-0.5 rounded-md">
                      {RULE_TYPE_LABELS[policy.rule_type as RuleType] || policy.rule_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/40 hidden md:table-cell max-w-[240px] truncate">
                    {formatConfig(policy.rule_type, policy.config)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleEnabled(policy.id, policy.enabled)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${
                        policy.enabled ? 'bg-emerald-500' : 'bg-white/[0.08]'
                      }`}
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
      ) : null}
    </div>
  );
}
