# Monitoring & Alerting Setup

## 1. Uptime Monitoring (Free)

AgentLedger has a health check endpoint at `/api/health` that checks both the app and database.

### BetterStack (recommended)
1. Go to [betterstack.com](https://betterstack.com) → Create free account
2. Add monitor: `https://agentledger.co/api/health`
3. Check interval: 60 seconds
4. Alert via: Email, Slack, or SMS
5. Expected response: `{"status":"ok","db":true}`

### UptimeRobot (alternative)
1. Go to [uptimerobot.com](https://uptimerobot.com) → Create free account
2. Add HTTP(s) monitor: `https://agentledger.co/api/health`
3. Monitoring interval: 5 minutes (free tier)

## 2. Error Tracking

### Current: Vercel Logs
All API errors are logged as structured JSON. View them in:
- Vercel Dashboard → Your Project → Logs
- Filter by `level: error`

### Recommended: Sentry (free tier: 5K errors/month)
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Then replace `console.error` in `src/lib/errors.ts`:
```typescript
import * as Sentry from '@sentry/nextjs';

export function reportError(error: unknown, context: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.captureException(err, { extra: context });
}
```

## 3. Key Metrics to Monitor

| Metric | Where | Alert If |
|--------|-------|----------|
| Health check | `/api/health` | Status ≠ 200 |
| DB latency | Health check `latencyMs` | > 500ms |
| API 500s | Vercel Logs | Any occurrence |
| Auth failures | Vercel Logs (401s) | Spike > 50/hour |

## 4. Vercel Analytics (Optional)

Enable in Vercel Dashboard → Analytics for:
- Web Vitals (LCP, FID, CLS)
- Page load times
- API route performance
