import { pool } from '../db/index.js';

/**
 * Generate a daily digest for a workspace.
 * Summarizes agent actions, key metrics, unresolved items, and upcoming deadlines.
 * Stores the digest as a business_event for display in the frontend.
 */
export async function generateDailyDigest(workspaceId) {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [agentActions, pendingDecisions, metrics, upcomingDeadlines, blockers] = await Promise.all([
      pool.query(
        `SELECT agent, action_type, outcome, description, entity_type, entity_id
         FROM agent_actions
         WHERE workspace_id = $1 AND created_at > $2
         ORDER BY created_at DESC`,
        [workspaceId, since.toISOString()]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM agent_actions
         WHERE workspace_id = $1 AND outcome = 'pending'`,
        [workspaceId]
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM invoices WHERE workspace_id = $1 AND status = 'overdue') AS overdue_invoices,
           (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE workspace_id = $1 AND status = 'overdue') AS overdue_amount,
           (SELECT COUNT(*) FROM deals WHERE workspace_id = $1 AND stage NOT IN ('won','lost')
              AND updated_at < NOW() - INTERVAL '7 days') AS stale_deals,
           (SELECT COUNT(*) FROM tasks WHERE workspace_id = $1 AND status = 'pending'
              AND due_date < NOW()) AS overdue_tasks`,
        [workspaceId]
      ),
      pool.query(
        `SELECT title, due_date, priority FROM tasks
         WHERE workspace_id = $1
           AND status = 'pending'
           AND due_date BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
         ORDER BY due_date ASC LIMIT 5`,
        [workspaceId]
      ),
      pool.query(
        `SELECT description, agent FROM agent_actions
         WHERE workspace_id = $1 AND outcome = 'blocked'
         ORDER BY created_at DESC LIMIT 5`,
        [workspaceId]
      ),
    ]);

    const m = metrics.rows[0] || {};
    const actionsByAgent = {};
    let autoExecuted = 0;
    let emailsSent = 0;

    for (const a of agentActions.rows) {
      if (!actionsByAgent[a.agent]) actionsByAgent[a.agent] = 0;
      actionsByAgent[a.agent]++;
      if (a.outcome === 'completed') autoExecuted++;
      if (a.action_type === 'email' || a.action_type === 'remind' || a.action_type === 'pre') emailsSent++;
    }

    const digestData = {
      period: { from: since.toISOString(), to: now.toISOString() },
      total_actions: agentActions.rows.length,
      auto_executed: autoExecuted,
      emails_sent: emailsSent,
      pending_approvals: parseInt(pendingDecisions.rows[0]?.count) || 0,
      actions_by_agent: actionsByAgent,
      key_metrics: {
        overdue_invoices: parseInt(m.overdue_invoices) || 0,
        overdue_amount: parseFloat(m.overdue_amount) || 0,
        stale_deals: parseInt(m.stale_deals) || 0,
        overdue_tasks: parseInt(m.overdue_tasks) || 0,
      },
      upcoming_deadlines: upcomingDeadlines.rows,
      blockers: blockers.rows,
      unresolved_items: parseInt(pendingDecisions.rows[0]?.count) || 0,
    };

    // Store digest as a business event
    await pool.query(
      `INSERT INTO business_events
         (workspace_id, source, event_type, status, raw_data, processed_at)
       VALUES ($1, 'system', 'daily_digest', 'processed', $2, NOW())`,
      [workspaceId, JSON.stringify(digestData)]
    );

    console.log(`[DailyDigest] Generated digest for workspace ${workspaceId}: ${agentActions.rows.length} actions, ${digestData.pending_approvals} pending approvals`);
    return digestData;
  } catch (err) {
    console.error(`[DailyDigest] Error generating digest for workspace ${workspaceId}:`, err.message);
    throw err;
  }
}

/**
 * Run the daily digest for all active workspaces.
 */
export async function runDailyDigestForAllWorkspaces() {
  try {
    const workspacesResult = await pool.query(
      `SELECT DISTINCT w.id FROM workspaces w
       WHERE EXISTS (
         SELECT 1 FROM users u
         WHERE u.workspace_id = w.id
       )`
    );

    console.log(`[DailyDigest] Running digest for ${workspacesResult.rows.length} workspace(s)`);

    for (const { id } of workspacesResult.rows) {
      await generateDailyDigest(id).catch((err) => {
        console.error(`[DailyDigest] Failed for workspace ${id}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[DailyDigest] Failed to run digest:', err.message);
  }
}

/**
 * Start the daily digest scheduler — runs once per day at midnight.
 */
export function startDailyDigestScheduler() {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Calculate ms until next midnight
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  console.log(`[DailyDigest] Scheduler started — next run in ${Math.round(msUntilMidnight / 60000)} minutes`);

  // First run at next midnight
  setTimeout(() => {
    runDailyDigestForAllWorkspaces();
    // Then run every 24h
    setInterval(runDailyDigestForAllWorkspaces, ONE_DAY_MS);
  }, msUntilMidnight);
}
