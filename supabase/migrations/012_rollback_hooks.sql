CREATE TABLE rollback_hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_name TEXT,
  service TEXT,
  action TEXT,
  rollback_webhook_url TEXT NOT NULL,
  rollback_config JSONB DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rollback_hooks_org ON rollback_hooks(org_id);
ALTER TABLE rollback_hooks ENABLE ROW LEVEL SECURITY;

CREATE TABLE rollback_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rollback_hook_id UUID NOT NULL REFERENCES rollback_hooks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_reason TEXT NOT NULL,
  trace_id TEXT,
  actions_context JSONB NOT NULL DEFAULT '[]',
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rollback_executions_org ON rollback_executions(org_id, created_at DESC);
ALTER TABLE rollback_executions ENABLE ROW LEVEL SECURITY;
