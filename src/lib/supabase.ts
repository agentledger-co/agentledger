import { createClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

// Custom fetch that rewrites .supabase.com to .supabase.co
const supabaseFetch: typeof fetch = (url, options) => {
  const fixedUrl = typeof url === 'string'
    ? url.replace('.supabase.com', '.supabase.co')
    : url;
  return fetch(fixedUrl, options);
};

// Service role client for API routes (bypasses RLS)
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
    global: { fetch: supabaseFetch },
  });
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
