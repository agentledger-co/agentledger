import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  // Get user ID from header (set by authenticated client)
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Missing user ID' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find user's org
  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', userId)
    .single();

  if (!member) {
    return NextResponse.json({ orgId: null, apiKey: null });
  }

  // Get active API key for the org
  const { data: key } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, last_used_at, created_at')
    .eq('org_id', member.org_id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  // Get org details
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, plan')
    .eq('id', member.org_id)
    .single();

  return NextResponse.json({
    orgId: member.org_id,
    role: member.role,
    org,
    keys: key || [],
  });
}
