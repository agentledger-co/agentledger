import { NextRequest } from 'next/server';
import { authenticateApiKey, authenticateApiKeyFromString } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Auth: prefer Authorization header; fall back to ?key= for EventSource
  // (EventSource API doesn't support custom headers)
  const auth = await authenticateApiKey(req)
    || await (async () => {
      const keyParam = req.nextUrl.searchParams.get('key');
      return keyParam ? authenticateApiKeyFromString(keyParam) : null;
    })();

  if (!auth) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Parse filter query params
  const eventsParam = req.nextUrl.searchParams.get('events');
  const allowedEvents = eventsParam
    ? new Set(eventsParam.split(',').map((e) => e.trim()).filter(Boolean))
    : null;
  const agentFilter = req.nextUrl.searchParams.get('agent') || null;
  const environmentFilter = req.nextUrl.searchParams.get('environment') || null;

  // Support Last-Event-ID for reconnection
  const lastEventIdHeader = req.headers.get('Last-Event-ID');
  let eventId = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : 0;
  if (isNaN(eventId)) eventId = 0;

  const encoder = new TextEncoder();

  // Track last seen timestamps to only fetch new items
  let lastActionTimestamp: string | null = null;
  let lastAlertTimestamp: string | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  const stream = new ReadableStream({
    start(controller) {
      const supabase = createServiceClient();

      function sendEvent(type: string, data: unknown) {
        if (cancelled) return;
        eventId++;
        const payload = `id: ${eventId}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller closed, ignore
        }
      }

      function sendHeartbeat() {
        if (cancelled) return;
        eventId++;
        const payload = `id: ${eventId}\nevent: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller closed, ignore
        }
      }

      const poll = async () => {
        if (cancelled) return;

        try {
          // Poll for new actions
          const wantActions = !allowedEvents || allowedEvents.has('action.new');
          if (wantActions) {
            let actionQuery = supabase
              .from('action_logs')
              .select('*')
              .eq('org_id', auth.orgId)
              .order('created_at', { ascending: true })
              .limit(50);

            if (lastActionTimestamp) {
              actionQuery = actionQuery.gt('created_at', lastActionTimestamp);
            } else {
              // On first poll, only get actions from the last 10 seconds
              // so we don't replay old history
              const recent = new Date(Date.now() - 10_000).toISOString();
              actionQuery = actionQuery.gt('created_at', recent);
            }

            if (agentFilter) {
              actionQuery = actionQuery.eq('agent_name', agentFilter);
            }
            if (environmentFilter) {
              actionQuery = actionQuery.eq('environment', environmentFilter);
            }

            const { data: actions } = await actionQuery;

            if (actions && actions.length > 0) {
              for (const action of actions) {
                sendEvent('action.new', action);
              }
              lastActionTimestamp = actions[actions.length - 1].created_at;
            }
          }

          // Poll for new alerts
          const wantAlerts = !allowedEvents || allowedEvents.has('alert.new');
          if (wantAlerts) {
            let alertQuery = supabase
              .from('anomaly_alerts')
              .select('*')
              .eq('org_id', auth.orgId)
              .order('created_at', { ascending: true })
              .limit(50);

            if (lastAlertTimestamp) {
              alertQuery = alertQuery.gt('created_at', lastAlertTimestamp);
            } else {
              const recent = new Date(Date.now() - 10_000).toISOString();
              alertQuery = alertQuery.gt('created_at', recent);
            }

            if (agentFilter) {
              alertQuery = alertQuery.eq('agent_name', agentFilter);
            }

            const { data: alerts } = await alertQuery;

            if (alerts && alerts.length > 0) {
              for (const alert of alerts) {
                sendEvent('alert.new', alert);
              }
              lastAlertTimestamp = alerts[alerts.length - 1].created_at;
            }
          }
        } catch {
          // Swallow errors, keep streaming
        }
      };

      // Initial poll
      poll();

      // Poll every 2 seconds
      intervalId = setInterval(poll, 2000);

      // Heartbeat every 15 seconds to keep connection alive
      heartbeatId = setInterval(sendHeartbeat, 15_000);
    },
    cancel() {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (heartbeatId) clearInterval(heartbeatId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
