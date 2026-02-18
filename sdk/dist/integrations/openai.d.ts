/**
 * AgentLedger integration for the OpenAI Agents SDK.
 *
 * Wraps tool functions so every tool invocation is automatically logged.
 *
 * Usage:
 *   import { AgentLedger } from '@agentledger/sdk';
 *   import { withAgentLedger } from '@agentledger/sdk/integrations/openai';
 *
 *   const ledger = new AgentLedger({ apiKey: 'al_...' });
 *
 *   // Wrap individual tool functions
 *   const trackedSendEmail = withAgentLedger(ledger, {
 *     agent: 'support-bot',
 *     service: 'sendgrid',
 *     action: 'send_email',
 *   }, sendEmail);
 *
 *   // Or wrap an entire tools array
 *   const tools = wrapOpenAITools(ledger, 'my-agent', [
 *     { type: 'function', function: { name: 'send_email', ... } }
 *   ]);
 */
import type { AgentLedger, TrackOptions } from '../index';
/**
 * Wraps a single async function with AgentLedger tracking.
 * The function signature is preserved — drop-in replacement.
 */
export declare function withAgentLedger<TArgs extends unknown[], TResult>(ledger: AgentLedger, options: Pick<TrackOptions, 'agent' | 'service' | 'action'>, fn: (...args: TArgs) => Promise<TResult>): (...args: TArgs) => Promise<TResult>;
/**
 * Map of tool names to their handler functions.
 */
type ToolHandlers = Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
/**
 * Service mapping: how to categorize each tool for AgentLedger tracking.
 * If a tool isn't in the map, its name is used as both service and action.
 */
type ServiceMap = Record<string, {
    service: string;
    action?: string;
}>;
/**
 * Creates a tool execution wrapper that logs all tool calls to AgentLedger.
 *
 * Usage:
 *   const executeTools = createToolExecutor(ledger, 'my-agent', {
 *     send_email: sendEmailFn,
 *     create_ticket: createTicketFn,
 *   }, {
 *     send_email: { service: 'sendgrid', action: 'send' },
 *     create_ticket: { service: 'jira', action: 'create_issue' },
 *   });
 *
 *   // In your OpenAI agent loop:
 *   for (const toolCall of message.tool_calls) {
 *     const result = await executeTools(toolCall.function.name, JSON.parse(toolCall.function.arguments));
 *   }
 */
export declare function createToolExecutor(ledger: AgentLedger, agent: string, handlers: ToolHandlers, serviceMap?: ServiceMap): (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
/**
 * Convenience: wraps the OpenAI chat.completions.create call itself to track LLM usage.
 */
export declare function wrapOpenAICompletion<TArgs extends unknown[], TResult>(ledger: AgentLedger, agent: string, createFn: (...args: TArgs) => Promise<TResult>): (...args: TArgs) => Promise<TResult>;
export {};
