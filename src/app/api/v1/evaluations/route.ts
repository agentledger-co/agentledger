import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeString } from '@/lib/validate';

// Flatten the joined action_logs.agent_name into a top-level field
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenAgentName(evaluations: any[] | null): any[] {
  if (!evaluations) return [];
  return evaluations.map(e => ({
    ...e,
    agent_name: e.action_logs?.agent_name ?? null,
    action_logs: undefined,
  }));
}

// POST /api/v1/evaluations - Create an evaluation
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

  const action_id = sanitizeString(body.action_id, 200);
  const score = typeof body.score === 'number' ? Math.floor(body.score) : NaN;
  const label = sanitizeString(body.label ?? undefined);
  const feedback = sanitizeString(body.feedback ?? undefined, 2000);
  const evaluated_by = sanitizeString(body.evaluated_by ?? undefined);

  if (!action_id) {
    return NextResponse.json({ error: 'Missing required field: action_id' }, { status: 400 });
  }

  if (isNaN(score) || score < 0 || score > 100) {
    return NextResponse.json({ error: 'score must be an integer between 0 and 100' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Validate that action_id exists and belongs to this org
  const { data: actionLog, error: actionErr } = await supabase
    .from('action_logs')
    .select('id')
    .eq('id', action_id)
    .eq('org_id', auth.orgId)
    .single();

  if (actionErr || !actionLog) {
    return NextResponse.json({ error: 'action_id not found or does not belong to your organization' }, { status: 404 });
  }

  const { data: evaluation, error: insertErr } = await supabase
    .from('evaluations')
    .insert({
      org_id: auth.orgId,
      action_id,
      score,
      label,
      feedback,
      evaluated_by,
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: 'Failed to create evaluation', detail: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(evaluation, { status: 201 });
}

// GET /api/v1/evaluations - List evaluations
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(req.url);

  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50') || 50, 1), 200);
  const agent = sanitizeString(url.searchParams.get('agent') ?? undefined);
  const label = sanitizeString(url.searchParams.get('label') ?? undefined);
  const from = sanitizeString(url.searchParams.get('from') ?? undefined);
  const to = sanitizeString(url.searchParams.get('to') ?? undefined);

  // Validate ISO date params
  if (from && isNaN(Date.parse(from))) {
    return NextResponse.json({ error: 'Invalid "from" date. Must be ISO 8601 format.' }, { status: 400 });
  }
  if (to && isNaN(Date.parse(to))) {
    return NextResponse.json({ error: 'Invalid "to" date. Must be ISO 8601 format.' }, { status: 400 });
  }

  // If filtering by agent, we need to join through action_logs
  if (agent) {
    // Get action IDs for this agent first
    const { data: actionIds } = await supabase
      .from('action_logs')
      .select('id')
      .eq('org_id', auth.orgId)
      .eq('agent_name', agent);

    if (!actionIds || actionIds.length === 0) {
      return NextResponse.json({ evaluations: [] });
    }

    const ids = actionIds.map((a) => a.id);

    let query = supabase
      .from('evaluations')
      .select('*, action_logs(agent_name)')
      .eq('org_id', auth.orgId)
      .in('action_id', ids);

    if (label) query = query.eq('label', label);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data: evaluations, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch evaluations', detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ evaluations: flattenAgentName(evaluations) });
  }

  // No agent filter — direct query
  let query = supabase
    .from('evaluations')
    .select('*, action_logs(agent_name)')
    .eq('org_id', auth.orgId);

  if (label) query = query.eq('label', label);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  query = query.order('created_at', { ascending: false }).limit(limit);

  const { data: evaluations, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch evaluations', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ evaluations: flattenAgentName(evaluations) });
}
