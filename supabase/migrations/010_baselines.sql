-- Agent Baselines for Statistical Anomaly Detection
-- Stores rolling statistical baselines per agent per metric

CREATE TABLE agent_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'actions_per_hour', 'cost_per_action', 'duration_per_action',
    'error_rate', 'service_distribution'
  )),
  baseline_value NUMERIC NOT NULL DEFAULT 0,
  stddev NUMERIC NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, agent_name, metric)
);

CREATE INDEX idx_baselines_org ON agent_baselines(org_id);
CREATE INDEX idx_baselines_org_agent ON agent_baselines(org_id, agent_name);

ALTER TABLE agent_baselines ENABLE ROW LEVEL SECURITY;
