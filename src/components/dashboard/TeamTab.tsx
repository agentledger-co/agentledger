'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { analytics } from '@/lib/analytics';

interface Member {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  member: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  viewer: 'bg-white/[0.12] text-white/40 border-white/[0.16]',
};

const ASSIGNABLE_ROLES = ['admin', 'member', 'viewer'] as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function TeamTab({ onToast }: { onToast: (msg: string, type: 'success' | 'error') => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [currentRole, setCurrentRole] = useState<string>('viewer');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('member');
  const [sending, setSending] = useState(false);

  // Confirm states
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{ userId: string; newRole: string } | null>(null);

  const isManager = currentRole === 'owner' || currentRole === 'admin';

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/team');
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        setCurrentRole(data.currentRole || 'viewer');
      }
    } catch { /* ignore */ }
  }, []);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/team/invite');
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      // Audit logs use cookie auth via a dedicated endpoint that reads from session
      const res = await fetch('/api/v1/team/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([fetchMembers(), fetchInvites(), fetchAuditLogs()]).then(() => setLoading(false));
  }, [fetchMembers, fetchInvites, fetchAuditLogs]);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/v1/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (res.ok) {
        analytics.teamInviteSent(inviteRole);
        onToast('Invite sent', 'success');
        setInviteEmail('');
        setInviteRole('member');
        fetchInvites();
      } else {
        const err = await res.json().catch(() => ({}));
        onToast(err.error || 'Failed to send invite', 'error');
      }
    } catch {
      onToast('Failed to send invite', 'error');
    }
    setSending(false);
  };

  const revokeInvite = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/team/invite?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        onToast('Invite revoked', 'success');
        setRevokeConfirm(null);
        fetchInvites();
        fetchAuditLogs();
      } else {
        onToast('Failed to revoke invite', 'error');
      }
    } catch {
      onToast('Failed to revoke invite', 'error');
    }
  };

  const removeMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/v1/team?user_id=${userId}`, { method: 'DELETE' });
      if (res.ok) {
        analytics.teamMemberRemoved();
        onToast('Member removed', 'success');
        setRemoveConfirm(null);
        fetchMembers();
        fetchAuditLogs();
      } else {
        const err = await res.json().catch(() => ({}));
        onToast(err.error || 'Failed to remove member', 'error');
      }
    } catch {
      onToast('Failed to remove member', 'error');
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch('/api/v1/team/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (res.ok) {
        analytics.teamRoleChanged(newRole);
        onToast('Role updated', 'success');
        fetchMembers();
        fetchAuditLogs();
      } else {
        const err = await res.json().catch(() => ({}));
        onToast(err.error || 'Failed to update role', 'error');
      }
    } catch {
      onToast('Failed to update role', 'error');
    }
  };

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (bulkRemoveConfirm) setBulkRemoveConfirm(false);
        else if (removeConfirm) setRemoveConfirm(null);
        else if (roleChangeConfirm) setRoleChangeConfirm(null);
        else if (revokeConfirm) setRevokeConfirm(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkRemoveConfirm, removeConfirm, roleChangeConfirm, revokeConfirm]);

  const filteredMembers = members.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableMembers = filteredMembers.filter(m => m.role !== 'owner');

  const toggleSelectAll = () => {
    if (selected.size === selectableMembers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableMembers.map(m => m.user_id)));
    }
  };

  const bulkRemove = async () => {
    setBulkRemoving(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(
        ids.map(userId =>
          fetch(`/api/v1/team?user_id=${userId}`, { method: 'DELETE' })
        )
      );
      onToast(`${ids.length} ${ids.length === 1 ? 'member' : 'members'} removed`, 'success');
      setSelected(new Set());
      setBulkRemoveConfirm(false);
      fetchMembers();
      fetchAuditLogs();
    } catch {
      onToast('Failed to remove some members', 'error');
    } finally {
      setBulkRemoving(false);
    }
  };

  const inputClass = 'bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] placeholder-white/50 focus:border-blue-500/50 focus:outline-none';
  const selectClass = 'bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] focus:border-blue-500/50 focus:outline-none';

  if (loading) return <div className="text-white/60 text-center py-16">Loading team...</div>;

  return (
    <div className="space-y-6">
      {/* Remove confirmation modal */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setRemoveConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Remove Member?</h3>
            <p className="text-sm text-white/40 mb-4">This will remove this user from your organization. They will lose access immediately.</p>
            <div className="flex gap-3">
              <button onClick={() => removeMember(removeConfirm)} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 rounded-lg transition-colors">Remove</button>
              <button onClick={() => setRemoveConfirm(null)} className="flex-1 bg-white/[0.08] hover:bg-white/10 text-white/60 text-sm font-medium py-2 rounded-lg transition-colors border border-white/[0.14]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk remove confirmation modal */}
      {bulkRemoveConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setBulkRemoveConfirm(false)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Remove {selected.size} {selected.size === 1 ? 'Member' : 'Members'}?</h3>
            <p className="text-sm text-white/40 mb-4">This will remove the selected users from your organization. They will lose access immediately.</p>
            <div className="flex gap-3">
              <button onClick={bulkRemove} disabled={bulkRemoving} className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors">{bulkRemoving ? 'Removing...' : 'Remove All'}</button>
              <button onClick={() => setBulkRemoveConfirm(false)} className="flex-1 bg-white/[0.08] hover:bg-white/10 text-white/60 text-sm font-medium py-2 rounded-lg transition-colors border border-white/[0.14]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Role change confirmation modal */}
      {roleChangeConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setRoleChangeConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Change Role?</h3>
            <p className="text-sm text-white/40 mb-4">Change this member&apos;s role to <span className="text-white/60 font-medium">{roleChangeConfirm.newRole}</span>? This will update their permissions immediately.</p>
            <div className="flex gap-3">
              <button onClick={() => { changeRole(roleChangeConfirm.userId, roleChangeConfirm.newRole); setRoleChangeConfirm(null); }} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 rounded-lg transition-colors">Confirm</button>
              <button onClick={() => setRoleChangeConfirm(null)} className="flex-1 bg-white/[0.08] hover:bg-white/10 text-white/60 text-sm font-medium py-2 rounded-lg transition-colors border border-white/[0.14]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirmation modal */}
      {revokeConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setRevokeConfirm(null)}>
          <div className="bg-[#1a1a1a] border border-white/[0.16] rounded-xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Revoke Invite?</h3>
            <p className="text-sm text-white/40 mb-4">This invite link will no longer work.</p>
            <div className="flex gap-3">
              <button onClick={() => revokeInvite(revokeConfirm)} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 rounded-lg transition-colors">Revoke</button>
              <button onClick={() => setRevokeConfirm(null)} className="flex-1 bg-white/[0.08] hover:bg-white/10 text-white/60 text-sm font-medium py-2 rounded-lg transition-colors border border-white/[0.14]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Team Members */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-white/70">Team Members</h3>
            <p className="text-xs text-white/60 mt-0.5">Manage who has access to your organization.</p>
          </div>
          {isManager && selected.size > 0 && (
            <button onClick={() => setBulkRemoveConfirm(true)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-red-500/20">
              Remove {selected.size} selected
            </button>
          )}
        </div>

        {members.length > 3 && (
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email or role..."
            className="w-full bg-white/[0.06] border border-white/[0.12] rounded-lg px-3 py-2 text-[13px] text-white/80 placeholder-white/30 focus:border-blue-500/50 focus:outline-none mb-3"
          />
        )}

        {filteredMembers.length > 0 ? (
        <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.14]">
                {isManager && (
                  <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === selectableMembers.length && selectableMembers.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-white/20 bg-white/[0.10] text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                    />
                  </th>
                )}
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Email</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Role</th>
                <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3 hidden sm:table-cell">Joined</th>
                {isManager && <th className="text-right text-[11px] text-white/60 font-medium px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredMembers.map(member => (
                <tr key={member.id} className={`hover:bg-white/[0.06] transition-colors ${selected.has(member.user_id) ? 'bg-blue-500/[0.04]' : ''}`}>
                  {isManager && (
                    <td className="px-4 py-3">
                      {member.role !== 'owner' ? (
                        <input
                          type="checkbox"
                          checked={selected.has(member.user_id)}
                          onChange={() => toggleSelect(member.user_id)}
                          className="rounded border-white/20 bg-white/[0.10] text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                        />
                      ) : <span />}
                    </td>
                  )}
                  <td className="px-4 py-3 text-white/70">{member.email}</td>
                  <td className="px-4 py-3">
                    {isManager && member.role !== 'owner' ? (
                      <select
                        value={member.role}
                        onChange={e => setRoleChangeConfirm({ userId: member.user_id, newRole: e.target.value })}
                        className={`text-[11px] px-2 py-0.5 rounded-md border cursor-pointer ${ROLE_COLORS[member.role] || ROLE_COLORS.viewer}`}
                        style={{ background: 'transparent' }}
                      >
                        {ASSIGNABLE_ROLES.map(r => (
                          <option key={r} value={r} className="bg-[#1a1a1a] text-white">{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-[11px] px-2 py-0.5 rounded-md border ${ROLE_COLORS[member.role] || ROLE_COLORS.viewer}`}>
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/60 hidden sm:table-cell">{timeAgo(member.created_at)}</td>
                  {isManager && (
                    <td className="px-4 py-3 text-right">
                      {member.role !== 'owner' && (
                        <button
                          onClick={() => setRemoveConfirm(member.user_id)}
                          className="text-[11px] text-red-400/40 hover:text-red-400 px-2 py-1"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : search && members.length > 0 ? (
          <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-6 text-center">
            <p className="text-white/40 text-sm">No members match &ldquo;{search}&rdquo;</p>
          </div>
        ) : null}
      </div>

      {/* Invite Section */}
      {isManager && (
        <div>
          <h3 className="text-sm font-medium text-white/70 mb-3">Invite Team Member</h3>
          <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className={`${inputClass} flex-1`}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className={selectClass}
              >
                {ASSIGNABLE_ROLES.map(r => (
                  <option key={r} value={r} className="bg-[#1a1a1a]">{r}</option>
                ))}
              </select>
              <button
                onClick={sendInvite}
                disabled={sending || !inviteEmail.trim()}
                className="bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/60 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                {sending ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-white/70 mb-3">Pending Invites</h3>
          <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.14]">
                  <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Email</th>
                  <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Role</th>
                  <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3 hidden sm:table-cell">Expires</th>
                  {isManager && <th className="text-right text-[11px] text-white/60 font-medium px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {invites.map(invite => (
                  <tr key={invite.id} className="hover:bg-white/[0.06] transition-colors">
                    <td className="px-4 py-3 text-white/70">{invite.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-md border ${ROLE_COLORS[invite.role] || ROLE_COLORS.viewer}`}>
                        {invite.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60 hidden sm:table-cell">{timeAgo(invite.expires_at)}</td>
                    {isManager && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setRevokeConfirm(invite.id)}
                          className="text-[11px] text-red-400/40 hover:text-red-400 px-2 py-1"
                        >
                          Revoke
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Log */}
      <div>
        <h3 className="text-sm font-medium text-white/70 mb-3">Audit Log</h3>
        {auditLogs.length === 0 ? (
          <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-6 text-center">
            <p className="text-white/60 text-sm">No audit events yet</p>
          </div>
        ) : (
          <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.14]">
                  <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Action</th>
                  <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3">Resource</th>
                  <th className="text-left text-[11px] text-white/60 font-medium px-4 py-3 hidden md:table-cell">User</th>
                  <th className="text-right text-[11px] text-white/60 font-medium px-4 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-white/[0.06] transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] bg-white/[0.10] text-white/50 px-2 py-0.5 rounded-md">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-white/40">
                      {log.resource_type}
                      {log.resource_id && <span className="text-white/50 ml-1">({log.resource_id.slice(0, 8)}...)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-white/60 hidden md:table-cell">{log.user_email || '-'}</td>
                    <td className="px-4 py-2.5 text-white/60 text-right">{timeAgo(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
