import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeString } from '@/lib/validate';
import { POLICY_TEMPLATES, getTemplate } from '@/lib/policy-templates';
import { invalidatePolicyCache } from '@/lib/policies';
import { logAudit } from '@/lib/audit';

// GET /api/v1/policies/templates — List all available templates
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const category = sanitizeString(url.searchParams.get('category') ?? undefined);

  const templates = category
    ? POLICY_TEMPLATES.filter(t => t.category === category)
    : POLICY_TEMPLATES;

  return NextResponse.json({ templates });
}

// POST /api/v1/policies/templates — Apply a template (creates policies)
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

  const templateId = sanitizeString(body.template_id);
  const agentName = sanitizeString(body.agent_name) || null;

  if (!templateId) {
    return NextResponse.json({ error: 'Missing required field: template_id' }, { status: 400 });
  }

  const template = getTemplate(templateId);
  if (!template) {
    return NextResponse.json({ error: `Unknown template: ${templateId}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Insert all policies from the template
  const rows = template.policies.map(p => ({
    org_id: auth.orgId,
    agent_name: agentName,
    rule_type: p.rule_type,
    rule_config: p.rule_config,
    enabled: true,
    priority: p.priority,
  }));

  const { data, error } = await supabase
    .from('policies')
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: 'Failed to apply template', detail: error.message }, { status: 500 });
  }

  invalidatePolicyCache(auth.orgId);

  logAudit({
    orgId: auth.orgId,
    action: 'policy_template.applied',
    resourceType: 'policy_template',
    resourceId: templateId,
    details: { template_name: template.name, agent_name: agentName, policies_created: data?.length || 0 },
  });

  return NextResponse.json({
    applied: true,
    template: { id: template.id, name: template.name },
    policiesCreated: data?.length || 0,
    policies: data || [],
  }, { status: 201 });
}
