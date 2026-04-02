import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — AgentLedger',
};

export default function TermsPage() {
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
          <span className="text-white/40 text-[13px]">Terms of Service</span>
          </div>
          <Link href="/signup" className="text-[13px] text-blue-400 hover:text-blue-300 transition-colors">Sign up</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-[32px] font-bold mb-2 tracking-tight">Terms of Service</h1>
        <p className="text-white/60 text-[14px] mb-10">Last updated: February 16, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-white/50 text-[14px] leading-relaxed">

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">1. Agreement to Terms</h2>
            <p>By accessing or using AgentLedger (&quot;the Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the Service. The Service is operated by AgentLedger (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">2. Description of Service</h2>
            <p>AgentLedger provides an observability and monitoring platform for AI agents. The Service includes a web-based dashboard, REST API, and SDK for tracking agent actions, costs, and behavior. The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">3. Accounts</h2>
            <p>To use the Service, you must create an account. You are responsible for maintaining the confidentiality of your account credentials, including API keys. You are responsible for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.</p>
            <p className="mt-2">You must be at least 18 years old to use the Service. By creating an account, you represent that you are at least 18 years of age.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">4. Acceptable Use</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Violate any applicable law or regulation</li>
              <li>Transmit malicious code, viruses, or any harmful data</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Use the Service to monitor or collect data about individuals without their consent</li>
              <li>Resell or redistribute the Service without our written permission</li>
              <li>Use the Service in connection with any illegal AI agent activities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">5. API Keys and Security</h2>
            <p>API keys are confidential credentials. You are solely responsible for safeguarding your API keys. We hash and store API keys securely, but we are not liable for unauthorized access resulting from your failure to protect your credentials. You should rotate API keys regularly and revoke any compromised keys immediately.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">6. Data and Privacy</h2>
            <p>Your use of the Service is also governed by our <Link href="/privacy" className="text-blue-400 hover:underline">Privacy Policy</Link>. You retain ownership of all data you submit to the Service (&quot;Your Data&quot;). We do not sell Your Data to third parties. We use Your Data solely to provide and improve the Service.</p>
            <p className="mt-2">You are responsible for ensuring that your use of the Service complies with all applicable data protection laws, including GDPR, CCPA, and any other relevant regulations. If your AI agents process personal data, you must ensure appropriate legal basis and transparency.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">7. Service Availability</h2>
            <p>We strive to maintain high availability of the Service, but we do not guarantee uninterrupted or error-free operation. The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control. We are not liable for any damages resulting from service interruptions.</p>
            <p className="mt-2">We do not provide uptime guarantees or Service Level Agreements (SLAs) at this time.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">8. Pricing, Payment, and Usage Limits</h2>
            <p>The Service currently offers a free tier. Paid plans may be introduced in the future. We will provide reasonable notice before implementing any pricing changes. Free tier limits are subject to change with notice.</p>
            <p className="mt-2">If paid plans are introduced, payment terms will be clearly communicated before any charges are applied. You will not be charged without your explicit consent.</p>
            <p className="mt-2"><strong className="text-white/60">Usage Limits.</strong> Each plan has defined limits on monthly actions, number of agents, data retention period, and API request rate. These limits are enforced automatically. When you exceed your plan&apos;s monthly action limit, further action logging requests will be rejected with a 429 status code until the next billing period. Rate limiting (per-minute burst limits) is applied to protect service quality for all users.</p>
            <p className="mt-2"><strong className="text-white/60">Fair Use.</strong> We reserve the right to limit, suspend, or terminate accounts that we reasonably determine are abusing the Service, including but not limited to: creating multiple accounts to circumvent limits, sending excessive automated requests designed to degrade service performance, or using the free tier for commercial purposes that significantly exceed normal usage patterns.</p>
            <p className="mt-2"><strong className="text-white/60">Data Retention.</strong> Action logs and associated data are automatically deleted after your plan&apos;s retention period (24 hours for the free tier). This is not recoverable. You are responsible for exporting any data you wish to retain beyond your plan&apos;s retention window.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">9. Intellectual Property</h2>
            <p>The Service, including its design, code (excluding open-source components), and documentation, is owned by AgentLedger and protected by intellectual property laws. Open-source components of the SDK and self-hosted version are licensed under the MIT License as specified in the repository.</p>
            <p className="mt-2">You retain all rights to Your Data. By using the Service, you grant us a limited license to process Your Data solely for the purpose of providing the Service.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">10. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, AGENTLEDGER SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, BUSINESS OPPORTUNITIES, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE.</p>
            <p className="mt-2">OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM OR RELATING TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.</p>
            <p className="mt-2">The Service is a monitoring and observability tool. It does not control your AI agents and is not responsible for actions taken by your agents, including any damages caused by agent behavior, whether or not those actions were logged by the Service.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">11. Disclaimer of Warranties</h2>
            <p>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
            <p className="mt-2">We do not warrant that the Service will meet your specific requirements, that the Service will be uninterrupted or error-free, that defects will be corrected, or that the Service is free of viruses or other harmful components.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">12. Indemnification</h2>
            <p>You agree to indemnify, defend, and hold harmless AgentLedger and its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses (including reasonable attorneys&apos; fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">13. Termination</h2>
            <p>We may suspend or terminate your access to the Service at any time, with or without cause, with or without notice. Upon termination, your right to use the Service ceases immediately. We may delete Your Data after a reasonable period following termination.</p>
            <p className="mt-2">You may terminate your account at any time by contacting us. Upon request, we will make reasonable efforts to export or delete Your Data.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">14. Changes to Terms</h2>
            <p>We may update these Terms from time to time. We will notify you of material changes by posting the updated Terms on the Service with a new &quot;Last updated&quot; date. Your continued use of the Service after changes are posted constitutes your acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">15. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of Ireland, without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service shall be resolved in the courts of Ireland.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-white/80 mb-3">16. Contact</h2>
            <p>If you have any questions about these Terms, please contact us at:</p>
            <p className="mt-2 text-blue-400">legal@agentledger.co</p>
          </section>

        </div>
      </main>
    </div>
  );
}
