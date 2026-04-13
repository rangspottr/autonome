-- Migration 010: Intelligence layer trust fixes
-- Adds last_active_at to users for "since last login" briefing tracking

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Index to speed up briefing queries
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(id, last_active_at);

-- Add blocked_reason to agent_actions metadata support (already JSONB — no schema change needed)
-- Index for fast blocked action queries with reason
CREATE INDEX IF NOT EXISTS idx_agent_actions_blocked ON agent_actions(workspace_id, agent, outcome) WHERE outcome IN ('blocked', 'pending');

-- Index for finding recent chat messages by user session (for user-scoped history)
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session ON chat_messages(workspace_id, user_id, session_id, created_at DESC);
