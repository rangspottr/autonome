-- Add command interface columns to chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS agent VARCHAR(50);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for session-based lookups
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_agent ON chat_messages(workspace_id, agent);

-- Conversation sessions table
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL DEFAULT 'quick',
  agent VARCHAR(50),
  title TEXT,
  resolved BOOLEAN DEFAULT false,
  has_pending_actions BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_sessions_workspace ON conversation_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conv_sessions_user ON conversation_sessions(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conv_sessions_updated ON conversation_sessions(workspace_id, updated_at DESC);
