-- ============================================================
-- Migration: Add traces, input/output, and notification settings
-- ============================================================

-- 1. Add trace_id, input, output columns to action_logs
ALTER TABLE action_logs ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE action_logs ADD COLUMN IF NOT EXISTS input JSONB;
ALTER TABLE action_logs ADD COLUMN IF NOT EXISTS output JSONB;

-- Index for trace lookups
CREATE INDEX IF NOT EXISTS idx_action_logs_trace ON action_logs(org_id, trace_id) WHERE trace_id IS NOT NULL;

-- 2. Notification settings table
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
