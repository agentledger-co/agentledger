# AgentLedger — Supabase Setup Guide

Complete guide to get AgentLedger running with Supabase. Takes ~10 minutes.

---

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (GitHub login works)
2. Click **"New Project"**
3. Fill in:
   - **Name:** `agentledger` (or whatever you want)
   - **Database Password:** generate a strong one and save it
   - **Region:** choose closest to your users (e.g. `eu-west-1` for Ireland)
4. Click **"Create new project"** — takes ~2 minutes to provision

---

## Step 2: Run the Database Migration

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Open the file `supabase/setup.sql` from this project
4. Copy the entire contents and paste into the SQL Editor
5. Click **"Run"** (or Cmd+Enter)
6. You should see "Success. No rows returned" — that means all tables were created

**Verify:** Go to **Table Editor** in the sidebar. You should see 9 tables:
- `organizations`
- `org_members`
- `api_keys`
- `agents`
- `action_logs`
- `budgets`
- `anomaly_alerts`
- `webhooks`
- `webhook_deliveries`

---

## Step 3: Get Your API Keys

1. Go to **Settings** > **API** (left sidebar > gear icon > API)
2. Copy these three values:

| Value | Where to find it | What it's for |
|-------|-----------------|---------------|
| **Project URL** | Under "Project URL" | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon public** | Under "Project API keys" | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role secret** | Under "Project API keys" (click "Reveal") | `SUPABASE_SERVICE_ROLE_KEY` |

⚠️ The `service_role` key bypasses Row Level Security. Never expose it in browser code.

---

## Step 4: Configure Environment Variables

```bash
# In your agentledger project directory:
cp .env.example .env.local
```

Edit `.env.local` and paste your three values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

---

## Step 5: Configure Authentication

### Email/Password Auth (enabled by default)

1. Go to **Authentication** > **Providers** in Supabase dashboard
2. **Email** should already be enabled
3. Recommended settings under **Authentication** > **Settings**:
   - ✅ Enable email confirmations (on by default)
   - Set "Minimum password length" to 6
   - Under "Email Templates", customize the **Confirm signup** template:

```html
<h2>Welcome to AgentLedger</h2>
<p>Click the link below to confirm your account:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
<p>If you didn't sign up for AgentLedger, ignore this email.</p>
```

### GitHub OAuth (recommended)

1. Go to **Authentication** > **Providers** > **GitHub**
2. Toggle it **ON**
3. You'll see a callback URL like: `https://abcdefghijklm.supabase.co/auth/v1/callback`
4. Now go to GitHub:
   - [github.com/settings/developers](https://github.com/settings/developers) > **OAuth Apps** > **New OAuth App**
   - **Application name:** `AgentLedger`
   - **Homepage URL:** `https://agentledger.co` (or `http://localhost:3000` for dev)
   - **Authorization callback URL:** paste the Supabase callback URL from step 3
   - Click **Register application**
5. Copy the **Client ID** and generate a **Client Secret**
6. Back in Supabase, paste both into the GitHub provider settings
7. Click **Save**

### URL Configuration

1. Go to **Authentication** > **URL Configuration**
2. Set:
   - **Site URL:** `http://localhost:3000` (for dev) or `https://agentledger.co` (for prod)
   - **Redirect URLs:** add these:
     - `http://localhost:3000/auth/callback`
     - `https://agentledger.co/auth/callback`
     - `http://localhost:3000/**` (for dev convenience)

---

## Step 6: Start the App

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). You should see the landing page with the animated heartbeat logo.

Click **"Start Free →"** to test the full signup flow.

---

## Step 7: Verify Everything Works

### Test 1: Sign up
1. Go to `/signup`
2. Enter an email and password
3. Check your email for the confirmation link
4. Click it → you should land on `/onboarding`
5. Name your workspace → get an API key → test it

### Test 2: Send an action
```bash
curl -X POST http://localhost:3000/api/v1/actions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent":"test-bot","service":"test","action":"hello","status":"success"}'
```

