# agentledger

The missing observability layer for AI agents. Track every action, set budgets, get alerts, and kill misbehaving agents — with one line of code.

[![npm](https://img.shields.io/npm/v/agentledger)](https://www.npmjs.com/package/agentledger)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install agentledger
```

## Quick Start (60 seconds)

```typescript
import AgentLedger from 'agentledger';

const ledger = new AgentLedger({
  apiKey: process.env.AGENTLEDGER_KEY!, // Get from agentledger.co
});

// Wrap any async action — it gets logged, timed, and budget-checked automatically
const { result } = await ledger.track({
  agent: 'support-bot',
  service: 'slack',
  action: 'send_message',
}, async () => {
  return await slack.chat.postMessage({ channel: '#support', text: 'Hello!' });
});
```

That's it. Open [agentledger.co/dashboard](https://agentledger.co/dashboard) and watch your agent in real-time.

## What You Get

- **Live dashboard** — see every action, cost, and error in real-time
- **Budget controls** — set hourly/daily/weekly/monthly spend limits per agent
- **Kill switch** — pause or kill any agent instantly from the dashboard or SDK
- **Alerts** — get notified when agents exceed budgets or behave unexpectedly
- **Webhooks** — HTTP callbacks for action.logged, budget.exceeded, agent.killed, etc.
- **Pre-flight checks** — ask "is this agent allowed to act?" before expensive operations

## API

### `new AgentLedger(config)`

```typescript
const ledger = new AgentLedger({
  apiKey: 'al_...',           // Required. Get from agentledger.co
  baseUrl: 'https://...',     // Optional. Default: https://agentledger.co
  failOpen: true,             // Optional. If true (default), actions proceed when AgentLedger is unreachable
  timeout: 5000,              // Optional. API timeout in ms
  onError: (err) => {},       // Optional. Error callback
});
```

### `ledger.track(options, fn)` — Track an action

Wraps an async function with logging, timing, and budget checks.

```typescript
const { result, allowed, durationMs, actionId } = await ledger.track({
  agent: 'my-bot',
  service: 'openai',
  action: 'completion',
  costCents: 5,                // Optional estimated cost
  metadata: { model: 'gpt-4' }, // Optional metadata
}, async () => {
  return await openai.chat.completions.create({ ... });
});
```

Throws if the agent is paused/killed or budget is exceeded.

### `ledger.check(options)` — Pre-flight check

Check if an action is allowed without executing it.

```typescript
const { allowed, blockReason, remainingBudget } = await ledger.check({
  agent: 'my-bot',
  service: 'stripe',
  action: 'charge',
});

if (!allowed) {
  console.log(`Blocked: ${blockReason}`);
}
```

### `ledger.log(options)` — Manual logging

Log an action without wrapping a function.

```typescript
await ledger.log({
  agent: 'my-bot',
  service: 'email',
  action: 'send',
  status: 'success',
  durationMs: 230,
  costCents: 1,
});
```

### Agent Controls

```typescript
await ledger.pauseAgent('my-bot');   // Pause — blocks all future actions
await ledger.resumeAgent('my-bot');  // Resume a paused agent
await ledger.killAgent('my-bot');    // Kill — permanently blocks (can be resumed from dashboard)
```

## Framework Integrations

### LangChain

```typescript
import { AgentLedgerCallback } from 'agentledger/integrations/langchain';

const callback = new AgentLedgerCallback({
  apiKey: process.env.AGENTLEDGER_KEY!,
  agent: 'langchain-bot',
});

const chain = new LLMChain({ llm, prompt, callbacks: [callback] });
```

### OpenAI

```typescript
import { wrapOpenAI } from 'agentledger/integrations/openai';

const openai = wrapOpenAI(new OpenAI(), {
  apiKey: process.env.AGENTLEDGER_KEY!,
  agent: 'openai-bot',
});

// All calls are automatically tracked
await openai.chat.completions.create({ model: 'gpt-4', messages: [...] });
```

### Express Middleware

```typescript
import { agentLedgerMiddleware } from 'agentledger/integrations/express';

app.use('/api/agent', agentLedgerMiddleware({
  apiKey: process.env.AGENTLEDGER_KEY!,
  agent: 'api-agent',
}));
```

### MCP (Model Context Protocol)

```typescript
import { wrapMCPServer } from 'agentledger/integrations/mcp';

const server = wrapMCPServer(mcpServer, {
  apiKey: process.env.AGENTLEDGER_KEY!,
  agent: 'mcp-agent',
});
```

## Self-Hosting

```bash
git clone https://github.com/agentledger-co/agentledger.git
cd agentledger
cp .env.example .env.local  # Add your Supabase credentials
npm install && npm run dev
```

See [docs/SUPABASE_AUTH_SETUP.md](docs/SUPABASE_AUTH_SETUP.md) for full setup guide.

## License

MIT
