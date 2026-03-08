-- ============================================================
-- AgentLedger — Complete Database Setup
-- ============================================================
-- Run this ONCE in your Supabase SQL Editor:
--   Dashboard > SQL Editor > New Query > Paste this > Run
--
-- This creates all tables, indexes, and RLS policies.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. ORG MEMBERS (links Supabase Auth users → organizations)
-- ============================================================
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,  -- References auth.users(id)
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);

-- ============================================================
-- 3. API KEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default Key',
  description TEXT,
  scopes TEXT[] DEFAULT '{"*"}',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);

-- ============================================================
-- 4. AGENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'killed')),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agents_org ON agents(org_id);
CREATE INDEX IF NOT EXISTS idx_agents_org_name ON agents(org_id, name);

-- ============================================================
-- 5. ACTION LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS action_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  service TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'blocked')),
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  request_meta JSONB DEFAULT '{}',
  trace_id TEXT,
  input JSONB,
  output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_org ON action_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_org_created ON action_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_agent ON action_logs(org_id, agent_name);
CREATE INDEX IF NOT EXISTS idx_action_logs_service ON action_logs(org_id, service);
CREATE INDEX IF NOT EXISTS idx_action_logs_trace ON action_logs(org_id, trace_id) WHERE trace_id IS NOT NULL;

-- ============================================================
-- 6. BUDGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  period TEXT NOT NULL DEFAULT 'daily' CHECK (period IN ('hourly', 'daily', 'weekly', 'monthly')),
  max_actions INTEGER,
  max_cost_cents INTEGER,
  current_actions INTEGER NOT NULL DEFAULT 0,
  current_cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warning', 'critical', 'exceeded')),
  period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_agent ON budgets(agent_id);

-- ============================================================
-- 7. ANOMALY ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_org ON anomaly_alerts(org_id);
CREATE INDEX IF NOT EXISTS idx_alerts_org_created ON anomaly_alerts(org_id, created_at DESC);

-- ============================================================
-- 8. WEBHOOKS
-- ============================================================
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(org_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(org_id, active);

-- ============================================================
-- 9. WEBHOOK DELIVERY LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  response_status INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org ON webhook_deliveries(org_id, created_at DESC);

-- ============================================================
-- 10. NOTIFICATION SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack')),
  config JSONB NOT NULL DEFAULT '{}',
  events TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_org ON notification_settings(org_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Note: All API access uses the service_role key which bypasses RLS.
-- Application code filters by org_id to enforce data isolation.
-- These RLS policies are a defense-in-depth layer — if the anon key
-- is accidentally used, data is still protected.

-- Allow service role full access (API routes use this)
-- Block anon key from all tables (defense in depth)
CREATE POLICY "Service role only" ON organizations FOR ALL USING (false);
CREATE POLICY "Service role only" ON org_members FOR ALL USING (false);
CREATE POLICY "Service role only" ON api_keys FOR ALL USING (false);
CREATE POLICY "Service role only" ON agents FOR ALL USING (false);
CREATE POLICY "Service role only" ON action_logs FOR ALL USING (false);
CREATE POLICY "Service role only" ON budgets FOR ALL USING (false);
CREATE POLICY "Service role only" ON anomaly_alerts FOR ALL USING (false);
CREATE POLICY "Service role only" ON webhooks FOR ALL USING (false);
CREATE POLICY "Service role only" ON webhook_deliveries FOR ALL USING (false);
CREATE POLICY "Service role only" ON notification_settings FOR ALL USING (false);

-- ============================================================
-- BUDGET RESET FUNCTION (for cron jobs)
-- ============================================================
CREATE OR REPLACE FUNCTION reset_budget_counters(budget_period TEXT)
RETURNS void AS $$
BEGIN
  UPDATE budgets
  SET current_actions = 0,
      current_cost_cents = 0,
      status = 'ok',
      updated_at = NOW()
  WHERE period = budget_period;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- OPTIONAL: Automatic budget resets via pg_cron
-- ============================================================
-- Uncomment these if you have pg_cron enabled (Supabase Pro):
--
-- SELECT cron.schedule('reset-hourly-budgets', '0 * * * *', $$SELECT reset_budget_counters('hourly')$$);
-- SELECT cron.schedule('reset-daily-budgets', '0 0 * * *', $$SELECT reset_budget_counters('daily')$$);
-- SELECT cron.schedule('reset-weekly-budgets', '0 0 * * 1', $$SELECT reset_budget_counters('weekly')$$);
-- SELECT cron.schedule('reset-monthly-budgets', '0 0 1 * *', $$SELECT reset_budget_counters('monthly')$$);

-- ============================================================
-- DONE! Your database is ready.
-- ============================================================
