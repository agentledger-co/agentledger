import { createServiceClient } from './supabase';

export async function logAudit(params: {
  orgId: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('audit_logs').insert({
      org_id: params.orgId,
      user_id: params.userId,
      user_email: params.userEmail,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      details: params.details || {},
    });
  } catch (err) {
    // Non-blocking — don't fail the main request, but log for observability
    console.error('[audit] Failed to write audit log:', err);
  }
}
