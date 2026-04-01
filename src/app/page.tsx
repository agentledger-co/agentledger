'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// ==================== TYPEWRITER WORD ====================
const ROTATING_WORDS = ['do', 'send', 'charge', 'spend', 'build', 'deploy', 'create', 'call'];

function TypewriterWord() {
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'paused' | 'clearing'>('typing');

  useEffect(() => {
    const word = ROTATING_WORDS[wordIndex];

    if (phase === 'typing') {
      if (charIndex < word.length) {
        const timer = setTimeout(() => setCharIndex(prev => prev + 1), 100);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => setPhase('paused'), 1800);
        return () => clearTimeout(timer);
      }
    }

    if (phase === 'paused') {
      setPhase('clearing');
      return;
    }

    if (phase === 'clearing') {
      const timer = setTimeout(() => {
        setWordIndex(prev => (prev + 1) % ROTATING_WORDS.length);
        setCharIndex(0);
        setPhase('typing');
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [charIndex, phase, wordIndex]);

  const displayed = ROTATING_WORDS[wordIndex].slice(0, charIndex);

  return (
    <span className="text-blue-400 font-extrabold" style={{ textShadow: '0 0 30px rgba(59, 130, 246, 0.5), 0 0 60px rgba(59, 130, 246, 0.2)' }}>
      {displayed}
      <span className="inline-block w-[3px] h-[0.85em] bg-blue-400 ml-[2px] align-baseline animate-blink" />
    </span>
  );
}

// ==================== LIVE DEMO COMPONENT ====================
function LiveDemo() {
  const [actions, setActions] = useState<Array<{
    id: number; agent: string; service: string; action: string; status: string; cost: number; duration: number; time: string;
  }>>([]);
  const [agents, setAgents] = useState([
    { name: 'support-bot', status: 'active' as const, actions: 847, cost: 342, lastActive: '2s ago' },
    { name: 'billing-agent', status: 'active' as const, actions: 234, cost: 1891, lastActive: '14s ago' },
    { name: 'data-sync', status: 'paused' as const, actions: 1203, cost: 0, lastActive: '2h ago' },
  ]);
  const [budget, setBudget] = useState({ used: 67, limit: 100, label: 'billing-agent · daily spend' });
  const [alert, setAlert] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [tab, setTab] = useState<'feed' | 'agents' | 'budgets'>('feed');
  const [autoCycle, setAutoCycle] = useState(true);
  const [progress, setProgress] = useState(0);
  const idRef = useRef(0);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const TABS: ('feed' | 'agents' | 'budgets')[] = ['feed', 'agents', 'budgets'];
  const TAB_DURATION = 4000;

  const DEMO_ACTIONS = [
    { agent: 'support-bot', service: 'slack', action: 'send_message', cost: 0, durationRange: [80, 200] },
    { agent: 'support-bot', service: 'gmail', action: 'send_email', cost: 1, durationRange: [400, 1200] },
    { agent: 'billing-agent', service: 'stripe', action: 'charge', cost: 45, durationRange: [1000, 3000] },
    { agent: 'billing-agent', service: 'stripe', action: 'create_invoice', cost: 0, durationRange: [800, 2000] },
    { agent: 'billing-agent', service: 'openai', action: 'completion', cost: 3, durationRange: [200, 800] },
    { agent: 'data-sync', service: 'github', action: 'create_issue', cost: 0, durationRange: [300, 700] },
    { agent: 'support-bot', service: 'twilio', action: 'send_sms', cost: 79, durationRange: [150, 400] },
  ];

  const SERVICE_COLORS: Record<string, string> = {
    slack: 'text-violet-400', gmail: 'text-rose-400', stripe: 'text-sky-400',
    github: 'text-white/60', openai: 'text-emerald-400', twilio: 'text-rose-400',
  };

  // Auto-cycle tabs
  useEffect(() => {
    if (!autoCycle) return;
    setProgress(0);
    const startTime = Date.now();
    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min((elapsed / TAB_DURATION) * 100, 100));
    }, 50);
    cycleTimerRef.current = setInterval(() => {
      setTab(prev => TABS[(TABS.indexOf(prev) + 1) % TABS.length]);
      setProgress(0);
    }, TAB_DURATION);
    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCycle, tab]);

  // Action generator
  useEffect(() => {
    const addAction = () => {
      const template = DEMO_ACTIONS[Math.floor(Math.random() * DEMO_ACTIONS.length)];
      const duration = Math.floor(Math.random() * (template.durationRange[1] - template.durationRange[0]) + template.durationRange[0]);
      const isError = Math.random() < 0.05;
      const isBlocked = !isError && Math.random() < 0.03;
      setActions(prev => [{
        id: idRef.current++, agent: template.agent, service: template.service,
        action: template.action, status: isError ? 'error' : isBlocked ? 'blocked' : 'success',
        cost: template.cost, duration,
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }, ...prev].slice(0, 6));
      setAgents(prev => prev.map(a => a.name === template.agent ? {
        ...a, actions: a.actions + 1, cost: a.cost + template.cost, lastActive: 'just now'
      } : a));
      if (template.agent === 'billing-agent' && template.cost > 0) {
        setBudget(prev => {
          const newUsed = Math.min(prev.used + template.cost / 100, prev.limit);
          if (newUsed > 85 && prev.used <= 85) {
            setAlert({ show: true, message: 'billing-agent approaching daily budget (85%)' });
            setTimeout(() => setAlert({ show: false, message: '' }), 4000);
          }
          return { ...prev, used: newUsed };
        });
      }
    };
    for (let i = 0; i < 3; i++) setTimeout(addAction, i * 200);
    const interval = setInterval(addAction, 2500 + Math.random() * 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabClick = (t: 'feed' | 'agents' | 'budgets') => {
    setAutoCycle(false);
    setTab(t);
  };

  const toggleAgent = (name: string) => {
    setAutoCycle(false);
    setAgents(prev => prev.map(a => a.name === name ? {
      ...a, status: a.status === 'active' ? 'paused' : 'active',
    } : a));
  };

  return (
    <div className="relative group">
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-blue-500/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative bg-[#0c0c0c] rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/50">
        {/* Alert banner */}
        <div className={`overflow-hidden transition-all duration-500 ${alert.show ? 'max-h-12' : 'max-h-0'}`}>
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2.5">
            <span className="text-amber-400 text-[11px]">{'\u26a0'}</span>
            <span className="text-[11px] text-amber-400/80">{alert.message}</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-5 border-b border-white/[0.06]">
          {TABS.map(t => (
            <button key={t} onClick={() => handleTabClick(t)}
              className={`px-4 py-3 text-[11px] font-medium tracking-wide uppercase transition-all relative ${tab === t ? 'text-white/70' : 'text-white/20 hover:text-white/40'}`}>
              {t === 'feed' ? 'Live Feed' : t === 'agents' ? 'Agents' : 'Budgets'}
              {tab === t && (
                <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full overflow-hidden bg-white/[0.06]">
                  {autoCycle ? (
                    <div className="h-full bg-blue-500 rounded-full transition-none" style={{ width: `${progress}%` }} />
                  ) : (
                    <div className="h-full bg-blue-500 rounded-full w-full" />
                  )}
                </div>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-white/15 font-mono">live</span>
          </div>
        </div>

        {/* Feed tab */}
        {tab === 'feed' && (
          <div className="divide-y divide-white/[0.04]">
            {actions.map((a, i) => (
              <div key={a.id} className={`px-5 py-2.5 flex items-center gap-3 text-[12px] transition-all duration-300 hover:bg-white/[0.02] ${i === 0 ? 'animate-fade-in bg-white/[0.015]' : ''}`}>
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.status === 'success' ? 'bg-emerald-400' : a.status === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
                <span className="text-white/30 font-mono w-[60px] flex-shrink-0 tabular-nums">{a.time}</span>
                <span className="text-white/70 font-medium w-28 flex-shrink-0 truncate">{a.agent}</span>
                <span className="text-white/15">{'\u2192'}</span>
                <span className={`font-medium w-16 flex-shrink-0 ${SERVICE_COLORS[a.service] || 'text-white/50'}`}>{a.service}</span>
                <span className="text-white/30 flex-1 truncate">{a.action}</span>
                <span className="text-white/15 w-14 text-right font-mono tabular-nums">{a.duration}ms</span>
                {a.cost > 0 && <span className="text-blue-400/70 w-12 text-right font-mono tabular-nums">${(a.cost / 100).toFixed(2)}</span>}
              </div>
            ))}
            {actions.length === 0 && <div className="px-5 py-8 text-center text-[12px] text-white/30">Waiting for actions...</div>}
          </div>
        )}

        {/* Agents tab */}
        {tab === 'agents' && (
          <div className="divide-y divide-white/[0.04]">
            {agents.map(a => (
              <div key={a.name} className="px-5 py-4 flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-white/70 font-medium">{a.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${a.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400'}`}>{a.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-white/20">{a.actions.toLocaleString()} actions</span>
                    <span className="text-[11px] text-white/20">{'\u00b7'}</span>
                    <span className="text-[11px] text-blue-400/50">${(a.cost / 100).toFixed(2)} spent</span>
                    <span className="text-[11px] text-white/20">{'\u00b7'}</span>
                    <span className="text-[11px] text-white/15">{a.lastActive}</span>
                  </div>
                </div>
                <button onClick={() => toggleAgent(a.name)}
                  className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all ${a.status === 'active' ? 'border-amber-500/30 text-amber-400/70 hover:bg-amber-500/10' : 'border-emerald-500/30 text-emerald-400/70 hover:bg-emerald-500/10'}`}>
                  {a.status === 'active' ? 'Pause' : 'Resume'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Budgets tab */}
        {tab === 'budgets' && (
          <div className="p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-white/50">{budget.label}</span>
                <span className="text-[12px] font-mono text-white/30">${budget.used.toFixed(0)} / ${budget.limit}</span>
              </div>
              <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ${budget.used / budget.limit > 0.85 ? 'bg-amber-500' : budget.used / budget.limit > 0.7 ? 'bg-blue-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min((budget.used / budget.limit) * 100, 100)}%` }} />
              </div>
              <p className="text-[11px] text-white/15 mt-1.5">Auto-pauses agent when limit is reached</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-white/50">support-bot {'\u00b7'} monthly actions</span>
                <span className="text-[12px] font-mono text-white/30">847 / 2,000</span>
              </div>
              <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-blue-400 transition-all duration-1000" style={{ width: '42%' }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-white/50">data-sync {'\u00b7'} daily actions</span>
                <span className="text-[12px] font-mono text-white/30">0 / 500</span>
              </div>
              <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-white/10 transition-all duration-1000" style={{ width: '0%' }} />
              </div>
              <p className="text-[11px] text-amber-400/40 mt-1.5">{'\u23f8'} Agent paused</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeBlock({ code, filename }: { code: string; filename: string }) {
  const highlighted = code
    .replace(/(import|from|const|await|return|async|new)/g, '<span class="text-violet-400">$1</span>')
    .replace(/('[@\w/.-]+')/g, '<span class="text-emerald-400">$1</span>')
    .replace(/(\/\/[^\n]*)/g, '<span class="text-white/20">$1</span>')
    .replace(/(AgentLedger|ledger)/g, '<span class="text-blue-400">$1</span>');
  return (
    <div className="relative group">
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative bg-[#0c0c0c] rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/50">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          <span className="text-[11px] text-white/20 ml-3 font-mono">{filename}</span>
        </div>
        <pre className="p-6 text-[13px] leading-[1.8] overflow-x-auto">
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: '📡', title: 'Live Streaming Feed', desc: 'Real-time SSE streaming of every action. Watch your agents work live with sub-second latency.' },
  { icon: '🛡️', title: 'Policy Engine & Templates', desc: 'Define rules or apply pre-built templates: conservative, cost-conscious, compliance. Rate limits, allowlists, cost caps, and more.' },
  { icon: '✋', title: 'Human-in-the-Loop', desc: 'Require human approval for high-risk actions. Approve or deny from the dashboard, Slack, Discord, or PagerDuty.' },
  { icon: '📊', title: 'Advanced Analytics & Forecasting', desc: 'Multi-day trend analysis, cost forecasting with linear regression, and budget overrun predictions.' },
  { icon: '🔗', title: 'Trace Replay & Debugging', desc: 'Step through agent traces action-by-action. Inspect input/output at each step with a visual replay timeline.' },
  { icon: '🐍', title: 'SDKs, CLI & 8 Integrations', desc: 'Python & TypeScript SDKs, CLI tool, plus LangChain, OpenAI, MCP, CrewAI, AutoGen, LlamaIndex, and Vercel AI SDK.' },
];

const COMPARISON = [
  { feature: 'LLM call tracing', us: false, them: true },
  { feature: 'Real-world action logging', us: true, them: false },
  { feature: 'Policy engine & guardrails', us: true, them: false },
  { feature: 'Human-in-the-loop approvals', us: true, them: false },
  { feature: 'Statistical anomaly detection', us: true, them: false },
  { feature: 'Agent evaluations & scoring', us: true, them: false },
  { feature: 'Trace replay & debugging', us: true, them: false },
  { feature: 'Cost forecasting & analytics', us: true, them: false },
  { feature: 'Budget controls & enforcement', us: true, them: false },
  { feature: 'Batch logging & data export', us: true, them: false },
  { feature: 'CLI tool (npx agentledger)', us: true, them: false },
  { feature: 'Slack, Discord & PagerDuty alerts', us: true, them: false },
  { feature: 'Live SSE streaming', us: true, them: false },
  { feature: 'Python & TypeScript SDKs', us: true, them: true },
  { feature: '8 framework integrations', us: true, them: true },
];

const SDK_CODE = `import AgentLedger from 'agentledger';

const ledger = new AgentLedger({
  apiKey: process.env.AGENTLEDGER_KEY
});

// Group related actions into a trace
const traceId = AgentLedger.traceId();

const { result } = await ledger.track({
  agent: 'support-bot',
  service: 'slack',
  action: 'send_message',
  traceId,
  input: { channel: '#support' },
  captureOutput: true,
}, async () => {
  return await slack.chat.postMessage({
    channel: '#support',
    text: 'Issue resolved!'
  });
});`;

const FAQ_ITEMS = [
  { q: 'Is AgentLedger open source?', a: 'Yes. The entire platform is open source on GitHub. You can self-host it on your own infrastructure or use our hosted version at agentledger.co.' },
  { q: 'Can I self-host AgentLedger?', a: 'Absolutely. You need a Supabase project (or any PostgreSQL 13+ database) and can deploy to Vercel, Railway, or any Node.js host. Full instructions are in the docs.' },
  { q: 'What happens if AgentLedger goes down?', a: 'AgentLedger is fail-open by default. If our service is unreachable, your agents continue running normally. No action is ever blocked due to an AgentLedger outage.' },
  { q: 'How is this different from Langfuse or Helicone?', a: 'Those tools trace LLM API calls (tokens, latency, prompts). AgentLedger tracks what happens after the LLM decides to act: the emails sent, tickets created, payments charged, and APIs called.' },
  { q: 'What frameworks do you support?', a: 'LangChain, OpenAI Agents, MCP Servers, CrewAI, AutoGen, LlamaIndex, Vercel AI SDK, and Express out of the box. The core SDK works with any async function in any framework — just wrap it with ledger.track().' },
  { q: 'Where is my data stored?', a: 'On the hosted version, data is stored in Supabase (PostgreSQL) with row-level security. If you self-host, data stays entirely on your infrastructure. We never share or sell your data.' },
  { q: 'Can I require human approval for agent actions?', a: 'Yes. Create a require_approval policy for specific agents, services, or actions. When triggered, the agent pauses and waits for a human to approve or deny in the dashboard. Approvals auto-expire after 30 minutes.' },
  { q: 'Do you support Python?', a: 'Yes. We have both Python and TypeScript SDKs with sync and async support. The Python SDK includes integrations for LangChain, CrewAI, and OpenAI Agents.' },
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('https://api.github.com/repos/agentledger-co/agentledger')
      .then(r => r.json())
      .then(d => { if (d.stargazers_count != null) setStars(d.stargazers_count); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#08080a] text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 py-4 sticky top-0 bg-[#08080a]/80 backdrop-blur-2xl z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 logo-heartbeat-glow">
              <svg className="logo-heartbeat" width="20" height="20" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">AgentLedger</span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#features" className="text-[13px] text-white/60 hover:text-white/90 transition-colors hidden md:block">Features</a>
            <a href="#demo" className="text-[13px] text-white/60 hover:text-white/90 transition-colors hidden md:block">Live Demo</a>
            <Link href="/docs" className="text-[13px] text-white/60 hover:text-white/90 transition-colors hidden md:block">Docs</Link>
            <a href="#pricing" className="text-[13px] text-white/60 hover:text-white/90 transition-colors hidden md:block">Pricing</a>
            <Link href="/signup" className="bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hidden md:block">
              Get Started {'\u2192'}
            </Link>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white/60 hover:text-white/90 p-1">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {mobileMenuOpen ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></>}
              </svg>
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-2 border-t border-white/[0.06] pt-4 flex flex-col gap-3">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-[14px] text-white/60 hover:text-white/90 transition-colors">Features</a>
            <a href="#demo" onClick={() => setMobileMenuOpen(false)} className="text-[14px] text-white/60 hover:text-white/90 transition-colors">Live Demo</a>
            <Link href="/docs" onClick={() => setMobileMenuOpen(false)} className="text-[14px] text-white/60 hover:text-white/90 transition-colors">Docs</Link>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-[14px] text-white/60 hover:text-white/90 transition-colors">Pricing</a>
            <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="bg-blue-500 hover:bg-blue-400 text-white text-[14px] font-medium px-4 py-2.5 rounded-lg transition-all text-center mt-1">
              Get Started {'\u2192'}
            </Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 md:pt-32 md:pb-28 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-500/[0.06] rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center relative">
          <div>
            <h1 className="text-[32px] md:text-[56px] font-bold leading-[1.05] mb-6 tracking-tight">
              See everything your{' '}
              <span className="hidden md:inline"><br /></span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500">AI agents</span>{' '}
              <TypewriterWord />
            </h1>
            <p className="text-[17px] text-white/55 mb-10 leading-relaxed max-w-[480px]">
              Your agents send emails, create tickets, charge credit cards, and call APIs. AgentLedger logs every action, tracks every cost, and kills agents when things go wrong.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="bg-blue-500 hover:bg-blue-400 text-white font-medium px-6 py-3 rounded-xl transition-all text-[14px] shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40">
                Start Free {'\u2192'}
              </Link>
              <a href="#demo" className="bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white/80 font-medium px-6 py-3 rounded-xl transition-all text-[14px] border border-white/[0.08]">
                See live demo
              </a>
              <button
                onClick={() => { navigator.clipboard.writeText('npm i agentledger'); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-2 bg-white/[0.04] rounded-xl border border-white/[0.08] px-4 py-2.5 hover:bg-white/[0.06] transition-colors group"
              >
                <code className="text-[13px] text-blue-400/80 font-mono">npm i agentledger</code>
                <span className="text-[11px] text-white/20 group-hover:text-white/40 transition-colors">
                  {copied ? '✓' : '⎘'}
                </span>
              </button>
            </div>
            {stars !== null && (
              <a href="https://github.com/agentledger-co/agentledger" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-5 text-[13px] text-white/40 hover:text-white/60 transition-colors">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                <span>{stars} stars on GitHub</span>
              </a>
            )}
          </div>
          <CodeBlock code={SDK_CODE} filename="agent.ts" />
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-y border-white/[0.04] px-6 py-5">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[12px] text-white/30 tracking-wider">Works with LangChain {'\u00b7'} OpenAI Agents {'\u00b7'} CrewAI {'\u00b7'} MCP Servers {'\u00b7'} Express {'\u00b7'} Python & TypeScript</p>
        </div>
      </section>

      {/* Live Demo */}
      <section id="demo" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-medium tracking-widest uppercase text-blue-400/50 mb-3">Live Preview</p>
            <h2 className="text-[32px] font-bold mb-4 tracking-tight">Watch agents in real-time</h2>
            <p className="text-white/50 max-w-md mx-auto text-[15px]">This is what your dashboard looks like when agents are running. Every action logged, every cost tracked.</p>
          </div>
          <div className="max-w-4xl mx-auto"><LiveDemo /></div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[11px] font-medium tracking-widest uppercase text-blue-400/50 mb-3">Features</p>
            <h2 className="text-[32px] font-bold mb-4 tracking-tight">Everything you need to trust your agents</h2>
            <p className="text-white/50 max-w-md mx-auto text-[15px]">LLM observability tools track token usage. AgentLedger tracks what agents actually <em className="text-white/50 not-italic">do</em>.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white/[0.02] rounded-2xl border border-white/[0.06] p-8 hover:border-blue-500/20 hover:bg-white/[0.03] transition-all duration-300 group">
                <div className="text-3xl mb-5">{f.icon}</div>
                <h3 className="font-semibold mb-3 text-[16px] group-hover:text-blue-400 transition-colors">{f.title}</h3>
                <p className="text-[14px] text-white/45 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24 border-y border-white/[0.04]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[11px] font-medium tracking-widest uppercase text-blue-400/50 mb-3">Get Started</p>
            <h2 className="text-[32px] font-bold mb-4 tracking-tight">Three steps. Five minutes.</h2>
            <p className="text-white/50 text-[15px]">No infrastructure. No config files. Just wrap and go.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Install the SDK', code: 'npm install agentledger' },
              { step: '2', title: 'Wrap your agent actions', code: "await ledger.track({\n  agent: 'my-bot',\n  service: 'gmail',\n  action: 'send_email',\n  traceId,\n  captureOutput: true,\n}, sendEmailFn)" },
              { step: '3', title: 'Watch the dashboard', code: '\u2192 agentledger.co/dashboard' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 font-bold text-[14px] flex items-center justify-center mx-auto mb-5 border border-blue-500/20">{s.step}</div>
                <h3 className="font-semibold mb-4 text-[15px]">{s.title}</h3>
                <div className="bg-[#0c0c0c] rounded-xl border border-white/[0.06] p-5">
                  <code className="text-[12px] text-blue-400/70 font-mono whitespace-pre leading-relaxed">{s.code}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="px-6 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-medium tracking-widest uppercase text-blue-400/50 mb-3">Comparison</p>
            <h2 className="text-[32px] font-bold mb-4 tracking-tight">Not another LLM tracer</h2>
            <p className="text-white/50 text-[15px]">Helicone and Langfuse track LLM calls. We track what happens <em className="text-white/50 not-italic">after</em>.</p>
          </div>
          <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-white/[0.06]">
                <th className="px-6 py-4 text-left text-[12px] font-medium text-white/45">Feature</th>
                <th className="px-6 py-4 text-center text-[12px] font-medium text-blue-400">AgentLedger</th>
                <th className="px-6 py-4 text-center text-[12px] font-medium text-white/45">LLM Tracers</th>
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {COMPARISON.map(c => (
                  <tr key={c.feature} className="hover:bg-white/[0.015] transition-colors">
                    <td className="px-6 py-3.5 text-[13px] text-white/60">{c.feature}</td>
                    <td className="px-6 py-3.5 text-center text-[14px]">{c.us ? '\u2705' : '\u2014'}</td>
                    <td className="px-6 py-3.5 text-center text-[14px]">{c.them ? '\u2705' : '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className="px-6 py-16 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, title: 'Open Source', desc: 'Fully auditable codebase on GitHub' },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 00-8 0v2"/></svg>, title: 'Self-Hostable', desc: 'Run on your own infrastructure' },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, title: 'Fail-Open', desc: 'Never blocks your production agents' },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>, title: 'Zero Dependencies', desc: 'SDK adds no bloat to your project' },
          ].map(item => (
            <div key={item.title} className="text-center">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-3 border border-blue-500/10">
                {item.icon}
              </div>
              <h3 className="text-[13px] font-semibold mb-1">{item.title}</h3>
              <p className="text-[11px] text-white/35">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-24 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-medium tracking-widest uppercase text-blue-400/50 mb-3">Pricing</p>
            <h2 className="text-[32px] font-bold mb-4 tracking-tight">Simple pricing</h2>
            <p className="text-white/50 text-[15px]">Start free, scale when you need to.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: 'Free', price: '$0', period: 'forever', features: ['5,000 actions/mo', '5 agents', '7-day data retention', 'Action drawer & I/O', 'Slack, Discord & email alerts', 'Community support'], cta: 'Get Started', hl: true },
              { name: 'Pro', price: '$29', period: '/month', features: ['50,000 actions/mo', 'Unlimited agents', '90-day data retention', 'Traces & sessions', 'Budget controls', 'Webhooks', 'Slack, Discord & PagerDuty', 'Email support'], cta: 'Join Waitlist', hl: false },
              { name: 'Team', price: '$99', period: '/month', features: ['500,000 actions/mo', 'Unlimited agents', '1-year data retention', 'Traces & sessions', 'Budget controls', 'Webhooks', 'Slack, Discord & PagerDuty', 'SSO (coming soon)', 'Priority support'], cta: 'Join Waitlist', hl: false },
            ].map(plan => (
              <div key={plan.name} className={`rounded-2xl border p-7 transition-all duration-300 ${plan.hl ? 'bg-blue-500/[0.04] border-blue-500/20 relative shadow-lg shadow-blue-500/5' : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]'}`}>
                {plan.hl && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-[10px] font-bold px-3.5 py-1 rounded-full uppercase tracking-wider shadow-lg shadow-blue-500/30">Available Now</div>}
                <h3 className="font-semibold text-[17px] mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-7">
                  <span className="text-[36px] font-bold tracking-tight">{plan.price}</span>
                  <span className="text-[13px] text-white/35">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-7">
                  {plan.features.map(f => <li key={f} className="flex items-center gap-2.5 text-[13px] text-white/60"><span className="text-blue-400/60 text-[11px]">{'\u2713'}</span> {f}</li>)}
                </ul>
                {plan.cta === 'Join Waitlist' ? (
                  <a href="mailto:hello@agentledger.co?subject=Waitlist: AgentLedger Pro/Team" className="block text-center py-2.5 rounded-xl text-[13px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-white/50 border border-white/[0.08] transition-all">
                    {plan.cta} {'\u2192'}
                  </a>
                ) : (
                  <Link href="/signup" className={`block text-center py-2.5 rounded-xl text-[13px] font-medium transition-all ${plan.hl ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/25' : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/50 border border-white/[0.08]'}`}>
                    {plan.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-[12px] text-white/25 mt-6 max-w-lg mx-auto">
            Free tier includes 5,000 actions/month with 7-day data retention. Usage beyond plan limits is rate-limited.
            We reserve the right to enforce fair use policies to maintain service quality for all users.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-24 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-medium tracking-widest uppercase text-blue-400/50 mb-3">FAQ</p>
            <h2 className="text-[32px] font-bold mb-4 tracking-tight">Common questions</h2>
          </div>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="border border-white/[0.06] rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-[14px] font-medium text-white/80">{item.q}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                    className={`text-white/30 flex-shrink-0 ml-4 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-[13px] text-white/45 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/[0.03] to-transparent pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative">
          <h2 className="text-[32px] font-bold mb-4 tracking-tight">Stop flying blind with your agents</h2>
          <p className="text-white/50 mb-10 text-[15px]">Know exactly what your agents are doing, what they cost, and how to stop them when things go sideways.</p>
          <Link href="/signup" className="bg-blue-500 hover:bg-blue-400 text-white font-medium px-8 py-3.5 rounded-xl transition-all inline-block shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 text-[14px]">
            Get Started Free {'\u2192'}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center logo-heartbeat-glow">
              <svg className="logo-heartbeat" width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="text-[13px] text-white/35">AgentLedger</span>
          </div>
          <div className="flex items-center gap-4 md:gap-6 flex-wrap justify-center">
            <a href="https://github.com/agentledger-co/agentledger" target="_blank" rel="noopener noreferrer" className="text-[12px] text-white/30 hover:text-white/50 transition-colors">GitHub</a>
            <Link href="/docs" className="text-[12px] text-white/30 hover:text-white/50 transition-colors">Docs</Link>
            <Link href="/changelog" className="text-[12px] text-white/30 hover:text-white/50 transition-colors">Changelog</Link>
            <Link href="/terms" className="text-[12px] text-white/30 hover:text-white/50 transition-colors">Terms</Link>
            <Link href="/privacy" className="text-[12px] text-white/30 hover:text-white/50 transition-colors">Privacy</Link>
            <p className="text-[12px] text-white/30">{'\u00a9'} 2026 AgentLedger. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
