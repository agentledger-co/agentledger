import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/auth';
import { getAuthenticatedUser } from '@/lib/auth-user';

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', userId)
    .single();

  if (!member) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 });
  }

  const { key, hash, prefix } = generateApiKey();

  const { count } = await supabase
    .from('api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', member.org_id)
    .is('revoked_at', null);

  const { error } = await supabase
    .from('api_keys')
    .insert({
      org_id: member.org_id,
      key_hash: hash,
      key_prefix: prefix,
      name: `Key ${(count || 0) + 1}`,
      description: 'Generated on re-login',
    });

  if (error) {
    return NextResponse.json({ error: 'Failed to create API key', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ key });
}
