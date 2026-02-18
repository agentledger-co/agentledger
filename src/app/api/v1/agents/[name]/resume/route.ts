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
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('agents')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('org_id', auth.orgId)
    .eq('name', name);

  if (error) {
    return NextResponse.json({ error: 'Failed to resume agent' }, { status: 500 });
  }

  fireWebhooks(auth.orgId, 'agent.resumed', { agent: name }).catch(() => {});

  return NextResponse.json({ status: 'active', agent: name });
}
