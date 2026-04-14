-- 013_outputs.sql
-- Stores finished output artifacts (briefings, reports, operator summaries)
-- produced by scheduled jobs so the UI can surface them as deliverables.

CREATE TABLE IF NOT EXISTS outputs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  output_type   TEXT        NOT NULL,   -- morning_briefing | weekly_report | collections_summary | inbox_summary
  title         TEXT        NOT NULL,
  content       TEXT        NOT NULL,   -- human-readable Markdown / structured text
  data          JSONB       NOT NULL DEFAULT '{}', -- underlying structured data
  period_start  TIMESTAMPTZ,
  period_end    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outputs_workspace_type_idx
  ON outputs (workspace_id, output_type, created_at DESC);
