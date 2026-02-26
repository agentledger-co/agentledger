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
import type { AgentLedger } from '../index';
interface Serialized {
    id?: string[];
    name?: string;
    [key: string]: unknown;
}
export interface AgentLedgerCallbackConfig {
    /** Name of the agent in AgentLedger */
    agent: string;
    /** Map LangChain tool names to AgentLedger services. Default: tool name becomes both service and action */
    serviceMap?: Record<string, {
        service: string;
        action?: string;
    }>;
    /** Whether to track LLM calls (tokens/cost). Default: true */
    trackLLM?: boolean;
    /** Whether to track tool calls. Default: true */
    trackTools?: boolean;
    /** Whether to track chain/agent runs. Default: false */
    trackChains?: boolean;
}
export declare class AgentLedgerCallbackHandler {
    name: string;
    private ledger;
    private config;
    private runTimers;
    constructor(ledger: AgentLedger, config: AgentLedgerCallbackConfig);
    handleToolStart(tool: Serialized, input: string, runId: string): Promise<void>;
    handleToolEnd(output: string, runId: string): Promise<void>;
    handleToolError(err: Error, runId: string): Promise<void>;
    handleLLMStart(llm: Serialized, prompts: string[], runId: string): Promise<void>;
    handleLLMEnd(output: unknown, runId: string): Promise<void>;
    handleLLMError(err: Error, runId: string): Promise<void>;
    handleChainStart(chain: Serialized, inputs: Record<string, unknown>, runId: string): Promise<void>;
    handleChainEnd(outputs: Record<string, unknown>, runId: string): Promise<void>;
    handleChainError(err: Error, runId: string): Promise<void>;
    private toolNameStore;
    private extractToolName;
}
export {};
