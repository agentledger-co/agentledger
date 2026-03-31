'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';

interface EnvironmentSelectorProps {
  apiKey: string;
  environment: string;
  onChange: (env: string) => void;
}

const ENV_COLORS: Record<string, string> = {
  production: 'bg-emerald-400',
  prod: 'bg-emerald-400',
  staging: 'bg-blue-400',
  stage: 'bg-blue-400',
  development: 'bg-amber-400',
  dev: 'bg-amber-400',
};

function getEnvDotColor(envName: string): string {
  const lower = envName.toLowerCase();
  return ENV_COLORS[lower] || 'bg-white/30';
}

export default function EnvironmentSelector({ apiKey, environment, onChange }: EnvironmentSelectorProps) {
  const [environments, setEnvironments] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchEnvironments = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/environments', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEnvironments(data.environments || []);
      }
    } catch {
      // silent
    }
  }, [apiKey]);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const currentLabel = environment || 'All';
  const currentDotColor = environment ? getEnvDotColor(environment) : 'bg-white/20';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${currentDotColor}`} />
        <span className="capitalize">{currentLabel}</span>
        <svg className={`w-3 h-3 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-[#141416] border border-white/[0.08] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
          {/* All option */}
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors hover:bg-white/[0.06] ${
              !environment ? 'bg-white/[0.04] text-white' : 'text-white/60'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-white/20" />
            All
          </button>

          {environments.map(env => (
            <button
              key={env}
              onClick={() => { onChange(env); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors hover:bg-white/[0.06] ${
                environment === env ? 'bg-white/[0.04] text-white' : 'text-white/60'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${getEnvDotColor(env)}`} />
              <span className="capitalize">{env}</span>
            </button>
          ))}

          {environments.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-white/20">No environments found</div>
          )}
        </div>
      )}
    </div>
  );
}
