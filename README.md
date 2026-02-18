<div align="center">

# ⚡ AgentLedger

**See everything your AI agents do.**

Open-source observability for AI agents — track actions, control costs, kill misbehaving agents.

[![npm](https://img.shields.io/npm/v/agentledger)](https://www.npmjs.com/package/agentledger)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmiken1988%2Fagentledger&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY&envDescription=Supabase%20credentials%20for%20AgentLedger&project-name=agentledger)

[Dashboard](https://agentledger.co) · [Docs](https://agentledger.co/docs) · [npm](https://www.npmjs.com/package/agentledger)

</div>

---

<!-- 
  📸 SCREENSHOT: Replace this with a real screenshot of your dashboard
  Take a screenshot at 1200px wide of the dashboard with seeded data.
  Save as docs/screenshot.png and uncomment the line below:
-->
<!-- ![AgentLedger Dashboard](docs/screenshot.png) -->

## The Problem

Your AI agents send emails, create tickets, charge credit cards, and call APIs. When one goes rogue at 3am, you have no visibility and no kill switch.

## The Solution

```typescript
import AgentLedger from 'agentledger';

const ledger = new AgentLedger({ apiKey: process.env.AGENTLEDGER_KEY! });

// One line — logged, timed, and budget-checked
const { result } = await ledger.track({
  agent: 'support-bot',
  service: 'slack',
  action: 'send_message',
}, async () => {
  return await slack.chat.postMessage({ channel: '#support', text: 'Hello!' });
});
```

Open [agentledger.co/dashboard](https://agentledger.co/dashboard) → real-time feed of every action, cost, and error.

## Try It (60 seconds)

```bash
# 1. Get an API key at agentledger.co
# 2. Run the demo
AGENTLEDGER_KEY=al_... npx agentledger-demo
```

Or with the SDK:

```bash
npm install agentledger
```

## What You Get

**📊 Live Dashboard** — every action, cost, and error in real-time  
**💰 Budget Controls** — hourly/daily/weekly/monthly spend limits per agent  
**🛑 Kill Switch** — pause or kill any agent instantly from dashboard or SDK  
**🚨 Alerts** — notifications when agents exceed budgets or spike in activity  
**🔗 Webhooks** — HTTP callbacks for action.logged, budget.exceeded, agent.killed  
**✈️ Pre-flight Checks** — block actions before they happen if agent is over budget  
**0️⃣ Zero Dependencies** — the SDK has no external dependencies  
**🔓 Fail-Open** — if AgentLedger is down, your agents keep running  

## Framework Integrations

Works with any agent framework. Built-in integrations for:

### LangChain
```typescript
import { AgentLedgerCallback } from 'agentledger/integrations/langchain';
const callback = new AgentLedgerCallback({ apiKey: 'al_...', agent: 'my-bot' });
const chain = new LLMChain({ llm, prompt, callbacks: [callback] });
```

### OpenAI
```typescript
import { wrapOpenAI } from 'agentledger/integrations/openai';
const openai = wrapOpenAI(new OpenAI(), { apiKey: 'al_...', agent: 'my-bot' });
// All calls automatically tracked
```

### MCP (Model Context Protocol)
```typescript
import { wrapMCPServer } from 'agentledger/integrations/mcp';
wrapMCPServer(mcpServer, { apiKey: 'al_...', agent: 'my-mcp' });
```

### Express
```typescript
import { agentLedgerMiddleware } from 'agentledger/integrations/express';
app.use('/api/agent', agentLedgerMiddleware({ apiKey: 'al_...', agent: 'api-bot' }));
```

## SDK API

```typescript
const ledger = new AgentLedger({
  apiKey: 'al_...',       // Required
  baseUrl: 'https://...',  // Default: agentledger.co
  failOpen: true,          // Default: true
  timeout: 5000,           // Default: 5000ms
});

// Track an action (wraps async function)
await ledger.track({ agent, service, action, costCents, metadata }, fn);

// Pre-flight check (no execution)
const { allowed, blockReason } = await ledger.check({ agent, service, action });

// Manual log
await ledger.log({ agent, service, action, status, durationMs });

// Agent controls
await ledger.pauseAgent('my-bot');
await ledger.resumeAgent('my-bot');
await ledger.killAgent('my-bot');
```

## REST API

All endpoints require `Authorization: Bearer al_...` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/actions` | Log an action |
| `GET` | `/api/v1/actions` | List actions (paginated) |
| `POST` | `/api/v1/check` | Pre-flight budget/status check |
| `GET` | `/api/v1/stats` | Dashboard stats |
| `GET` | `/api/v1/usage` | Plan usage & limits |
| `GET` | `/api/v1/agents/:name` | Agent details |
| `POST` | `/api/v1/agents/:name/pause` | Pause agent |
| `POST` | `/api/v1/agents/:name/resume` | Resume agent |
| `POST` | `/api/v1/agents/:name/kill` | Kill agent |
| `GET/POST` | `/api/v1/budgets` | List/create budgets |
| `GET` | `/api/v1/alerts` | List alerts |
| `POST` | `/api/v1/alerts/acknowledge` | Acknowledge alerts |
| `GET/POST/DELETE/PATCH` | `/api/v1/webhooks` | Manage webhooks |

## Architecture

```
Your Agent Code          AgentLedger API          Supabase
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│              │  HTTP   │   Next.js    │  SQL   │   Postgres   │
│ ledger.track ├───────→│  /api/v1/*   ├───────→│  9 tables    │
│              │failopen│              │        │  RLS enabled  │
└──────────────┘        └──────┬───────┘        └──────────────┘
                               │
                        ┌──────▼───────┐
                        │  Webhooks    │
                        │  (HMAC-256)  │
                        └──────────────┘
```

## Self-Hosting

```bash
git clone https://github.com/miken1988/agentledger.git
cd agentledger
cp .env.example .env.local   # Add Supabase credentials
npm install && npm run dev
```

1. Create a free [Supabase](https://supabase.com) project
2. Run `supabase/setup.sql` in SQL Editor
3. Configure auth (see [docs/SUPABASE_AUTH_SETUP.md](docs/SUPABASE_AUTH_SETUP.md))
4. Deploy to Vercel or run locally

## Testing

```bash
npm test                    # 202 unit tests
npm run dev                 # Start dev server
node tests/e2e/run.mjs http://localhost:3000  # 61 E2E tests
```

## License

MIT © AgentLedger
