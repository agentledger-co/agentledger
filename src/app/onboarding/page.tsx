'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';

const CHECK = '\u2713';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [testResult, setTestResult] = useState<'idle' | 'loading' | 'success' | 'error' | 'not_found'>('idle');
  const supabase = createBrowserClient();

  // Check if user already has an org
  useEffect(() => {
    const checkExistingOrg = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch('/api/v1/keys');
      if (res.ok) {
        const data = await res.json();
        if (data.orgId) {
          // Already onboarded
          window.location.href = '/dashboard';
        }
      }
    };
    checkExistingOrg();
  }, [supabase]);

  const handleCreateOrg = async () => {
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName || 'My Organization', userId: user.id }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json().catch(() => ({}));
      if (data.apiKey) {
        analytics.workspaceCreated(orgName || 'My Organization');
        setApiKey(data.apiKey);
        setStep(2);
      } else if (res.status === 409) {
        // User already has an org — send them to the dashboard
        window.location.href = '/dashboard';
        return;
      } else {
        setError(data.error || 'Setup failed');
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      setError(isTimeout ? 'Setup timed out — please check your connection and try again.' : 'Setup failed');
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    setTestResult('loading');
    try {
      const res = await fetch('/api/v1/actions?limit=5', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        const actions = data.actions || [];
        if (actions.length > 0) {
          analytics.testEventSent(true);
          setTestResult('success');
          setTimeout(() => setStep(3), 1200);
        } else {
          setTestResult('not_found');
        }
      } else {
        analytics.testEventSent(false);
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    }
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    if (id === 'key') analytics.apiKeyCopied();
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const curlCommand = `curl -X POST ${baseUrl}/api/v1/actions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"agent":"test-agent","service":"agentledger","action":"onboarding_test","status":"success","duration_ms":42}'`;

  return (
    <div className="min-h-screen bg-[#08080a] text-white flex items-center justify-center">
      <div className="max-w-lg w-full mx-4">

        {/* Progress */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium border transition-all ${
                s < step
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : s === step
                  ? 'border-blue-500 text-blue-400'
                  : 'border-white/[0.16] text-white/50'
              }`}>
                {s < step ? CHECK : s}
              </div>
              {s < 3 && <div className={`w-16 h-px ${s < step ? 'bg-blue-500' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Create Workspace */}
        {step === 1 && (
          <div>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold mb-2">Name your workspace</h1>
              <p className="text-white/60 text-[14px]">This is where your agent data lives. You can change it later.</p>
            </div>

            <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-6">
              <input
                type="text"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Acme Corp"
                autoFocus
                className="w-full bg-white/[0.12] border border-white/[0.20] rounded-lg px-4 py-3 text-base text-white placeholder-white/50 focus:border-blue-500/60 focus:outline-none mb-4"
              />
              <button
                onClick={handleCreateOrg}
                disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-white/10 disabled:text-white/60 text-white font-medium py-3 rounded-lg transition-all shadow-lg shadow-blue-500/20 text-[14px]"
              >
                {loading ? 'Creating...' : 'Create workspace'}
              </button>
              {error && <p className="text-red-400 text-[13px] mt-3">{error}</p>}
            </div>
          </div>
        )}

        {/* Step 2: API Key + Test */}
        {step === 2 && (
          <div>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold mb-2">Your API Key</h1>
              <p className="text-white/60 text-[14px]">Copy this key — you won&apos;t see it again. Use it in your agent code.</p>
            </div>

            {/* API Key display */}
            <div className="bg-white/[0.08] rounded-xl border border-white/[0.14] p-4 mb-6">
              <div className="flex items-center justify-between">
                <code className="text-[13px] text-blue-400 font-mono break-all">{apiKey}</code>
                <button
                  onClick={() => copy(apiKey, 'key')}
                  className="ml-3 text-[12px] text-white/60 hover:text-white/60 transition-colors flex-shrink-0"
                >
                  {copied === 'key' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-amber-500/[0.05] border border-amber-500/10 rounded-xl p-4 mb-6">
              <p className="text-[13px] text-amber-400/80">
                <strong className="text-amber-400">Save this key now.</strong> For security, we only show it once. Store it in your environment variables.
              </p>
            </div>

            {/* Test it */}
            <div className="mb-6">
              <h3 className="text-[15px] font-medium mb-3">Test your connection</h3>
              <p className="text-white/60 text-[13px] mb-3">Run this command in your terminal to send a test event:</p>

              <div className="bg-[#0c0c0c] rounded-xl border border-white/[0.14] overflow-hidden mb-4">
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.14]">
                  <span className="text-[11px] text-white/50 font-mono">terminal</span>
                  <button
                    onClick={() => copy(curlCommand, 'curl')}
                    className="text-[11px] text-white/50 hover:text-white/50 transition-colors"
                  >
                    {copied === 'curl' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="p-4 text-[12px] leading-[1.7] overflow-x-auto text-emerald-400/70">
                  <code>{curlCommand}</code>
                </pre>
              </div>

              <button
                onClick={handleVerify}
                disabled={testResult === 'loading'}
                className={`w-full py-3 rounded-lg font-medium text-[14px] transition-all ${
                  testResult === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : testResult === 'error'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : testResult === 'not_found'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20'
                }`}
              >
                {testResult === 'loading' ? 'Checking...' :
                 testResult === 'success' ? `${CHECK} Event received! Redirecting...` :
                 testResult === 'error' ? 'Verification failed — try again' :
                 testResult === 'not_found' ? 'No events found yet — run the command above first' :
                 `I've run the command — verify`}
              </button>
            </div>

            <button
              onClick={() => { analytics.onboardingSkipped(); setStep(3); }}
              className="w-full text-[13px] text-white/50 hover:text-white/40 transition-colors text-center"
            >
              Skip, go to dashboard →
            </button>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl mx-auto mb-6">
              {CHECK}
            </div>
            <h1 className="text-2xl font-bold mb-2">You&apos;re all set!</h1>
            <p className="text-white/60 text-[14px] mb-8 max-w-sm mx-auto">
              Your workspace is ready. Install the SDK in your agent code and every action will show up in your dashboard.
            </p>

            {/* Quick install */}
            <div className="bg-[#0c0c0c] rounded-xl border border-white/[0.14] p-4 mb-6 text-left">
              <code className="text-[13px] text-emerald-400/70 font-mono">npm install agentledger</code>
            </div>

            {/* Quick start snippet */}
            <div className="bg-[#0c0c0c] rounded-xl border border-white/[0.14] p-4 mb-6 text-left">
              <p className="text-[11px] text-white/50 mb-2 font-medium uppercase tracking-wider">Quick start</p>
              <pre className="text-[12px] text-blue-400/70 font-mono whitespace-pre leading-relaxed">{`import AgentLedger from 'agentledger';

const ledger = new AgentLedger({
  apiKey: '${apiKey.slice(0, 10)}...'
});

await ledger.track({
  agent: 'my-bot',
  service: 'slack',
  action: 'send_message'
}, myFunction);`}</pre>
            </div>

            {/* What's next checklist */}
            <div className="bg-white/[0.06] rounded-xl border border-white/[0.14] p-4 mb-6 text-left">
              <p className="text-[11px] text-white/50 mb-3 font-medium uppercase tracking-wider">What&apos;s next</p>
              <div className="space-y-2.5">
                {[
                  { label: 'Track your first real action', link: '/docs#core-sdk' },
                  { label: 'Set up a budget for cost control', link: '/docs#budgets' },
                  { label: 'Configure Slack or email alerts', link: '/docs#webhooks' },
                ].map(item => (
                  <a key={item.label} href={item.link} className="flex items-center gap-2.5 text-[13px] text-white/40 hover:text-white/70 transition-colors group">
                    <div className="w-4 h-4 rounded border border-white/[0.16] group-hover:border-blue-400/30 flex items-center justify-center flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/10 group-hover:bg-blue-400/30" />
                    </div>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Framework links */}
            <div className="flex flex-wrap gap-2 mb-6 justify-center">
              {[
                { label: 'LangChain', href: '/docs#langchain' },
                { label: 'OpenAI', href: '/docs#openai' },
                { label: 'MCP', href: '/docs#mcp' },
                { label: 'Express', href: '/docs#express' },
              ].map(fw => (
                <a key={fw.label} href={fw.href} className="text-[11px] text-white/55 hover:text-blue-400/60 border border-white/[0.14] hover:border-blue-400/20 px-3 py-1.5 rounded-lg transition-colors">
                  {fw.label}
                </a>
              ))}
            </div>

            <button
              onClick={() => {
                analytics.onboardingCompleted();
                try { sessionStorage.setItem('al_api_key', apiKey); } catch { /* unavailable in incognito */ }
                window.location.href = '/dashboard';
              }}
              className="w-full bg-blue-500 hover:bg-blue-400 text-white font-medium py-3 rounded-lg transition-all shadow-lg shadow-blue-500/20 text-[14px]"
            >
              Open dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
