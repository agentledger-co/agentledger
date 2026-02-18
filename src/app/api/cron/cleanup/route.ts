import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { PLANS } from '@/lib/usage';

/**
 * Data retention cleanup cron job.
 * 
 * Deletes action_logs and webhook_deliveries older than each org's
 * plan retention period. Run daily via Vercel Cron or external scheduler.
 * 
 * To set up Vercel Cron, add to vercel.json:
 * {
 *   "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }]
 * }
 * 
 * Protected by CRON_SECRET env var to prevent unauthorized access.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (required in production)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results: Record<string, unknown>[] = [];

  // Get all organizations with their plans
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, plan');

  if (!orgs?.length) {
    return NextResponse.json({ message: 'No organizations found', cleaned: 0 });
  }

  let totalDeleted = 0;

  for (const org of orgs) {
    const planKey = (org.plan as string) || 'free';
    const plan = PLANS[planKey] || PLANS.free;
    const cutoff = new Date(Date.now() - plan.retentionDays * 24 * 60 * 60 * 1000);

    // Delete old action logs
    const { count: actionsDeleted } = await supabase
      .from('action_logs')
      .delete({ count: 'exact' })
      .eq('org_id', org.id)
      .lt('created_at', cutoff.toISOString());

    // Delete old webhook deliveries (always 30 days max)
    const webhookCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count: webhooksDeleted } = await supabase
      .from('webhook_deliveries')
      .delete({ count: 'exact' })
      .eq('org_id', org.id)
      .lt('created_at', webhookCutoff.toISOString());

    const deleted = (actionsDeleted || 0) + (webhooksDeleted || 0);
    totalDeleted += deleted;

    if (deleted > 0) {
      results.push({
        org: org.name,
        plan: planKey,
        retentionDays: plan.retentionDays,
        actionsDeleted: actionsDeleted || 0,
        webhooksDeleted: webhooksDeleted || 0,
      });
    }
  }

  return NextResponse.json({
    message: `Cleanup complete. Deleted ${totalDeleted} records across ${results.length} organizations.`,
    totalDeleted,
    details: results,
    timestamp: new Date().toISOString(),
  });
}
