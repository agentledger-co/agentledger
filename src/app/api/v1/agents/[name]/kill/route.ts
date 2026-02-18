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
    .update({ status: 'killed', updated_at: new Date().toISOString() })
    .eq('org_id', auth.orgId)
    .eq('name', name);

  if (error) {
    return NextResponse.json({ error: 'Failed to kill agent' }, { status: 500 });
  }

  // Log an anomaly alert
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('org_id', auth.orgId)
    .eq('name', name)
    .single();

  if (agent) {
    await supabase.from('anomaly_alerts').insert({
      org_id: auth.orgId,
      agent_id: agent.id,
      alert_type: 'agent_killed',
      severity: 'critical',
      message: `Agent "${name}" was manually killed via dashboard`,
      metadata: { killed_by: 'dashboard', timestamp: new Date().toISOString() },
    });
  }

  fireWebhooks(auth.orgId, 'agent.killed', { agent: name }).catch(() => {});
  fireWebhooks(auth.orgId, 'alert.created', { agent: name, alert_type: 'agent_killed', severity: 'critical' }).catch(() => {});

  return NextResponse.json({ status: 'killed', agent: name });
}
