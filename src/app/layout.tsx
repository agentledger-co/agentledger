import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import GAPageTracker from '@/components/GAPageTracker';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentledger.co';

export const metadata: Metadata = {
  title: {
    default: 'AgentLedger — Monitor & Control Your AI Agents',
    template: '%s — AgentLedger',
  },
  description: 'Open-source observability for AI agents. Track actions, costs, and safety in real time. Budget controls, kill switches, and anomaly detection. 3 lines of code to integrate.',
  keywords: ['AI agent monitoring', 'AI observability', 'agent safety', 'LLM monitoring', 'AI agent costs', 'AI agent dashboard', 'agent kill switch', 'AI budget control', 'MCP monitoring', 'LangChain monitoring', 'OpenAI agent monitoring'],
  authors: [{ name: 'AgentLedger' }],
  creator: 'AgentLedger',
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'AgentLedger',
    title: 'AgentLedger — Monitor & Control Your AI Agents',
    description: 'Open-source observability for AI agents. Track actions, costs, and safety in real time. Budget controls, kill switches, and anomaly detection.',
    images: [
      {
        url: `${siteUrl}/og`,
        width: 1200,
        height: 630,
        alt: 'AgentLedger — AI Agent Monitoring Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentLedger — Monitor & Control Your AI Agents',
    description: 'Open-source observability for AI agents. Track actions, costs, and safety in real time.',
    images: [`${siteUrl}/og`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
};

// JSON-LD structured data
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AgentLedger',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  description: 'Open-source observability platform for AI agents. Track actions, costs, and safety in real time.',
  url: siteUrl,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free tier with 1,000 actions/month',
  },
  featureList: [
    'Real-time agent action tracking',
    'Cost monitoring and budget controls',
    'Agent kill switch and pause controls',
    'Anomaly detection and alerts',
    'Webhook notifications',
    'Multi-framework SDK (LangChain, OpenAI, MCP, Express)',
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Google Analytics (GA4) — set NEXT_PUBLIC_GA_MEASUREMENT_ID in env */}
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}');`,
              }}
            />
          </>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="font-sans antialiased">
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && <GAPageTracker />}
        {children}
      </body>
    </html>
  );
}
