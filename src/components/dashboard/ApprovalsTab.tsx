'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';

interface Approval {
  id: string;
  agent_name: string;
  service: string;
  action: string;
  input: unknown;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  decided_by: string | null;
  expires_at: string | null;
  created_at: string;
  decided_at: string | null;
}

type StatusFilter = 'pending' | 'approved' | 'denied' | 'expired' | 'all';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function timeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s remaining`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m remaining`;
  return `${Math.floor(seconds / 3600)}h remaining`;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  denied: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired: 'bg-white/[0.04] text-white/30 border-white/[0.06]',
};

export default function ApprovalsTab({ apiKey, onToast }: { apiKey: string; onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [expandedInput, setExpandedInput] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const params = filter === 'all' ? '' : `?status=${filter}`;
      const res = await fetch(`/api/v1/approvals${params}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiKey, filter]);

  // Fetch pending count separately for badge
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/approvals?status=pending', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingCount((data.approvals || []).length);
      }
    } catch { /* ignore */ }
  }, [apiKey]);

  useEffect(() => { fetchApprovals(); fetchPendingCount(); }, [fetchApprovals, fetchPendingCount]);

  // Auto-refresh every 5s when on pending tab
  useEffect(() => {
    if (filter === 'pending') {
      intervalRef.current = setInterval(() => {
        fetchApprovals();
        fetchPendingCount();
      }, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [filter, fetchApprovals, fetchPendingCount]);

  const handleDecision = async (id: string, decision: 'approved' | 'denied') => {
    try {
      const res = await fetch('/api/v1/approvals', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, decided_by: 'dashboard' }),
      });
      if (res.ok) {
        onToast(`Request ${decision}`, 'success');
        fetchApprovals();
        fetchPendingCount();
      } else {
        const err = await res.json().catch(() => ({}));
        onToast((err as Record<string, string>).error || `Failed to ${decision === 'approved' ? 'approve' : 'deny'}`, 'error');
      }
    } catch {
      onToast('Failed to process decision', 'error');
    }
  };

  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'denied', label: 'Denied' },
    { value: 'expired', label: 'Expired' },
    { value: 'all', label: 'All' },
  ];

  if (loading) return <div className="text-white/30 text-center py-16">Loading approvals...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white/70">
            Approvals
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </h3>
          <p className="text-xs text-white/30 mt-0.5">Review and decide on agent action requests that require manual approval.</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-white/[0.03] p-1 rounded-lg w-fit">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setLoading(true); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f.value ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
            }`}
          >
            {f.label}
            {f.value === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {approvals.length === 0 ? (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-8 text-center">
          <div className="text-2xl mb-3 opacity-30">&#x2705;</div>
          <p className="text-white/30 text-sm font-medium mb-2">
            {filter === 'pending'
              ? 'No pending approvals'
              : `No ${filter === 'all' ? '' : filter + ' '}approvals found`}
          </p>
          <p className="text-white/15 text-xs">
            {filter === 'pending'
              ? 'Approvals appear when agents trigger require_approval policies.'
              : 'Try changing the status filter above.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {approvals.map(approval => (
            <div key={approval.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[13px] text-white/70 font-medium">{approval.agent_name}</span>
                    <span className="text-[11px] text-white/20">&#x2192;</span>
                    <span className="text-[11px] bg-white/[0.04] text-white/50 px-2 py-0.5 rounded-md">{approval.service}</span>
                    <span className="text-[11px] text-white/40">{approval.action}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${STATUS_BADGE[approval.status] || STATUS_BADGE.pending}`}>
                      {approval.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-white/25">
                    <span>Requested {timeAgo(approval.created_at)}</span>
                    {approval.status === 'pending' && approval.expires_at && (
                      <span className={`${
                        new Date(approval.expires_at).getTime() - Date.now() < 60000
                          ? 'text-red-400/60'
                          : 'text-amber-400/40'
                      }`}>
                        {timeRemaining(approval.expires_at)}
                      </span>
                    )}
                    {approval.decided_by && (
                      <span>Decided by: {approval.decided_by}</span>
                    )}
                    {approval.decided_at && (
                      <span>Decided {timeAgo(approval.decided_at)}</span>
                    )}
                  </div>

                  {/* Collapsible input preview */}
                  {approval.input != null && (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandedInput(expandedInput === approval.id ? null : approval.id)}
                        className="text-[11px] text-blue-400/50 hover:text-blue-400 transition-colors"
                      >
                        {expandedInput === approval.id ? 'Hide input' : 'Show input'}
                      </button>
                      {expandedInput === approval.id && (
                        <pre className="mt-1.5 bg-black/30 rounded-lg p-3 text-[11px] text-white/40 font-mono overflow-x-auto max-h-48 overflow-y-auto">
                          {JSON.stringify(approval.input, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>

                {/* Approve / Deny buttons */}
                {approval.status === 'pending' && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleDecision(approval.id, 'approved')}
                      className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors border border-emerald-500/20"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDecision(approval.id, 'denied')}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors border border-red-500/20"
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
