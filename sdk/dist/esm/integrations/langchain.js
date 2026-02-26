/**
 * AgentLedger integration for LangChain.
 *
 * Usage:
 *   import { AgentLedger } from '@agentledger/sdk';
 *   import { AgentLedgerCallbackHandler } from '@agentledger/sdk/integrations/langchain';
 *
 *   const ledger = new AgentLedger({ apiKey: 'al_...' });
 *   const handler = new AgentLedgerCallbackHandler(ledger, { agent: 'my-agent' });
 *
 *   const chain = new ChatOpenAI({ callbacks: [handler] });
 *   // or
 *   await agent.invoke({ input: '...' }, { callbacks: [handler] });
 */
export class AgentLedgerCallbackHandler {
    constructor(ledger, config) {
        this.name = 'AgentLedgerCallbackHandler';
        this.runTimers = new Map();
        // ==================== HELPERS ====================
        this.toolNameStore = new Map();
        this.ledger = ledger;
        this.config = {
            trackLLM: true,
            trackTools: true,
            trackChains: false,
            ...config,
        };
    }
    // ==================== TOOL CALLS ====================
    async handleToolStart(tool, input, runId) {
        if (!this.config.trackTools)
            return;
        this.runTimers.set(runId, Date.now());
    }
    async handleToolEnd(output, runId) {
        if (!this.config.trackTools)
            return;
        const startTime = this.runTimers.get(runId);
        const durationMs = startTime ? Date.now() - startTime : 0;
        this.runTimers.delete(runId);
        // Extract tool name from runId context (stored during handleToolStart)
        const toolName = this.extractToolName(runId) || 'unknown_tool';
        const mapped = this.config.serviceMap?.[toolName];
        await this.ledger.log({
            agent: this.config.agent,
            service: mapped?.service || toolName,
            action: mapped?.action || 'invoke',
            durationMs,
            metadata: { source: 'langchain', runId, outputLength: output?.length },
        }).catch(() => { }); // fail-open
    }
    async handleToolError(err, runId) {
        if (!this.config.trackTools)
            return;
        const startTime = this.runTimers.get(runId);
        const durationMs = startTime ? Date.now() - startTime : 0;
        this.runTimers.delete(runId);
        const toolName = this.extractToolName(runId) || 'unknown_tool';
        const mapped = this.config.serviceMap?.[toolName];
        await this.ledger.log({
            agent: this.config.agent,
            service: mapped?.service || toolName,
            action: mapped?.action || 'invoke',
            status: 'error',
            durationMs,
            metadata: { source: 'langchain', runId, error: err.message },
        }).catch(() => { });
    }
    // ==================== LLM CALLS ====================
    async handleLLMStart(llm, prompts, runId) {
        if (!this.config.trackLLM)
            return;
        this.runTimers.set(runId, Date.now());
    }
    async handleLLMEnd(output, runId) {
        if (!this.config.trackLLM)
            return;
        const startTime = this.runTimers.get(runId);
        const durationMs = startTime ? Date.now() - startTime : 0;
        this.runTimers.delete(runId);
        // Try to extract token usage and model info
        const llmOutput = output;
        const tokenUsage = llmOutput?.llmOutput?.tokenUsage;
        const model = llmOutput?.llmOutput?.modelName;
        // Estimate cost from tokens (rough: $0.01 per 1K tokens for GPT-4 class)
        const totalTokens = tokenUsage?.totalTokens || 0;
        const estimatedCostCents = Math.ceil(totalTokens * 0.001);
        await this.ledger.log({
            agent: this.config.agent,
            service: model?.includes('claude') ? 'anthropic' : model?.includes('gpt') ? 'openai' : 'llm',
            action: 'completion',
            costCents: estimatedCostCents,
            durationMs,
            metadata: { source: 'langchain', runId, model, tokenUsage },
        }).catch(() => { });
    }
    async handleLLMError(err, runId) {
        if (!this.config.trackLLM)
            return;
        const startTime = this.runTimers.get(runId);
        const durationMs = startTime ? Date.now() - startTime : 0;
        this.runTimers.delete(runId);
        await this.ledger.log({
            agent: this.config.agent,
            service: 'llm',
            action: 'completion',
            status: 'error',
            durationMs,
            metadata: { source: 'langchain', runId, error: err.message },
        }).catch(() => { });
    }
    // ==================== CHAIN/AGENT RUNS ====================
    async handleChainStart(chain, inputs, runId) {
        if (!this.config.trackChains)
            return;
        this.runTimers.set(runId, Date.now());
    }
    async handleChainEnd(outputs, runId) {
        if (!this.config.trackChains)
            return;
        const startTime = this.runTimers.get(runId);
        const durationMs = startTime ? Date.now() - startTime : 0;
        this.runTimers.delete(runId);
        await this.ledger.log({
            agent: this.config.agent,
            service: 'langchain',
            action: 'chain_run',
            durationMs,
            metadata: { source: 'langchain', runId },
        }).catch(() => { });
    }
    async handleChainError(err, runId) {
        if (!this.config.trackChains)
            return;
        const startTime = this.runTimers.get(runId);
        const durationMs = startTime ? Date.now() - startTime : 0;
        this.runTimers.delete(runId);
        await this.ledger.log({
            agent: this.config.agent,
            service: 'langchain',
            action: 'chain_run',
            status: 'error',
            durationMs,
            metadata: { source: 'langchain', runId, error: err.message },
        }).catch(() => { });
    }
    extractToolName(runId) {
        return this.toolNameStore.get(runId);
    }
}
