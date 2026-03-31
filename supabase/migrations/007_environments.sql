-- Add environment column to action_logs
ALTER TABLE action_logs ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

-- Add environment column to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_action_logs_org_env ON action_logs(org_id, environment);
CREATE INDEX IF NOT EXISTS idx_agents_org_env ON agents(org_id, environment);

-- Update agents unique constraint to include environment
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_org_id_name_key;
ALTER TABLE agents ADD CONSTRAINT agents_org_id_name_env_key UNIQUE(org_id, name, environment);
