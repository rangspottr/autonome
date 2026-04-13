-- ── Companies ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(workspace_id, domain);

-- Add company_id FK to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- ── Integrations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  config JSONB DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(workspace_id, type);

-- ── Business Events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  raw_data JSONB NOT NULL DEFAULT '{}',
  classified_data JSONB DEFAULT '{}',
  entity_links JSONB DEFAULT '[]',
  agent_routing JSONB DEFAULT '[]',
  owner_agent TEXT,
  resolution JSONB DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_events_workspace ON business_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_events_status ON business_events(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_business_events_source ON business_events(workspace_id, source);
CREATE INDEX IF NOT EXISTS idx_business_events_type ON business_events(workspace_id, event_type);
CREATE INDEX IF NOT EXISTS idx_business_events_created ON business_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_events_owner ON business_events(workspace_id, owner_agent);

-- ── Operator Instructions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent TEXT,
  instruction TEXT NOT NULL,
  type TEXT DEFAULT 'preference',
  priority INTEGER DEFAULT 50,
  active BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'manual',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operator_instructions_workspace ON operator_instructions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_operator_instructions_agent ON operator_instructions(workspace_id, agent);
