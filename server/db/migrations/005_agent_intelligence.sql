-- Persistent per-agent action log (not just cycle summaries)
CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  agent VARCHAR(50) NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  description TEXT NOT NULL,
  reasoning TEXT,
  outcome VARCHAR(50) DEFAULT 'pending',
  handed_off_to VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent memory: persistent context each agent accumulates
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  agent VARCHAR(50) NOT NULL,
  memory_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  content TEXT NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 1.0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_actions_workspace ON agent_actions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON agent_actions(agent, workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_entity ON agent_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_created ON agent_actions(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_memory_workspace ON agent_memory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent, workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_entity ON agent_memory(entity_type, entity_id);

-- Multi-turn AI chat history
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_workspace ON chat_messages(workspace_id);
