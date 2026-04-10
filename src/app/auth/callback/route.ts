import { NextResponse } from 'next/server';
import { createServerAuthClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/dashboard';

  // Only allow same-origin relative redirects. Reject protocol-relative (//evil.com),
  // absolute URLs, and backslash tricks. Default to /dashboard on anything suspicious.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')
    ? rawNext
    : '/dashboard';

  if (code) {
    const supabase = await createServerAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
