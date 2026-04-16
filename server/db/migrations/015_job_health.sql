CREATE TABLE IF NOT EXISTS job_health_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  job_name VARCHAR(120) NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('success', 'failed')),
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_health_runs_workspace_job_created
  ON job_health_runs(workspace_id, job_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_health_runs_status_created
  ON job_health_runs(status, created_at DESC);
