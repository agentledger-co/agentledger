'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// ==================== ROTATING WORD ====================
const ROTATING_WORDS = ['do', 'send', 'charge', 'spend', 'build', 'deploy', 'create', 'call'];

function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsExiting(true);
      setTimeout(() => {
        setIndex(prev => (prev + 1) % ROTATING_WORDS.length);
        setIsExiting(false);
      }, 300);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="inline-block transition-all duration-300 ease-in-out text-blue-400 font-extrabold"
      style={{
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'translateY(-20px)' : 'translateY(0)',
        textShadow: '0 0 30px rgba(59, 130, 246, 0.5), 0 0 60px rgba(59, 130, 246, 0.2)',
      }}
    >
      {ROTATING_WORDS[index]}
    </span>
  );
}

// ==================== ANIMATED DOTS ====================
function AnimatedDots() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setCount(prev => (prev + 1) % 4), 500);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="font-bold ml-1" style={{ textShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}>
      {count > 0 ? '.'.repeat(count) : '\u200b'}
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
            {actions.length === 0 && <div className="px-5 py-8 text-center text-[12px] text-white/15">Waiting for actions...</div>}
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
  { icon: '\ud83d\udce1', title: 'Real-Time Action Feed', desc: 'Every API call, email, ticket \u2014 logged with timing, cost, and metadata. Live dashboard updates.' },
  { icon: '\ud83d\udcb0', title: 'Cost Tracking & Budgets', desc: 'Know what your agents spend. Set daily/weekly/monthly budgets per agent with automatic enforcement.' },
  { icon: '\ud83d\udea8', title: 'Anomaly Detection', desc: 'Automatic alerts when agents spike in activity, hit new services, or approach budget limits.' },
  { icon: '\u23f9\ufe0f', title: 'Kill Switches', desc: 'Pause or permanently kill any agent instantly from the dashboard or API.' },
  { icon: '\ud83d\udd0c', title: '2-Line Integration', desc: 'Wrap any async function with ledger.track(). Works with LangChain, OpenAI, MCP Servers, Express, or plain code.' },
  { icon: '\ud83d\udee1\ufe0f', title: 'Fail-Open by Default', desc: 'If AgentLedger is down, your agents keep running. Never blocks production unless configured.' },
];

const COMPARISON = [
  { feature: 'LLM call tracing', us: false, them: true },
  { feature: 'Real-world action logging', us: true, them: false },
  { feature: 'Cross-service cost tracking', us: true, them: false },
  { feature: 'Agent kill switches', us: true, them: false },
  { feature: 'Budget controls & enforcement', us: true, them: false },
  { feature: 'Anomaly detection', us: true, them: false },
  { feature: 'Pre-flight action checks', us: true, them: false },
];

const SDK_CODE = `import { AgentLedger } from 'agentledger';

const ledger = new AgentLedger({
  apiKey: process.env.AGENTLEDGER_KEY
});

// Wrap any agent action
const result = await ledger.track({
  agent: 'support-bot',
  service: 'slack',
  action: 'send_message',
}, async () => {
  return await slack.chat.postMessage({
    channel: '#support',
    text: 'Issue resolved!'
  });
});`;

