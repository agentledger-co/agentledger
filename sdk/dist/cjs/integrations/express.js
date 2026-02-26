"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentLedgerMiddleware = agentLedgerMiddleware;
exports.trackFunction = trackFunction;
/**
 * Express-compatible middleware that tracks requests as agent actions.
 */
function agentLedgerMiddleware(ledger, config) {
    return async (req, res, next) => {
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
            }
            else if (pathParts.length === 1) {
                action = pathParts[0] || action;
            }
        }
        // Hook into response finish to log with timing
        const originalEnd = res.end.bind(res);
        let logged = false;
        res.end = function (...args) {
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
                }).catch(() => { }); // fail-open
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
function trackFunction(ledger, options, fn) {
    return async (...args) => {
        const { result } = await ledger.track({
            agent: options.agent,
            service: options.service,
            action: options.action,
            metadata: { source: 'tracked-function' },
        }, () => fn(...args));
        return result;
    };
}
