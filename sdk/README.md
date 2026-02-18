# AgentLedger

**See everything your AI agents do.** Track actions, monitor costs, and kill agents when things go wrong.

Your agents send emails, create tickets, charge credit cards, and call APIs. AgentLedger logs every action, tracks every cost, and lets you kill agents instantly when things go sideways.

## Install

```bash
npm install agentledger
```

## Quick Start

```typescript
import { AgentLedger } from 'agentledger';

const ledger = new AgentLedger({
  apiKey: process.env.AGENTLEDGER_KEY, // Get this from agentledger.co
});

// Wrap any async function — it's logged, timed, and budget-checked
const result = await ledger.track({
  agent: 'support-bot',
  service: 'slack',
  action: 'send_message',
}, async () => {
  return await slack.chat.postMessage({ channel: '#support', text: 'Hello!' });
});
```

Open your dashboard at [agentledger.co](https://agentledger.co) and watch your agents in real-time.

## Features

- **Zero dependencies** — just this package, nothing else
- **Fail-open by default** — if AgentLedger is down, your agents keep running
- **Pre-flight checks** — block actions before they happen if agent is over budget
- **Kill switches** — pause or kill any agent instantly
- **Cost tracking** — know exactly what each agent costs
- **5ms overhead** — async logging, doesn't slow your agents down

## API

### `new AgentLedger(config)`

```typescript
const ledger = new AgentLedger({
  apiKey: 'al_...',           // Required. Get from agentledger.co
  baseUrl: 'https://...',     // Optional. Default: https://agentledger.co
  failOpen: true,             // Optional. If true, agents run even if AgentLedger is unreachable
  timeout: 5000,              // Optional. API timeout in ms
  onError: (err) => {},       // Optional. Called on communication errors
});
```

### `ledger.track(options, fn)`

Wrap an async function. Runs a pre-flight budget check, executes the function, logs the result.

```typescript
const { result, allowed, durationMs } = await ledger.track({
  agent: 'my-bot',
  service: 'stripe',
  action: 'charge',
  costCents: 50,
  metadata: { customerId: '123' },
}, async () => {
  return await stripe.charges.create({ amount: 5000 });
});
```

### `ledger.check(options)`

Pre-flight check without executing. Use before expensive operations.

```typescript
const { allowed, blockReason } = await ledger.check({
  agent: 'my-bot',
  service: 'openai',
  action: 'completion',
});

if (!allowed) {
  console.log(`Blocked: ${blockReason}`);
}
```

### `ledger.log(options)`

Manual logging without wrapping a function.

```typescript
await ledger.log({
  agent: 'my-bot',
  service: 'sendgrid',
  action: 'send_email',
  costCents: 1,
  durationMs: 340,
});
```

### `ledger.pauseAgent(name)` / `resumeAgent(name)` / `killAgent(name)`

Control agents programmatically.

```typescript
await ledger.pauseAgent('runaway-bot');  // All future actions blocked
await ledger.resumeAgent('runaway-bot'); // Back in action
await ledger.killAgent('runaway-bot');   // Permanently stopped
```

## Framework Integrations

### LangChain

```typescript
import { AgentLedger } from 'agentledger';
import { AgentLedgerCallbackHandler } from 'agentledger/integrations/langchain';

const handler = new AgentLedgerCallbackHandler(ledger, {
  agent: 'research-bot',
  serviceMap: { 'tavily_search': { service: 'tavily', action: 'search' } },
});

const agent = createReactAgent({ llm, tools, callbacks: [handler] });
```

### OpenAI

```typescript
import { createToolExecutor } from 'agentledger/integrations/openai';

const execute = createToolExecutor(ledger, 'my-agent', tools, serviceMap);
```

### MCP Servers

```typescript
import { wrapMCPServer } from 'agentledger/integrations/mcp';

wrapMCPServer(ledger, server, { agent: 'my-mcp-server' });
```

### Express

```typescript
import { agentLedgerMiddleware } from 'agentledger/integrations/express';

app.post('/api/action', agentLedgerMiddleware(ledger, {
  agent: 'api-bot', service: 'internal', action: 'process',
}), handler);
```

## Self-Hosting

AgentLedger is open source. You can self-host the dashboard:

```bash
git clone https://github.com/miken1988/agentledger.git
cd agentledger
npm install && npm run dev
```

Point your SDK to your own instance:

```typescript
const ledger = new AgentLedger({
  apiKey: 'al_...',
  baseUrl: 'https://your-instance.com',
});
```

## License

MIT
