import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

// GET /api/v1/notifications — list notification settings
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('org_id', auth.orgId);

  return NextResponse.json({ settings: data || [] });
}

// POST /api/v1/notifications — create or update a notification channel
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
  const { channel, config, events, active } = body;

  if (!channel || !['email', 'slack'].includes(String(channel))) {
    return NextResponse.json({ error: 'Invalid channel. Must be "email" or "slack".' }, { status: 400 });
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'Must specify at least one event.' }, { status: 400 });
  }

  const validEvents = ['action.error', 'agent.killed', 'budget.exceeded', 'budget.warning'];
  const filteredEvents = events.filter((e: string) => validEvents.includes(e));

  if (channel === 'slack' && (!config?.webhook_url || typeof config.webhook_url !== 'string')) {
    return NextResponse.json({ error: 'Slack channel requires config.webhook_url' }, { status: 400 });
  }

  if (channel === 'email' && (!config?.email || typeof config.email !== 'string')) {
    return NextResponse.json({ error: 'Email channel requires config.email' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Upsert — one setting per channel per org
  const { data, error } = await supabase
    .from('notification_settings')
    .upsert({
      org_id: auth.orgId,
      channel,
      config: { ...config, _org_id: auth.orgId },
      events: filteredEvents,
      active: active !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,channel' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to save notification setting', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ setting: data });
}

// DELETE /api/v1/notifications — delete a notification channel
export async function DELETE(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const channel = url.searchParams.get('channel');

  if (!channel) {
    return NextResponse.json({ error: 'Must specify channel parameter' }, { status: 400 });
  }

  const supabase = createServiceClient();
  await supabase
    .from('notification_settings')
    .delete()
    .eq('org_id', auth.orgId)
    .eq('channel', channel);

  return NextResponse.json({ deleted: true });
}
