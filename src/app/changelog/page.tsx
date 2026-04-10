import Link from 'next/link';

const ENTRIES = [
  {
    date: 'April 10, 2026',
    version: 'v0.6.1',
    title: 'Launch Hardening',
    changes: [
      'GA4 pageview tracking — fires on every client-side navigation, not just initial load',
      'Landing page scroll-depth tracking and dashboard engagement heartbeat for accurate session time',
      'Auth-expiry resilience — session listener, clean 401 surfacing, apiFetch wrapper, inline re-key modal',
      'Open-redirect hardening on the OAuth callback route',
      'Setup rollback — failed org/member/API key writes no longer leave orphan rows that trap users in onboarding',
      'iOS Safari auto-zoom fix on login/signup inputs',
      'Mobile viewport metadata for correct scaling across devices',
      'Security hardening: export rate limits, audit log ACL, explicit API key rotation endpoint',
      'Infra hardening: cron endpoint auth, Server-Sent Events observability, structured error logging',
      'Safe JSON parse across API responses; Escape-to-close on dashboard modals',
      'Error logging for all fire-and-forget webhook + notification calls',
      'Legal & copy pass: license clarity, pricing terminology, privacy policy updates',
      'Idempotent API key recovery endpoint',
      'Fixed critical dashboard redirect loop from recursive sessionStorage access',
      'Fixed onboarding stuck-state and missing login error feedback',
    ],
  },
  {
    date: 'April 6, 2026',
    version: 'v0.6.0',
    title: 'Ecosystem & Mobile',
    changes: [
      'Batch action logging — POST up to 100 actions per request with partial error handling',
      'Data export — CSV and JSON export with date range filtering and 90-day windows',
      'Cost forecasting — linear regression on historical cost with per-agent trend detection and budget projections',
      'Policy templates — 6 pre-built packs (conservative, balanced, permissive, cost-conscious, compliance, openai-optimized) with one-click apply',
      'Advanced analytics — multi-day trends with daily/hourly granularity, service and agent breakdowns, period comparisons',
      'AgentLedger CLI for terminal-first workflows',
      'Expanded framework integrations across LangChain, OpenAI, MCP, and Express',
      'Full mobile UX overhaul — responsive dashboard, input visibility fixes, touch targets',
      'Loading states and double-submit protection across every dashboard form',
      'Emoji icons replaced with SVG; refined empty states and alert styling',
      'Launch monitoring: Slack signup alerts, Sentry error tracking, Google Analytics',
      'Top services per agent shown on agent cards',
      'Tab grouping, trend indicators, and landing page cleanup',
      'Comprehensive docs rewrite for launch quality',
      'SDK: logBatch, export, forecast, analytics, policyTemplates, applyPolicyTemplate',
      'New dashboard tabs: Analytics, Forecast, Policy Templates',
      '25 new backend tests',
    ],
  },
  {
    date: 'March 31, 2026',
    version: 'v0.5.0',
    title: 'The Control Plane Release',
    changes: [
      'Policy engine — 6 rule types: rate limits, service allow/blocklists, cost caps, payload regex blocks, human approval requirements',
      'Human-in-the-loop approvals — agents pause and wait for dashboard approval before high-risk actions',
      'Statistical anomaly detection — hourly baseline computation from 7 days of data, alerts on 2+ stddev deviations',
      'Agent evaluations — score actions 0-100 with labels and feedback, trend analytics',
      'Rollback hooks — compensating action webhooks fired on agent kill or budget exceeded',
      'Live streaming via Server-Sent Events — sub-second action feed with auto-reconnect',
      'Trace timeline — waterfall visualization with parallel group detection and I/O inspection',
      'Multi-environment support — separate dev, staging, and production data',
      'Server-side search and filtering with cursor-based pagination',
      'Python SDK — sync and async clients with LangChain and OpenAI integrations',
      'Team management — invites, role-based access (owner/admin/member/viewer), audit trail',
      'SDK: evaluate(), stream(), waitForApproval(), environment config',
      '10 new docs sections, 42 backend tests, 8 dashboard tabs added',
      'Published to npm as agentledger@0.5.0',
    ],
  },
  {
    date: 'March 24, 2026',
    version: 'v0.4.3',
    title: 'Launch Polish',
    changes: [
      'Mobile hamburger menu for landing page navigation',
      'Trust & Security section: Open Source, Self-Hostable, Fail-Open, Zero Dependencies',
      'FAQ section with accordion',
      'Dashboard empty states with actionable CTAs and code snippets',
      'Docs: mobile sidebar navigation and scroll-aware highlighting',
      'Onboarding step 3 enhanced with quick-start code and next-steps checklist',
      'Fixed docs code block rendering (SQL, bash, TypeScript syntax highlighting)',
      'Bug fixes: budgets API, rate limiter, revoke keys button',
    ],
  },
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
      <nav className="border-b border-white/[0.14] px-6 py-4 sticky top-0 bg-[#08080a]/80 backdrop-blur-2xl z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg width="20" height="20" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">AgentLedger</span>
          </Link>
          <Link href="/" className="text-[13px] text-white/60 hover:text-white/70 transition-colors">
            Back to home
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-[32px] font-bold mb-2 tracking-tight">Changelog</h1>
        <p className="text-white/60 text-[15px] mb-12">What&apos;s new in AgentLedger.</p>

        <div className="space-y-12">
          {ENTRIES.map(entry => (
            <div key={entry.version} className="relative pl-8 border-l border-white/[0.14]">
              <div className="absolute left-0 top-0 w-2 h-2 rounded-full bg-blue-500 -translate-x-[5px]" />
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[11px] font-mono bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">{entry.version}</span>
                <span className="text-[13px] text-white/55">{entry.date}</span>
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
