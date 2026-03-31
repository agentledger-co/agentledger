import { createServiceClient } from './supabase';
import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'crypto';

export interface AuthContext {
  orgId: string;
  apiKeyId: string;
}

/**
 * Authenticate an API request using Bearer token (API key).
 * Returns the org context or null if invalid.
 */
export async function authenticateApiKey(req: NextRequest): Promise<AuthContext | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith('al_')) return null;

  const keyHash = hashApiKey(apiKey);
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, org_id, revoked_at, last_used_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data || data.revoked_at) return null;

  // Only update last_used_at every 5 minutes to reduce DB writes
  const lastUsed = data.last_used_at ? new Date(data.last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > 5 * 60 * 1000) {
    Promise.resolve(
      supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
    ).catch(() => {});
  }

  return {
    orgId: data.org_id,
    apiKeyId: data.id,
  };
}

/**
 * Authenticate using a raw API key string (no request object needed).
 * Useful for SSE endpoints where EventSource doesn't support custom headers.
 */
export async function authenticateApiKeyFromString(key: string): Promise<AuthContext | null> {
  if (!key.startsWith('al_')) return null;

  const keyHash = hashApiKey(key);
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, org_id, revoked_at, last_used_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data || data.revoked_at) return null;

  // Only update last_used_at every 5 minutes to reduce DB writes
  const lastUsed = data.last_used_at ? new Date(data.last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > 5 * 60 * 1000) {
    Promise.resolve(
      supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
    ).catch(() => {});
  }

  return {
    orgId: data.org_id,
    apiKeyId: data.id,
  };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const random = randomBytes(30).toString('base64url'); // 40 chars, cryptographically secure
  const key = `al_${random}`;
  return {
    key,
    hash: hashApiKey(key),
    prefix: key.slice(0, 10),
  };
}
