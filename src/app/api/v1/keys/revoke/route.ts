import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth';
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
  const { keyId } = body;

  if (!keyId) return NextResponse.json({ error: 'Missing keyId' }, { status: 400 });

  // Can't revoke the key you're currently using
  if (keyId === auth.apiKeyId) {
    return NextResponse.json({ error: 'Cannot revoke the key you are using to make this request' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('org_id', auth.orgId)
    .is('revoked_at', null);

  if (error) return NextResponse.json({ error: 'Failed to revoke key', detail: error.message }, { status: 500 });

  return NextResponse.json({ revoked: true });
}
