/**
 * Lightweight error monitoring for AgentLedger API routes.
 * 
 * Logs errors to console with structured data.
 * Replace with Sentry/LogRocket/etc. when ready:
 *   import * as Sentry from '@sentry/nextjs';
 *   Sentry.captureException(error, { extra: context });
 */

interface ErrorContext {
  route: string;
  method?: string;
  orgId?: string;
  detail?: string;
  [key: string]: unknown;
}

export function reportError(error: unknown, context: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  
  // Structured log for Vercel Logs / any log aggregator
  console.error(JSON.stringify({
    level: 'error',
    message: err.message,
    stack: err.stack?.split('\n').slice(0, 5).join('\n'),
    ...context,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Wrap an API route handler with error reporting.
 * Catches unhandled errors and returns a clean 500.
 */
export function withErrorReporting(
  route: string,
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (error) {
      reportError(error, { route, method: req.method });
      
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}
