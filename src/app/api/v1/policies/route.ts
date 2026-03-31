import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeString, sanitizePositiveInt } from '@/lib/validate';
import { invalidatePolicyCache } from '@/lib/policies';
import { logAudit } from '@/lib/audit';

const VALID_RULE_TYPES = [
  'rate_limit',
  'service_allowlist',
  'service_blocklist',
  'cost_limit_per_action',
  'payload_regex_block',
  'require_approval',
] as const;

type RuleType = (typeof VALID_RULE_TYPES)[number];

/**
 * Validate rule_config shape for a given rule_type.
 */
function validateRuleConfig(ruleType: RuleType, config: unknown): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return 'rule_config must be a JSON object';
  }

  const cfg = config as Record<string, unknown>;

  switch (ruleType) {
    case 'rate_limit': {
      if (typeof cfg.max_actions !== 'number' || cfg.max_actions <= 0) {
        return 'rate_limit requires rule_config.max_actions (positive number)';
      }
      if (cfg.window_seconds !== undefined && (typeof cfg.window_seconds !== 'number' || cfg.window_seconds <= 0)) {
        return 'rate_limit rule_config.window_seconds must be a positive number';
      }
      return null;
    }
    case 'service_allowlist':
    case 'service_blocklist': {
      if (!Array.isArray(cfg.services) || cfg.services.length === 0) {
        return `${ruleType} requires rule_config.services (non-empty array of strings)`;
      }
      if (!cfg.services.every((s: unknown) => typeof s === 'string')) {
        return `${ruleType} rule_config.services must contain only strings`;
      }
      return null;
    }
    case 'cost_limit_per_action': {
      if (typeof cfg.max_cost_cents !== 'number' || cfg.max_cost_cents <= 0) {
        return 'cost_limit_per_action requires rule_config.max_cost_cents (positive number)';
      }
      return null;
    }
    case 'payload_regex_block': {
      if (!Array.isArray(cfg.patterns) || cfg.patterns.length === 0) {
        return 'payload_regex_block requires rule_config.patterns (non-empty array of strings)';
      }
      if (!cfg.patterns.every((p: unknown) => typeof p === 'string')) {
        return 'payload_regex_block rule_config.patterns must contain only strings';
      }
      // Validate each pattern is a valid regex
      for (const pattern of cfg.patterns) {
        try {
          new RegExp(pattern as string);
        } catch {
          return `Invalid regex pattern: ${pattern}`;
        }
      }
      return null;
    }
    case 'require_approval':
      return null; // No config needed
    default:
      return 'Unknown rule_type';
  }
}

// GET /api/v1/policies - List policies for org
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const url = new URL(req.url);
  const agentName = sanitizeString(url.searchParams.get('agent_name') ?? undefined);

  let query = supabase
    .from('policies')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('priority', { ascending: false });

  if (agentName) {
    query = query.eq('agent_name', agentName);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch policies', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ policies: data || [] });
}

// POST /api/v1/policies - Create a policy
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

  const agentName = sanitizeString(body.agent_name) || null;
  const ruleType = sanitizeString(body.rule_type);
  const ruleConfig = body.rule_config;
  const enabled = body.enabled !== undefined ? Boolean(body.enabled) : true;
  const priority = sanitizePositiveInt(body.priority, 1000);

  if (!ruleType || !VALID_RULE_TYPES.includes(ruleType as RuleType)) {
    return NextResponse.json({
      error: `Invalid rule_type. Must be one of: ${VALID_RULE_TYPES.join(', ')}`,
    }, { status: 400 });
  }

  const configError = validateRuleConfig(ruleType as RuleType, ruleConfig);
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('policies')
    .insert({
      org_id: auth.orgId,
      agent_name: agentName,
      rule_type: ruleType,
      rule_config: ruleConfig,
      enabled,
      priority,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create policy', detail: error.message }, { status: 500 });
  }

  invalidatePolicyCache(auth.orgId);

  logAudit({
    orgId: auth.orgId,
    action: 'policy.created',
    resourceType: 'policy',
    resourceId: data.id,
    details: { rule_type: ruleType, agent_name: agentName },
  });

  return NextResponse.json({ policy: data }, { status: 201 });
}

// PATCH /api/v1/policies - Update a policy by id
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
  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  // Build partial update
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.enabled !== undefined) {
    updates.enabled = Boolean(body.enabled);
  }

  if (body.priority !== undefined) {
    updates.priority = sanitizePositiveInt(body.priority, 1000);
  }

  if (body.agent_name !== undefined) {
    updates.agent_name = sanitizeString(body.agent_name) || null;
  }

  if (body.rule_config !== undefined) {
    // If rule_config is being updated, we need to validate it against the rule_type
    // Fetch the existing policy to get rule_type if not provided
    let ruleType = sanitizeString(body.rule_type);

    if (!ruleType) {
      const supabase = createServiceClient();
      const { data: existing } = await supabase
        .from('policies')
        .select('rule_type')
        .eq('id', id)
        .eq('org_id', auth.orgId)
        .single();

      if (!existing) {
        return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
      }
      ruleType = existing.rule_type;
    }

    const configError = validateRuleConfig(ruleType as RuleType, body.rule_config);
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 400 });
    }

    updates.rule_config = body.rule_config;
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('policies')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update policy', detail: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
  }

  invalidatePolicyCache(auth.orgId);

  logAudit({
    orgId: auth.orgId,
    action: 'policy.updated',
    resourceType: 'policy',
    resourceId: id,
    details: { updates: Object.keys(updates) },
  });

  return NextResponse.json({ policy: data });
}

// DELETE /api/v1/policies - Delete a policy by id
export async function DELETE(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = sanitizeString(url.searchParams.get('id') ?? undefined);

  if (!id) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error, count } = await supabase
    .from('policies')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete policy', detail: error.message }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
  }

  invalidatePolicyCache(auth.orgId);

  logAudit({
    orgId: auth.orgId,
    action: 'policy.deleted',
    resourceType: 'policy',
    resourceId: id,
  });

  return NextResponse.json({ deleted: true });
}
