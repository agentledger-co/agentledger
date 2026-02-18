/**
 * AgentLedger Express middleware and generic HTTP integration.
 *
 * Usage with Express:
 *   import { AgentLedger } from '@agentledger/sdk';
 *   import { agentLedgerMiddleware } from '@agentledger/sdk/integrations/express';
 *
 *   const ledger = new AgentLedger({ apiKey: 'al_...' });
 *
 *   // Track all requests to a specific route
 *   app.post('/api/agent/send-email', agentLedgerMiddleware(ledger, {
 *     agent: 'email-bot',
 *     service: 'sendgrid',
 *     action: 'send_email',
 *   }), (req, res) => {
 *     // your handler
 *   });
 *
 *   // Or track all routes with auto-detection
 *   app.use('/api/agent', agentLedgerMiddleware(ledger, {
 *     agent: 'my-agent',
 *     autoDetect: true, // uses req.path as action, req.method as metadata
 *   }));
 */

import type { AgentLedger, TrackOptions } from '../index';

export interface MiddlewareConfig {
  /** Agent name */
  agent: string;
  /** Service name. If autoDetect is true, can be omitted */
  service?: string;
  /** Action name. If autoDetect is true, uses req.path */
  action?: string;
  /** Auto-detect service/action from request path */
  autoDetect?: boolean;
  /** Custom cost extractor from request/response */
  costExtractor?: (req: unknown, res: unknown) => number;
}

/**
 * Express-compatible middleware that tracks requests as agent actions.
 */
export function agentLedgerMiddleware(
  ledger: AgentLedger,
  config: MiddlewareConfig,
) {
  return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
    const start = Date.now();

    // Determine service/action
    let service = config.service || 'http';
    let action = config.action || 'request';

    if (config.autoDetect) {
      // /api/agent/send-email → service: 'agent', action: 'send-email'
      const pathParts = (req.path || req.url || '').split('/').filter(Boolean);
      if (pathParts.length >= 2) {
        service = pathParts[pathParts.length - 2] || service;
        action = pathParts[pathParts.length - 1] || action;
      } else if (pathParts.length === 1) {
        action = pathParts[0] || action;
      }
    }

    // Hook into response finish to log with timing
    const originalEnd = res.end.bind(res);
    let logged = false;

    res.end = function (...args: unknown[]): ExpressResponse {
      if (!logged) {
        logged = true;
        const durationMs = Date.now() - start;
        const status = res.statusCode >= 400 ? 'error' : 'success';
        const costCents = config.costExtractor ? config.costExtractor(req, res) : 0;

        // Fire and forget — don't block the response
        ledger.log({
          agent: config.agent,
          service,
          action,
          status,
          durationMs,
          costCents,
          metadata: {
            source: 'express',
            method: req.method,
            path: req.path || req.url,
            statusCode: res.statusCode,
          },
        }).catch(() => {}); // fail-open
      }

      return originalEnd(...args);
    };

    next();
  };
}

/**
 * Simple wrapper for any async function — no Express dependency needed.
 * Wraps a function with AgentLedger tracking and returns a new function
 * with the same signature.
 *
 * Usage:
 *   const trackedFn = trackFunction(ledger, {
 *     agent: 'my-bot',
 *     service: 'slack',
 *     action: 'send_message',
 *   }, slackSendMessage);
 *
 *   await trackedFn('#general', 'Hello!');
 */
export function trackFunction<TArgs extends unknown[], TResult>(
  ledger: AgentLedger,
  options: Pick<TrackOptions, 'agent' | 'service' | 'action'>,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const { result } = await ledger.track(
      {
        agent: options.agent,
        service: options.service,
        action: options.action,
        metadata: { source: 'tracked-function' },
      },
      () => fn(...args),
    );
    return result;
  };
}

// Minimal Express types to avoid requiring @types/express
interface ExpressRequest {
  method: string;
  path?: string;
  url?: string;
  [key: string]: unknown;
}

interface ExpressResponse {
  statusCode: number;
  end: (...args: unknown[]) => ExpressResponse;
  [key: string]: unknown;
}

type NextFunction = (err?: unknown) => void;
