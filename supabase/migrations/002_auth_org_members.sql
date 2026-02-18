-- AgentLedger Auth Migration
-- Run this AFTER 001_initial_schema.sql

-- ============================================================
-- ORG MEMBERS (links Supabase Auth users to organizations)
-- ============================================================
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,  -- References auth.users(id) from Supabase Auth
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);

-- Enable RLS
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
