-- Composite indexes for common filter combinations on action_logs
CREATE INDEX IF NOT EXISTS idx_action_logs_org_agent_created ON action_logs(org_id, agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_org_service_created ON action_logs(org_id, service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_org_status_created ON action_logs(org_id, status, created_at DESC);
