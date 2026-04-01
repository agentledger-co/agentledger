'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface ActionFilters {
  agent?: string;
  service?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
}

interface FilterBarProps {
  apiKey: string;
  environment: string;
  onFilterChange: (filters: ActionFilters) => void;
  agents: string[];
  services: string[];
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'blocked', label: 'Blocked' },
];

export default function FilterBar({ onFilterChange, agents, services }: FilterBarProps) {
  const [search, setSearch] = useState('');
  const [agent, setAgent] = useState('');
  const [service, setService] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFilters = !!(search || agent || service || status || from || to);

  const buildFilters = useCallback((): ActionFilters => {
    const filters: ActionFilters = {};
    if (search.trim()) filters.search = search.trim();
    if (agent) filters.agent = agent;
    if (service) filters.service = service;
    if (status) filters.status = status;
    if (from) filters.from = from;
    if (to) filters.to = to;
    return filters;
  }, [search, agent, service, status, from, to]);

  // Debounced filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange(buildFilters());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, agent, service, status, from, to, buildFilters, onFilterChange]);

  const clearAll = () => {
    setSearch('');
    setAgent('');
    setService('');
    setStatus('');
    setFrom('');
    setTo('');
  };

  const selectClass =
    'appearance-none bg-white/[0.10] border border-white/[0.16] text-white/80 rounded-lg px-3 py-2 text-[13px] focus:border-blue-500/50 focus:outline-none pr-8 cursor-pointer';

  const chevronStyle: React.CSSProperties = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
  };

  return (
    <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search actions..."
            className="w-full bg-white/[0.10] border border-white/[0.16] rounded-lg pl-9 pr-3 py-2 text-[13px] text-white/80 placeholder-white/20 focus:border-blue-500/50 focus:outline-none"
          />
        </div>

        {/* Agent dropdown */}
        <select
          value={agent}
          onChange={e => setAgent(e.target.value)}
          className={`${selectClass} ${agent ? 'border-blue-500/30 text-blue-400' : ''}`}
          style={chevronStyle}
        >
          <option value="">All agents</option>
          {agents.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Service dropdown */}
        <select
          value={service}
          onChange={e => setService(e.target.value)}
          className={`${selectClass} ${service ? 'border-blue-500/30 text-blue-400' : ''}`}
          style={chevronStyle}
        >
          <option value="">All services</option>
          {services.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Status dropdown */}
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className={`${selectClass} ${status ? 'border-blue-500/30 text-blue-400' : ''}`}
          style={chevronStyle}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className={`bg-white/[0.10] border border-white/[0.16] rounded-lg px-3 py-2 text-[13px] text-white/80 focus:border-blue-500/50 focus:outline-none [color-scheme:dark] ${from ? 'border-blue-500/30' : ''}`}
          />
          <span className="text-white/50 text-xs">to</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className={`bg-white/[0.10] border border-white/[0.16] rounded-lg px-3 py-2 text-[13px] text-white/80 focus:border-blue-500/50 focus:outline-none [color-scheme:dark] ${to ? 'border-blue-500/30' : ''}`}
          />
        </div>

        {/* Clear all */}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-[11px] text-white/60 hover:text-white/60 bg-white/[0.10] hover:bg-white/[0.08] px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
