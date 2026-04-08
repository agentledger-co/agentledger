import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { fireWebhooks } from '@/lib/webhooks';

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await params;
  const url = new URL(req.url);
  const environment = url.searchParams.get('environment') || 'production';
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('agents')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('org_id', auth.orgId)
    .eq('name', name)
    .eq('environment', environment);

  if (error) {
    return NextResponse.json({ error: 'Failed to pause agent', detail: error.message }, { status: 500 });
  }

  fireWebhooks(auth.orgId, 'agent.paused', { agent: name }).catch(err => console.error('[agent:pause] background task failed:', err));

  return NextResponse.json({ status: 'paused', agent: name });
}
