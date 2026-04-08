import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { fireWebhooks } from '@/lib/webhooks';
import { sendNotifications } from '@/lib/notifications';
import { checkUsageLimits, checkRateLimit } from '@/lib/usage';
import { reportError } from '@/lib/errors';
import { sanitizeString, sanitizeMetadata, sanitizePayload, sanitizePositiveInt, validateStatus } from '@/lib/validate';
import { evaluatePolicies } from '@/lib/policies';
import { checkAnomalies } from '@/lib/anomalies';
import { fireRollbacks } from '@/lib/rollbacks';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50') || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0') || 0, 0);

  // Filter params
  const agent = sanitizeString(url.searchParams.get('agent') ?? undefined);
  const service = sanitizeString(url.searchParams.get('service') ?? undefined);
  const statusParam = url.searchParams.get('status');
  const from = sanitizeString(url.searchParams.get('from') ?? undefined);
  const to = sanitizeString(url.searchParams.get('to') ?? undefined);
  const traceId = sanitizeString(url.searchParams.get('trace_id') ?? undefined);
  const search = sanitizeString(url.searchParams.get('search') ?? undefined);
  const cursorParam = url.searchParams.get('cursor');

  // Validate status if provided
  if (statusParam !== null) {
    const validStatuses = ['success', 'error', 'blocked'];
    if (!validStatuses.includes(statusParam)) {
      return NextResponse.json({ error: 'Invalid status. Must be one of: success, error, blocked' }, { status: 400 });
    }
  }

  // Validate ISO date params
  if (from && isNaN(Date.parse(from))) {
    return NextResponse.json({ error: 'Invalid "from" date. Must be ISO 8601 format.' }, { status: 400 });
  }
  if (to && isNaN(Date.parse(to))) {
    return NextResponse.json({ error: 'Invalid "to" date. Must be ISO 8601 format.' }, { status: 400 });
  }

  // Decode cursor for cursor-based pagination
  let cursorCreatedAt: string | null = null;
  let cursorId: string | null = null;
  if (cursorParam) {
    try {
      const decoded = JSON.parse(Buffer.from(cursorParam, 'base64').toString('utf-8'));
      cursorCreatedAt = decoded.created_at || null;
      cursorId = decoded.id || null;
      // Validate cursor values to prevent injection via .or() filter
      if (cursorCreatedAt && isNaN(Date.parse(cursorCreatedAt))) {
        return NextResponse.json({ error: 'Invalid cursor: bad date' }, { status: 400 });
      }
      if (cursorId && !/^[0-9a-f-]{36}$/i.test(cursorId)) {
        return NextResponse.json({ error: 'Invalid cursor: bad id' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
  }

  // Build query
  let query = supabase
    .from('action_logs')
    .select('*', { count: 'exact' })
    .eq('org_id', auth.orgId);

  const environment = sanitizeString(url.searchParams.get('environment') ?? undefined);

  if (environment) query = query.eq('environment', environment);
  if (agent) query = query.eq('agent_name', agent);
  if (service) query = query.eq('service', service);
  if (statusParam) query = query.eq('status', statusParam);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  if (traceId) query = query.eq('trace_id', traceId);
  if (search) query = query.ilike('action', `%${search}%`);

  // Apply cursor-based pagination if cursor provided, otherwise use offset
  if (cursorCreatedAt && cursorId) {
    // Fetch rows strictly older than the cursor (or same timestamp but with a different id)
    query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`);
  }

  query = query.order('created_at', { ascending: false }).order('id', { ascending: false });

  // Use offset only when no cursor is provided
  if (!cursorParam) {
    query = query.range(offset, offset + limit - 1);
  } else {
    query = query.limit(limit);
  }

  const { data: actions, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch actions', detail: error.message }, { status: 500 });
  }

  const result: Record<string, unknown> = { actions: actions || [], total: count || 0 };

  // Generate nextCursor if there are more results
  if (actions && actions.length === limit) {
    const last = actions[actions.length - 1];
    const nextCursor = Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id })).toString('base64');
    result.nextCursor = nextCursor;
  }

  return NextResponse.json(result);
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
  const environment = sanitizeString(body.environment) || 'production';
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
    .eq('environment', environment)
    .single();

  if (existingAgent) {
    agentId = existingAgent.id;
    agentStatus = existingAgent.status;
    // Update timestamps (non-blocking)
    Promise.resolve(supabase.from('agents').update({ last_active_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', agentId)).catch(err => console.error('[actions] background task failed:', err));
  } else {
    // Try to create — catch unique constraint race condition
    const { data: newAgent, error: insertErr } = await supabase
      .from('agents')
      .insert({ org_id: auth.orgId, name: agent, environment, status: 'active', last_active_at: new Date().toISOString() })
      .select('id, status')
      .single();

    if (insertErr) {
      // Race condition — another request created it first. Re-fetch.
      const { data: raceAgent } = await supabase
        .from('agents')
        .select('id, status')
        .eq('org_id', auth.orgId)
        .eq('name', agent)
        .eq('environment', environment)
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

  // Policy engine checks
  const policyResult = await evaluatePolicies(auth.orgId, agent, service, action, cost_cents, input, environment);
  if (!policyResult.allowed) {
    if (policyResult.requiresApproval) {
      return NextResponse.json(
        { blocked: true, requiresApproval: true, approvalId: policyResult.approvalId, reason: 'Approval required by policy', policyId: policyResult.policyId },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { blocked: true, reason: policyResult.blockReason, policyId: policyResult.policyId },
      { status: 403 },
    );
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
      environment,
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
        }).catch(err => console.error('[actions] background task failed:', err));

        fireWebhooks(auth.orgId, 'alert.created', {
          agent, alert_type: 'budget_exceeded', severity: 'critical',
          message: `Budget for ${agent} (${budget.period}) has been exceeded`,
        }).catch(err => console.error('[actions] background task failed:', err));

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
        }).catch(err => console.error('[actions] background task failed:', err));

        // Fire rollback hooks (non-blocking)
        fireRollbacks(auth.orgId, 'budget_exceeded', agent, trace_id || undefined).catch(err => console.error('[actions] background task failed:', err));
      }

      // Fire budget warning webhook
      if (newStatus === 'warning' && budget.status === 'ok') {
        fireWebhooks(auth.orgId, 'budget.warning', {
          agent, period: budget.period, current_actions: newActions, current_cost_cents: newCost,
          max_actions: budget.max_actions, max_cost_cents: budget.max_cost_cents,
        }).catch(err => console.error('[actions] background task failed:', err));

        sendNotifications(auth.orgId, {
          event: 'budget.warning',
          agentName: agent,
          message: `Agent *${agent}* is approaching its ${budget.period} budget (75%+).`,
          details: {
            period: budget.period,
            actions: `${newActions}/${budget.max_actions || '∞'}`,
            cost: `$${(newCost / 100).toFixed(2)}/${budget.max_cost_cents ? '$' + (budget.max_cost_cents / 100).toFixed(2) : '∞'}`,
          },
        }).catch(err => console.error('[actions] background task failed:', err));
      }
    }
  }

  // Statistical anomaly detection (non-blocking)
  checkAnomalies(auth.orgId, agent, {
    service,
    estimated_cost_cents: cost_cents,
    duration_ms,
    status,
  }).catch(err => console.error('[actions] background task failed:', err));

  // Fire action logged webhook (non-blocking)
  fireWebhooks(auth.orgId, 'action.logged', {
    id: actionLog?.id, agent, service, action, status, cost_cents, duration_ms,
  }).catch(err => console.error('[actions] background task failed:', err));

  // Send notification on errors
  if (status === 'error') {
    sendNotifications(auth.orgId, {
      event: 'action.error',
      agentName: agent,
      message: `Action \`${action}\` on \`${service}\` failed.`,
      details: { service, action, duration: `${duration_ms}ms` },
    }).catch(err => console.error('[actions] background task failed:', err));
  }

  return NextResponse.json({ logged: true, id: actionLog?.id });
}
