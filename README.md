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
**🚨 Alerts** — Slack, Discord, PagerDuty, and email notifications  
**🛡️ Policy Templates** — pre-built rule sets (conservative, compliance, cost-conscious) with one-click apply  
**📈 Cost Forecasting** — predict future spend with linear regression and budget overrun warnings  
**📊 Advanced Analytics** — multi-day trends, daily/hourly granularity, service & agent breakdowns  
**🔗 Trace Replay** — step through agent traces action-by-action with full input/output inspection  
**📦 Batch Logging** — log up to 100 actions per request for high-throughput agents  
**📤 Data Export** — export action logs as CSV or JSON for compliance and reporting  
**⌨️ CLI Tool** — `npx agentledger-cli` for tail, stats, pause/kill from the terminal  
**🔒 Global Rate Limiting** — API-level token bucket rate limiter with standard headers  
**0️⃣ Zero Dependencies** — the SDK has no external dependencies  
**🔓 Fail-Open** — if AgentLedger is down, your agents keep running  

## CLI

```bash
npx agentledger-cli stats       # Dashboard summary
npx agentledger-cli actions     # List recent actions
npx agentledger-cli tail        # Live stream of actions
npx agentledger-cli forecast    # Cost forecasts
npx agentledger-cli export --from 2025-01-01 --to 2025-01-31
```

## Framework Integrations

Works with any agent framework. Built-in integrations for **8 frameworks**:

| Framework | Import |
|-----------|--------|
| LangChain | `agentledger/integrations/langchain` |
| OpenAI Agents | `agentledger/integrations/openai` |
| MCP Servers | `agentledger/integrations/mcp` |
| Express | `agentledger/integrations/express` |
| CrewAI | `agentledger/integrations/crewai` |
| AutoGen | `agentledger/integrations/autogen` |
| LlamaIndex | `agentledger/integrations/llamaindex` |
| Vercel AI SDK | `agentledger/integrations/vercel-ai` |

### LangChain
```typescript
import { AgentLedgerCallback } from 'agentledger/integrations/langchain';
const callback = new AgentLedgerCallback({ apiKey: 'al_...', agent: 'my-bot' });
const chain = new LLMChain({ llm, prompt, callbacks: [callback] });
```

### Vercel AI SDK
```typescript
import { createVercelAIMiddleware } from 'agentledger/integrations/vercel-ai';
const middleware = createVercelAIMiddleware(ledger, { agent: 'my-app' });
const result = await generateText({ model: openai('gpt-4o'), prompt: '...' });
middleware.onFinish(result);
```

### CrewAI
```typescript
import { createCrewAICallback } from 'agentledger/integrations/crewai';
const callback = createCrewAICallback(ledger, { agent: 'my-crew' });
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

// Batch logging (up to 100 actions)
await ledger.logBatch([
  { agent: 'bot', service: 'openai', action: 'completion', costCents: 5 },
  { agent: 'bot', service: 'slack', action: 'send', costCents: 0 },
]);

// Data export
const csv = await ledger.export({ from: '2025-01-01', to: '2025-01-31', format: 'csv' });

// Cost forecasting
const forecast = await ledger.forecast({ daysBack: 30, forecastDays: 30 });

// Advanced analytics
const analytics = await ledger.analytics({ days: 30, granularity: 'daily' });

// Policy templates
await ledger.applyPolicyTemplate('conservative', 'my-bot');
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
| `POST` | `/api/v1/actions/batch` | Batch log up to 100 actions |
| `GET` | `/api/v1/export` | Export actions as CSV or JSON |
| `GET` | `/api/v1/forecast` | Cost forecasting with trends |
| `GET` | `/api/v1/analytics` | Advanced analytics & breakdowns |
| `GET/POST` | `/api/v1/policies/templates` | List/apply policy templates |

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
git clone https://github.com/agentledger-co/agentledger.git
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
