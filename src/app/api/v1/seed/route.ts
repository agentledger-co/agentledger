import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

const AGENTS = ['support-bot', 'sales-agent', 'ops-automator', 'content-writer'];

const SERVICES_AND_ACTIONS = [
  { service: 'slack', actions: ['send_message', 'create_channel', 'add_reaction'], costRange: [0, 0] },
  { service: 'gmail', actions: ['send_email', 'create_draft', 'reply'], costRange: [1, 3] },
  { service: 'jira', actions: ['create_ticket', 'update_ticket', 'add_comment'], costRange: [0, 0] },
  { service: 'stripe', actions: ['create_invoice', 'refund_payment', 'update_subscription'], costRange: [0, 0] },
  { service: 'openai', actions: ['completion', 'embedding', 'vision'], costRange: [1, 5] },
  { service: 'anthropic', actions: ['completion', 'tool_use'], costRange: [2, 6] },
  { service: 'twilio', actions: ['send_sms', 'make_call'], costRange: [1, 10] },
  { service: 'sendgrid', actions: ['send_email', 'send_template'], costRange: [0, 1] },
  { service: 'notion', actions: ['create_page', 'update_database', 'add_comment'], costRange: [0, 0] },
  { service: 'github', actions: ['create_issue', 'create_pr', 'merge_pr'], costRange: [0, 0] },
];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// POST /api/v1/seed - Generate demo data
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = Date.now();
  const hoursBack = 48;

  // Create agents
  const agentErrors: string[] = [];
  for (const name of AGENTS) {
    const { error: agentErr } = await supabase.from('agents').insert(
      { org_id: auth.orgId, name, status: 'active' }
    );
    if (agentErr) agentErrors.push(`${name}: ${agentErr.message}`);
  }

  // Generate ~200 action logs spread over the last 48 hours
  const logs = [];
  const actionCount = randomInt(150, 250);

  for (let i = 0; i < actionCount; i++) {
    const agent = randomPick(AGENTS);
    const serviceConfig = randomPick(SERVICES_AND_ACTIONS);
    const action = randomPick(serviceConfig.actions);
    const costCents = randomInt(serviceConfig.costRange[0], serviceConfig.costRange[1]);
    const durationMs = randomInt(50, 3000);
    const hoursAgo = Math.random() * hoursBack;
    const createdAt = new Date(now - hoursAgo * 60 * 60 * 1000);

    // Weight status: 90% success, 5% error, 5% blocked
    const statusRoll = Math.random();
    const status = statusRoll < 0.9 ? 'success' : statusRoll < 0.95 ? 'error' : 'blocked';

    logs.push({
      org_id: auth.orgId,
      agent_name: agent,
      service: serviceConfig.service,
      action,
      status,
      estimated_cost_cents: costCents,
      duration_ms: durationMs,
      created_at: createdAt.toISOString(),
      request_meta: { demo: true, user: `user_${randomInt(100, 999)}` },
    });
  }

  // Insert in batches
  const batchSize = 50;
  let inserted = 0;
  for (let i = 0; i < logs.length; i += batchSize) {
    const batch = logs.slice(i, i + batchSize);
    const { error } = await supabase.from('action_logs').insert(batch);
    if (!error) inserted += batch.length;
  }

  // Update agent last_active_at
  for (const name of AGENTS) {
    await supabase
      .from('agents')
      .update({
        last_active_at: new Date().toISOString(),
      })
      .eq('org_id', auth.orgId)
      .eq('name', name);
  }

  // Create a couple sample alerts
  await supabase.from('anomaly_alerts').insert([
    {
      org_id: auth.orgId,
      agent_name: 'sales-agent',
      alert_type: 'rate_spike',
      severity: 'warning',
      message: 'sales-agent fired 45 actions in the last hour (3x normal rate of 15/hr)',
      metadata: { hourly_count: 45, avg_count: 15 },
    },
    {
      org_id: auth.orgId,
      agent_name: 'ops-automator',
      alert_type: 'new_service',
      severity: 'info',
      message: 'ops-automator accessed a new service: stripe (first time)',
      metadata: { service: 'stripe' },
    },
  ]);

  return NextResponse.json({
    success: true,
    inserted,
    agents: AGENTS.length,
    alerts: 2,
    message: `Seeded ${inserted} actions across ${AGENTS.length} agents`,
    agentErrors: agentErrors.length > 0 ? agentErrors : undefined,
  });
}
