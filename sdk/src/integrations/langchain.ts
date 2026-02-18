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

import type { AgentLedger, TrackOptions } from '../index';

// Minimal LangChain callback interfaces to avoid requiring langchain as a dependency.
// These match the shape of @langchain/core/callbacks/base.
interface BaseCallbackHandlerInput {
  ignoreLLM?: boolean;
  ignoreChain?: boolean;
  ignoreAgent?: boolean;
}

interface Serialized {
  id?: string[];
  name?: string;
  [key: string]: unknown;
}

export interface AgentLedgerCallbackConfig {
  /** Name of the agent in AgentLedger */
  agent: string;
  /** Map LangChain tool names to AgentLedger services. Default: tool name becomes both service and action */
  serviceMap?: Record<string, { service: string; action?: string }>;
  /** Whether to track LLM calls (tokens/cost). Default: true */
  trackLLM?: boolean;
  /** Whether to track tool calls. Default: true */
  trackTools?: boolean;
  /** Whether to track chain/agent runs. Default: false */
  trackChains?: boolean;
}

export class AgentLedgerCallbackHandler {
  name = 'AgentLedgerCallbackHandler';
  private ledger: AgentLedger;
  private config: AgentLedgerCallbackConfig;
  private runTimers = new Map<string, number>();

  constructor(ledger: AgentLedger, config: AgentLedgerCallbackConfig) {
    this.ledger = ledger;
    this.config = {
      trackLLM: true,
      trackTools: true,
      trackChains: false,
      ...config,
    };
  }

  // ==================== TOOL CALLS ====================
  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
  ): Promise<void> {
    if (!this.config.trackTools) return;
    this.runTimers.set(runId, Date.now());
  }

  async handleToolEnd(output: string, runId: string): Promise<void> {
    if (!this.config.trackTools) return;
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
    }).catch(() => {}); // fail-open
  }

  async handleToolError(err: Error, runId: string): Promise<void> {
    if (!this.config.trackTools) return;
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
    }).catch(() => {});
  }

  // ==================== LLM CALLS ====================
  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
  ): Promise<void> {
    if (!this.config.trackLLM) return;
    this.runTimers.set(runId, Date.now());
  }

  async handleLLMEnd(output: unknown, runId: string): Promise<void> {
    if (!this.config.trackLLM) return;
    const startTime = this.runTimers.get(runId);
    const durationMs = startTime ? Date.now() - startTime : 0;
    this.runTimers.delete(runId);

    // Try to extract token usage and model info
    const llmOutput = output as Record<string, unknown>;
    const tokenUsage = (llmOutput as Record<string, Record<string, unknown>>)?.llmOutput?.tokenUsage as Record<string, number> | undefined;
    const model = (llmOutput as Record<string, Record<string, unknown>>)?.llmOutput?.modelName as string | undefined;

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
    }).catch(() => {});
  }

  async handleLLMError(err: Error, runId: string): Promise<void> {
    if (!this.config.trackLLM) return;
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
    }).catch(() => {});
  }

  // ==================== CHAIN/AGENT RUNS ====================
  async handleChainStart(
    chain: Serialized,
    inputs: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    if (!this.config.trackChains) return;
    this.runTimers.set(runId, Date.now());
  }

  async handleChainEnd(outputs: Record<string, unknown>, runId: string): Promise<void> {
    if (!this.config.trackChains) return;
    const startTime = this.runTimers.get(runId);
    const durationMs = startTime ? Date.now() - startTime : 0;
    this.runTimers.delete(runId);

    await this.ledger.log({
      agent: this.config.agent,
      service: 'langchain',
      action: 'chain_run',
      durationMs,
      metadata: { source: 'langchain', runId },
    }).catch(() => {});
  }

  async handleChainError(err: Error, runId: string): Promise<void> {
    if (!this.config.trackChains) return;
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
    }).catch(() => {});
  }

  // ==================== HELPERS ====================
  private toolNameStore = new Map<string, string>();

  private extractToolName(runId: string): string | undefined {
    return this.toolNameStore.get(runId);
  }
}
