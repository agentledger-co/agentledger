'use client';

import React, { useEffect, useState } from 'react';

interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'safety' | 'cost' | 'compliance' | 'development';
  policies: { rule_type: string; rule_config: Record<string, unknown>; priority: number }[];
}

const CATEGORY_COLORS: Record<string, string> = {
  safety: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cost: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  compliance: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  development: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export default function PolicyTemplatesSection({ apiKey, onToast, onRefresh }: { apiKey: string; onToast: (msg: string, type: 'success' | 'error') => void; onRefresh: () => void }) {
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState('');

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/v1/policies/templates', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchTemplates();
  }, [apiKey]);

  const applyTemplate = async (templateId: string) => {
    setApplying(templateId);
    try {
      const res = await fetch('/api/v1/policies/templates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, agent_name: agentFilter || null }),
      });
      if (res.ok) {
        const data = await res.json();
        onToast(`Template applied — ${data.policiesCreated} policies created`, 'success');
        onRefresh();
      } else {
        const err = await res.json();
        onToast(err.error || 'Failed to apply template', 'error');
      }
    } catch {
      onToast('Failed to apply template', 'error');
    }
    setApplying(null);
  };

  if (loading) return <div className="text-white/60 text-center py-8">Loading templates...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-white/70">Quick Start Templates</h4>
          <p className="text-xs text-white/60 mt-0.5">Apply pre-built policy sets with one click.</p>
        </div>
        <div>
          <input
            type="text"
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            placeholder="Agent name (empty = all)"
            className="bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-1.5 text-[12px] placeholder-white/20 focus:border-blue-500/50 focus:outline-none w-48"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map(template => (
          <div key={template.id} className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4 flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <h5 className="text-sm font-medium text-white/80">{template.name}</h5>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[template.category] || ''}`}>
                {template.category}
              </span>
            </div>
            <p className="text-xs text-white/60 mb-3 flex-1">{template.description}</p>
            <div className="text-[11px] text-white/50 mb-3">
              {template.policies.length} rule{template.policies.length !== 1 ? 's' : ''}: {template.policies.map(p => p.rule_type.replace(/_/g, ' ')).join(', ')}
            </div>
            <button
              onClick={() => applyTemplate(template.id)}
              disabled={applying === template.id}
              className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium py-2 rounded-lg transition-colors border border-blue-500/20 disabled:opacity-50"
            >
              {applying === template.id ? 'Applying...' : 'Apply Template'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
