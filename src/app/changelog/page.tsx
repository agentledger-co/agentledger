import Link from 'next/link';

const ENTRIES = [
  {
    date: 'March 31, 2026',
    version: 'v0.5.0',
    title: 'SDK v0.5.0 — Evaluations, Streaming & Approvals',
    changes: [
      'SDK: evaluate() method — score agent actions 0-100 with labels and feedback',
      'SDK: stream() method — real-time SSE streaming with auto-reconnect',
      'SDK: waitForApproval() — poll for human-in-the-loop decisions',
      'SDK: ApprovalRequiredError thrown by track() when approval policies trigger',
      'SDK: environment config option for multi-environment support',
      'Published to npm as agentledger@0.5.0',
    ],
  },
  {
    date: 'March 30, 2026',
    version: 'v0.4.8',
    title: 'Team Management & Audit Trail',
    changes: [
      'Team invites with cryptographic tokens and 7-day expiry',
      'Role-based access control: owner, admin, member, viewer',
      'Audit logging on all configuration changes (policies, webhooks, rollbacks, agent kills)',
      'Team management dashboard tab with invite form and member management',
      'Audit log viewer in the dashboard',
      'Invite emails sent via Resend API',
    ],
  },
  {
    date: 'March 29, 2026',
    version: 'v0.4.7',
    title: 'Comprehensive Documentation',
    changes: [
      '10 new docs sections: Environments, Search, Traces, Policy Engine, Approvals, SSE, Anomaly Detection, Evaluations, Rollback Hooks, Python SDK',
      '42 backend tests across policies, anomalies, rollbacks, and approvals',
      'Every feature now documented with code examples and API references',
    ],
  },
  {
    date: 'March 28, 2026',
    version: 'v0.4.6',
    title: 'Dashboard UI for All Features',
    changes: [
      'Policies tab — create and manage guardrail rules with dynamic config forms',
      'Approvals tab — pending queue with approve/deny, status filters, 5s auto-refresh',
      'Evaluations tab — score trends, per-agent breakdown, label distribution charts',
      'Rollback Hooks tab — configure compensating action webhooks with execution history',
      'Environment selector dropdown in dashboard header',
      'Filter bar component for server-side action search',
      'Live Tail view — real-time SSE streaming with pause/resume and rate counter',
      'Baselines visualization — anomaly detection range cards',
      'Landing page updated with 12 features and 11 comparison items',
    ],
  },
  {
    date: 'March 27, 2026',
    version: 'v0.4.5',
    title: 'Intelligence Layer — Anomalies, Evaluations & Rollbacks',
    changes: [
      'Human-in-the-loop approvals — require_approval policy type with 30-minute expiry',
      'Statistical anomaly detection — hourly baseline computation, 2+ stddev alerts',
      'Agent evaluations — score actions 0-100 with labels, feedback, and trend stats',
      'Rollback hooks — compensating action webhooks on agent kill or budget exceeded',
      'Approval request API with approve/deny flow',
      'Baselines cron job running hourly',
      'Rollback execution logging with HMAC-signed webhooks',
    ],
  },
  {
    date: 'March 26, 2026',
    version: 'v0.4.4',
    title: 'Control Plane — Policies, SSE & Trace Timeline',
    changes: [
      'Policy engine with 6 rule types: rate limit, service allow/blocklist, cost cap, payload regex, require approval',
      'Policy evaluation cached per-org with 30s TTL, priority-based ordering',
      'Live tail via Server-Sent Events — 2s polling, action/alert streaming',
      'Trace timeline waterfall visualization with parallel group detection',
      'SSE auth via Bearer header or query param for EventSource compatibility',
      'SDK stream() method with zero-dependency SSE parser',
      'Clickable trace IDs throughout dashboard',
    ],
  },
  {
    date: 'March 25, 2026',
    version: 'v0.4.3',
    title: 'Foundation — Search, Python SDK & Multi-Environment',
    changes: [
      'Server-side search and filtering on actions: agent, service, status, date range, trace_id, full-text search',
      'Cursor-based pagination for large action datasets',
      'Python SDK with sync and async clients — pip install agentledger',
      'LangChain and OpenAI Agents integrations for Python',
      'Multi-environment support — separate dev, staging, and production data',
      'Environment selector in dashboard header',
      'GET /api/v1/traces/:traceId endpoint with summary stats',
      'GET /api/v1/environments endpoint',
    ],
  },
  {
    date: 'March 24, 2026',
    version: 'v0.4.2',
    title: 'Launch Polish',
    changes: [
      'Mobile hamburger menu for landing page navigation',
      'Trust & Security section: Open Source, Self-Hostable, Fail-Open, Zero Dependencies',
      'FAQ section with 8 accordion questions',
      'GitHub stars badge in hero',
      'Dashboard empty states with actionable CTAs and code snippets',
      'Docs: mobile sidebar navigation and scroll-aware highlighting',
      'Onboarding step 3 enhanced with quick-start code and next-steps checklist',
      'Fixed docs code block rendering (SQL, bash, TypeScript syntax highlighting)',
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
