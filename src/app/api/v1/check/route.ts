import { NextRequest, NextResponse } from 'next/server';
import { sanitizeString } from '@/lib/validate';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const agent = sanitizeString(body.agent);

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

  return NextResponse.json({
    allowed: true,
    remainingBudget: {},
  });
}
