-- Add period_start column to budgets table for tracking budget reset cycles
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS period_start timestamptz DEFAULT now();
