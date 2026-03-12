import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, generateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { name, description } = body;

  const supabase = createServiceClient();

  // Limit to 5 active keys per org
  const { count } = await supabase
    .from('api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', auth.orgId)
    .is('revoked_at', null);

  if ((count || 0) >= 5) {
    return NextResponse.json({ error: 'Maximum 5 active API keys per organization' }, { status: 400 });
  }

  const { key, hash, prefix } = generateApiKey();

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      org_id: auth.orgId,
      key_hash: hash,
      key_prefix: prefix,
      name: name || `Key ${(count || 0) + 1}`,
      description: description || null,
    })
    .select('id, key_prefix, name, description, created_at')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create API key', detail: error.message }, { status: 500 });

  // Return the full key only on creation
  return NextResponse.json({ ...data, key });
}
