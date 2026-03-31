-- Human-in-the-Loop Approvals
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  service TEXT NOT NULL,
  action TEXT NOT NULL,
  input JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  environment TEXT NOT NULL DEFAULT 'production'
);
CREATE INDEX idx_approvals_org_status ON approval_requests(org_id, status);
CREATE INDEX idx_approvals_org_pending ON approval_requests(org_id) WHERE status = 'pending';
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
