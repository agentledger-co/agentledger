import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

// Custom fetch that rewrites .supabase.com to .supabase.co
const supabaseFetch: typeof fetch = (url, options) => {
  const fixedUrl = typeof url === 'string'
    ? url.replace('.supabase.com', '.supabase.co')
    : url;
  return fetch(fixedUrl, options);
};

// Service role client for API routes (bypasses RLS) — lazy singleton
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _serviceClient: SupabaseClient<any, "public", any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServiceClient(): SupabaseClient<any, "public", any> {
  if (!_serviceClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    _serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      global: { fetch: supabaseFetch },
    });
  }
  return _serviceClient;
}

// Browser client for client components
// Fallback placeholders prevent @supabase/ssr from throwing during Next.js static prerendering
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

  return createSSRBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: supabaseFetch },
  });
}
