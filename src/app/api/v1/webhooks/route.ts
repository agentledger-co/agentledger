import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { generateWebhookSecret } from '@/lib/webhooks';

const VALID_EVENTS = [
  'action.logged', 'agent.paused', 'agent.killed', 'agent.resumed',
  'budget.exceeded', 'budget.warning', 'alert.created',
];

// GET /api/v1/webhooks — list webhooks
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();

  const { data: webhooks, error } = await supabase
    .from('webhooks')
    .select('id, url, events, active, description, last_triggered_at, failure_count, created_at')
    .eq('org_id', auth.orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to fetch webhooks', detail: error.message }, { status: 500 });

  return NextResponse.json({ webhooks: webhooks || [] });
}

// POST /api/v1/webhooks — create webhook
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { url, events, description } = body;

  if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

  try { new URL(url); } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!url.startsWith('https://') && !url.startsWith('http://localhost')) {
    return NextResponse.json({ error: 'Webhook URL must use HTTPS' }, { status: 400 });
  }

  const selectedEvents = events?.filter((e: string) => VALID_EVENTS.includes(e)) || VALID_EVENTS;
  const secret = generateWebhookSecret();

  const supabase = createServiceClient();

  const { data: webhook, error } = await supabase
    .from('webhooks')
    .insert({
      org_id: auth.orgId,
      url,
      secret,
      events: selectedEvents,
      description: description || null,
      active: true,
    })
    .select('id, url, events, active, description, created_at')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create webhook', detail: error.message }, { status: 500 });

  // Return the secret only on creation
  return NextResponse.json({ ...webhook, secret });
}

// DELETE /api/v1/webhooks?id=xxx — delete webhook
export async function DELETE(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing webhook id' }, { status: 400 });

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('webhooks')
    .delete()
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) return NextResponse.json({ error: 'Failed to delete webhook', detail: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}

// PATCH /api/v1/webhooks — toggle active or update
export async function PATCH(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, active, events, url, description } = body;

  if (!id) return NextResponse.json({ error: 'Missing webhook id' }, { status: 400 });

  const supabase = createServiceClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (active !== undefined) updates.active = active;
  if (events) updates.events = events.filter((e: string) => VALID_EVENTS.includes(e));
  if (url) updates.url = url;
  if (description !== undefined) updates.description = description;
  if (active === true) updates.failure_count = 0; // Reset failures on re-enable

  const { error } = await supabase
    .from('webhooks')
    .update(updates)
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) return NextResponse.json({ error: 'Failed to update webhook', detail: error.message }, { status: 500 });

  return NextResponse.json({ updated: true });
}
