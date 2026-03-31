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
  const totalCost = actions.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.estimated_cost_cents as number) || 0), 0);
  const totalDuration = actions.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.duration_ms as number) || 0), 0);
  const services = [...new Set(actions.map((a: Record<string, unknown>) => a.service as string))];
  const hasErrors = actions.some((a: Record<string, unknown>) => a.status === 'error');

  return NextResponse.json({
    traceId,
    actions,
    summary: {
      totalDuration,
      totalCost,
      actionCount: actions.length,
      firstAction: firstAction.created_at,
      lastAction: lastAction.created_at,
      services,
      hasErrors,
    },
  });
}
