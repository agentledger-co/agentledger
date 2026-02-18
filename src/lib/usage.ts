import { createServiceClient } from './supabase';

// ==================== PLAN DEFINITIONS ====================
export interface PlanLimits {
  name: string;
  actionsPerMonth: number;
  maxAgents: number;
  retentionDays: number;
  webhooksAllowed: boolean;
  maxWebhooks: number;
  maxApiKeys: number;
  ratePerMinute: number; // Max actions per minute (burst protection)
}

export const PLANS: Record<string, PlanLimits> = {
  free: {
    name: 'Free',
    actionsPerMonth: 1_000,
    maxAgents: 2,
    retentionDays: 1, // 24 hours
    webhooksAllowed: false,
    maxWebhooks: 0,
    maxApiKeys: 2,
    ratePerMinute: 30,
  },
  pro: {
    name: 'Pro',
    actionsPerMonth: 50_000,
    maxAgents: 100,
    retentionDays: 90,
    webhooksAllowed: true,
    maxWebhooks: 10,
    maxApiKeys: 5,
    ratePerMinute: 200,
  },
  team: {
    name: 'Team',
    actionsPerMonth: 500_000,
    maxAgents: 1000,
    retentionDays: 365,
    webhooksAllowed: true,
    maxWebhooks: 50,
    maxApiKeys: 10,
    ratePerMinute: 1000,
  },
};

// ==================== USAGE CHECK ====================
export interface UsageResult {
  allowed: boolean;
  reason?: string;
  usage: {
    actionsThisMonth: number;
    actionsLimit: number;
    percentUsed: number;
    agentCount: number;
    agentLimit: number;
  };
  plan: string;
}

/**
 * Check if an org is within its usage limits.
 * Returns usage stats and whether the action should be allowed.
 */
export async function checkUsageLimits(orgId: string): Promise<UsageResult> {
  const supabase = createServiceClient();

  // Get org's plan (default: free)
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single();

  const planKey = (org?.plan as string) || 'free';
  const plan = PLANS[planKey] || PLANS.free;

  // Get actions count this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count: actionsThisMonth } = await supabase
    .from('action_logs')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', monthStart.toISOString());

  const actionCount = actionsThisMonth || 0;
  const percentUsed = (actionCount / plan.actionsPerMonth) * 100;

  // Get agent count
  const { count: agentCount } = await supabase
    .from('agents')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .neq('status', 'killed');

  const agents = agentCount || 0;

  // Check monthly limit
  if (actionCount >= plan.actionsPerMonth) {
    return {
      allowed: false,
      reason: `Monthly action limit reached (${plan.actionsPerMonth.toLocaleString()} actions on ${plan.name} plan). Upgrade for more.`,
      usage: {
        actionsThisMonth: actionCount,
        actionsLimit: plan.actionsPerMonth,
        percentUsed,
        agentCount: agents,
        agentLimit: plan.maxAgents,
      },
      plan: planKey,
    };
  }

  // Check agent limit (soft limit - don't block, just warn)
  if (agents > plan.maxAgents) {
    // Still allow but could be flagged
  }

  return {
    allowed: true,
    usage: {
      actionsThisMonth: actionCount,
      actionsLimit: plan.actionsPerMonth,
      percentUsed,
      agentCount: agents,
      agentLimit: plan.maxAgents,
    },
    plan: planKey,
  };
}

// ==================== RATE LIMITING (IN-MEMORY) ====================
// Simple sliding window rate limiter. Resets on server restart.
// For production scale, use Redis or Upstash.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(orgId: string, planKey: string = 'free'): { allowed: boolean; retryAfter?: number } {
  const plan = PLANS[planKey] || PLANS.free;
  const now = Date.now();
  const windowMs = 60_000; // 1 minute window

  const entry = rateLimitMap.get(orgId);

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    rateLimitMap.set(orgId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= plan.ratePerMinute) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

// Cleanup old entries periodically (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > 120_000) { // 2 minutes old
      rateLimitMap.delete(key);
    }
  }
}, 60_000);

// ==================== USAGE STATS ENDPOINT HELPER ====================
export async function getOrgUsageStats(orgId: string) {
  const supabase = createServiceClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    { count: monthActions },
    { count: weekActions },
    { count: todayActions },
    { count: agentCount },
    { count: webhookCount },
    { count: keyCount },
    { data: org },
  ] = await Promise.all([
    supabase.from('action_logs').select('*', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', monthStart.toISOString()),
    supabase.from('action_logs').select('*', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', weekAgo.toISOString()),
    supabase.from('action_logs').select('*', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', yesterday.toISOString()),
    supabase.from('agents').select('*', { count: 'exact', head: true }).eq('org_id', orgId).neq('status', 'killed'),
    supabase.from('webhooks').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('active', true),
    supabase.from('api_keys').select('*', { count: 'exact', head: true }).eq('org_id', orgId).is('revoked_at', null),
    supabase.from('organizations').select('plan').eq('id', orgId).single(),
  ]);

  const planKey = (org?.plan as string) || 'free';
  const plan = PLANS[planKey] || PLANS.free;

  return {
    plan: planKey,
    limits: plan,
    usage: {
      actionsThisMonth: monthActions || 0,
      actionsThisWeek: weekActions || 0,
      actionsToday: todayActions || 0,
      agents: agentCount || 0,
      activeWebhooks: webhookCount || 0,
      activeApiKeys: keyCount || 0,
    },
    percentages: {
      actions: ((monthActions || 0) / plan.actionsPerMonth) * 100,
      agents: ((agentCount || 0) / plan.maxAgents) * 100,
    },
  };
}
