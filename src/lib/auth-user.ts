import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const supabaseFetch: typeof fetch = (url, options) => {
  const fixedUrl = typeof url === 'string'
    ? url.replace('.supabase.com', '.supabase.co')
    : url;
  return fetch(fixedUrl, options);
};

/**
 * Verify the authenticated user from Supabase Auth session cookies.
 * Returns the user ID or null if not authenticated.
 * 
 * This is the secure replacement for trusting x-user-id headers.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<string | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          setAll(_cookiesToSet) {
            // Read-only in API routes
          },
        },
        global: { fetch: supabaseFetch },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}
