# AgentLedger - Production Readiness Plan

## Current State
- ✅ Dashboard (landing + dashboard UI)  
- ✅ API (actions, agents, budgets, alerts, check, stats, seed)
- ✅ SDK (TypeScript, zero-dep, fail-open)
- ✅ Auth (API key based, hashed, org-scoped)
- ✅ Blue theme, Geist font, rotating word hero

## Gaps to Close

### Batch 1: Framework Integrations (SDK)
Make it truly plug-and-play for the 3 biggest agent frameworks:

1. **LangChain Callback Handler** - `AgentLedgerCallbackHandler`
   - Extends BaseCallbackHandler
   - Auto-tracks: tool calls, LLM calls, chain runs
   - Maps LangChain tool names → service/action pairs
   
2. **OpenAI Agents SDK wrapper** - `withAgentLedger(agent)`
   - Wraps OpenAI tool functions automatically
   - Tracks function_call actions
   
3. **MCP Server middleware** - `agentLedgerMCP(server)`
   - Wraps MCP tool handlers
   - Logs every tool invocation with args

4. **Express/generic middleware** - for custom setups

### Batch 2: Supabase Schema Migration File
- Proper SQL migration file users can run
- Includes all tables: organizations, api_keys, agents, action_logs, budgets, anomaly_alerts
- Includes indexes for performance
- RLS policies

### Batch 3: Vercel Deploy Config
- vercel.json
- Environment variable docs
- One-click deploy button in README

### Batch 4: Enhanced README + Docs
- Quick start for each framework
- Architecture diagram
- API reference
- Self-hosting guide

## Execution Order
1. Supabase migration (foundation)
2. Framework integrations (core value)
3. Deploy config (shipping)
4. Docs (polish)
