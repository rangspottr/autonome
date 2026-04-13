-- Defensive: add created_at to agent_runs so queries using created_at work
-- The table originally only had started_at and completed_at
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
