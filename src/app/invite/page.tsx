'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function InvitePage() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'accepting' | 'accepted' | 'error' | 'login_required'>('loading');
  const [error, setError] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setStatus('error');
      setError('No invite token provided.');
      return;
    }
    setToken(t);
    setStatus('ready');
  }, []);

  const acceptInvite = async () => {
    setStatus('accepting');
    try {
      const res = await fetch('/api/v1/team/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (res.status === 401) {
        setStatus('login_required');
        return;
      }

      const data = await res.json();

      if (res.ok) {
        setRole(data.role);
        setStatus('accepted');
      } else {
        setError(data.error || 'Failed to accept invite');
        setStatus('error');
      }
    } catch {
      setError('Network error. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#08080a] text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 mx-auto mb-8">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>

        {status === 'loading' && (
          <p className="text-white/40">Loading...</p>
        )}

        {status === 'ready' && (
          <>
            <h1 className="text-2xl font-bold mb-3">You&apos;ve been invited</h1>
            <p className="text-white/40 text-[15px] mb-8">
              You&apos;ve been invited to join an AgentLedger workspace. Click below to accept and get access to the dashboard.
            </p>
            <button
              onClick={acceptInvite}
              className="w-full bg-blue-500 hover:bg-blue-400 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-500/25 text-[14px]"
            >
              Accept Invitation
            </button>
            <Link href="/login" className="block text-[13px] text-white/25 hover:text-white/40 mt-4 transition-colors">
              Need to sign in first?
            </Link>
          </>
        )}

        {status === 'accepting' && (
          <>
            <h1 className="text-2xl font-bold mb-3">Joining workspace...</h1>
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </>
        )}

        {status === 'accepted' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl mx-auto mb-6">
              ✓
            </div>
            <h1 className="text-2xl font-bold mb-3">You&apos;re in!</h1>
            <p className="text-white/40 text-[15px] mb-2">
              You&apos;ve joined the workspace as <span className="text-white/70 font-medium">{role}</span>.
            </p>
            <Link
              href="/dashboard"
              className="inline-block mt-6 bg-blue-500 hover:bg-blue-400 text-white font-medium px-8 py-3 rounded-xl transition-all shadow-lg shadow-blue-500/25 text-[14px]"
            >
              Open Dashboard →
            </Link>
          </>
        )}

        {status === 'login_required' && (
          <>
            <h1 className="text-2xl font-bold mb-3">Sign in to continue</h1>
            <p className="text-white/40 text-[15px] mb-8">
              You need to sign in or create an account before accepting this invite.
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/invite?token=${token}`)}`}
              className="inline-block w-full bg-blue-500 hover:bg-blue-400 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-500/25 text-[14px]"
            >
              Sign In →
            </Link>
            <Link
              href={`/signup?redirect=${encodeURIComponent(`/invite?token=${token}`)}`}
              className="block text-[13px] text-white/25 hover:text-white/40 mt-4 transition-colors"
            >
              Don&apos;t have an account? Sign up
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl mx-auto mb-6">
              ✕
            </div>
            <h1 className="text-2xl font-bold mb-3">Invite error</h1>
            <p className="text-red-400/70 text-[15px] mb-8">{error}</p>
            <Link href="/" className="text-[13px] text-white/25 hover:text-white/40 transition-colors">
              Go to AgentLedger →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
