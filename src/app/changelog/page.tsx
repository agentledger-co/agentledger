import Link from 'next/link';

const ENTRIES = [
  {
    date: 'February 18, 2026',
    version: 'v0.4.1',
    title: 'Launch',
    changes: [
      'AgentLedger is live — dashboard, SDK, and API',
      'Core SDK with LangChain, OpenAI, MCP, and Express integrations',
      'Real-time dashboard with action feed, cost tracking, and agent controls',
      'Budget enforcement with automatic agent pausing',
      'Anomaly detection and alerting',
      'Webhook support with HMAC-SHA256 verification',
      'Kill switch — pause or kill agents instantly',
      'Pre-flight checks — block actions before they happen',
      'Security hardening: CSP, HSTS, input validation, rate limiting',
      'Comprehensive API with 20+ endpoints',
      'Self-hosting support with Supabase',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#08080a] text-white">
      <nav className="border-b border-white/[0.06] px-6 py-4 sticky top-0 bg-[#08080a]/80 backdrop-blur-2xl z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg width="20" height="20" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">AgentLedger</span>
          </Link>
          <Link href="/" className="text-[13px] text-white/30 hover:text-white/70 transition-colors">
            Back to home
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-[32px] font-bold mb-2 tracking-tight">Changelog</h1>
        <p className="text-white/30 text-[15px] mb-12">What&apos;s new in AgentLedger.</p>

        <div className="space-y-12">
          {ENTRIES.map(entry => (
            <div key={entry.version} className="relative pl-8 border-l border-white/[0.06]">
              <div className="absolute left-0 top-0 w-2 h-2 rounded-full bg-blue-500 -translate-x-[5px]" />
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[11px] font-mono bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">{entry.version}</span>
                <span className="text-[13px] text-white/25">{entry.date}</span>
              </div>
              <h2 className="text-[20px] font-semibold mb-4">{entry.title}</h2>
              <ul className="space-y-2.5">
                {entry.changes.map(c => (
                  <li key={c} className="flex items-start gap-2.5 text-[14px] text-white/50 leading-relaxed">
                    <span className="text-blue-400/60 text-[11px] mt-1.5">{'\u2713'}</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
