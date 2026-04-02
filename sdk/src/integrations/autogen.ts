/**
 * AgentLedger integration for AutoGen.
 *
 * Usage:
 *   import { AgentLedger } from 'agentledger';
 *   import { createAutoGenHook } from 'agentledger/integrations/autogen';
 *
 *   const ledger = new AgentLedger({ apiKey: 'al_...' });
 *   const hook = createAutoGenHook(ledger, { agent: 'my-autogen-team' });
 */

import type { AgentLedger } from '../index';

export interface AutoGenHookConfig {
  agent: string;
  trackMessages?: boolean;
  trackFunctionCalls?: boolean;
}

export function createAutoGenHook(ledger: AgentLedger, config: AutoGenHookConfig) {
  const cfg = { trackMessages: true, trackFunctionCalls: true, ...config };

  return {
    async onMessageSent(sender: string, receiver: string, message: unknown) {
      if (!cfg.trackMessages) return;
      await ledger.log({
        agent: cfg.agent,
        service: 'autogen',
        action: 'message',
        metadata: { source: 'autogen', sender, receiver },
        input: message,
      }).catch(() => {});
    },

    async onFunctionCall(callerAgent: string, functionName: string, args?: unknown) {
      if (!cfg.trackFunctionCalls) return;
      const start = Date.now();
      return {
        async complete(result?: unknown) {
          const durationMs = Date.now() - start;
          await ledger.log({
            agent: cfg.agent,
            service: functionName,
            action: 'call',
            durationMs,
            input: args,
            output: result,
            metadata: { source: 'autogen', caller: callerAgent },
          }).catch(() => {});
        },
        async error(err: Error) {
          const durationMs = Date.now() - start;
          await ledger.log({
            agent: cfg.agent,
            service: functionName,
            action: 'call',
            status: 'error',
            durationMs,
            input: args,
            metadata: { source: 'autogen', caller: callerAgent, error: err.message },
          }).catch(() => {});
        },
      };
    },

    async onConversationEnd(summary?: unknown) {
      await ledger.log({
        agent: cfg.agent,
        service: 'autogen',
        action: 'conversation_end',
        output: summary,
        metadata: { source: 'autogen' },
      }).catch(() => {});
    },
  };
}
