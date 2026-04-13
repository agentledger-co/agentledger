'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [mode, setMode] = useState<'password' | 'magic'>('password');

  const supabase = createBrowserClient();

  // Surface auth callback failures (e.g. expired confirmation link) and
  // session-expiry redirects from the dashboard's apiFetch wrapper.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err === 'auth_failed') {
      setError('Sign-in link expired or invalid. Please try again.');
    } else if (err === 'session_expired') {
      setError('Your session has expired. Please sign in again.');
    }
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (error) setError(error.message);
      else { analytics.login('magic_link'); setMagicLinkSent(true); }
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      analytics.login('email');
      window.location.href = '/dashboard';
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    analytics.login('google');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setLoading(true);
    setError('');
    analytics.login('github');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  if (magicLinkSent) {
    return (
      <div className="min-h-screen bg-[#08080a] text-white flex items-center justify-center">
        <div className="max-w-sm w-full mx-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-6 logo-heartbeat-glow">
            <svg className="logo-heartbeat" width="36" height="36" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h1 className="text-xl font-semibold mb-2">Check your email</h1>
          <p className="text-white/40 text-[14px] mb-6">
            We sent a magic link to <strong className="text-white/70">{email}</strong>
          </p>
          <button onClick={() => setMagicLinkSent(false)} className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors">
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08080a] text-white flex items-center justify-center">
      <div className="max-w-sm w-full mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20 logo-heartbeat-glow">
              <svg className="logo-heartbeat" width="36" height="36" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </Link>
          <h1 className="text-xl font-semibold mb-1">Welcome back</h1>
          <p className="text-white/60 text-[14px]">Sign in to AgentLedger</p>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white/[0.05] hover:bg-white/[0.08] disabled:opacity-60 disabled:cursor-not-allowed border border-white/[0.14] text-white font-medium py-2.5 rounded-lg transition-colors text-[14px] mb-2"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* GitHub OAuth */}
        <button
          onClick={handleGitHubLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white/[0.05] hover:bg-white/[0.08] disabled:opacity-60 disabled:cursor-not-allowed border border-white/[0.14] text-white font-medium py-2.5 rounded-lg transition-colors text-[14px] mb-6"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          Continue with GitHub
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-white/[0.12]" />
          <span className="text-[12px] text-white/50 uppercase tracking-wider">or</span>
          <div className="h-px flex-1 bg-white/[0.12]" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailLogin} className="space-y-3">
          <div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              required
              className="w-full bg-white/[0.12] border border-white/[0.20] rounded-lg px-4 py-2.5 text-base text-white placeholder-white/50 focus:border-blue-500/60 focus:outline-none transition-colors"
            />
          </div>

          {mode === 'password' && (
            <div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full bg-white/[0.12] border border-white/[0.20] rounded-lg px-4 py-2.5 text-base text-white placeholder-white/50 focus:border-blue-500/60 focus:outline-none transition-colors"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-[13px]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/60 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-blue-500/20 text-[14px]"
          >
            {loading ? 'Signing in...' : mode === 'magic' ? 'Send magic link' : 'Sign in'}
          </button>
        </form>

        {/* Toggle mode */}
        <button
          onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
          className="w-full text-[12px] text-white/50 hover:text-white/40 transition-colors mt-4 text-center"
        >
          {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
        </button>

        {/* Sign up link */}
        <p className="text-center text-[13px] text-white/50 mt-8">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-blue-400 hover:text-blue-300 transition-colors">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
