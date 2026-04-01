/**
 * AgentLedger integration for LlamaIndex.
 *
 * Usage:
 *   import { AgentLedger } from 'agentledger';
 *   import { createLlamaIndexCallback } from 'agentledger/integrations/llamaindex';
 *
 *   const ledger = new AgentLedger({ apiKey: 'al_...' });
 *   const callback = createLlamaIndexCallback(ledger, { agent: 'my-rag-agent' });
 */

import type { AgentLedger } from '../index';

export interface LlamaIndexCallbackConfig {
  agent: string;
  trackQueries?: boolean;
  trackRetrieval?: boolean;
  trackLLM?: boolean;
}

export function createLlamaIndexCallback(ledger: AgentLedger, config: LlamaIndexCallbackConfig) {
  const timers = new Map<string, number>();
  const cfg = { trackQueries: true, trackRetrieval: true, trackLLM: true, ...config };

  return {
    onQueryStart(queryId: string, query: string) {
      if (!cfg.trackQueries) return;
      timers.set(`query:${queryId}`, Date.now());
    },

    async onQueryEnd(queryId: string, response?: unknown) {
      if (!cfg.trackQueries) return;
      const start = timers.get(`query:${queryId}`);
      const durationMs = start ? Date.now() - start : 0;
      timers.delete(`query:${queryId}`);

      await ledger.log({
        agent: cfg.agent,
        service: 'llamaindex',
        action: 'query',
        durationMs,
        output: response,
        metadata: { source: 'llamaindex', queryId },
      }).catch(() => {});
    },

    onRetrievalStart(retrievalId: string, query: string) {
      if (!cfg.trackRetrieval) return;
      timers.set(`retrieval:${retrievalId}`, Date.now());
    },

    async onRetrievalEnd(retrievalId: string, nodes?: unknown[]) {
      if (!cfg.trackRetrieval) return;
      const start = timers.get(`retrieval:${retrievalId}`);
      const durationMs = start ? Date.now() - start : 0;
      timers.delete(`retrieval:${retrievalId}`);

      await ledger.log({
        agent: cfg.agent,
        service: 'llamaindex',
        action: 'retrieval',
        durationMs,
        metadata: { source: 'llamaindex', retrievalId, nodeCount: nodes?.length || 0 },
      }).catch(() => {});
    },

    onLLMStart(llmId: string, prompt: string) {
      if (!cfg.trackLLM) return;
      timers.set(`llm:${llmId}`, Date.now());
    },

    async onLLMEnd(llmId: string, response?: unknown, tokenUsage?: { prompt: number; completion: number; total: number }) {
      if (!cfg.trackLLM) return;
      const start = timers.get(`llm:${llmId}`);
      const durationMs = start ? Date.now() - start : 0;
      timers.delete(`llm:${llmId}`);

      const costCents = tokenUsage ? Math.ceil(tokenUsage.total * 0.001) : 0;

      await ledger.log({
        agent: cfg.agent,
        service: 'llamaindex',
        action: 'llm_completion',
        costCents,
        durationMs,
        metadata: { source: 'llamaindex', llmId, tokenUsage },
      }).catch(() => {});
    },

    async onLLMError(llmId: string, error: Error) {
      if (!cfg.trackLLM) return;
      const start = timers.get(`llm:${llmId}`);
      const durationMs = start ? Date.now() - start : 0;
      timers.delete(`llm:${llmId}`);

      await ledger.log({
        agent: cfg.agent,
        service: 'llamaindex',
        action: 'llm_completion',
        status: 'error',
        durationMs,
        metadata: { source: 'llamaindex', llmId, error: error.message },
      }).catch(() => {});
    },
  };
}
