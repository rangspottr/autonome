import { pool } from '../db/index.js';

const HOURLY_RATE = 35;
const HOURS_PER_ACTION = 0.25;

/**
 * Calculate ROI for a workspace by querying real data from
 * communications, audit_log, and agent_runs tables.
 */
export async function calculateROI(workspaceId) {
  // Count delivered vs simulated communications across all channels (email + sms).
  // realSent = successfully delivered via SMTP/Twilio; loggedSent = simulated (no credentials configured).
  const commResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
       COUNT(*) FILTER (WHERE status = 'simulated') AS simulated_count
     FROM communications
     WHERE workspace_id = $1 AND channel IN ('email', 'sms')`,
    [workspaceId]
  );
  const commStats = commResult.rows[0];
  const realSent = parseInt(commStats.sent_count, 10) || 0;
  const loggedSent = parseInt(commStats.simulated_count, 10) || 0;

  // Count qualifying actions from audit_log
  const auditResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE action = 'qualify') AS leads_qualified,
       COUNT(*) FILTER (WHERE action = 'escalate' AND entity_type = 'task') AS tasks_auto,
       COUNT(*) FILTER (WHERE outcome = 'executed') AS total_actions
     FROM audit_log
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  const auditStats = auditResult.rows[0];
  const leadsQualified = parseInt(auditStats.leads_qualified, 10) || 0;
  const tasksAuto = parseInt(auditStats.tasks_auto, 10) || 0;
  const totalAuditActions = parseInt(auditStats.total_actions, 10) || 0;

  // Count closed deals revenue
  const dealsResult = await pool.query(
    `SELECT COUNT(*) AS deals_closed,
            COALESCE(SUM(value), 0) AS deals_value
     FROM deals
     WHERE workspace_id = $1 AND stage = 'closed'`,
    [workspaceId]
  );
  const dealsClosed = parseInt(dealsResult.rows[0].deals_closed, 10) || 0;
  const dealsValue = parseFloat(dealsResult.rows[0].deals_value) || 0;

  // Count paid invoices
  const invoicesResult = await pool.query(
    `SELECT COALESCE(SUM(amount_paid), 0) AS collected
     FROM invoices
     WHERE workspace_id = $1 AND status = 'paid'`,
    [workspaceId]
  );
  const collected = parseFloat(invoicesResult.rows[0].collected) || 0;

  // Workflow stats
  const wfResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active') AS active_wf,
       COUNT(*) FILTER (WHERE status = 'completed') AS completed_wf,
       COUNT(*) FILTER (WHERE status = 'completed' AND context->>'outcome' = 'payment_received') AS paid_wf
     FROM workflows
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  const activeWf = parseInt(wfResult.rows[0].active_wf, 10) || 0;
  const completedWf = parseInt(wfResult.rows[0].completed_wf, 10) || 0;
  const paidWf = parseInt(wfResult.rows[0].paid_wf, 10) || 0;

  // Agent run stats
  const runResult = await pool.query(
    `SELECT COUNT(*) AS run_count, COALESCE(SUM(actions_taken), 0) AS total_run_actions
     FROM agent_runs
     WHERE workspace_id = $1 AND status = 'completed'`,
    [workspaceId]
  );
  const runCount = parseInt(runResult.rows[0].run_count, 10) || 0;

  const totalActions = realSent + leadsQualified + tasksAuto;
  const hoursSaved = totalActions * HOURS_PER_ACTION;
  const moneySaved = hoursSaved * HOURLY_RATE;
  const headcountEquiv = hoursSaved / 160;

  return {
    totalActions,
    hoursSaved: Math.round(hoursSaved * 10) / 10,
    moneySaved: Math.round(moneySaved),
    headcountEquiv: Math.round(headcountEquiv * 10) / 10,
    collected,
    dealsClosed,
    dealsValue,
    realSent,
    loggedSent,
    totalAuditActions,
    activeWf,
    completedWf,
    paidWf,
    runCount,
  };
}

/**
 * Calculate a 0–100 health score for a workspace based on:
 * - Revenue vs expenses (from invoices)
 * - Open deals pipeline
 * - Task completion rate
 * - Overdue task penalty
 * - Contact presence
 */
export async function calculateHealth(workspaceId) {
  let score = 50;

  // Revenue: sum of paid invoices vs pending/overdue
  const invResult = await pool.query(
    `SELECT
       COALESCE(SUM(amount_paid), 0) AS revenue,
       COALESCE(SUM(amount) FILTER (WHERE status NOT IN ('paid', 'draft')), 0) AS outstanding
     FROM invoices
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  const revenue = parseFloat(invResult.rows[0].revenue) || 0;
  const outstanding = parseFloat(invResult.rows[0].outstanding) || 0;
  if (revenue > outstanding) score += 15;
  if (revenue > 0 && (revenue - outstanding) / revenue > 0.2) score += 10;

  // Deals pipeline
  const dealResult = await pool.query(
    `SELECT COUNT(*) AS open_deals FROM deals WHERE workspace_id = $1 AND stage != 'closed'`,
    [workspaceId]
  );
  const openDeals = parseInt(dealResult.rows[0].open_deals, 10) || 0;
  if (openDeals >= 3) score += 5;

  // Task completion rate
  const taskResult = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'done') AS done,
       COUNT(*) FILTER (WHERE status != 'done' AND due_date IS NOT NULL AND due_date < NOW()) AS overdue
     FROM tasks
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  const totalTasks = parseInt(taskResult.rows[0].total, 10) || 0;
  const doneTasks = parseInt(taskResult.rows[0].done, 10) || 0;
  const overdueTasks = parseInt(taskResult.rows[0].overdue, 10) || 0;
  if (totalTasks > 0 && doneTasks / totalTasks > 0.5) score += 5;
  score -= overdueTasks * 3;

  // Asset low-stock penalty
  const assetResult = await pool.query(
    `SELECT COUNT(*) AS low_stock
     FROM assets
     WHERE workspace_id = $1
       AND (metadata->>'reorder_point') IS NOT NULL
       AND (metadata->>'reorder_point')::int > 0
       AND quantity < (metadata->>'reorder_point')::int`,
    [workspaceId]
  );
  const lowStock = parseInt(assetResult.rows[0].low_stock, 10) || 0;
  score -= lowStock * 5;

  // Contact presence
  const contactResult = await pool.query(
    'SELECT COUNT(*) AS total FROM contacts WHERE workspace_id = $1',
    [workspaceId]
  );
  const contactCount = parseInt(contactResult.rows[0].total, 10) || 0;
  if (contactCount === 0) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}
