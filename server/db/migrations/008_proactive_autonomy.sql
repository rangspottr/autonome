-- Phase 5C: Proactive Autonomy + Real-Time Operating Layer

-- Add SLA and pause support to workflows
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT false;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS pause_reason TEXT;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS escalation_level INT DEFAULT 0;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS fallback_action JSONB;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS triggered_by_event UUID REFERENCES business_events(id);

-- Proactive alerts table
CREATE TABLE IF NOT EXISTS proactive_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent VARCHAR(50) NOT NULL,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  entity_type VARCHAR(50),
  entity_id UUID,
  data JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proactive_alerts_workspace ON proactive_alerts(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_alerts_agent ON proactive_alerts(workspace_id, agent, status);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_digest BOOLEAN DEFAULT true,
  approval_alerts BOOLEAN DEFAULT true,
  critical_risk_alerts BOOLEAN DEFAULT true,
  boardroom_summaries BOOLEAN DEFAULT true,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone VARCHAR(50) DEFAULT 'UTC',
  channels JSONB DEFAULT '{"email": true, "in_app": true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- Autonomy settings table
CREATE TABLE IF NOT EXISTS autonomy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent VARCHAR(50),
  auto_execute_threshold NUMERIC DEFAULT 500,
  approval_threshold NUMERIC DEFAULT 5000,
  max_auto_actions_per_cycle INT DEFAULT 20,
  max_daily_emails INT DEFAULT 50,
  max_daily_sms INT DEFAULT 20,
  escalation_delay_hours INT DEFAULT 24,
  risk_tolerance VARCHAR(20) DEFAULT 'moderate',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, agent)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id, user_id, read, created_at DESC);

-- Add last_login_at to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
