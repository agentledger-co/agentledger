CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES action_logs(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  label TEXT,
  feedback TEXT,
  evaluated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_evaluations_org ON evaluations(org_id);
CREATE INDEX idx_evaluations_action ON evaluations(action_id);
CREATE INDEX idx_evaluations_org_created ON evaluations(org_id, created_at DESC);
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
