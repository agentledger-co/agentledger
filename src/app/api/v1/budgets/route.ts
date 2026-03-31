import { NextRequest, NextResponse } from 'next/server';
import { sanitizeString, sanitizePositiveInt } from '@/lib/validate';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

// GET /api/v1/budgets - List all budgets
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: budgets, error } = await supabase
    .from('budgets')
    .select('*, agents(name)')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch budgets', detail: error.message }, { status: 500 });
  }

  const enriched = (budgets || []).map((b: Record<string, unknown>) => ({
    ...b,
    agent_name: (b.agents as Record<string, unknown> | null)?.name || 'unknown',
    pct_actions: b.max_actions ? (((b.current_actions as number) ?? 0) / (b.max_actions as number)) * 100 : null,
    pct_cost: b.max_cost_cents ? (((b.current_cost_cents as number) ?? 0) / (b.max_cost_cents as number)) * 100 : null,
  }));

  return NextResponse.json({ budgets: enriched });
}

// POST /api/v1/budgets - Create a budget
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
  const agent_name = sanitizeString(body.agent_name);
  const period = sanitizeString(body.period);
  const max_actions = body.max_actions ? sanitizePositiveInt(body.max_actions) : null;
  const max_cost_cents = body.max_cost_cents ? sanitizePositiveInt(body.max_cost_cents) : null;

  if (!agent_name || !period) {
    return NextResponse.json({ error: 'Missing required fields: agent_name, period' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Find agent
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('org_id', auth.orgId)
    .eq('name', agent_name)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const now = new Date();
  const { data: budget, error } = await supabase
    .from('budgets')
    .insert({
      org_id: auth.orgId,
      agent_id: agent.id,
      period,
      max_actions: max_actions || null,
      max_cost_cents: max_cost_cents || null,
      current_actions: 0,
      current_cost_cents: 0,
      status: 'ok',
      period_start: now.toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create budget', detail: error.message }, { status: 500 });
  }

  return NextResponse.json(budget);
}

// DELETE /api/v1/budgets?id=xxx - Delete a budget
export async function DELETE(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing budget id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete budget', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Budget deleted' });
}

// PATCH /api/v1/budgets - Reset a budget
export async function PATCH(req: NextRequest) {
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
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: 'Missing budget id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('budgets')
    .update({
      current_actions: 0,
      current_cost_cents: 0,
      status: 'ok',
      period_start: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to reset budget', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Budget reset' });
}
