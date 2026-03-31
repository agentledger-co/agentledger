import { createServiceClient } from './supabase';

export interface PolicyResult {
  allowed: boolean;
  blockReason?: string;
  requiresApproval?: boolean;
  policyId?: string;
  approvalId?: string;
}

interface Policy {
  id: string;
  org_id: string;
  agent_name: string | null;
  rule_type: string;
  rule_config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
}

interface CacheEntry {
  policies: Policy[];
  timestamp: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
const policyCache = new Map<string, CacheEntry>();

/**
 * Fetch enabled policies for an org, with 30-second caching.
 */
async function fetchPolicies(orgId: string): Promise<Policy[]> {
  const cached = policyCache.get(orgId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.policies;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .eq('org_id', orgId)
    .eq('enabled', true)
    .order('priority', { ascending: false });

  if (error || !data) {
    return [];
  }

  const policies = data as Policy[];
  policyCache.set(orgId, { policies, timestamp: Date.now() });
  return policies;
}

/**
 * Evaluate all policies for a given org/agent/service/action.
 * Returns the first block or approval-required result, or {allowed: true}.
 */
export async function evaluatePolicies(
  orgId: string,
  agent: string,
  service: string,
  action: string,
  costCents?: number,
  input?: unknown,
  environment?: string,
): Promise<PolicyResult> {
  const allPolicies = await fetchPolicies(orgId);

  // Filter to policies that apply: agent_name matches or is NULL (applies to all)
  const applicable = allPolicies.filter(
    (p) => p.agent_name === null || p.agent_name === agent,
  );

  if (applicable.length === 0) {
    return { allowed: true };
  }

  for (const policy of applicable) {
    const result = await evaluatePolicy(policy, orgId, agent, service, action, costCents, input, environment);
    if (!result.allowed) {
      return result;
    }
  }

  return { allowed: true };
}

async function evaluatePolicy(
  policy: Policy,
  orgId: string,
  agent: string,
  service: string,
  action: string,
  costCents?: number,
  input?: unknown,
  environment?: string,
): Promise<PolicyResult> {
  switch (policy.rule_type) {
    case 'rate_limit':
      return evaluateRateLimit(policy, orgId, agent);
    case 'service_allowlist':
      return evaluateServiceAllowlist(policy, service);
    case 'service_blocklist':
      return evaluateServiceBlocklist(policy, service);
    case 'cost_limit_per_action':
      return evaluateCostLimit(policy, costCents);
    case 'payload_regex_block':
      return evaluatePayloadRegex(policy, input);
    case 'require_approval':
      return createApprovalRequest(policy, orgId, agent, service, action, input, environment);
    default:
      return { allowed: true };
  }
}

async function createApprovalRequest(
  policy: Policy,
  orgId: string,
  agent: string,
  service: string,
  action: string,
  input?: unknown,
  environment?: string,
): Promise<PolicyResult> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      org_id: orgId,
      agent_name: agent,
      service,
      action,
      input: input ?? null,
      policy_id: policy.id,
      environment: environment || 'production',
    })
    .select('id')
    .single();

  if (error || !data) {
    // If we can't create the approval row, still block but without an approvalId
    return { allowed: false, requiresApproval: true, policyId: policy.id };
  }

  return { allowed: false, requiresApproval: true, policyId: policy.id, approvalId: data.id };
}

async function evaluateRateLimit(
  policy: Policy,
  orgId: string,
  agent: string,
): Promise<PolicyResult> {
  const config = policy.rule_config;
  const maxActions = typeof config.max_actions === 'number' ? config.max_actions : 0;
  const windowSeconds = typeof config.window_seconds === 'number' ? config.window_seconds : 60;

  if (maxActions <= 0) return { allowed: true };

  const supabase = createServiceClient();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error } = await supabase
    .from('action_logs')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('agent_name', agent)
    .gte('created_at', since);

  if (error) return { allowed: true }; // fail open on DB errors

  if ((count ?? 0) >= maxActions) {
    return {
      allowed: false,
      blockReason: `Rate limit exceeded: ${count}/${maxActions} actions in ${windowSeconds}s window`,
      policyId: policy.id,
    };
  }

  return { allowed: true };
}

function evaluateServiceAllowlist(
  policy: Policy,
  service: string,
): PolicyResult {
  const services = Array.isArray(policy.rule_config.services) ? policy.rule_config.services : [];
  if (services.length === 0) return { allowed: true };

  if (!services.includes(service)) {
    return {
      allowed: false,
      blockReason: `Service '${service}' is not in the allowlist`,
      policyId: policy.id,
    };
  }
  return { allowed: true };
}

function evaluateServiceBlocklist(
  policy: Policy,
  service: string,
): PolicyResult {
  const services = Array.isArray(policy.rule_config.services) ? policy.rule_config.services : [];

  if (services.includes(service)) {
    return {
      allowed: false,
      blockReason: `Service '${service}' is blocked by policy`,
      policyId: policy.id,
    };
  }
  return { allowed: true };
}

function evaluateCostLimit(
  policy: Policy,
  costCents?: number,
): PolicyResult {
  const maxCostCents = typeof policy.rule_config.max_cost_cents === 'number' ? policy.rule_config.max_cost_cents : 0;
  if (maxCostCents <= 0) return { allowed: true };

  if (costCents !== undefined && costCents > maxCostCents) {
    return {
      allowed: false,
      blockReason: `Action cost (${costCents}c) exceeds per-action limit (${maxCostCents}c)`,
      policyId: policy.id,
    };
  }
  return { allowed: true };
}

function evaluatePayloadRegex(
  policy: Policy,
  input?: unknown,
): PolicyResult {
  const patterns = Array.isArray(policy.rule_config.patterns) ? policy.rule_config.patterns : [];
  if (patterns.length === 0 || input === undefined || input === null) {
    return { allowed: true };
  }

  const inputStr = JSON.stringify(input);

  for (const pattern of patterns) {
    if (typeof pattern !== 'string') continue;
    try {
      const regex = new RegExp(pattern);
      if (regex.test(inputStr)) {
        return {
          allowed: false,
          blockReason: `Input matches blocked pattern`,
          policyId: policy.id,
        };
      }
    } catch {
      // Invalid regex pattern — skip it
      continue;
    }
  }

  return { allowed: true };
}

/**
 * Clear the policy cache for an org (call after create/update/delete).
 */
export function invalidatePolicyCache(orgId: string): void {
  policyCache.delete(orgId);
}
