import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeString } from '@/lib/validate';
import { logAudit } from '@/lib/audit';

// GET /api/v1/rollback-hooks - List rollback hooks
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: hooks, error } = await supabase
    .from('rollback_hooks')
    .select('*')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch rollback hooks', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ hooks: hooks || [] });
}

// POST /api/v1/rollback-hooks - Create a rollback hook
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

  const rollback_webhook_url = sanitizeString(body.rollback_webhook_url, 2000);
  if (!rollback_webhook_url) {
    return NextResponse.json({ error: 'Missing required field: rollback_webhook_url' }, { status: 400 });
  }

  // Validate URL format
  try {
    new URL(rollback_webhook_url);
  } catch {
    return NextResponse.json({ error: 'Invalid rollback_webhook_url format' }, { status: 400 });
  }

  const agent_name = sanitizeString(body.agent_name ?? undefined) || null;
  const service = sanitizeString(body.service ?? undefined) || null;
  const action = sanitizeString(body.action ?? undefined) || null;
  const rollback_config = typeof body.rollback_config === 'object' && body.rollback_config !== null
    ? body.rollback_config
    : {};
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;

  const supabase = createServiceClient();

  const { data: hook, error } = await supabase
    .from('rollback_hooks')
    .insert({
      org_id: auth.orgId,
      agent_name,
      service,
      action,
      rollback_webhook_url,
      rollback_config,
      enabled,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create rollback hook', detail: error.message }, { status: 500 });
  }

  logAudit({
    orgId: auth.orgId,
    action: 'rollback_hook.created',
    resourceType: 'rollback_hook',
    resourceId: hook.id,
    details: { agent_name: agent_name, service, action },
  });

  return NextResponse.json(hook, { status: 201 });
}

// PATCH /api/v1/rollback-hooks - Update a rollback hook
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

  const id = sanitizeString(body.id, 200);
  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.rollback_webhook_url !== undefined) {
    const url = sanitizeString(body.rollback_webhook_url, 2000);
    if (!url) {
      return NextResponse.json({ error: 'rollback_webhook_url cannot be empty' }, { status: 400 });
    }
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid rollback_webhook_url format' }, { status: 400 });
    }
    updates.rollback_webhook_url = url;
  }
  if (body.agent_name !== undefined) updates.agent_name = sanitizeString(body.agent_name) || null;
  if (body.service !== undefined) updates.service = sanitizeString(body.service) || null;
  if (body.action !== undefined) updates.action = sanitizeString(body.action) || null;
  if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
  if (typeof body.rollback_config === 'object' && body.rollback_config !== null) {
    updates.rollback_config = body.rollback_config;
  }

  const supabase = createServiceClient();

  const { data: hook, error } = await supabase
    .from('rollback_hooks')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update rollback hook', detail: error.message }, { status: 500 });
  }

  logAudit({
    orgId: auth.orgId,
    action: 'rollback_hook.updated',
    resourceType: 'rollback_hook',
    resourceId: id,
    details: { updates: Object.keys(updates) },
  });

  return NextResponse.json(hook);
}

// DELETE /api/v1/rollback-hooks?id=... - Delete a rollback hook
export async function DELETE(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = sanitizeString(url.searchParams.get('id') ?? undefined, 200);

  if (!id) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('rollback_hooks')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete rollback hook', detail: error.message }, { status: 500 });
  }

  logAudit({
    orgId: auth.orgId,
    action: 'rollback_hook.deleted',
    resourceType: 'rollback_hook',
    resourceId: id,
  });

  return NextResponse.json({ deleted: true });
}
