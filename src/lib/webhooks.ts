import { createServiceClient } from './supabase';
import { createHmac } from 'crypto';

export type WebhookEvent =
  | 'action.logged'
  | 'agent.paused'
  | 'agent.killed'
  | 'agent.resumed'
  | 'budget.exceeded'
  | 'budget.warning'
  | 'alert.created';

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Fire webhooks for an event. Non-blocking — errors are logged but don't propagate.
 */
export async function fireWebhooks(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const supabase = createServiceClient();

  // Find active webhooks for this org that subscribe to this event
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('*')
    .eq('org_id', orgId)
    .eq('active', true)
    .contains('events', [event]);

  if (!webhooks?.length) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Fire all webhooks in parallel (non-blocking)
  await Promise.allSettled(
    webhooks.map(webhook => deliverWebhook(supabase, webhook, payload))
  );
}

async function deliverWebhook(
  supabase: ReturnType<typeof createServiceClient>,
  webhook: Record<string, unknown>,
  payload: WebhookPayload,
  attempt = 1
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', webhook.secret as string)
    .update(body)
    .digest('hex');

  const start = Date.now();
  let responseStatus: number | null = null;
  let responseBody = '';
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(webhook.url as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AgentLedger-Signature': `sha256=${signature}`,
        'X-AgentLedger-Event': payload.event,
        'X-AgentLedger-Delivery': crypto.randomUUID(),
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    responseStatus = res.status;
    responseBody = await res.text().catch(() => '');
    success = res.ok;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : 'Unknown error';
  }

  const durationMs = Date.now() - start;

  // Log delivery
  try {
    await supabase.from('webhook_deliveries').insert({
      webhook_id: webhook.id,
      org_id: webhook.org_id,
      event: payload.event,
      payload,
      response_status: responseStatus,
      response_body: responseBody?.slice(0, 1000),
      duration_ms: durationMs,
      success,
      attempt,
    });
  } catch { /* Don't fail if logging fails */ }

  // Update webhook stats
  try {
    await supabase.from('webhooks').update({
      last_triggered_at: new Date().toISOString(),
      failure_count: success ? 0 : ((webhook.failure_count as number) || 0) + 1,
      // Disable after 10 consecutive failures
      active: success || ((webhook.failure_count as number) || 0) < 9,
      updated_at: new Date().toISOString(),
    }).eq('id', webhook.id);
  } catch { /* Non-critical */ }

  // Retry once on failure
  if (!success && attempt < 2) {
    await new Promise(r => setTimeout(r, 2000));
    await deliverWebhook(supabase, webhook, payload, attempt + 1);
  }
}

/**
 * Generate a webhook signing secret.
 */
export function generateWebhookSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let secret = 'whsec_';
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}
