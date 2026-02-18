-- AgentLedger Schema Migration
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- API KEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default Key',
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);

-- ============================================================
-- AGENTS
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
-- ACTION LOGS
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_org ON action_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_org_created ON action_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_agent ON action_logs(org_id, agent_name);
CREATE INDEX IF NOT EXISTS idx_action_logs_service ON action_logs(org_id, service);

-- ============================================================
-- BUDGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  period TEXT NOT NULL DEFAULT 'daily' CHECK (period IN ('daily', 'weekly', 'monthly')),
  max_actions INTEGER,
  max_cost_cents INTEGER,
  current_actions INTEGER NOT NULL DEFAULT 0,
  current_cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warning', 'critical', 'exceeded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budgets_agent ON budgets(agent_id);

-- ============================================================
-- ANOMALY ALERTS
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
-- ROW LEVEL SECURITY
-- ============================================================
-- Enable RLS on all tables (service role bypasses RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_alerts ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by the API)
-- No additional policies needed since we use the service role key
-- and filter by org_id in application code

-- ============================================================
-- HELPER FUNCTION: Reset budget counters (run on cron)
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

-- To set up automatic budget resets, use Supabase pg_cron:
-- SELECT cron.schedule('reset-daily-budgets', '0 0 * * *', $$SELECT reset_budget_counters('daily')$$);
-- SELECT cron.schedule('reset-weekly-budgets', '0 0 * * 1', $$SELECT reset_budget_counters('weekly')$$);
-- SELECT cron.schedule('reset-monthly-budgets', '0 0 1 * *', $$SELECT reset_budget_counters('monthly')$$);
