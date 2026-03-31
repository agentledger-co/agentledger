import { createServiceClient } from './supabase';
import { createHmac } from 'crypto';

/**
 * Fire rollback webhooks for an agent event.
 * Non-blocking — errors are logged to rollback_executions but never thrown.
 */
export async function fireRollbacks(
  orgId: string,
  triggerReason: string, // 'agent_killed' | 'budget_exceeded' | 'manual'
  agentName: string,
  traceId?: string
): Promise<void> {
  const supabase = createServiceClient();

  // Find matching rollback hooks
  let query = supabase
    .from('rollback_hooks')
    .select('*')
    .eq('org_id', orgId)
    .eq('enabled', true);

  const { data: hooks } = await query;

  if (!hooks?.length) return;

  // Filter: agent_name matches OR agent_name IS NULL, same for service
  const matchingHooks = hooks.filter((hook) => {
    if (hook.agent_name && hook.agent_name !== agentName) return false;
    // service/action matching is broad — null means "any"
    return true;
  });

  if (!matchingHooks.length) return;

  // Fetch recent actions as context if traceId provided
  let completedActions: Record<string, unknown>[] = [];
  if (traceId) {
    const { data: actions } = await supabase
      .from('action_logs')
      .select('id, agent_name, service, action, status, estimated_cost_cents, duration_ms, created_at')
      .eq('org_id', orgId)
      .eq('trace_id', traceId)
      .order('created_at', { ascending: false })
      .limit(50);

    completedActions = actions || [];
  }

  // Fire all hooks in parallel
  await Promise.allSettled(
    matchingHooks.map((hook) =>
      deliverRollback(supabase, hook, triggerReason, agentName, traceId, completedActions)
    )
  );
}

async function deliverRollback(
  supabase: ReturnType<typeof createServiceClient>,
  hook: Record<string, unknown>,
  triggerReason: string,
  agentName: string,
  traceId: string | undefined,
  completedActions: Record<string, unknown>[]
): Promise<void> {
  const payload = {
    trigger: triggerReason,
    agent: agentName,
    trace_id: traceId || null,
    completed_actions: completedActions,
    config: hook.rollback_config || {},
  };

  const body = JSON.stringify(payload);

  // Sign with HMAC-SHA256 using hook ID as key material
  const signingKey = `rollback_${hook.id}`;
  const signature = createHmac('sha256', signingKey).update(body).digest('hex');

  let responseStatus: number | null = null;
  let responseBody = '';
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(hook.rollback_webhook_url as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AgentLedger-Rollback-Signature': `sha256=${signature}`,
        'X-AgentLedger-Rollback-Trigger': triggerReason,
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

  // Log execution
  try {
    await supabase.from('rollback_executions').insert({
      rollback_hook_id: hook.id,
      org_id: hook.org_id,
      trigger_reason: triggerReason,
      trace_id: traceId || null,
      actions_context: completedActions,
      response_status: responseStatus,
      response_body: responseBody?.slice(0, 2000),
      success,
    });
  } catch { /* Don't fail if logging fails */ }
}
