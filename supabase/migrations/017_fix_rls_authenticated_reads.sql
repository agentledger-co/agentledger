-- Fix RLS policies for tables that are read directly from the browser client.
--
-- The original "Service role only" policies (setup.sql + 001_initial_schema.sql)
-- used USING (false), which blocked authenticated users — not just anon. This
-- caused WorkspaceSwitcher and related dashboard UI to silently receive empty
-- results from org_members, organizations, and api_keys.
--
-- This migration replaces those three policies with scoped SELECT policies:
-- authenticated users can read their own membership rows, the orgs they belong
-- to, and api_key metadata for those orgs. Service role continues to bypass
-- RLS entirely (unchanged), so all /api/v1/* routes are unaffected. Writes
-- still flow through those API routes. Anon users remain fully blocked.
--
-- Idempotent: safe to run multiple times.

DROP POLICY IF EXISTS "Service role only" ON org_members;
DROP POLICY IF EXISTS "Service role only" ON organizations;
DROP POLICY IF EXISTS "Service role only" ON api_keys;

-- Also drop the replacement policies if they already exist (re-run safety)
DROP POLICY IF EXISTS "Users can read their own memberships" ON org_members;
DROP POLICY IF EXISTS "Members can read their organizations" ON organizations;
DROP POLICY IF EXISTS "Members can read api_keys in their orgs" ON api_keys;

CREATE POLICY "Users can read their own memberships" ON org_members
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members can read their organizations" ON organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can read api_keys in their orgs" ON api_keys
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));
