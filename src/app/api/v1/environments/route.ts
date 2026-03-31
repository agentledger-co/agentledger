import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('action_logs')
    .select('environment')
    .eq('org_id', auth.orgId);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch environments', detail: error.message }, { status: 500 });
  }

  // Extract distinct environments from the results
  const environments = [...new Set((data || []).map((row: any) => row.environment))].sort();

  return NextResponse.json({ environments });
}
