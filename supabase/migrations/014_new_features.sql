-- New Features: Batch Logging, Data Export, Cost Forecasting, Policy Templates, Advanced Analytics
-- Run AFTER 013_team_management.sql
--
-- These features use existing tables (action_logs, budgets, agents, policies).
-- This migration adds indexes to support the new query patterns.

-- ============================================================
-- INDEX: Support date-range export queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_action_logs_org_env_created
  ON action_logs(org_id, environment, created_at);

-- ============================================================
-- INDEX: Support analytics agent+service breakdowns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_action_logs_org_agent_created
  ON action_logs(org_id, agent_name, created_at);

-- ============================================================
-- INDEX: Support forecasting cost aggregation
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_action_logs_org_cost
  ON action_logs(org_id, estimated_cost_cents)
  WHERE estimated_cost_cents > 0;

-- ============================================================
-- INDEX: Support batch logging agent upsert
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_org_name_env
  ON agents(org_id, name, environment);
