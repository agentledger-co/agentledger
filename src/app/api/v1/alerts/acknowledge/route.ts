import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

// POST /api/v1/alerts/acknowledge - Acknowledge an alert
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { id, all } = body;

  const supabase = createServiceClient();

  if (all) {
    // Acknowledge all alerts for this org
    const { error } = await supabase
      .from('anomaly_alerts')
      .update({ acknowledged: true })
      .eq('org_id', auth.orgId)
      .eq('acknowledged', false);

    if (error) {
      return NextResponse.json({ error: 'Failed to acknowledge alerts' }, { status: 500 });
    }
    return NextResponse.json({ message: 'All alerts acknowledged' });
  }

  if (!id) {
    return NextResponse.json({ error: 'Missing required field: id or all' }, { status: 400 });
  }

  const { error } = await supabase
    .from('anomaly_alerts')
    .update({ acknowledged: true })
    .eq('id', id)
    .eq('org_id', auth.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to acknowledge alert' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Alert acknowledged' });
}
