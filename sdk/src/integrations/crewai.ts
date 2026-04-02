/**
 * AgentLedger integration for CrewAI (TypeScript).
 *
 * Usage:
 *   import { AgentLedger } from 'agentledger';
 *   import { createCrewAICallback } from 'agentledger/integrations/crewai';
 *
 *   const ledger = new AgentLedger({ apiKey: 'al_...' });
 *   const callback = createCrewAICallback(ledger, { agent: 'my-crew' });
 */

import type { AgentLedger } from '../index';

export interface CrewAICallbackConfig {
  agent: string;
  trackTasks?: boolean;
  trackToolCalls?: boolean;
}

export function createCrewAICallback(ledger: AgentLedger, config: CrewAICallbackConfig) {
  const taskTimers = new Map<string, number>();
  const cfg = { trackTasks: true, trackToolCalls: true, ...config };

  return {
    onTaskStart(taskName: string, taskId: string, inputs?: Record<string, unknown>) {
      if (!cfg.trackTasks) return;
      taskTimers.set(taskId, Date.now());
    },

    async onTaskComplete(taskName: string, taskId: string, output?: unknown) {
      if (!cfg.trackTasks) return;
      const start = taskTimers.get(taskId);
      const durationMs = start ? Date.now() - start : 0;
      taskTimers.delete(taskId);

      await ledger.log({
        agent: cfg.agent,
        service: 'crewai',
        action: taskName || 'task',
        durationMs,
        metadata: { source: 'crewai', taskId },
        output: output !== undefined ? output : undefined,
      }).catch(() => {});
    },

    async onTaskError(taskName: string, taskId: string, error: Error) {
      if (!cfg.trackTasks) return;
      const start = taskTimers.get(taskId);
      const durationMs = start ? Date.now() - start : 0;
      taskTimers.delete(taskId);

      await ledger.log({
        agent: cfg.agent,
        service: 'crewai',
        action: taskName || 'task',
        status: 'error',
        durationMs,
        metadata: { source: 'crewai', taskId, error: error.message },
      }).catch(() => {});
    },

    async onToolCall(toolName: string, input?: unknown) {
      if (!cfg.trackToolCalls) return;
      const start = Date.now();
      return {
        async complete(output?: unknown) {
          const durationMs = Date.now() - start;
          await ledger.log({
            agent: cfg.agent,
            service: toolName,
            action: 'invoke',
            durationMs,
            input,
            output,
            metadata: { source: 'crewai' },
          }).catch(() => {});
        },
        async error(err: Error) {
          const durationMs = Date.now() - start;
          await ledger.log({
            agent: cfg.agent,
            service: toolName,
            action: 'invoke',
            status: 'error',
            durationMs,
            input,
            metadata: { source: 'crewai', error: err.message },
          }).catch(() => {});
        },
      };
    },
  };
}