### Test 3: Check the dashboard
Go to `/dashboard` — you should see your test action in the feed.

### Test 4: Check Supabase
Go to your Supabase dashboard > **Table Editor**:
- `organizations` — should have 1 row
- `org_members` — should have 1 row linking your user
- `api_keys` — should have 1 row
- `action_logs` — should have your test action

Go to **Authentication** > **Users**:
- Should show your email, confirmed status, and last sign-in

---

## Deploying to Vercel

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com) > **Add New Project** > Import your repo
3. In the **Environment Variables** section, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = `https://agentledger.co` (or your domain)
4. Click **Deploy**
5. Update Supabase URL Configuration:
   - Add `https://your-domain.vercel.app/auth/callback` to Redirect URLs
   - Update Site URL to your production domain
6. Update GitHub OAuth:
   - Add production callback URL in GitHub OAuth app settings
   - Add production homepage URL

---

## Where to See Your Users

| What | Where |
|------|-------|
| **User accounts** | Supabase > Authentication > Users |
| **Organizations** | Supabase > Table Editor > `organizations` |
| **User → Org links** | Supabase > Table Editor > `org_members` |
| **API keys** | Supabase > Table Editor > `api_keys` (hashed — you can't see the raw keys) |
| **Agent activity** | Supabase > Table Editor > `action_logs` |
| **All data** | Supabase > SQL Editor > write any query you want |

### Useful queries to run in SQL Editor:

```sql
-- How many users signed up?
SELECT count(*) FROM auth.users;

-- Users by signup date
SELECT email, created_at, last_sign_in_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 20;

-- Actions per org
SELECT o.name, count(a.id) as actions
FROM organizations o
LEFT JOIN action_logs a ON a.org_id = o.id
GROUP BY o.name
ORDER BY actions DESC;

-- Most active agents
SELECT agent_name, count(*) as actions, sum(estimated_cost_cents) as total_cost_cents
FROM action_logs
GROUP BY agent_name
ORDER BY actions DESC
LIMIT 20;

-- Storage usage (approximate)
SELECT pg_size_pretty(pg_total_relation_size('action_logs')) as action_logs_size,
       pg_size_pretty(pg_total_relation_size('agents')) as agents_size,
       pg_size_pretty(pg_database_size(current_database())) as total_db_size;
```

---

## Optional: Budget Reset Cron Jobs

If you're on Supabase Pro ($25/mo), you get `pg_cron` for automatic budget resets. Run in SQL Editor:

```sql
-- Reset hourly budgets every hour
SELECT cron.schedule('reset-hourly-budgets', '0 * * * *', $$SELECT reset_budget_counters('hourly')$$);

-- Reset daily budgets at midnight UTC
SELECT cron.schedule('reset-daily-budgets', '0 0 * * *', $$SELECT reset_budget_counters('daily')$$);

-- Reset weekly budgets every Monday at midnight UTC
SELECT cron.schedule('reset-weekly-budgets', '0 0 * * 1', $$SELECT reset_budget_counters('weekly')$$);

-- Reset monthly budgets on the 1st of each month
SELECT cron.schedule('reset-monthly-budgets', '0 0 1 * *', $$SELECT reset_budget_counters('monthly')$$);
```

On the free tier, budgets won't auto-reset. Users can manually reset from the dashboard.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Invalid API key" on dashboard | Your `.env.local` Supabase keys are wrong or missing |
| Sign up works but no confirmation email | Check Supabase > Authentication > Settings > email confirmations are ON. Check spam folder. |
| GitHub OAuth redirects to wrong URL | Update callback URL in both GitHub OAuth app AND Supabase provider settings |
| "relation does not exist" errors | You haven't run the migration. Go to SQL Editor and run `supabase/setup.sql` |
| Dashboard shows "Loading..." forever | Check browser console for errors. Usually means Supabase isn't configured |
| Infinite redirect between dashboard and onboarding | Fixed in v13 — make sure you're on the latest version |
