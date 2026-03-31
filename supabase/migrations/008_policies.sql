CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_name TEXT,  -- NULL = applies to all agents
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'rate_limit', 'service_allowlist', 'service_blocklist',
    'cost_limit_per_action', 'payload_regex_block', 'require_approval'
  )),
  rule_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_policies_org ON policies(org_id);
CREATE INDEX idx_policies_org_agent ON policies(org_id, agent_name);
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
