import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/auth';
import { reportError } from '@/lib/errors';

// Simple in-memory rate limiter for setup endpoint
const setupRateLimit = new Map<string, { count: number; windowStart: number }>();

function checkSetupRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 5; // max 5 orgs per hour per IP

  const entry = setupRateLimit.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    setupRateLimit.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkSetupRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many organizations created. Try again later.' }, { status: 429 });
  }

  const body = await req.json();
  const { name, userId } = body;

  if (!name) {
    return NextResponse.json({ error: 'Organization name required' }, { status: 400 });
  }

  const supabase = createServiceClient();

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
