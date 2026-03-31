import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeString } from '@/lib/validate';

/**
 * GET /api/v1/approvals - List approval requests
 * Query params: status (pending/approved/denied/expired), limit (default 50)
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusFilter = sanitizeString(url.searchParams.get('status') ?? undefined);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50') || 50, 1), 200);

  if (statusFilter && !['pending', 'approved', 'denied', 'expired'].includes(statusFilter)) {
    return NextResponse.json({ error: 'Invalid status. Must be one of: pending, approved, denied, expired' }, { status: 400 });
  }

  const supabase = createServiceClient();

  let query = supabase
    .from('approval_requests')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('requested_at', { ascending: false })
    .limit(limit);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch approvals', detail: error.message }, { status: 500 });
  }

  // Mark any pending approvals that have expired
  const approvals = (data || []).map((a) => {
    if (a.status === 'pending' && new Date(a.expires_at) < new Date()) {
      return { ...a, status: 'expired' };
    }
    return a;
  });

  return NextResponse.json({ approvals });
}

/**
 * PATCH /api/v1/approvals - Approve or deny a request
 * Body: { id, decision: 'approved' | 'denied', decided_by? }
 */
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

  const id = sanitizeString(body.id);
  const decision = sanitizeString(body.decision);
  const decidedBy = sanitizeString(body.decided_by) || null;

  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  if (!decision || !['approved', 'denied'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid decision. Must be "approved" or "denied"' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch the approval request
  const { data: existing, error: fetchErr } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
  }

  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `Approval request already ${existing.status}` }, { status: 409 });
  }

  // Check if expired
  if (new Date(existing.expires_at) < new Date()) {
    // Auto-expire it
    await supabase
      .from('approval_requests')
      .update({ status: 'expired' })
      .eq('id', id);
    return NextResponse.json({ error: 'Approval request has expired' }, { status: 410 });
  }

  // Update the approval request
  const { data: updated, error: updateErr } = await supabase
    .from('approval_requests')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to update approval', detail: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ approval: updated });
}
