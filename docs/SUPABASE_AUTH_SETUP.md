# Supabase Auth Setup for AgentLedger

## 1. Site URL & Redirect URLs

Go to **Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL**: `https://agentledger.co`
- **Redirect URLs** (add all of these):
  - `https://agentledger.co/auth/callback`
  - `https://agentledger.co/auth/callback?next=/dashboard`
  - `https://agentledger.co/auth/callback?next=/onboarding`
  - `http://localhost:3000/auth/callback` *(for local dev)*
  - `http://localhost:3000/auth/callback?next=/dashboard`
  - `http://localhost:3000/auth/callback?next=/onboarding`

## 2. GitHub OAuth

Go to **GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App**:

- **Application name**: `AgentLedger`
- **Homepage URL**: `https://agentledger.co`
- **Authorization callback URL**: `https://<YOUR_PROJECT>.supabase.co/auth/v1/callback`

Copy the Client ID and Client Secret, then go to **Supabase → Authentication → Providers → GitHub** and paste them.

## 3. Email Templates

Go to **Supabase → Authentication → Email Templates**.

### Confirm Signup
**Subject**: `Welcome to AgentLedger — Confirm your email`

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #06b6d4); border-radius: 12px; line-height: 48px; color: white; font-size: 24px;">⚡</div>
  </div>
  <h1 style="font-size: 22px; font-weight: 600; color: #111; margin-bottom: 8px; text-align: center;">Welcome to AgentLedger</h1>
  <p style="color: #666; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 32px;">
    Click below to confirm your email and start monitoring your AI agents.
  </p>
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 15px;">Confirm Email</a>
  </div>
  <p style="color: #999; font-size: 12px; text-align: center;">
    If you didn't create an AgentLedger account, you can ignore this email.
  </p>
</div>
```

### Magic Link
**Subject**: `Your AgentLedger sign-in link`

```html
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #06b6d4); border-radius: 12px; line-height: 48px; color: white; font-size: 24px;">⚡</div>
  </div>
  <h1 style="font-size: 22px; font-weight: 600; color: #111; margin-bottom: 8px; text-align: center;">Sign in to AgentLedger</h1>
  <p style="color: #666; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 32px;">
    Click below to sign in. This link expires in 10 minutes.
  </p>
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 15px;">Sign In</a>
  </div>
  <p style="color: #999; font-size: 12px; text-align: center;">
    If you didn't request this link, you can ignore this email.
  </p>
</div>
```

## 4. Vercel Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `CRON_SECRET` | Generate: `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | `https://agentledger.co` |

## 5. CRON_SECRET

Generate one:
```bash
openssl rand -hex 32
```

Add it as a Vercel secret:
```bash
vercel secrets add cron-secret YOUR_GENERATED_SECRET
```
