import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — AgentLedger',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#08080a] text-white">
      <nav className="border-b border-white/[0.14] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center logo-heartbeat-glow"><svg className="logo-heartbeat" width="20" height="20" viewBox="0 0 48 48" fill="none"><path d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            <span className="text-lg font-semibold tracking-tight">AgentLedger</span>
          </Link>
          <span className="text-white/50 text-[13px]">/</span>
          <span className="text-white/40 text-[13px]">Privacy Policy</span>
          </div>
          <Link href="/signup" className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors">Sign up</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-[32px] font-bold mb-2 tracking-tight">Privacy Policy</h1>
        <p className="text-white/60 text-[14px] mb-10">Last updated: April 13, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-white/50 text-[14px] leading-relaxed">

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">1. Introduction</h2>
            <p>AgentLedger (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and protect your information when you use our AI agent monitoring service (&quot;the Service&quot;).</p>
            <p className="mt-2">This policy applies to all users of the Service, including the web dashboard, API, and SDK.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">2. Data We Collect</h2>

            <h3 className="text-[15px] font-medium text-white/60 mt-4 mb-2">2.1 Account Data</h3>
            <p>When you create an account, we collect:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Email address</li>
              <li>Password (hashed, never stored in plain text) — if you sign up with email</li>
              <li>Organization name</li>
              <li>Authentication provider information (if using Google or GitHub OAuth), including your name and profile picture as provided by the OAuth provider</li>
            </ul>

            <h3 className="text-[15px] font-medium text-white/60 mt-4 mb-2">2.2 Agent Activity Data</h3>
            <p>When your AI agents use the Service via our API or SDK, we collect the data you send us:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Agent name and identifier</li>
              <li>Service being called (e.g., &quot;slack&quot;, &quot;stripe&quot;)</li>
              <li>Action performed (e.g., &quot;send_message&quot;, &quot;charge&quot;)</li>
              <li>Action status (success, error, blocked)</li>
              <li>Estimated cost</li>
              <li>Duration</li>
              <li>Custom metadata you choose to include</li>
            </ul>
            <p className="mt-2"><strong className="text-white/60">Important:</strong> You control what data your agents send to AgentLedger. We recommend not sending personal data (PII) in the metadata field unless necessary. We do not inspect, analyze, or use your agent activity data for any purpose other than providing the Service to you.</p>

            <h3 className="text-[15px] font-medium text-white/60 mt-4 mb-2">2.3 Usage Data</h3>
            <p>We automatically collect limited technical data when you use the Service:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Pages visited, features used, and scroll depth</li>
              <li>Referral source</li>
              <li>Session duration and engagement time</li>
            </ul>
            <p className="mt-2">We use Google Analytics 4 (GA4) to collect this usage data. GA4 may set cookies to distinguish unique users and sessions. See Section 9 for more details on cookies.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">3. How We Use Your Data</h2>
            <p>We use your data for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong className="text-white/60">Provide the Service:</strong> Display your agent activity, enforce budgets, send alerts</li>
              <li><strong className="text-white/60">Account management:</strong> Authentication, authorization, billing</li>
              <li><strong className="text-white/60">Improve the Service:</strong> Analyze aggregate usage patterns (not individual agent data)</li>
              <li><strong className="text-white/60">Security:</strong> Detect and prevent fraud, abuse, or unauthorized access</li>
              <li><strong className="text-white/60">Communications:</strong> Service-related announcements, security alerts</li>
            </ul>
            <p className="mt-2">We do <strong className="text-white/60">not</strong> sell your data to third parties. We do <strong className="text-white/60">not</strong> use your agent activity data for advertising, profiling, or AI training.</p>
            <p className="mt-2">Agent activity data (action names, agent names, cost, and status) may be included in notification payloads sent to third-party services you configure, such as Slack, Discord, PagerDuty, or custom webhooks.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">4. Data Storage and Security</h2>
            <p>Your data is stored in Supabase (PostgreSQL) infrastructure. We implement the following security measures:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>API keys are SHA-256 hashed before storage (we never store raw keys)</li>
              <li>Passwords are hashed using bcrypt via Supabase Auth</li>
              <li>All data transmission is encrypted via TLS/HTTPS</li>
              <li>Row-Level Security (RLS) enforces organization-level data isolation</li>
              <li>Webhook secrets are used for HMAC-SHA256 payload signing</li>
            </ul>
            <p className="mt-2">While we take reasonable measures to protect your data, no method of electronic storage or transmission is 100% secure. We cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">5. Data Retention</h2>
            <p>We retain your data as follows:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong className="text-white/60">Account data:</strong> Retained as long as your account is active</li>
              <li><strong className="text-white/60">Agent activity data:</strong> Retained according to your plan&apos;s retention period (24 hours for free tier)</li>
              <li><strong className="text-white/60">Webhook delivery logs:</strong> Retained for 30 days</li>
            </ul>
            <p className="mt-2">When you delete your account, we will delete or anonymize your data within 30 days, except where retention is required by law.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">6. Third-Party Services</h2>
            <p>We use the following third-party services to operate:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong className="text-white/60">Supabase:</strong> Database hosting, authentication (data stored in their infrastructure)</li>
              <li><strong className="text-white/60">Vercel:</strong> Application hosting and CDN</li>
              <li><strong className="text-white/60">Google:</strong> OAuth authentication provider (if you choose Google login) and analytics via Google Analytics 4</li>
              <li><strong className="text-white/60">GitHub:</strong> OAuth authentication provider (if you choose GitHub login)</li>
              <li><strong className="text-white/60">Sentry:</strong> Error monitoring and performance tracking</li>
              <li><strong className="text-white/60">Resend:</strong> Transactional email delivery (confirmation emails, invitations)</li>
            </ul>
            <p className="mt-2">Each of these services has their own privacy policies. We encourage you to review them.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">7. Your Rights (GDPR)</h2>
            <p>If you are located in the European Economic Area (EEA), you have the following rights under GDPR:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong className="text-white/60">Access:</strong> Request a copy of the personal data we hold about you</li>
              <li><strong className="text-white/60">Rectification:</strong> Request correction of inaccurate personal data</li>
              <li><strong className="text-white/60">Erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
              <li><strong className="text-white/60">Restriction:</strong> Request restriction of processing of your personal data</li>
              <li><strong className="text-white/60">Portability:</strong> Request transfer of your data in a machine-readable format</li>
              <li><strong className="text-white/60">Objection:</strong> Object to processing of your personal data</li>
            </ul>
            <p className="mt-2">To exercise any of these rights, contact us at <span className="text-blue-400">privacy@agentledger.co</span>. We will respond within 30 days.</p>
            <p className="mt-2"><strong className="text-white/60">Legal basis for processing:</strong> We process your data based on (a) contract performance (providing the Service), (b) legitimate interest (security, service improvement), and (c) consent (optional analytics).</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">8. Your Rights (CCPA)</h2>
            <p>If you are a California resident, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Know what personal information we collect and how it is used</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of the sale of personal information (we do not sell your data)</li>
              <li>Non-discrimination for exercising your privacy rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">9. Cookies</h2>
            <p>We use the following types of cookies:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong className="text-white/60">Essential cookies:</strong> Authentication and session management. These are necessary for the Service to function and cannot be disabled.</li>
              <li><strong className="text-white/60">Analytics cookies:</strong> Google Analytics 4 (GA4) sets cookies (e.g., <code className="text-white/40 text-[12px]">_ga</code>, <code className="text-white/40 text-[12px]">_ga_*</code>) to distinguish unique users and measure engagement. This data is used solely to understand how the Service is used and improve it. We do not use this data for advertising or profiling.</li>
            </ul>
            <p className="mt-2">We do not use advertising, retargeting, or third-party tracking cookies.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">10. International Data Transfers</h2>
            <p>Your data may be processed in countries outside your country of residence, including the United States (where our hosting providers operate). We ensure that appropriate safeguards are in place for any international data transfers in compliance with applicable data protection laws.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">11. Children&apos;s Privacy</h2>
            <p>The Service is not intended for use by anyone under the age of 18. We do not knowingly collect personal data from children. If you believe we have inadvertently collected data from a minor, please contact us and we will promptly delete it.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">12. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on the Service with a new &quot;Last updated&quot; date. For significant changes, we may also notify you by email.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">13. Contact</h2>
            <p>For privacy-related inquiries or to exercise your data rights:</p>
            <p className="mt-2 text-blue-400">privacy@agentledger.co</p>
            <p className="mt-2 text-white/60">AgentLedger<br />Dublin, Ireland</p>
          </section>

        </div>
      </main>
    </div>
  );
}
