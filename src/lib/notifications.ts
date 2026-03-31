import { createServiceClient } from './supabase';

type NotificationEvent = 'action.error' | 'agent.killed' | 'budget.exceeded' | 'budget.warning' | 'anomaly.detected';

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
  const toEmail = config.email as string;
  if (!toEmail) return;

  const resendKey = process.env.RESEND_API_KEY;
  
  // If Resend is configured, send real emails
  if (resendKey) {
    const emoji = payload.event === 'action.error' ? '🔴' :
      payload.event === 'agent.killed' ? '💀' :
      payload.event === 'budget.exceeded' ? '🚨' : '⚠️';

    const detailsHtml = payload.details 
      ? Object.entries(payload.details).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')
      : '';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px;">
        <h2 style="margin: 0 0 12px;">${emoji} AgentLedger Alert</h2>
        <p style="color: #555; margin: 0 0 4px;"><strong>Agent:</strong> ${payload.agentName}</p>
        <p style="color: #555; margin: 0 0 4px;"><strong>Event:</strong> ${payload.event}</p>
        <p style="color: #333; margin: 12px 0;">${payload.message.replace(/\*/g, '')}</p>
        ${detailsHtml ? `<ul style="color: #555; padding-left: 20px;">${detailsHtml}</ul>` : ''}
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">Sent by <a href="https://agentledger.co" style="color: #3b82f6;">AgentLedger</a></p>
      </div>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'AgentLedger <alerts@agentledger.co>',
          to: [toEmail],
          subject: `[AgentLedger] ${payload.event}: ${payload.agentName}`,
          html,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    return;
  }

  // Fallback: store as pending alert if no email provider configured
  const supabase = createServiceClient();
  try {
    await supabase.from('anomaly_alerts').insert({
      org_id: config._org_id as string,
      agent_name: payload.agentName,
      alert_type: `email_pending_${payload.event}`,
      severity: payload.event === 'budget.exceeded' || payload.event === 'action.error' ? 'critical' : 'warning',
      message: `[Email → ${toEmail}] ${payload.message}`,
      metadata: { email: toEmail, event: payload.event, details: payload.details },
    });
  } catch { /* Non-critical */ }
}
