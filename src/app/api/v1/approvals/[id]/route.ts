import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

/**
 * GET /api/v1/approvals/:id - Get a single approval request
 * Used by SDK polling (waitForApproval).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: approval, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .single();

  if (error || !approval) {
    return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
  }

  // If still pending but expired, reflect that in the response
  let effectiveStatus = approval.status;
  if (approval.status === 'pending' && new Date(approval.expires_at) < new Date()) {
    effectiveStatus = 'expired';
    // Auto-expire in DB (non-blocking)
    supabase
      .from('approval_requests')
      .update({ status: 'expired' })
      .eq('id', id)
      .then(() => {});
  }

  return NextResponse.json({
    ...approval,
    status: effectiveStatus,
  });
}
