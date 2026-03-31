'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// ==================== CODE BLOCK WITH COPY ====================
function Code({ code, lang = 'typescript', filename }: { code: string; lang?: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // HTML-escape first, then apply syntax highlighting spans
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escaped = esc(code);

  const highlighted = lang === 'sql'
    ? escaped.split('\n').map(line => {
        if (line.trimStart().startsWith('--')) return `<span class="text-white/20">${line}</span>`;
        return line.replace(/\b(CREATE|TABLE|ALTER|ADD|COLUMN|INSERT|INTO|VALUES|SELECT|FROM|WHERE|UPDATE|SET|DELETE|DROP|INDEX|ON|IF|NOT|EXISTS|NULL|DEFAULT|PRIMARY|KEY|REFERENCES|UNIQUE|CONSTRAINT|ENABLE|ROW|LEVEL|SECURITY)\b/gi, '<span class="text-violet-400">$1</span>');
      }).join('\n')
    : lang === 'bash'
    ? escaped.split('\n').map(line => {
        if (line.trimStart().startsWith('#')) return `<span class="text-white/20">${line}</span>`;
        return line
          .replace(/^(\s*)(npm|npx|git|cd|cp|curl|mkdir|vercel)\b/g, '$1<span class="text-violet-400">$2</span>')
          .replace(/(\| )(npm|npx|git|cd|cp|curl|mkdir|vercel)\b/g, '$1<span class="text-violet-400">$2</span>');
      }).join('\n')
    : (() => {
        // Process TypeScript line-by-line to avoid cross-regex corruption
        return escaped.split('\n').map(line => {
          if (line.trimStart().startsWith('//')) return `<span class="text-white/20">${line}</span>`;
          return line
            .replace(/('[@\w/.*#:!{} -]+'|"[@\w/.*#:!{} -]+")/g, '<span class="text-emerald-400">$1</span>')
            .replace(/\b(import|from|const|await|return|async|new|export|interface|type|function|if|else|for|of|throw|try|catch)\b/g, '<span class="text-violet-400">$1</span>')
            .replace(/\b(AgentLedger|ledger|handler|wrapMCPServer|wrapMCPTool|createToolExecutor|withAgentLedger|trackFunction|agentLedgerMiddleware|AgentLedgerCallbackHandler|wrapOpenAICompletion)\b/g, '<span class="text-blue-400">$1</span>');
        }).join('\n');
      })();

  return (
    <div className="relative group my-4">
      <div className="bg-[#0c0c0c] rounded-xl border border-white/[0.06] overflow-hidden">
        {filename && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
            <span className="text-[11px] text-white/20 font-mono">{filename}</span>
            <button onClick={copy} className="text-[11px] text-white/20 hover:text-white/50 transition-colors">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
        {!filename && (
          <button onClick={copy} className="absolute top-3 right-3 text-[11px] text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
        <pre className="p-4 text-[13px] leading-[1.7] overflow-x-auto">
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    </div>
  );
}

function InlineCode({ children }: { children: string }) {
  return <code className="bg-white/[0.06] text-blue-400 px-1.5 py-0.5 rounded text-[13px] font-mono">{children}</code>;
}

// ==================== NAV SECTIONS ====================
const NAV = [
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'installation', label: 'Installation' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'core-sdk', label: 'Core SDK' },
  { id: 'langchain', label: 'LangChain' },
  { id: 'openai', label: 'OpenAI Agents' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'express', label: 'Express / Generic' },
  { id: 'rest-api', label: 'REST API' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'api-keys', label: 'API Key Management' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'budgets', label: 'Budgets & Alerts' },
  { id: 'environments', label: 'Environments' },
  { id: 'search', label: 'Search & Filtering' },
  { id: 'traces', label: 'Traces' },
  { id: 'policies', label: 'Policy Engine' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'streaming', label: 'Live Streaming (SSE)' },
  { id: 'anomalies', label: 'Anomaly Detection' },
  { id: 'evaluations', label: 'Evaluations' },
  { id: 'rollbacks', label: 'Rollback Hooks' },
  { id: 'python', label: 'Python SDK' },
  { id: 'self-hosting', label: 'Self-Hosting' },
];

// ==================== TABLE ====================
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-white/[0.06]">
          {headers.map(h => <th key={h} className="px-4 py-2.5 text-left text-white/40 font-medium">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((row, i) => <tr key={i} className="hover:bg-white/[0.015]">
            {row.map((cell, j) => <td key={j} className="px-4 py-2.5 text-white/60">{j === 0 ? <code className="text-blue-400/70 font-mono text-[12px]">{cell}</code> : cell}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('quickstart');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );
    const sections = NAV.map(n => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    sections.forEach(s => observerRef.current?.observe(s));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-[#08080a] text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 py-4 sticky top-0 bg-[#08080a]/80 backdrop-blur-2xl z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 logo-heartbeat-glow">
                <svg className="logo-heartbeat" width="20" height="20" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span className="text-lg font-semibold tracking-tight">AgentLedger</span>
            </Link>
            <span className="text-white/15 text-[13px]">/</span>
            <span className="text-white/40 text-[13px]">Docs</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-[13px] text-white/30 hover:text-white/70 transition-colors">Home</Link>
            <Link href="/dashboard" className="bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-all shadow-lg shadow-blue-500/20">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Mobile section nav */}
      <div className="lg:hidden border-b border-white/[0.06] px-6 py-3 sticky top-[57px] bg-[#08080a]/90 backdrop-blur-xl z-40">
        <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="flex items-center justify-between w-full text-left">
          <span className="text-[13px] text-white/60">{NAV.find(n => n.id === activeSection)?.label || 'Navigate'}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={`text-white/30 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {mobileNavOpen && (
          <nav className="mt-3 space-y-1 pb-1">
            {NAV.map(item => (
              <a key={item.id} href={`#${item.id}`}
                onClick={() => { setActiveSection(item.id); setMobileNavOpen(false); }}
                className={`block px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                  activeSection === item.id ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-white/30 hover:text-white/60'
                }`}>
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 border-r border-white/[0.06] py-8 pr-6 pl-6 sticky top-[65px] h-[calc(100vh-65px)] overflow-y-auto hidden lg:block">
          <nav className="space-y-1">
            {NAV.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setActiveSection(item.id)}
                className={`block px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                  activeSection === item.id
                    ? 'bg-blue-500/10 text-blue-400 font-medium'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/[0.03]'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 py-12 px-8 lg:px-16 max-w-4xl">

          {/* Quick Start */}
          <section id="quickstart" className="mb-20">
            <h1 className="text-[36px] font-bold mb-3 tracking-tight">Documentation</h1>
            <p className="text-white/40 text-[16px] mb-10 leading-relaxed max-w-2xl">
              AgentLedger tracks what your AI agents actually do — every API call, email, ticket, and charge. Get set up in under 5 minutes.
            </p>

            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Quick Start</h2>

            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-bold flex items-center justify-center border border-blue-500/20">1</div>
                  <h3 className="text-[15px] font-medium">Set up the database</h3>
                </div>
                <p className="text-white/30 text-[14px] mb-2 ml-9">Create a <a href="https://supabase.com" className="text-blue-400 hover:underline" target="_blank" rel="noopener">Supabase</a> project and run the migration in the SQL Editor.</p>
                <div className="ml-9">
                  <Code code="-- Paste the contents of supabase/migrations/001_initial_schema.sql\n-- into Supabase Dashboard > SQL Editor > New Query > Run" lang="sql" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-bold flex items-center justify-center border border-blue-500/20">2</div>
                  <h3 className="text-[15px] font-medium">Deploy the dashboard</h3>
                </div>
                <p className="text-white/30 text-[14px] mb-2 ml-9">Deploy to Vercel with one click, or run locally:</p>
                <div className="ml-9">
                  <Code code={`git clone https://github.com/miken1988/agentledger.git
cd agentledger
cp .env.local.example .env.local
# Add your Supabase URL, anon key, and service role key
npm install
npm run dev`} lang="bash" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-bold flex items-center justify-center border border-blue-500/20">3</div>
                  <h3 className="text-[15px] font-medium">Install the SDK and start tracking</h3>
                </div>
                <div className="ml-9">
                  <Code code={`npm install agentledger`} lang="bash" />
                  <Code code={`import { AgentLedger } from 'agentledger';

const ledger = new AgentLedger({
  apiKey: process.env.AGENTLEDGER_KEY,
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
});`} filename="agent.ts" />
                </div>
              </div>
            </div>
          </section>

          {/* Installation */}
          <section id="installation" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Installation</h2>
            <Code code="npm install agentledger" lang="bash" />
            <p className="text-white/30 text-[14px] mt-3">The SDK has zero external dependencies and works in Node.js 18+. It also works in Bun and Deno.</p>
          </section>

          {/* Configuration */}
          <section id="configuration" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Configuration</h2>
            <Code code={`const ledger = new AgentLedger({
  apiKey: 'al_...',              // Required. Get from dashboard.
  baseUrl: 'https://...',       // Your AgentLedger instance URL
  failOpen: true,               // If AgentLedger is down, actions proceed (default: true)
  timeout: 5000,                // API timeout in ms (default: 5000)
  onError: (err) => log(err),   // Optional error callback
});`} filename="config.ts" />

            <Table
              headers={['Option', 'Default', 'Description']}
              rows={[
                ['apiKey', 'required', 'Your API key (starts with al_)'],
                ['baseUrl', 'https://agentledger.co', 'Your AgentLedger API endpoint'],
                ['failOpen', 'true', 'If true, actions proceed when AgentLedger is unreachable'],
                ['timeout', '5000', 'API call timeout in milliseconds'],
                ['onError', 'undefined', 'Callback for communication errors'],
              ]}
            />

            <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4 mt-4">
              <p className="text-[13px] text-blue-400/70"><strong className="text-blue-400">Fail-open by default.</strong> AgentLedger never blocks your agents from running unless you explicitly set <InlineCode>failOpen: false</InlineCode>. Even budget checks fail-open — if the API is unreachable, the action proceeds.</p>
            </div>
          </section>

          {/* Core SDK */}
          <section id="core-sdk" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Core SDK</h2>

            <h3 className="text-[16px] font-medium mt-8 mb-3"><InlineCode>ledger.track(options, fn)</InlineCode></h3>
            <p className="text-white/30 text-[14px] mb-3">Wraps an async function with logging and pre-flight budget checks. This is the main method you'll use.</p>
            <Code code={`const { result, allowed, durationMs, actionId } = await ledger.track({
  agent: 'support-bot',       // Agent name
  service: 'sendgrid',        // Service being called
  action: 'send_email',       // Action being performed
  costCents: 1,               // Optional: estimated cost
  metadata: { to: 'user@' },  // Optional: custom metadata
}, async () => {
  return await sendEmail(to, subject, body);
});`} filename="track.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3"><InlineCode>ledger.check(options)</InlineCode></h3>
            <p className="text-white/30 text-[14px] mb-3">Pre-flight check without executing the action. Useful before expensive operations.</p>
            <Code code={`const { allowed, blockReason, remainingBudget } = await ledger.check({
  agent: 'billing-agent',
  service: 'stripe',
  action: 'charge',
});

if (!allowed) {
  console.log('Blocked:', blockReason);
}`} filename="check.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3"><InlineCode>ledger.log(options)</InlineCode></h3>
            <p className="text-white/30 text-[14px] mb-3">Log an action manually when you want full control over timing.</p>
            <Code code={`await ledger.log({
  agent: 'data-sync',
  service: 'postgres',
  action: 'bulk_insert',
  status: 'success',
  durationMs: 1523,
  costCents: 0,
});`} filename="log.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Agent Controls</h3>
            <Code code={`await ledger.pauseAgent('support-bot');  // Blocks all future actions
await ledger.resumeAgent('support-bot'); // Resumes the agent
await ledger.killAgent('rogue-bot');     // Permanently kills the agent`} />
          </section>

          {/* LangChain */}
          <section id="langchain" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">LangChain Integration</h2>
            <p className="text-white/30 text-[14px] mb-4">Drop-in callback handler that auto-tracks tool calls, LLM completions, and chain runs.</p>
            <Code code="npm install agentledger langchain @langchain/core" lang="bash" />
            <Code code={`import { AgentLedger } from 'agentledger';
import { AgentLedgerCallbackHandler } from 'agentledger/integrations/langchain';

const ledger = new AgentLedger({ apiKey: 'al_...' });

const handler = new AgentLedgerCallbackHandler(ledger, {
  agent: 'research-bot',
  trackLLM: true,     // Track LLM calls with token usage (default: true)
  trackTools: true,    // Track tool invocations (default: true)
  trackChains: false,  // Track chain/agent runs (default: false)
  serviceMap: {
    'tavily_search': { service: 'tavily', action: 'search' },
    'calculator': { service: 'math', action: 'calculate' },
    'send_email': { service: 'sendgrid', action: 'send' },
  },
});

// Use with any LangChain component
const agent = createReactAgent({
  llm: new ChatOpenAI({ callbacks: [handler] }),
  tools,
});

await agent.invoke(
  { input: 'Research the latest AI news and email me a summary' },
  { callbacks: [handler] }
);`} filename="langchain-example.ts" />

            <p className="text-white/30 text-[14px] mt-4">The <InlineCode>serviceMap</InlineCode> lets you control how LangChain tool names map to AgentLedger services. If a tool isn't in the map, its name is used as the service with "invoke" as the action.</p>
          </section>

          {/* OpenAI */}
          <section id="openai" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">OpenAI Agents Integration</h2>
            <p className="text-white/30 text-[14px] mb-4">Wrap tool handlers so every function call from OpenAI is tracked.</p>

            <Code code={`import { AgentLedger } from 'agentledger';
import { createToolExecutor } from 'agentledger/integrations/openai';

const ledger = new AgentLedger({ apiKey: 'al_...' });

// Define your tool handlers
const handlers = {
  send_email: async (args) => sendEmail(args.to, args.body),
  create_ticket: async (args) => createJiraTicket(args.title, args.desc),
  charge_card: async (args) => stripe.charges.create(args),
};

// Map tool names to services
const serviceMap = {
  send_email: { service: 'sendgrid', action: 'send' },
  create_ticket: { service: 'jira', action: 'create_issue' },
  charge_card: { service: 'stripe', action: 'charge' },
};

// Create the executor
const execute = createToolExecutor(ledger, 'my-agent', handlers, serviceMap);

// In your OpenAI agent loop
for (const toolCall of response.choices[0].message.tool_calls) {
  const result = await execute(
    toolCall.function.name,
    JSON.parse(toolCall.function.arguments)
  );
  // ... send result back to OpenAI
}`} filename="openai-example.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Wrap individual functions</h3>
            <Code code={`import { withAgentLedger } from 'agentledger/integrations/openai';

// Wrap a single function — preserves original signature
const trackedSendEmail = withAgentLedger(ledger, {
  agent: 'email-bot',
  service: 'sendgrid',
  action: 'send_email',
}, sendEmail);

// Use exactly like the original
await trackedSendEmail(to, subject, body);`} />
          </section>

          {/* MCP */}
          <section id="mcp" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">MCP Server Integration</h2>
            <p className="text-white/30 text-[14px] mb-4">One line to track every tool invocation in your MCP server.</p>

            <Code code={`import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentLedger } from 'agentledger';
import { wrapMCPServer } from 'agentledger/integrations/mcp';

const ledger = new AgentLedger({ apiKey: 'al_...' });
const server = new McpServer({ name: 'my-tools', version: '1.0.0' });

// Register tools as normal
server.tool('send_email', { to: z.string(), body: z.string() }, async (args) => {
  return await sendEmail(args.to, args.body);
});

server.tool('search_web', { query: z.string() }, async (args) => {
  return await tavily.search(args.query);
});

// One line — all tool calls are now logged to AgentLedger
wrapMCPServer(ledger, server, {
  agent: 'my-mcp-server',
  serviceMap: {
    send_email: { service: 'sendgrid' },
    search_web: { service: 'tavily', action: 'search' },
  },
});`} filename="mcp-example.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Wrap individual tools</h3>
            <Code code={`import { wrapMCPTool } from 'agentledger/integrations/mcp';

server.tool('send_email', schema, wrapMCPTool(ledger, {
  agent: 'my-server',
  service: 'sendgrid',
  action: 'send_email',
}, async (args) => {
  return await sendEmail(args.to, args.body);
}));`} />
          </section>

          {/* Express */}
          <section id="express" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Express / Generic Integration</h2>

            <h3 className="text-[16px] font-medium mt-4 mb-3">Express middleware</h3>
            <Code code={`import { agentLedgerMiddleware } from 'agentledger/integrations/express';

// Track specific routes
app.post('/api/send-email', agentLedgerMiddleware(ledger, {
  agent: 'email-bot',
  service: 'sendgrid',
  action: 'send_email',
}), emailHandler);

// Auto-detect from path
app.use('/api/agent', agentLedgerMiddleware(ledger, {
  agent: 'my-agent',
  autoDetect: true,
}));`} filename="express-example.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Wrap any function</h3>
            <p className="text-white/30 text-[14px] mb-3">Works with any framework — no Express required.</p>
            <Code code={`import { trackFunction } from 'agentledger/integrations/express';

const trackedSendEmail = trackFunction(ledger, {
  agent: 'my-bot',
  service: 'sendgrid',
  action: 'send_email',
}, sendEmail);

// Same signature as the original function
await trackedSendEmail(to, subject, body);`} />
          </section>

          {/* REST API */}
          <section id="rest-api" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">REST API</h2>
            <p className="text-white/30 text-[14px] mb-4">All endpoints require an <InlineCode>Authorization: Bearer al_...</InlineCode> header.</p>

            <Table
              headers={['Method', 'Endpoint', 'Description']}
              rows={[
                ['POST', '/api/v1/actions', 'Log an agent action'],
                ['GET', '/api/v1/actions', 'List actions (paginated)'],
                ['POST', '/api/v1/check', 'Pre-flight budget/status check'],
                ['GET', '/api/v1/stats', 'Dashboard summary stats'],
                ['GET', '/api/v1/agents/:name', 'Agent details + recent actions'],
                ['POST', '/api/v1/agents/:name/pause', 'Pause an agent'],
                ['POST', '/api/v1/agents/:name/resume', 'Resume a paused agent'],
                ['POST', '/api/v1/agents/:name/kill', 'Permanently kill an agent'],
                ['POST', '/api/v1/budgets', 'Create or update a budget'],
                ['GET', '/api/v1/alerts', 'List anomaly alerts'],
              ]}
            />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Example: Log an action</h3>
            <Code code={`curl -X POST https://your-instance.vercel.app/api/v1/actions \\
  -H "Authorization: Bearer al_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": "support-bot",
    "service": "slack",
    "action": "send_message",
    "status": "success",
    "cost_cents": 0,
    "duration_ms": 150,
    "metadata": { "channel": "#support" }
  }'`} lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Example: Pre-flight check</h3>
            <Code code={`curl -X POST https://your-instance.vercel.app/api/v1/check \\
  -H "Authorization: Bearer al_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": "billing-agent",
    "service": "stripe",
    "action": "charge"
  }'

// Response:
// { "allowed": true, "remainingBudget": {} }
// or
// { "allowed": false, "blockReason": "daily cost budget exceeded ($50.00/$50.00)" }`} lang="bash" />
          </section>

          {/* Webhooks */}
          <section id="webhooks" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Webhooks</h2>
            <p className="text-white/30 text-[14px] mb-4">Get real-time HTTP notifications when events occur. Webhooks are signed with HMAC-SHA256 so you can verify authenticity.</p>

            <h3 className="text-[16px] font-medium mt-4 mb-3">Events</h3>
            <Table
              headers={['Event', 'Fired When']}
              rows={[
                ['action.logged', 'Any agent action is recorded'],
                ['agent.paused', 'An agent is paused'],
                ['agent.killed', 'An agent is permanently killed'],
                ['agent.resumed', 'A paused agent is resumed'],
                ['budget.exceeded', 'A budget limit is reached'],
                ['budget.warning', 'A budget crosses 75% usage'],
                ['alert.created', 'Any anomaly alert is created'],
              ]}
            />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Create a webhook</h3>
            <Code code={`curl -X POST https://your-instance.vercel.app/api/v1/webhooks \\
  -H "Authorization: Bearer al_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["budget.exceeded", "agent.killed"],
    "description": "Slack alerts"
  }'

// Response includes a signing secret (shown only once):
// { "id": "...", "secret": "whsec_...", "url": "...", "events": [...] }`} lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Verify signatures</h3>
            <Code code={`// Every webhook request includes X-AgentLedger-Signature header
const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-agentledger-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).send('Invalid signature');
  }

  // Process the event
  const { event, data, timestamp } = req.body;
  console.log(\`Received \${event}:\`, data);
  res.sendStatus(200);
});`} filename="webhook-handler.js" />

            <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4 mt-4">
              <p className="text-[13px] text-blue-400/70"><strong className="text-blue-400">Auto-disable.</strong> Webhooks are automatically disabled after 10 consecutive delivery failures. Re-enable them from the dashboard or API.</p>
            </div>
          </section>

          {/* API Key Management */}
          <section id="api-keys" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">API Key Management</h2>
            <p className="text-white/30 text-[14px] mb-4">Create up to 5 active API keys per organization. Rotate and revoke keys without downtime.</p>

            <h3 className="text-[16px] font-medium mt-4 mb-3">Create a new key</h3>
            <Code code={`curl -X POST https://your-instance.vercel.app/api/v1/keys/create \\
  -H "Authorization: Bearer al_current_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "production", "description": "Main production key" }'

// Response includes the full key (shown only once):
// { "id": "...", "key": "al_...", "name": "production" }`} lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Rotate a key</h3>
            <p className="text-white/30 text-[14px] mb-3">Atomically revokes an old key and creates a new one with the same name.</p>
            <Code code={`curl -X POST https://your-instance.vercel.app/api/v1/keys/rotate \\
  -H "Authorization: Bearer al_current_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "keyId": "key-uuid-to-rotate" }'`} lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Revoke a key</h3>
            <Code code={`curl -X POST https://your-instance.vercel.app/api/v1/keys/revoke \\
  -H "Authorization: Bearer al_current_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "keyId": "key-uuid-to-revoke" }'`} lang="bash" />

            <div className="bg-amber-500/[0.04] border border-amber-500/10 rounded-xl p-4 mt-4">
              <p className="text-[13px] text-amber-400/70"><strong className="text-amber-400">Safety.</strong> You cannot revoke the key you&apos;re currently using to authenticate. This prevents accidental lockouts.</p>
            </div>
          </section>

          {/* Dashboard */}
          <section id="dashboard" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Dashboard</h2>
            <p className="text-white/30 text-[14px] mb-4">The dashboard provides a real-time view of all your agent activity.</p>

            <div className="space-y-4 text-[14px] text-white/40">
              <p><strong className="text-white/70">Overview</strong> — total actions, costs, active agents, error rate, 24h activity chart, and service breakdown.</p>
              <p><strong className="text-white/70">Actions</strong> — searchable, filterable feed of every action with agent, service, status, duration, and cost.</p>
              <p><strong className="text-white/70">Agents</strong> — all registered agents with status, action counts, costs, and pause/kill controls.</p>
              <p><strong className="text-white/70">Budgets</strong> — create and manage daily/weekly/monthly budgets per agent.</p>
              <p><strong className="text-white/70">Alerts</strong> — anomaly alerts for budget exceeded, unusual activity spikes, and agent kills.</p>
            </div>
          </section>

          {/* Budgets */}
          <section id="budgets" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Budgets & Alerts</h2>
            <p className="text-white/30 text-[14px] mb-4">Set spending and action limits per agent. When a budget is exceeded, all future actions are blocked until the budget resets.</p>

            <Code code={`// Create a budget via the API
curl -X POST https://your-instance.vercel.app/api/v1/budgets \\
  -H "Authorization: Bearer al_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": "billing-agent",
    "period": "daily",
    "max_actions": 1000,
    "max_cost_cents": 5000
  }'`} lang="bash" />

            <p className="text-white/30 text-[14px] mt-4">Budget counters reset automatically:</p>
            <Table
              headers={['Period', 'Resets At']}
              rows={[
                ['daily', 'Midnight UTC'],
                ['weekly', 'Monday midnight UTC'],
                ['monthly', '1st of the month midnight UTC'],
              ]}
            />

            <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4 mt-4">
              <p className="text-[13px] text-blue-400/70"><strong className="text-blue-400">Automatic budget resets</strong> require enabling pg_cron in your Supabase project. See the migration file for the cron schedule SQL.</p>
            </div>
          </section>

          {/* Environments */}
          <section id="environments" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Environments</h2>
            <p className="text-white/30 text-[14px] mb-4">Separate agent activity across dev, staging, and production. Each environment has its own action log, budgets, and alerts. The default is <InlineCode>production</InlineCode> when not specified.</p>

            <h3 className="text-[16px] font-medium mt-8 mb-3">SDK (TypeScript)</h3>
            <Code code={`const ledger = new AgentLedger({
  apiKey: 'al_...',
  environment: 'staging',  // 'production' | 'staging' | 'development' | any string
});`} filename="config.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">SDK (Python)</h3>
            <Code code={`from agentledger import AgentLedger

ledger = AgentLedger(api_key="al_...", environment="staging")`} filename="config.py" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">REST API</h3>
            <p className="text-white/30 text-[14px] mb-3">All endpoints accept an <InlineCode>environment</InlineCode> query parameter:</p>
            <Code code={`curl https://your-instance.vercel.app/api/v1/actions?environment=staging \\
  -H "Authorization: Bearer al_..."`} lang="bash" />

            <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4 mt-4">
              <p className="text-[13px] text-blue-400/70"><strong className="text-blue-400">Dashboard.</strong> Use the environment selector in the header to switch between environments. All charts, tables, and alerts filter to the selected environment.</p>
            </div>
          </section>

          {/* Search & Filtering */}
          <section id="search" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Search & Filtering</h2>
            <p className="text-white/30 text-[14px] mb-4">Query the action log with powerful filters. All parameters are optional and can be combined.</p>

            <Table
              headers={['Parameter', 'Type', 'Description']}
              rows={[
                ['agent', 'string', 'Filter by agent name'],
                ['service', 'string', 'Filter by service (e.g. openai, stripe)'],
                ['status', 'string', 'Filter by status: success, error, blocked'],
                ['from', 'ISO 8601', 'Start of time range'],
                ['to', 'ISO 8601', 'End of time range'],
                ['trace_id', 'string', 'Filter by trace ID'],
                ['search', 'string', 'Full-text search across action metadata'],
                ['cursor', 'string', 'Cursor for pagination (from previous response)'],
              ]}
            />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Example: filtered query</h3>
            <Code code={`curl "https://your-instance.vercel.app/api/v1/actions?agent=support-bot&status=error&from=2026-03-01T00:00:00Z&to=2026-03-30T00:00:00Z" \\
  -H "Authorization: Bearer al_..."

# Paginate through large result sets with cursor
curl "https://your-instance.vercel.app/api/v1/actions?agent=support-bot&cursor=eyJpZCI6MTIzfQ" \\
  -H "Authorization: Bearer al_..."`} lang="bash" />
          </section>

          {/* Traces */}
          <section id="traces" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Traces</h2>
            <p className="text-white/30 text-[14px] mb-4">Group related actions into a single trace to see the full lifecycle of an agent task. Attach a <InlineCode>traceId</InlineCode> to every action in a workflow.</p>

            <h3 className="text-[16px] font-medium mt-8 mb-3">Generate a trace ID</h3>
            <Code code={`import { AgentLedger } from 'agentledger';

const traceId = AgentLedger.traceId(); // unique trace identifier

await ledger.track({
  agent: 'research-bot',
  service: 'tavily',
  action: 'search',
  traceId,
}, async () => {
  return await tavily.search(query);
});

await ledger.track({
  agent: 'research-bot',
  service: 'openai',
  action: 'summarize',
  traceId,  // same traceId links these actions together
}, async () => {
  return await openai.chat.completions.create({ ... });
});`} filename="trace-example.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Retrieve a trace</h3>
            <Code code={`curl https://your-instance.vercel.app/api/v1/traces/trc_abc123 \\
  -H "Authorization: Bearer al_..."

# Response:
# {
#   "traceId": "trc_abc123",
#   "actions": [...],
#   "summary": {
#     "totalDuration": 3450,
#     "totalCost": 12,
#     "parallelGroups": 2
#   }
# }`} lang="bash" />

            <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4 mt-4">
              <p className="text-[13px] text-blue-400/70"><strong className="text-blue-400">Dashboard.</strong> Click any <InlineCode>trace_id</InlineCode> in the actions table to see a waterfall timeline of all actions in the trace.</p>
            </div>
          </section>

          {/* Policy Engine */}
          <section id="policies" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Policy Engine</h2>
            <p className="text-white/30 text-[14px] mb-4">Define rules that are evaluated before every action. Policies can rate-limit, allowlist, blocklist, cap costs, block sensitive data, or require human approval. Set <InlineCode>agent_name</InlineCode> to target a specific agent, or leave it <InlineCode>null</InlineCode> for org-wide rules. Policies are evaluated in priority order (highest first).</p>

            <h3 className="text-[16px] font-medium mt-8 mb-3">Rule types</h3>
            <Table
              headers={['Type', 'Config Example', 'Description']}
              rows={[
                ['rate_limit', '{ max_actions: 100, window_seconds: 3600 }', 'Cap actions per time window'],
                ['service_allowlist', '{ services: ["openai", "anthropic"] }', 'Only allow listed services'],
                ['service_blocklist', '{ services: ["stripe"] }', 'Block listed services'],
                ['cost_limit_per_action', '{ max_cost_cents: 500 }', 'Max cost per single action'],
                ['payload_regex_block', '{ patterns: ["password", "ssn"], fields: ["input"] }', 'Block actions with sensitive data in payload'],
                ['require_approval', '{ services: ["stripe"], actions: ["charge"] }', 'Require human approval before execution'],
              ]}
            />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Create a policy</h3>
            <Code code={`curl -X POST https://your-instance.vercel.app/api/v1/policies \\
  -H "Authorization: Bearer al_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Rate limit support-bot",
    "agent_name": "support-bot",
    "rule_type": "rate_limit",
    "config": { "max_actions": 100, "window_seconds": 3600 },
    "priority": 10,
    "enabled": true
  }'`} lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">API endpoints</h3>
            <Table
              headers={['Method', 'Endpoint', 'Description']}
              rows={[
                ['POST', '/api/v1/policies', 'Create a policy'],
                ['GET', '/api/v1/policies', 'List all policies'],
                ['PATCH', '/api/v1/policies/:id', 'Update a policy'],
                ['DELETE', '/api/v1/policies/:id', 'Delete a policy'],
              ]}
            />
          </section>

          {/* Human-in-the-Loop Approvals */}
          <section id="approvals" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Human-in-the-Loop Approvals</h2>
            <p className="text-white/30 text-[14px] mb-4">When a <InlineCode>require_approval</InlineCode> policy matches, the action is paused and an approval request is created. A human approves or denies it from the dashboard, and the agent continues.</p>

            <h3 className="text-[16px] font-medium mt-8 mb-3">How it works</h3>
            <div className="space-y-2 text-[14px] text-white/40">
              <p><strong className="text-white/70">1.</strong> Agent calls <InlineCode>ledger.track()</InlineCode> and a matching policy triggers.</p>
              <p><strong className="text-white/70">2.</strong> An <InlineCode>ApprovalRequiredError</InlineCode> is thrown with the <InlineCode>approvalId</InlineCode>.</p>
              <p><strong className="text-white/70">3.</strong> The agent calls <InlineCode>waitForApproval()</InlineCode> to poll until a human decides.</p>
              <p><strong className="text-white/70">4.</strong> Approvals auto-expire after 30 minutes if no action is taken.</p>
            </div>

            <h3 className="text-[16px] font-medium mt-8 mb-3">SDK usage</h3>
            <Code code={`import { AgentLedger, ApprovalRequiredError } from 'agentledger';

try {
  await ledger.track({
    agent: 'billing-bot',
    service: 'stripe',
    action: 'charge',
  }, async () => {
    return await stripe.charges.create({ amount: 5000, currency: 'usd' });
  });
} catch (err) {
  if (err instanceof ApprovalRequiredError) {
    // Wait up to 5 minutes for human approval
    const decision = await ledger.waitForApproval(err.approvalId, {
      timeout: 300000,
    });

    if (decision.approved) {
      // Re-execute the action
      await stripe.charges.create({ amount: 5000, currency: 'usd' });
    }
  }
}`} filename="approval-example.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">API endpoints</h3>
            <Table
              headers={['Method', 'Endpoint', 'Description']}
              rows={[
                ['GET', '/api/v1/approvals', 'List pending approvals'],
                ['PATCH', '/api/v1/approvals/:id', 'Approve or deny (body: { "status": "approved" | "denied" })'],
              ]}
            />

            <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4 mt-4">
              <p className="text-[13px] text-blue-400/70"><strong className="text-blue-400">Dashboard.</strong> The Approvals tab shows all pending requests with approve/deny buttons. Expired approvals are automatically marked as denied.</p>
            </div>
          </section>

          {/* Live Streaming (SSE) */}
          <section id="streaming" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Live Streaming (SSE)</h2>
            <p className="text-white/30 text-[14px] mb-4">Subscribe to real-time events via Server-Sent Events. Since <InlineCode>EventSource</InlineCode> cannot send headers, authentication is passed as a query parameter.</p>

            <h3 className="text-[16px] font-medium mt-8 mb-3">Event types</h3>
            <Table
              headers={['Event', 'Description']}
              rows={[
                ['action.new', 'Fired when a new action is logged'],
                ['alert.new', 'Fired when an anomaly alert is created'],
                ['heartbeat', 'Sent every 30s to keep the connection alive'],
              ]}
            />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Connect with filters</h3>
            <Code code={`curl -N "https://your-instance.vercel.app/api/v1/stream?key=al_...&events=action.new&agent=my-bot&environment=production"`} lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">SDK usage</h3>
            <Code code={`const handle = ledger.stream({
  events: ['action.new', 'alert.new'],
  agent: 'my-bot',
  onAction: (action) => {
    console.log('New action:', action.service, action.action);
  },
  onAlert: (alert) => {
    console.log('Alert:', alert.message);
  },
});

// Close the stream when done
handle.close();`} filename="stream-example.ts" />

            <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4 mt-4">
              <p className="text-[13px] text-blue-400/70"><strong className="text-blue-400">Auto-reconnection.</strong> The SDK automatically reconnects with exponential backoff if the connection drops.</p>
            </div>
          </section>

          {/* Anomaly Detection */}
          <section id="anomalies" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Anomaly Detection</h2>
            <p className="text-white/30 text-[14px] mb-4">AgentLedger computes statistical baselines from the last 7 days of data (updated hourly) and fires alerts when metrics deviate by more than 2 standard deviations. A minimum of 50 actions is required to establish a baseline.</p>

            <h3 className="text-[16px] font-medium mt-8 mb-3">Monitored metrics</h3>
            <Table
              headers={['Metric', 'Description']}
              rows={[
                ['actions_per_hour', 'Number of actions per hour per agent'],
                ['cost_per_action', 'Average cost per action'],
                ['duration_per_action', 'Average duration per action'],
                ['error_rate', 'Percentage of actions with error status'],
                ['service_distribution', 'Shift in which services are being called'],
              ]}
            />

            <h3 className="text-[16px] font-medium mt-8 mb-3">View baselines</h3>
            <Code code={`curl https://your-instance.vercel.app/api/v1/baselines \\
  -H "Authorization: Bearer al_..."

# Response:
# {
#   "agent": "support-bot",
#   "metrics": {
#     "actions_per_hour": { "mean": 45.2, "stddev": 8.1 },
#     "cost_per_action": { "mean": 2.3, "stddev": 0.5 },
#     "error_rate": { "mean": 0.03, "stddev": 0.01 }
#   }
# }`} lang="bash" />
          </section>

          {/* Evaluations */}
          <section id="evaluations" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Evaluations</h2>
            <p className="text-white/30 text-[14px] mb-4">Score agent actions on a 0-100 scale with optional labels and feedback. Use evaluations to track quality over time and identify regressions.</p>

            <h3 className="text-[16px] font-medium mt-8 mb-3">SDK (TypeScript)</h3>
            <Code code={`await ledger.evaluate(actionId, {
  score: 85,
  label: 'correct',
  feedback: 'Response was accurate but could be more concise',
});`} filename="evaluate.ts" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">SDK (Python)</h3>
            <Code code={`ledger.evaluate(action_id, score=85, label="correct",
    feedback="Response was accurate but could be more concise")`} filename="evaluate.py" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">API endpoints</h3>
            <Table
              headers={['Method', 'Endpoint', 'Description']}
              rows={[
                ['POST', '/api/v1/evaluations', 'Create an evaluation for an action'],
                ['GET', '/api/v1/evaluations/stats', 'Aggregated evaluation statistics'],
              ]}
            />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Stats response</h3>
            <Code code={`curl https://your-instance.vercel.app/api/v1/evaluations/stats \\
  -H "Authorization: Bearer al_..."

# Response:
# {
#   "avgScore": 82.4,
#   "byAgent": { "support-bot": 87.1, "billing-bot": 76.3 },
#   "byLabel": { "correct": 412, "incorrect": 38, "partial": 95 },
#   "trend": [{ "date": "2026-03-29", "avgScore": 83.1 }, ...]
# }`} lang="bash" />
          </section>

          {/* Rollback Hooks */}
          <section id="rollbacks" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Rollback Hooks</h2>
            <p className="text-white/30 text-[14px] mb-4">Register compensating action webhooks that fire when an agent is killed or a budget is exceeded. Use rollback hooks to undo partially-completed work.</p>

            <h3 className="text-[16px] font-medium mt-8 mb-3">Triggers</h3>
            <div className="space-y-2 text-[14px] text-white/40">
              <p>{'\u2022'} <strong className="text-white/70">Agent killed</strong> — the agent is permanently stopped</p>
              <p>{'\u2022'} <strong className="text-white/70">Budget exceeded</strong> — a budget limit is hit and actions are blocked</p>
            </div>

            <h3 className="text-[16px] font-medium mt-8 mb-3">Register a rollback hook</h3>
            <Code code={`curl -X POST https://your-instance.vercel.app/api/v1/rollback-hooks \\
  -H "Authorization: Bearer al_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-server.com/rollback",
    "agent_name": "billing-bot",
    "triggers": ["agent.killed", "budget.exceeded"]
  }'`} lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Webhook payload</h3>
            <p className="text-white/30 text-[14px] mb-3">The webhook receives the trigger reason, agent name, and trace context (last 50 actions). Requests are signed with HMAC-SHA256, the same way as regular webhooks.</p>
            <Code code={`// POST to your rollback URL:
// {
//   "trigger": "agent.killed",
//   "agent": "billing-bot",
//   "trace_context": {
//     "actions": [ ... last 50 actions ... ]
//   },
//   "timestamp": "2026-03-30T12:00:00Z"
// }
//
// Headers:
// X-AgentLedger-Signature: sha256=...`} />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Execution history</h3>
            <Code code={`curl https://your-instance.vercel.app/api/v1/rollback-hooks/executions \\
  -H "Authorization: Bearer al_..."`} lang="bash" />
          </section>

          {/* Python SDK */}
          <section id="python" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Python SDK</h2>
            <p className="text-white/30 text-[14px] mb-4">Full-featured Python client with sync and async support.</p>

            <h3 className="text-[16px] font-medium mt-4 mb-3">Installation</h3>
            <Code code="pip install agentledger" lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Sync client</h3>
            <Code code={`from agentledger import AgentLedger

ledger = AgentLedger(api_key="al_...")

# Track an action
result = ledger.track(
    agent="support-bot",
    service="openai",
    action="chat_completion",
    cost_cents=2,
    fn=lambda: openai.chat.completions.create(model="gpt-4", messages=messages)
)

# Pre-flight check
check = ledger.check(agent="billing-bot", service="stripe", action="charge")
if not check.allowed:
    print(f"Blocked: {check.block_reason}")

# Log manually
ledger.log(
    agent="data-sync",
    service="postgres",
    action="bulk_insert",
    status="success",
    duration_ms=1523,
)

# Agent controls
ledger.pause_agent("support-bot")
ledger.resume_agent("support-bot")
ledger.kill_agent("rogue-bot")`} filename="example.py" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Async client</h3>
            <Code code={`from agentledger import AsyncAgentLedger

ledger = AsyncAgentLedger(api_key="al_...")

result = await ledger.track(
    agent="support-bot",
    service="openai",
    action="chat_completion",
    fn=lambda: openai.chat.completions.create(model="gpt-4", messages=messages)
)`} filename="async_example.py" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">LangChain integration</h3>
            <Code code={`from agentledger import AgentLedger
from agentledger.integrations.langchain import AgentLedgerCallbackHandler

ledger = AgentLedger(api_key="al_...")
handler = AgentLedgerCallbackHandler(ledger, agent="research-bot")

# Pass to any LangChain component
agent.invoke({"input": "Research AI news"}, config={"callbacks": [handler]})`} filename="langchain_python.py" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">OpenAI Agents integration</h3>
            <Code code={`from agentledger import AgentLedger
from agentledger.integrations.openai_agents import with_agent_ledger

ledger = AgentLedger(api_key="al_...")

# Wrap the OpenAI agent runner
tracked_run = with_agent_ledger(ledger, agent="my-agent")
result = tracked_run(agent, messages)`} filename="openai_python.py" />
          </section>

          {/* Self-Hosting */}
          <section id="self-hosting" className="mb-20">
            <h2 className="text-[22px] font-semibold mb-4 tracking-tight">Self-Hosting</h2>

            <h3 className="text-[16px] font-medium mt-4 mb-3">Requirements</h3>
            <div className="space-y-2 text-[14px] text-white/40">
              <p>{'\u2022'} Node.js 18+</p>
              <p>{'\u2022'} Supabase project (free tier works)</p>
              <p>{'\u2022'} Vercel, Railway, Fly.io, or any Node.js host</p>
            </div>

            <h3 className="text-[16px] font-medium mt-8 mb-3">Environment Variables</h3>
            <Table
              headers={['Variable', 'Description']}
              rows={[
                ['NEXT_PUBLIC_SUPABASE_URL', 'Your Supabase project URL'],
                ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase anonymous/public key'],
                ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key (keep secret)'],
              ]}
            />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Deploy to Vercel</h3>
            <p className="text-white/30 text-[14px] mb-3">The fastest way. Click the deploy button in the README, or:</p>
            <Code code={`vercel deploy --prod`} lang="bash" />

            <h3 className="text-[16px] font-medium mt-8 mb-3">Run locally</h3>
            <Code code={`git clone https://github.com/miken1988/agentledger.git
cd agentledger
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials
npm install
npm run dev
# Open http://localhost:3000`} lang="bash" />
          </section>

          {/* Footer */}
          <footer className="border-t border-white/[0.04] pt-8 mt-20">
            <div className="flex items-center justify-between text-[12px] text-white/15">
              <p>{'\u00a9'} 2026 AgentLedger. MIT License.</p>
              <div className="flex gap-4">
                <a href="https://github.com/miken1988/agentledger" className="hover:text-white/40 transition-colors">GitHub</a>
                <Link href="/" className="hover:text-white/40 transition-colors">Home</Link>
                <Link href="/dashboard" className="hover:text-white/40 transition-colors">Dashboard</Link>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
