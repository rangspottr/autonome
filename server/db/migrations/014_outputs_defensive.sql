-- 014_outputs_defensive.sql
-- Defensive column additions for the outputs table.
--
-- Migration 013 creates outputs with CREATE TABLE IF NOT EXISTS.  If the
-- table already existed in a partial state (e.g. an older schema, or a
-- migration that was applied before 013 ran fully), those new columns would
-- never be added because Postgres silently skips CREATE TABLE when the table
-- is already present.
--
-- This migration uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS to guarantee
-- every required column is present regardless of prior schema state.  All
-- statements are idempotent and safe to re-run.

ALTER TABLE outputs ADD COLUMN IF NOT EXISTS title       TEXT        NOT NULL DEFAULT '';
ALTER TABLE outputs ADD COLUMN IF NOT EXISTS content     TEXT        NOT NULL DEFAULT '';
ALTER TABLE outputs ADD COLUMN IF NOT EXISTS data        JSONB       NOT NULL DEFAULT '{}';
ALTER TABLE outputs ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ;
ALTER TABLE outputs ADD COLUMN IF NOT EXISTS period_end   TIMESTAMPTZ;

-- Backfill a human-readable title for any rows that ended up with an empty
-- title (e.g. rows inserted before this column existed).
UPDATE outputs
SET title = CASE
  WHEN output_type = 'morning_briefing'   THEN 'Morning Briefing'
  WHEN output_type = 'weekly_report'      THEN 'Weekly Report'
  WHEN output_type = 'collections_summary' THEN 'Collections Summary'
  WHEN output_type = 'inbox_summary'      THEN 'Inbox Summary'
  ELSE 'Output'
END
WHERE title = '' OR title IS NULL;
