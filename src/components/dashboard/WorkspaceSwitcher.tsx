'use client';

import React, { useEffect, useState, useRef } from 'react';

interface Workspace {
  id: string;
  name: string;
  role: string;
  plan: string;
}

export default function WorkspaceSwitcher({ onSwitch }: { onSwitch?: (orgId: string) => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [current, setCurrent] = useState<Workspace | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const { createBrowserClient } = await import('@/lib/supabase');
        const supabase = createBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        // Get all orgs the user belongs to
        const { data: memberships } = await supabase
          .from('org_members')
          .select('org_id, role, organizations(id, name, plan)')
          .eq('user_id', user.id);

        if (!memberships || memberships.length === 0) {
          setLoading(false);
          return;
        }

        const ws: Workspace[] = memberships.map((m: any) => ({
          id: m.organizations.id,
          name: m.organizations.name,
          role: m.role,
          plan: m.organizations.plan,
        }));

        setWorkspaces(ws);

        // Set current from sessionStorage or first
        const storedOrgId = sessionStorage.getItem('al_org_id');
        const found = ws.find(w => w.id === storedOrgId);
        setCurrent(found || ws[0]);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const switchWorkspace = async (ws: Workspace) => {
    setCurrent(ws);
    setOpen(false);
    sessionStorage.setItem('al_org_id', ws.id);

    // Get a new API key for this org
    try {
      const { createBrowserClient } = await import('@/lib/supabase');
      const supabase = createBrowserClient();

      // Fetch first active API key for this org
      const { data: keys } = await supabase
        .from('api_keys')
        .select('id, key_prefix')
        .eq('org_id', ws.id)
        .is('revoked_at', null)
        .limit(1);

      if (keys && keys.length > 0) {
        // Need to recover the full key
        const res = await fetch('/api/v1/keys/recover', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.key) {
            sessionStorage.setItem('al_api_key', data.key);
          }
        }
      }
    } catch { /* ignore */ }

    if (onSwitch) onSwitch(ws.id);
    window.location.reload();
  };

  if (loading || workspaces.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[13px] transition-colors"
      >
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold text-white">
          {current?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <span className="text-white/70 max-w-[120px] truncate">{current?.name || 'Workspace'}</span>
        <svg className={`w-3 h-3 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">Workspaces</p>
          </div>
          <div className="py-1 max-h-[300px] overflow-y-auto">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => switchWorkspace(ws)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors ${
                  ws.id === current?.id ? 'bg-white/[0.04]' : ''
                }`}
              >
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500/80 to-cyan-500/80 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-[13px] text-white/80 truncate">{ws.name}</p>
                  <p className="text-[10px] text-white/30">{ws.role} &middot; {ws.plan}</p>
                </div>
                {ws.id === current?.id && (
                  <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
