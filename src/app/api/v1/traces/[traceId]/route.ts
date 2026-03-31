import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeString } from '@/lib/validate';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { traceId: rawTraceId } = await params;
  const traceId = sanitizeString(rawTraceId, 200);
  if (!traceId) {
    return NextResponse.json({ error: 'Invalid trace ID' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: actions, error } = await supabase
    .from('action_logs')
    .select('*')
    .eq('org_id', auth.orgId)
    .eq('trace_id', traceId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch trace', detail: error.message }, { status: 500 });
  }

  if (!actions || actions.length === 0) {
    return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
  }

  const firstAction = actions[0];
  const lastAction = actions[actions.length - 1];
  const traceStart = new Date(firstAction.created_at as string).getTime();
  const totalCost = actions.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.estimated_cost_cents as number) || 0), 0);
  const totalDuration = actions.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.duration_ms as number) || 0), 0);
  const services = [...new Set(actions.map((a: Record<string, unknown>) => a.service as string))];
  const hasErrors = actions.some((a: Record<string, unknown>) => a.status === 'error');

  // Compute offsetMs for each action (milliseconds from trace start)
  const actionsWithOffset = actions.map((a: Record<string, unknown>) => ({
    ...a,
    offsetMs: new Date(a.created_at as string).getTime() - traceStart,
  }));

  // Compute wall-clock span of the trace (last action end - first action start)
  const lastEnd = new Date(lastAction.created_at as string).getTime() + ((lastAction.duration_ms as number) || 0);
  const wallDuration = Math.max(lastEnd - traceStart, totalDuration);

  // Compute parallel groups: group overlapping [start, start+duration] ranges
  // Two actions overlap if action B starts before action A ends
  const intervals = actionsWithOffset.map((a, idx) => ({
    idx,
    start: a.offsetMs,
    end: a.offsetMs + ((a.duration_ms as number) || 0),
  }));

  const parallelGroups: number[][] = [];
  const visited = new Set<number>();

  for (let i = 0; i < intervals.length; i++) {
    if (visited.has(i)) continue;
    const group = [i];
    visited.add(i);
    let groupEnd = intervals[i].end;

    for (let j = i + 1; j < intervals.length; j++) {
      if (visited.has(j)) continue;
      // Action j overlaps with the group if it starts before the group ends
      if (intervals[j].start < groupEnd) {
        group.push(j);
        visited.add(j);
        groupEnd = Math.max(groupEnd, intervals[j].end);
      }
    }

    // Only include groups with 2+ actions (actual parallelism)
    if (group.length > 1) {
      parallelGroups.push(group);
    }
  }

  return NextResponse.json({
    traceId,
    actions: actionsWithOffset,
    summary: {
      totalDuration,
      wallDuration,
      totalCost,
      actionCount: actions.length,
      firstAction: firstAction.created_at,
      lastAction: lastAction.created_at,
      services,
      hasErrors,
      parallelGroups,
    },
  });
}
