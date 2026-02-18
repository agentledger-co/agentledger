import { createServiceClient } from './supabase';
import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

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
    .select('id, org_id, revoked_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data || data.revoked_at) return null;

  // Update last used
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    orgId: data.org_id,
    apiKeyId: data.id,
  };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 40; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const key = `al_${random}`;
  return {
    key,
    hash: hashApiKey(key),
    prefix: key.slice(0, 10),
  };
}