export default function LandingPage() {
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
            <a href="#features" className="text-[13px] text-white/30 hover:text-white/70 transition-colors hidden md:block">Features</a>
            <a href="#demo" className="text-[13px] text-white/30 hover:text-white/70 transition-colors hidden md:block">Live Demo</a>
            <Link href="/docs" className="text-[13px] text-white/30 hover:text-white/70 transition-colors hidden md:block">Docs</Link>
            <a href="#pricing" className="text-[13px] text-white/30 hover:text-white/70 transition-colors hidden md:block">Pricing</a>
            <Link href="/signup" className="bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30">
              Get Started {'\u2192'}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 md:pt-32 md:pb-28 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-500/[0.06] rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center relative">
          <div>
            <h1 className="text-[40px] md:text-[56px] font-bold leading-[1.05] mb-6 tracking-tight">
              See everything your<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500">AI agents</span>
              <span className="text-blue-400/40"><AnimatedDots /></span>{' '}
              <span className="relative">
                <RotatingWord />
                <span className="absolute -inset-x-2 -inset-y-1 bg-blue-500/10 rounded-lg blur-xl pointer-events-none" />
              </span>
            </h1>
            <p className="text-[17px] text-white/40 mb-10 leading-relaxed max-w-[480px]">
              Your agents send emails, create tickets, charge credit cards, and call APIs. AgentLedger logs every action, tracks every cost, and kills agents when things go wrong.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="bg-blue-500 hover:bg-blue-400 text-white font-medium px-6 py-3 rounded-xl transition-all text-[14px] shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40">
                Start Free {'\u2192'}
              </Link>
              <a href="#demo" className="bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/70 font-medium px-6 py-3 rounded-xl transition-all text-[14px] border border-white/[0.08]">
                See live demo
              </a>
              <div className="flex items-center bg-white/[0.04] rounded-xl border border-white/[0.08] px-4 py-2.5">
                <code className="text-[13px] text-blue-400/80 font-mono">npm i agentledger</code>
              </div>
            </div>
          </div>
          <CodeBlock code={SDK_CODE} filename="agent.ts" />
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-y border-white/[0.04] px-6 py-5">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[12px] text-white/15 tracking-wider">Works with LangChain {'\u00b7'} OpenAI Agents {'\u00b7'} MCP Servers {'\u00b7'} Express {'\u00b7'} Any agent framework</p>
        </div>
      </section>

      {/* Live Demo */}
      <section id="demo" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-medium tracking-widest uppercase text-blue-400/50 mb-3">Live Preview</p>
            <h2 className="text-[32px] font-bold mb-4 tracking-tight">Watch agents in real-time</h2>
            <p className="text-white/30 max-w-md mx-auto text-[15px]">This is what your dashboard looks like when agents are running. Every action logged, every cost tracked.</p>
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
            <p className="text-white/30 max-w-md mx-auto text-[15px]">LLM observability tools track token usage. AgentLedger tracks what agents actually <em className="text-white/50 not-italic">do</em>.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white/[0.02] rounded-2xl border border-white/[0.06] p-7 hover:border-blue-500/20 hover:bg-white/[0.03] transition-all duration-300 group">
                <div className="text-2xl mb-4">{f.icon}</div>
                <h3 className="font-semibold mb-2 text-[15px] group-hover:text-blue-400 transition-colors">{f.title}</h3>
                <p className="text-[13px] text-white/30 leading-relaxed">{f.desc}</p>
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
            <p className="text-white/30 text-[15px]">No infrastructure. No config files. Just wrap and go.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Install the SDK', code: 'npm install agentledger' },
              { step: '2', title: 'Wrap your agent actions', code: "await ledger.track({\n  agent: 'my-bot',\n  service: 'gmail',\n  action: 'send_email',\n}, sendEmailFn)" },
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
            <p className="text-white/30 text-[15px]">Helicone and Langfuse track LLM calls. We track what happens <em className="text-white/50 not-italic">after</em>.</p>
          </div>
          <div className="bg-white/[0.02] rounded-2xl border border-white/[0.06] overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-white/[0.06]">
                <th className="px-6 py-4 text-left text-[12px] font-medium text-white/30">Feature</th>
                <th className="px-6 py-4 text-center text-[12px] font-medium text-blue-400">AgentLedger</th>
                <th className="px-6 py-4 text-center text-[12px] font-medium text-white/30">LLM Tracers</th>
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {COMPARISON.map(c => (
                  <tr key={c.feature} className="hover:bg-white/[0.015] transition-colors">
                    <td className="px-6 py-3.5 text-[13px] text-white/50">{c.feature}</td>
                    <td className="px-6 py-3.5 text-center text-[14px]">{c.us ? '\u2705' : '\u2014'}</td>
                    <td className="px-6 py-3.5 text-center text-[14px]">{c.them ? '\u2705' : '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-24 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-medium tracking-widest uppercase text-blue-400/50 mb-3">Pricing</p>
            <h2 className="text-[32px] font-bold mb-4 tracking-tight">Simple pricing</h2>
            <p className="text-white/30 text-[15px]">Start free, scale when you need to.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: 'Free', price: '$0', period: 'forever', features: ['1,000 actions/mo', '5 agents', '7-day data retention', 'Basic alerts', 'Community support'], cta: 'Get Started', hl: true },
              { name: 'Pro', price: '$29', period: '/month', features: ['50,000 actions/mo', 'Unlimited agents', '90-day data retention', 'Anomaly detection', 'Budget controls', 'Webhooks', 'Email support'], cta: 'Join Waitlist', hl: false },
              { name: 'Team', price: '$99', period: '/month', features: ['500,000 actions/mo', 'Unlimited agents', '1-year data retention', 'SSO (coming soon)', 'Webhooks & API', 'Email support'], cta: 'Join Waitlist', hl: false },
            ].map(plan => (
              <div key={plan.name} className={`rounded-2xl border p-7 transition-all duration-300 ${plan.hl ? 'bg-blue-500/[0.04] border-blue-500/20 relative shadow-lg shadow-blue-500/5' : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]'}`}>
                {plan.hl && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-[10px] font-bold px-3.5 py-1 rounded-full uppercase tracking-wider shadow-lg shadow-blue-500/30">Available Now</div>}
                <h3 className="font-semibold text-[17px] mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-7">
                  <span className="text-[36px] font-bold tracking-tight">{plan.price}</span>
                  <span className="text-[13px] text-white/25">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-7">
                  {plan.features.map(f => <li key={f} className="flex items-center gap-2.5 text-[13px] text-white/50"><span className="text-blue-400/60 text-[11px]">{'\u2713'}</span> {f}</li>)}
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
          <p className="text-center text-[12px] text-white/15 mt-6 max-w-lg mx-auto">
            Free tier includes 1,000 actions/month with 7-day data retention. Usage beyond plan limits is rate-limited.
            We reserve the right to enforce fair use policies to maintain service quality for all users.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/[0.03] to-transparent pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative">
          <h2 className="text-[32px] font-bold mb-4 tracking-tight">Stop flying blind with your agents</h2>
          <p className="text-white/30 mb-10 text-[15px]">Know exactly what your agents are doing, what they cost, and how to stop them when things go sideways.</p>
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
            <span className="text-[13px] text-white/25">AgentLedger</span>
          </div>
          <div className="flex items-center gap-4 md:gap-6 flex-wrap justify-center">
            <a href="https://github.com/miken1988/agentledger" target="_blank" rel="noopener noreferrer" className="text-[12px] text-white/15 hover:text-white/40 transition-colors">GitHub</a>
            <Link href="/docs" className="text-[12px] text-white/15 hover:text-white/40 transition-colors">Docs</Link>
            <Link href="/changelog" className="text-[12px] text-white/15 hover:text-white/40 transition-colors">Changelog</Link>
            <Link href="/terms" className="text-[12px] text-white/15 hover:text-white/40 transition-colors">Terms</Link>
            <Link href="/privacy" className="text-[12px] text-white/15 hover:text-white/40 transition-colors">Privacy</Link>
            <p className="text-[12px] text-white/15">{'\u00a9'} 2026 AgentLedger. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
