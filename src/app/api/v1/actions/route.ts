import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { fireWebhooks } from '@/lib/webhooks';
import { sendNotifications } from '@/lib/notifications';
import { checkUsageLimits, checkRateLimit } from '@/lib/usage';
import { reportError } from '@/lib/errors';
import { sanitizeString, sanitizeMetadata, sanitizePayload, sanitizePositiveInt, validateStatus } from '@/lib/validate';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50') || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0') || 0, 0);

  const { data: actions, error, count } = await supabase
    .from('action_logs')
    .select('*', { count: 'exact' })
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch actions', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ actions: actions || [], total: count || 0 });
}

// POST /api/v1/actions - Log an agent action
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const agent = sanitizeString(body.agent);
  const service = sanitizeString(body.service);
  const action = sanitizeString(body.action);
  const status = validateStatus(body.status);
  const cost_cents = sanitizePositiveInt(body.cost_cents);
  const duration_ms = sanitizePositiveInt(body.duration_ms);
  const metadata = sanitizeMetadata(body.metadata);
  const trace_id = sanitizeString(body.trace_id, 200) || null;
  const input = body.input !== undefined ? sanitizePayload(body.input) : null;
  const output = body.output !== undefined ? sanitizePayload(body.output) : null;

  if (!agent || !service || !action) {
    return NextResponse.json({ error: 'Missing required fields: agent, service, action' }, { status: 400 });
  }

  // Monthly usage limit check
  const usageCheck = await checkUsageLimits(auth.orgId);
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: usageCheck.reason, usage: usageCheck.usage },
      { status: 429 }
    );
  }

  // Rate limit check using actual plan
  const rateCheck = checkRateLimit(auth.orgId, usageCheck.plan);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down.', retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 60) } }
    );
  }

  const supabase = createServiceClient();

  // Resolve agent: try to find existing, create if new
  // This avoids overwriting paused/killed status via upsert
  let agentId: string;
  let agentStatus: string;

  const { data: existingAgent } = await supabase
    .from('agents')
    .select('id, status')
    .eq('org_id', auth.orgId)
    .eq('name', agent)
    .single();

  if (existingAgent) {
    agentId = existingAgent.id;
    agentStatus = existingAgent.status;
    // Update timestamps (non-blocking)
    Promise.resolve(supabase.from('agents').update({ last_active_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', agentId)).catch(() => {});
  } else {
    // Try to create — catch unique constraint race condition
    const { data: newAgent, error: insertErr } = await supabase
      .from('agents')
      .insert({ org_id: auth.orgId, name: agent, status: 'active', last_active_at: new Date().toISOString() })
      .select('id, status')
      .single();

    if (insertErr) {
      // Race condition — another request created it first. Re-fetch.
      const { data: raceAgent } = await supabase
        .from('agents')
        .select('id, status')
        .eq('org_id', auth.orgId)
        .eq('name', agent)
        .single();

      if (!raceAgent) {
        return NextResponse.json({ error: 'Failed to resolve agent' }, { status: 500 });
      }
      agentId = raceAgent.id;
      agentStatus = raceAgent.status;
    } else {
      agentId = newAgent.id;
      agentStatus = newAgent.status;
    }
  }

  if (agentStatus === 'killed') {
    return NextResponse.json({ allowed: false, reason: 'Agent has been killed' }, { status: 403 });
  }

  if (agentStatus === 'paused') {
    return NextResponse.json({ allowed: false, reason: 'Agent is paused' }, { status: 403 });
  }

  // Insert action log
  const { data: actionLog, error: logErr } = await supabase
    .from('action_logs')
    .insert({
      org_id: auth.orgId,
      agent_name: agent,
      service,
      action,
      status,
      estimated_cost_cents: cost_cents,
      duration_ms,
      request_meta: metadata,
      trace_id,
      input,
      output,
    })
    .select()
    .single();

  if (logErr) {
    return NextResponse.json({ error: 'Failed to log action', detail: logErr.message }, { status: 500 });
  }

  // Update budget counters
  const { data: budgets } = await supabase
    .from('budgets')
    .select('*')
    .eq('agent_id', agentId);

  if (budgets) {
    for (const budget of budgets) {
      const newActions = (budget.current_actions || 0) + 1;
      const newCost = (budget.current_cost_cents || 0) + cost_cents;
      let newStatus = 'ok';

      const actPct = budget.max_actions ? (newActions / budget.max_actions) * 100 : 0;
      const costPct = budget.max_cost_cents ? (newCost / budget.max_cost_cents) * 100 : 0;
      const maxPct = Math.max(actPct, costPct);

      if (maxPct >= 100) newStatus = 'exceeded';
      else if (maxPct >= 90) newStatus = 'critical';
      else if (maxPct >= 75) newStatus = 'warning';

      await supabase
        .from('budgets')
        .update({
          current_actions: newActions,
          current_cost_cents: newCost,
          status: newStatus,
        })
        .eq('id', budget.id);

      // Create alert if budget exceeded
      if (newStatus === 'exceeded' && budget.status !== 'exceeded') {
        await supabase.from('anomaly_alerts').insert({
          org_id: auth.orgId,
          agent_id: agentId,
          agent_name: agent,
          alert_type: 'budget_exceeded',
          severity: 'critical',
          message: `Budget for ${agent} (${budget.period}) has been exceeded`,
          metadata: { budget_id: budget.id, current_actions: newActions, current_cost: newCost },
        });

        // Fire budget exceeded webhook
        fireWebhooks(auth.orgId, 'budget.exceeded', {
          agent, period: budget.period, current_actions: newActions, current_cost_cents: newCost,
          max_actions: budget.max_actions, max_cost_cents: budget.max_cost_cents,
        }).catch(() => {});

        fireWebhooks(auth.orgId, 'alert.created', {
          agent, alert_type: 'budget_exceeded', severity: 'critical',
          message: `Budget for ${agent} (${budget.period}) has been exceeded`,
        }).catch(() => {});

        // Send Slack/email notifications
        sendNotifications(auth.orgId, {
          event: 'budget.exceeded',
          agentName: agent,
          message: `Budget for *${agent}* (${budget.period}) has been exceeded.`,
          details: {
            period: budget.period,
            actions: `${newActions}/${budget.max_actions || '∞'}`,
            cost: `$${(newCost / 100).toFixed(2)}/${budget.max_cost_cents ? '$' + (budget.max_cost_cents / 100).toFixed(2) : '∞'}`,
          },
        }).catch(() => {});
      }

      // Fire budget warning webhook
      if (newStatus === 'warning' && budget.status === 'ok') {
        fireWebhooks(auth.orgId, 'budget.warning', {
          agent, period: budget.period, current_actions: newActions, current_cost_cents: newCost,
          max_actions: budget.max_actions, max_cost_cents: budget.max_cost_cents,
        }).catch(() => {});

        sendNotifications(auth.orgId, {
          event: 'budget.warning',
          agentName: agent,
          message: `Agent *${agent}* is approaching its ${budget.period} budget (75%+).`,
          details: {
            period: budget.period,
            actions: `${newActions}/${budget.max_actions || '∞'}`,
            cost: `$${(newCost / 100).toFixed(2)}/${budget.max_cost_cents ? '$' + (budget.max_cost_cents / 100).toFixed(2) : '∞'}`,
          },
        }).catch(() => {});
      }
    }
  }

  // Fire action logged webhook (non-blocking)
  fireWebhooks(auth.orgId, 'action.logged', {
    id: actionLog?.id, agent, service, action, status, cost_cents, duration_ms,
  }).catch(() => {});

  // Send notification on errors
  if (status === 'error') {
    sendNotifications(auth.orgId, {
      event: 'action.error',
      agentName: agent,
      message: `Action \`${action}\` on \`${service}\` failed.`,
      details: { service, action, duration: `${duration_ms}ms` },
    }).catch(() => {});
  }

  return NextResponse.json({ logged: true, id: actionLog?.id });
}
