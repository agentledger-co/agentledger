import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // XSS protection (legacy browsers)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy — disable unused browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS — force HTTPS for 1 year
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              // connect-src:
              //   - Supabase (auth + realtime)
              //   - GA4 beacons (region1.google-analytics.com matches *.google-analytics.com)
              //   - Sentry ingest (broad *.sentry.io so US/EU/DE region hosts all match;
              //     *.ingest.sentry.io does NOT match oXXX.ingest.us.sentry.io)
              //   - GitHub API for the landing-page stars widget
              "connect-src 'self' https://*.supabase.co https://*.supabase.com wss://*.supabase.co wss://*.supabase.com https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.sentry.io https://api.github.com",
              "frame-ancestors 'none'",
            ].join('; ') + ';',
          },
        ],
      },
      // Read-only GET endpoints that can tolerate short caching.
      // These are listed BEFORE the catch-all /api/:path* rule so they
      // take precedence.  POST/DELETE/PATCH mutations still get the
      // strict no-store directive from the catch-all (and from the
      // API route handlers themselves).
      ...([
        '/api/v1/stats',
        '/api/v1/agents/:path*',
        '/api/v1/analytics',
        '/api/v1/forecast',
        '/api/v1/usage',
      ] as const).map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'private, max-age=30, stale-while-revalidate=60' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      })),
      {
        // Catch-all: strict no-cache for every other API route
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          // Prevent API responses from being embedded
          { key: 'X-Frame-Options', value: 'DENY' },
          // CORS — allow SDK access from any origin
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress source map upload warnings when SENTRY_AUTH_TOKEN is not set
  silent: true,
  // Disable source map upload unless explicitly configured
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
