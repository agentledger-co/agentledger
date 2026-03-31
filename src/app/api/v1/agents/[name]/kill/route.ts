import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { fireWebhooks } from '@/lib/webhooks';
import { sendNotifications } from '@/lib/notifications';
import { fireRollbacks } from '@/lib/rollbacks';
import { logAudit } from '@/lib/audit';

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
    .update({ status: 'killed', updated_at: new Date().toISOString() })
    .eq('org_id', auth.orgId)
    .eq('name', name)
    .eq('environment', environment);

  if (error) {
    return NextResponse.json({ error: 'Failed to kill agent', detail: error.message }, { status: 500 });
  }

  // Log an anomaly alert
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('org_id', auth.orgId)
    .eq('name', name)
    .eq('environment', environment)
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

  sendNotifications(auth.orgId, {
    event: 'agent.killed',
    agentName: name,
    message: `Agent *${name}* was killed.`,
    details: { killed_by: 'dashboard' },
  }).catch(() => {});

  // Fire rollback hooks — find most recent trace_id for this agent (last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentAction } = await supabase
    .from('action_logs')
    .select('trace_id')
    .eq('org_id', auth.orgId)
    .eq('agent_name', name)
    .gte('created_at', oneHourAgo)
    .not('trace_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  fireRollbacks(auth.orgId, 'agent_killed', name, recentAction?.trace_id || undefined).catch(() => {});

  logAudit({
    orgId: auth.orgId,
    action: 'agent.killed',
    resourceType: 'agent',
    resourceId: name,
    details: { environment },
  });

  return NextResponse.json({ status: 'killed', agent: name });
}
