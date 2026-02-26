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
export declare function agentLedgerMiddleware(ledger: AgentLedger, config: MiddlewareConfig): (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => Promise<void>;
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
export declare function trackFunction<TArgs extends unknown[], TResult>(ledger: AgentLedger, options: Pick<TrackOptions, 'agent' | 'service' | 'action'>, fn: (...args: TArgs) => Promise<TResult>): (...args: TArgs) => Promise<TResult>;
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
export {};
