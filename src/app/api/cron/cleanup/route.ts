import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { PLANS } from '@/lib/usage';

/**
 * Daily maintenance cron job:
 * 1. Reset expired budget counters (hourly/daily/weekly/monthly)
 * 2. Clean up old data per plan retention
 * 
 * Runs daily at 3am UTC via Vercel Cron.
 * Also accepts x-vercel-cron-signature for Vercel's built-in auth.
 */
export async function GET(req: NextRequest) {
  // Auth: accept either CRON_SECRET or Vercel's built-in cron header
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const vercelCron = req.headers.get('x-vercel-cron-signature');

  const isAuthorized = vercelCron || (cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const results: Record<string, unknown>[] = [];

  // ==================== BUDGET RESETS ====================
  let budgetsReset = 0;

  // Reset hourly budgets (period_start older than 1 hour)
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const { count: hourlyReset } = await supabase
    .from('budgets')
    .update({ current_actions: 0, current_cost_cents: 0, status: 'ok', period_start: now.toISOString(), updated_at: now.toISOString() })
    .eq('period', 'hourly')
    .lt('period_start', hourAgo.toISOString())
    
  budgetsReset += hourlyReset || 0;

  // Reset daily budgets (period_start older than 24 hours)
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { count: dailyReset } = await supabase
    .from('budgets')
    .update({ current_actions: 0, current_cost_cents: 0, status: 'ok', period_start: now.toISOString(), updated_at: now.toISOString() })
    .eq('period', 'daily')
    .lt('period_start', dayAgo.toISOString())
    
  budgetsReset += dailyReset || 0;

  // Reset weekly budgets (period_start older than 7 days)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { count: weeklyReset } = await supabase
    .from('budgets')
    .update({ current_actions: 0, current_cost_cents: 0, status: 'ok', period_start: now.toISOString(), updated_at: now.toISOString() })
    .eq('period', 'weekly')
    .lt('period_start', weekAgo.toISOString())
    
  budgetsReset += weeklyReset || 0;

  // Reset monthly budgets (period_start older than 30 days)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { count: monthlyReset } = await supabase
    .from('budgets')
    .update({ current_actions: 0, current_cost_cents: 0, status: 'ok', period_start: now.toISOString(), updated_at: now.toISOString() })
    .eq('period', 'monthly')
    .lt('period_start', monthAgo.toISOString())
    
  budgetsReset += monthlyReset || 0;

  // ==================== DATA RETENTION CLEANUP ====================
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, plan');

  let totalDeleted = 0;

  if (orgs?.length) {
    for (const org of orgs) {
      const planKey = (org.plan as string) || 'free';
      const plan = PLANS[planKey] || PLANS.free;
      const cutoff = new Date(Date.now() - plan.retentionDays * 24 * 60 * 60 * 1000);

      const { count: actionsDeleted } = await supabase
        .from('action_logs')
        .delete({ count: 'exact' })
        .eq('org_id', org.id)
        .lt('created_at', cutoff.toISOString());

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
          org: org.name, plan: planKey, retentionDays: plan.retentionDays,
          actionsDeleted: actionsDeleted || 0, webhooksDeleted: webhooksDeleted || 0,
        });
      }
    }
  }

  return NextResponse.json({
    message: `Maintenance complete.`,
    budgetsReset,
    dataDeleted: totalDeleted,
    details: results,
    timestamp: now.toISOString(),
  });
}
