-- Trace ID lookup (used by /api/v1/traces/[traceId])
CREATE INDEX IF NOT EXISTS idx_action_logs_org_trace ON action_logs(org_id, trace_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_action_logs_org_status ON action_logs(org_id, status);

-- Cursor pagination (created_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_action_logs_org_created_desc ON action_logs(org_id, created_at DESC, id DESC);
