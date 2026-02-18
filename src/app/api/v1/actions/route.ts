import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { fireWebhooks } from '@/lib/webhooks';
import { checkUsageLimits, checkRateLimit } from '@/lib/usage';
import { reportError } from '@/lib/errors';
import { sanitizeString, sanitizeMetadata, sanitizePositiveInt, validateStatus } from '@/lib/validate';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

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

  const body = await req.json();
  const agent = sanitizeString(body.agent);
  const service = sanitizeString(body.service);
  const action = sanitizeString(body.action);
  const status = validateStatus(body.status);
  const cost_cents = sanitizePositiveInt(body.cost_cents);
  const duration_ms = sanitizePositiveInt(body.duration_ms);
  const metadata = sanitizeMetadata(body.metadata);

  if (!agent || !service || !action) {
    return NextResponse.json({ error: 'Missing required fields: agent, service, action' }, { status: 400 });
  }

  // Rate limit check (per-minute burst protection)
  const rateCheck = checkRateLimit(auth.orgId);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please slow down.', retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter || 60) } }
    );
  }

  // Monthly usage limit check
  const usageCheck = await checkUsageLimits(auth.orgId);
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: usageCheck.reason, usage: usageCheck.usage },
      { status: 429 }
    );
  }

  const supabase = createServiceClient();

  const { data: existingAgent } = await supabase
    .from('agents')
    .select('id, status')
    .eq('org_id', auth.orgId)
    .eq('name', agent)
    .single();

  if (existingAgent?.status === 'killed') {
    return NextResponse.json({ allowed: false, reason: 'Agent has been killed' }, { status: 403 });
  }

  if (existingAgent?.status === 'paused') {
    return NextResponse.json({ allowed: false, reason: 'Agent is paused' }, { status: 403 });
  }

  let agentId: string;

  if (!existingAgent) {
    const { data: newAgent, error: agentErr } = await supabase
      .from('agents')
      .insert({ org_id: auth.orgId, name: agent, status: 'active' })
      .select('id')
      .single();

    if (agentErr || !newAgent) {
      return NextResponse.json({ error: 'Failed to create agent', detail: (agentErr || new Error('unknown')).message }, { status: 500 });
    }
    agentId = newAgent.id;
  } else {
    agentId = existingAgent.id;
    // Update last active timestamp
    await supabase
      .from('agents')
      .update({
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId);
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
      }

      // Fire budget warning webhook
      if (newStatus === 'warning' && budget.status === 'ok') {
        fireWebhooks(auth.orgId, 'budget.warning', {
          agent, period: budget.period, current_actions: newActions, current_cost_cents: newCost,
          max_actions: budget.max_actions, max_cost_cents: budget.max_cost_cents,
        }).catch(() => {});
      }
    }
  }

  // Fire action logged webhook (non-blocking)
  fireWebhooks(auth.orgId, 'action.logged', {
    id: actionLog?.id, agent, service, action, status, cost_cents, duration_ms,
  }).catch(() => {});

  return NextResponse.json({ logged: true, id: actionLog?.id });
}
