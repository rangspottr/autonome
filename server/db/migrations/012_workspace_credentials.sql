CREATE TABLE IF NOT EXISTS workspace_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_workspace_credentials_lookup ON workspace_credentials(workspace_id, provider);
