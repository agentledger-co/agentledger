import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, generateApiKey } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { keyId } = body;

  if (!keyId) return NextResponse.json({ error: 'Missing keyId' }, { status: 400 });

  const supabase = createServiceClient();

  // Get the old key's metadata
  const { data: oldKey } = await supabase
    .from('api_keys')
    .select('name, description')
    .eq('id', keyId)
    .eq('org_id', auth.orgId)
    .is('revoked_at', null)
    .single();

  if (!oldKey) return NextResponse.json({ error: 'Key not found or already revoked' }, { status: 404 });

  // Revoke old key
  await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId);

  // Generate new key
  const { key, hash, prefix } = generateApiKey();

  const { data: newKey, error } = await supabase
    .from('api_keys')
    .insert({
      org_id: auth.orgId,
      key_hash: hash,
      key_prefix: prefix,
      name: oldKey.name,
      description: oldKey.description ? `Rotated: ${oldKey.description}` : 'Rotated key',
    })
    .select('id, key_prefix, name, description, created_at')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create new key' }, { status: 500 });

  return NextResponse.json({ ...newKey, key, rotatedFrom: keyId });
}
