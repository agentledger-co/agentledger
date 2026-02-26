import { createServiceClient } from './supabase';

type NotificationEvent = 'action.error' | 'agent.killed' | 'budget.exceeded' | 'budget.warning';

interface NotificationPayload {
  event: NotificationEvent;
  agentName: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Send notifications (email + Slack) for an event. Non-blocking.
 */
export async function sendNotifications(
  orgId: string,
  payload: NotificationPayload
): Promise<void> {
  const supabase = createServiceClient();

  const { data: settings } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('org_id', orgId)
    .eq('active', true);

  if (!settings?.length) return;

  await Promise.allSettled(
    settings
      .filter(s => s.events.includes(payload.event))
      .map(s => {
        if (s.channel === 'slack') return sendSlack(s.config, payload);
        if (s.channel === 'email') return sendEmail(s.config, payload);
        return Promise.resolve();
      })
  );
}

async function sendSlack(
  config: Record<string, unknown>,
  payload: NotificationPayload
): Promise<void> {
  const webhookUrl = config.webhook_url as string;
  if (!webhookUrl) return;

  const emoji = payload.event === 'action.error' ? '🔴' :
    payload.event === 'agent.killed' ? '💀' :
    payload.event === 'budget.exceeded' ? '🚨' : '⚠️';

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *AgentLedger Alert*\n*Agent:* \`${payload.agentName}\`\n*Event:* ${payload.event}\n${payload.message}`
      }
    }
  ];

  if (payload.details && Object.keys(payload.details).length > 0) {
    const detailStr = Object.entries(payload.details)
      .map(([k, v]) => `*${k}:* ${v}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: detailStr }
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function sendEmail(
  config: Record<string, unknown>,
  payload: NotificationPayload
): Promise<void> {
  const email = config.email as string;
  if (!email) return;

  // Use Supabase Edge Functions or a simple SMTP relay
  // For now, we'll use the Supabase built-in email via a webhook-style approach
  // In production, you'd integrate with Resend, SendGrid, or Zoho SMTP

  // Store as a pending notification for now — the dashboard will show it
  // and we can add SMTP later without changing the architecture
  const supabase = createServiceClient();
  
  try {
    await supabase.from('anomaly_alerts').insert({
      org_id: config._org_id as string,
      agent_name: payload.agentName,
      alert_type: `email_pending_${payload.event}`,
      severity: payload.event === 'budget.exceeded' || payload.event === 'action.error' ? 'critical' : 'warning',
      message: `[Email → ${email}] ${payload.message}`,
      metadata: { email, event: payload.event, details: payload.details },
    });
  } catch { /* Non-critical */ }
}
