import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/auth';
import { sanitizeString } from '@/lib/validate';

export async function POST(req: NextRequest) {

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const userId = typeof body.userId === 'string' ? body.userId : undefined;
  const name = sanitizeString(body.name);

  if (!name) {
    return NextResponse.json({ error: 'Organization name required' }, { status: 400 });
  }

  // Validate userId format if provided
  if (userId && !/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Rate limit: max 5 orgs created in the last hour (DB-based, survives serverless restarts)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentOrgs } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo);

  if ((recentOrgs || 0) >= 50) {
    return NextResponse.json({ error: 'Too many organizations created. Try again later.' }, { status: 429 });
  }

  // If userId provided, check if user already has an org
  if (userId) {
    const { data: existingMember } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      // User already has an org — return their existing API key prefix
      const { data: key } = await supabase
        .from('api_keys')
        .select('key_prefix')
        .eq('org_id', existingMember.org_id)
        .is('revoked_at', null)
        .single();

      return NextResponse.json({
        error: 'Organization already exists',
        orgId: existingMember.org_id,
        keyPrefix: key?.key_prefix,
      }, { status: 409 });
    }
  }

  // Create org
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name })
    .select()
    .single();

  if (orgError) {
    return NextResponse.json({ error: 'Failed to create organization', detail: orgError.message }, { status: 500 });
  }

  // Link user to org if userId provided
  if (userId) {
    await supabase.from('org_members').insert({
      org_id: org.id,
      user_id: userId,
      role: 'owner',
    });
  }

  // Generate API key (properly hashed)
  const { key, hash, prefix } = generateApiKey();

  const { error: keyError } = await supabase
    .from('api_keys')
    .insert({
      org_id: org.id,
      key_hash: hash,
      key_prefix: prefix,
      name: 'Default Key',
    });

  if (keyError) {
    return NextResponse.json({ error: 'Failed to create API key', detail: keyError.message }, { status: 500 });
  }

  return NextResponse.json({ orgId: org.id, apiKey: key });
}
