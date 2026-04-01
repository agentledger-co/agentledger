/**
 * AgentLedger integration for Vercel AI SDK.
 *
 * Usage:
 *   import { AgentLedger } from 'agentledger';
 *   import { createVercelAIMiddleware } from 'agentledger/integrations/vercel-ai';
 *
 *   const ledger = new AgentLedger({ apiKey: 'al_...' });
 *   const middleware = createVercelAIMiddleware(ledger, { agent: 'my-ai-app' });
 *
 *   // Use with generateText or streamText
 *   const result = await generateText({
 *     model: openai('gpt-4o'),
 *     prompt: 'Hello!',
 *     experimental_telemetry: { isEnabled: true },
 *   });
 *   middleware.onFinish(result);
 */

import type { AgentLedger } from '../index';

export interface VercelAIConfig {
  agent: string;
  trackGenerations?: boolean;
  trackToolCalls?: boolean;
}

export function createVercelAIMiddleware(ledger: AgentLedger, config: VercelAIConfig) {
  const cfg = { trackGenerations: true, trackToolCalls: true, ...config };

  return {
    async onFinish(result: {
      text?: string;
      usage?: { promptTokens: number; completionTokens: number; totalTokens?: number };
      finishReason?: string;
      toolCalls?: { toolName: string; args: unknown }[];
      toolResults?: { toolName: string; result: unknown }[];
      response?: { modelId?: string };
      roundtrips?: unknown[];
    }) {
      if (!cfg.trackGenerations) return;

      const totalTokens = result.usage?.totalTokens ||
        ((result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0));
      const costCents = Math.ceil(totalTokens * 0.001);
      const model = result.response?.modelId || 'unknown';

      await ledger.log({
        agent: cfg.agent,
        service: model.includes('claude') ? 'anthropic' : model.includes('gpt') ? 'openai' : 'vercel-ai',
        action: 'generate',
        costCents,
        metadata: {
          source: 'vercel-ai',
          model,
          finishReason: result.finishReason,
          promptTokens: result.usage?.promptTokens,
          completionTokens: result.usage?.completionTokens,
          totalTokens,
        },
      }).catch(() => {});

      // Track individual tool calls
      if (cfg.trackToolCalls && result.toolCalls) {
        for (const call of result.toolCalls) {
          const toolResult = result.toolResults?.find(r => r.toolName === call.toolName);
          await ledger.log({
            agent: cfg.agent,
            service: call.toolName,
            action: 'tool_call',
            input: call.args,
            output: toolResult?.result,
            metadata: { source: 'vercel-ai', model },
          }).catch(() => {});
        }
      }
    },

    wrapGenerate<T>(fn: () => Promise<T>): Promise<T> {
      const start = Date.now();
      return fn().then(
        async (result) => {
          const durationMs = Date.now() - start;
          await ledger.log({
            agent: cfg.agent,
            service: 'vercel-ai',
            action: 'generate',
            durationMs,
            metadata: { source: 'vercel-ai' },
          }).catch(() => {});
          return result;
        },
        async (err) => {
          const durationMs = Date.now() - start;
          await ledger.log({
            agent: cfg.agent,
            service: 'vercel-ai',
            action: 'generate',
            status: 'error',
            durationMs,
            metadata: { source: 'vercel-ai', error: err instanceof Error ? err.message : String(err) },
          }).catch(() => {});
          throw err;
        }
      );
    },
  };
}
