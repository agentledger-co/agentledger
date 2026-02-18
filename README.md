# AgentLedger

**See everything your AI agents do.** Open-source observability dashboard for AI agent actions, costs, and safety controls.

Your agents send emails, create tickets, charge credit cards, and call APIs. AgentLedger logs every action, tracks every cost, and kills agents when things go wrong.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmiken1988%2Fagentledger&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY&envDescription=Supabase%20credentials%20for%20AgentLedger&project-name=agentledger)

---

## Quick Start

### 1. Set up the database

Create a free [Supabase](https://supabase.com) project, then run the migration:

```sql
-- Copy the contents of supabase/setup.sql
-- into your Supabase SQL Editor and run it
```

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for the full walkthrough.

### 2. Deploy the dashboard

```bash
git clone https://github.com/miken1988/agentledger.git
cd agentledger
cp .env.example .env.local
# Fill in your Supabase credentials (see SUPABASE_SETUP.md)
npm install
npm run dev
```

Or click the **Deploy with Vercel** button above.

### 3. Install the SDK

```bash
npm install agentledger
```

### 4. Track your first action

```typescript
import { AgentLedger } from 'agentledger';

const ledger = new AgentLedger({
  apiKey: process.env.AGENTLEDGER_KEY, // Get this from the dashboard
});

const result = await ledger.track({
  agent: 'support-bot',
  service: 'slack',
  action: 'send_message',
}, async () => {
  return await slack.chat.postMessage({
    channel: '#support',
    text: 'Issue resolved!'
  });
});
```

That's it. Open the dashboard and watch your agents in real-time.

---

## Framework Integrations

AgentLedger works with any agent framework. Here are the built-in integrations:

### LangChain

```typescript
import { AgentLedger } from 'agentledger';
import { AgentLedgerCallbackHandler } from 'agentledger/integrations/langchain';

const ledger = new AgentLedger({ apiKey: 'al_...' });
const handler = new AgentLedgerCallbackHandler(ledger, {
  agent: 'research-bot',
  serviceMap: {
    'tavily_search': { service: 'tavily', action: 'search' },
    'calculator': { service: 'math', action: 'calculate' },
  },
});

// Pass as a callback to any LangChain component
const agent = createReactAgent({ llm, tools, callbacks: [handler] });
await agent.invoke({ input: 'Research the latest AI news' });
```

### OpenAI Agents SDK

```typescript
import { AgentLedger } from 'agentledger';
import { createToolExecutor, wrapOpenAICompletion } from 'agentledger/integrations/openai';

const ledger = new AgentLedger({ apiKey: 'al_...' });

// Wrap your tool handlers
const executeTools = createToolExecutor(ledger, 'my-agent', {
  send_email: sendEmailFn,
  create_ticket: createTicketFn,
}, {
  send_email: { service: 'sendgrid', action: 'send' },
  create_ticket: { service: 'jira', action: 'create_issue' },
});

// In your agent loop
for (const toolCall of message.tool_calls) {
  const result = await executeTools(
    toolCall.function.name,
    JSON.parse(toolCall.function.arguments)
  );
}
```

### MCP Servers

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AgentLedger } from 'agentledger';
import { wrapMCPServer } from 'agentledger/integrations/mcp';

const ledger = new AgentLedger({ apiKey: 'al_...' });
const server = new McpServer({ name: 'my-tools', version: '1.0.0' });

// Register tools as normal
server.tool('send_email', schema, async (args) => {
  return await sendEmail(args.to, args.body);
});

// One line — all tool calls are now logged
wrapMCPServer(ledger, server, { agent: 'my-mcp-server' });
```

### Express / Any HTTP

```typescript
import { AgentLedger } from 'agentledger';
import { agentLedgerMiddleware, trackFunction } from 'agentledger/integrations/express';

const ledger = new AgentLedger({ apiKey: 'al_...' });

// Express middleware
app.post('/api/send-email', agentLedgerMiddleware(ledger, {
  agent: 'email-bot',
  service: 'sendgrid',
  action: 'send_email',
}), handler);

// Or wrap any function directly
const trackedSendEmail = trackFunction(ledger, {
  agent: 'my-bot',
  service: 'sendgrid',
  action: 'send_email',
}, sendEmail);
```

### Manual / Any Framework

```typescript
// The core SDK works with anything — just wrap your async functions
const result = await ledger.track({
  agent: 'my-agent',
  service: 'any-service',
  action: 'any-action',
  costCents: 5,
  metadata: { whatever: 'you want' },
}, async () => {
  return await doAnything();
});
```

---

## Features

- **Real-time action feed** — every API call, email, ticket logged with timing and cost
- **Cost tracking & budgets** — set daily/weekly/monthly budgets per agent
- **Kill switches** — pause or kill any agent instantly from dashboard or API
- **Anomaly detection** — alerts when agents spike in activity or exceed budgets
- **Pre-flight checks** — block actions before they happen if agent is over budget
- **Fail-open by default** — if AgentLedger is down, your agents keep running
- **Zero dependencies** — the SDK has no external dependencies
- **Framework integrations** — LangChain, OpenAI, MCP, Express, or any async function

---

## API Reference

### SDK Methods

| Method | Description |
|--------|-------------|
| `ledger.track(options, fn)` | Wrap an async function with logging + budget checks |
| `ledger.check(options)` | Pre-flight check without executing |
| `ledger.log(options)` | Manual action log |
| `ledger.pauseAgent(name)` | Pause an agent |
| `ledger.resumeAgent(name)` | Resume a paused agent |
| `ledger.killAgent(name)` | Permanently kill an agent |

### REST API

All endpoints require `Authorization: Bearer al_...` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/actions` | Log an action |
| `GET` | `/api/v1/actions` | List actions |
| `POST` | `/api/v1/check` | Pre-flight budget/status check |
| `GET` | `/api/v1/stats` | Dashboard stats |
| `GET` | `/api/v1/agents/:name` | Agent details |
| `POST` | `/api/v1/agents/:name/pause` | Pause agent |
| `POST` | `/api/v1/agents/:name/resume` | Resume agent |
| `POST` | `/api/v1/agents/:name/kill` | Kill agent |
| `POST` | `/api/v1/budgets` | Create/update budget |
| `GET` | `/api/v1/alerts` | List alerts |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              Your Agent Code                │
│                                             │
│   ledger.track({ agent, service, action },  │
│     async () => doSomething()               │
│   )                                         │
└─────────────────┬───────────────────────────┘
                  │ HTTP (fail-open)
                  ▼
┌─────────────────────────────────────────────┐
│           AgentLedger API (Next.js)         │
│                                             │
│   POST /api/v1/check  → budget check       │
│   POST /api/v1/actions → log action         │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│              Supabase (Postgres)            │
│                                             │
│   organizations │ api_keys │ agents         │
│   action_logs   │ budgets  │ anomaly_alerts │
└─────────────────────────────────────────────┘
```

---

## Self-Hosting

See **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** for the complete step-by-step guide.

Quick version:

1. Create a free [Supabase](https://supabase.com) project
2. Run `supabase/setup.sql` in the SQL Editor (creates all 9 tables)
3. Copy your Supabase URL, anon key, and service role key into `.env.local`
4. Configure Auth providers (Email is on by default, GitHub OAuth is optional)
5. Deploy to Vercel or run `npm run dev` locally

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_SITE_URL` | Your production domain (optional, for OG images) |

---

## License

All rights reserved. © 2026 AgentLedger.
