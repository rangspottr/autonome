import { pool } from '../db/index.js';

export async function recordJobHealthRun({
  workspaceId = null,
  jobName,
  status,
  durationMs = null,
  errorMessage = null,
  metadata = {},
}) {
  if (!jobName || !status) return;
  await pool.query(
    `INSERT INTO job_health_runs
       (workspace_id, job_name, status, duration_ms, error_message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      workspaceId,
      jobName,
      status,
      Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
      errorMessage || null,
      JSON.stringify(metadata || {}),
    ]
  );
}

export async function getWorkspaceWorkflowHealth(workspaceId) {
  const [workflowState, recentRuns, failures24h] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM workflows
       WHERE workspace_id = $1
       GROUP BY status`,
      [workspaceId]
    ),
    pool.query(
      `SELECT job_name, status, duration_ms, error_message, created_at
       FROM job_health_runs
       WHERE workspace_id = $1 OR workspace_id IS NULL
       ORDER BY created_at DESC
       LIMIT 25`,
      [workspaceId]
    ),
    pool.query(
      `SELECT job_name, COUNT(*)::int AS failed_count
       FROM job_health_runs
       WHERE (workspace_id = $1 OR workspace_id IS NULL)
         AND status = 'failed'
         AND created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY job_name
       ORDER BY failed_count DESC`,
      [workspaceId]
    ),
  ]);

  return {
    workflow_counts: workflowState.rows,
    recent_runs: recentRuns.rows,
    failed_runs_24h: failures24h.rows,
  };
}
