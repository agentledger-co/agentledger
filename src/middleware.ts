import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkGlobalRateLimit, rateLimitHeaders } from '@/lib/rate-limit';

const supabaseFetch: typeof fetch = (url, options) => {
  const fixedUrl = typeof url === 'string'
    ? url.replace('.supabase.com', '.supabase.co')
    : url;
  return fetch(fixedUrl, options);
};

export async function middleware(request: NextRequest) {
  // --- Global API rate limiting ---
  if (request.nextUrl.pathname.startsWith('/api/v1/')) {
    // Skip rate limiting for health/cron endpoints
    if (!request.nextUrl.pathname.startsWith('/api/cron/')) {
      // Use API key or IP as the rate limit key
      const authHeader = request.headers.get('authorization') || '';
      const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7, 17) : ''; // Use prefix only
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rateLimitKey = apiKey || ip;

      const result = checkGlobalRateLimit(rateLimitKey);

      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please slow down.', retryAfter: result.retryAfterSeconds },
          {
            status: 429,
            headers: rateLimitHeaders(result),
          },
        );
      }

      // Add rate limit headers to successful responses
      const response = NextResponse.next();
      const headers = rateLimitHeaders(result);
      for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
      }
      return response;
    }
  }

  // --- Supabase auth middleware ---
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
      global: {
        fetch: supabaseFetch,
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/api/v1/:path*', '/dashboard/:path*', '/login', '/signup', '/onboarding'],
};
