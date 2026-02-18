-- AgentLedger: Usage Limits & Plan Enforcement
-- Run AFTER 003_webhooks_keys.sql

-- Add plan column to organizations (free, pro, team)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Index for cron cleanup queries
CREATE INDEX IF NOT EXISTS idx_action_logs_org_created 
  ON action_logs(org_id, created_at);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org_created 
  ON webhook_deliveries(org_id, created_at);
