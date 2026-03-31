import { NextRequest, NextResponse } from 'next/server';
import { sanitizeString } from '@/lib/validate';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { evaluatePolicies } from '@/lib/policies';

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
  const environment = sanitizeString(body.environment) || 'production';

  if (!agent) {
    return NextResponse.json({ error: 'Missing required field: agent' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check agent status
  const { data: agentData } = await supabase
    .from('agents')
    .select('id, status')
    .eq('org_id', auth.orgId)
    .eq('name', agent)
    .eq('environment', environment)
    .single();

  if (agentData?.status === 'paused') {
    return NextResponse.json({
      allowed: false,
      blockReason: 'Agent is paused',
    });
  }

  if (agentData?.status === 'killed') {
    return NextResponse.json({
      allowed: false,
      blockReason: 'Agent has been killed',
    });
  }

  // Check budgets
  if (agentData?.id) {
    const { data: budgets } = await supabase
      .from('budgets')
      .select('*')
      .eq('agent_id', agentData.id);

    if (budgets) {
      for (const budget of budgets) {
        const actionsExceeded = budget.max_actions && budget.current_actions >= budget.max_actions;
        const costExceeded = budget.max_cost_cents && budget.current_cost_cents >= budget.max_cost_cents;

        if (actionsExceeded) {
          return NextResponse.json({
            allowed: false,
            blockReason: `${budget.period} action budget exceeded (${budget.current_actions}/${budget.max_actions})`,
            remainingBudget: { actions: 0, costCents: budget.max_cost_cents ? budget.max_cost_cents - budget.current_cost_cents : undefined },
          });
        }

        if (costExceeded) {
          return NextResponse.json({
            allowed: false,
            blockReason: `${budget.period} cost budget exceeded ($${(budget.current_cost_cents / 100).toFixed(2)}/$${(budget.max_cost_cents / 100).toFixed(2)})`,
            remainingBudget: { actions: budget.max_actions ? budget.max_actions - budget.current_actions : undefined, costCents: 0 },
          });
        }
      }
    }
  }

  // Policy engine checks
  const service = sanitizeString(body.service) || '';
  const action = sanitizeString(body.action) || '';
  const policyResult = await evaluatePolicies(auth.orgId, agent, service, action, undefined, undefined, environment);
  if (!policyResult.allowed) {
    if (policyResult.requiresApproval) {
      return NextResponse.json({
        allowed: false,
        requiresApproval: true,
        approvalId: policyResult.approvalId,
        policyId: policyResult.policyId,
      });
    }
    return NextResponse.json({
      allowed: false,
      blockReason: policyResult.blockReason,
      policyId: policyResult.policyId,
    });
  }

  return NextResponse.json({
    allowed: true,
    remainingBudget: {},
  });
}
