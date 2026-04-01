-- Add Discord and PagerDuty notification channels
-- Run AFTER 014_new_features.sql

ALTER TABLE notification_settings DROP CONSTRAINT IF EXISTS notification_settings_channel_check;
ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_channel_check
  CHECK (channel IN ('email', 'slack', 'discord', 'pagerduty'));

-- Update unique constraint to support new channels
DROP INDEX IF EXISTS notification_settings_org_id_channel_key;
CREATE UNIQUE INDEX IF NOT EXISTS notification_settings_org_channel
  ON notification_settings(org_id, channel);
