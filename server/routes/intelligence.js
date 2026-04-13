import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

/**
 * GET /api/intelligence/summary
 * Cross-table intelligence: returns structured insights about the workspace.
 */
router.get('/summary', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;
    const insights = [];

    // 1. Contacts with overdue invoices AND open deals (revenue coordination needed)
    const riskCoordResult = await pool.query(
      `SELECT c.id AS contact_id, c.name AS contact_name,
              SUM(i.amount) AS overdue_amount,
              COUNT(DISTINCT i.id) AS invoice_count,
              SUM(d.value) AS deal_value,
              COUNT(DISTINCT d.id) AS deal_count
       FROM contacts c
       JOIN invoices i ON i.contact_id = c.id AND i.workspace_id = $1
         AND i.status IN ('overdue', 'escalated')
       JOIN deals d ON d.contact_id = c.id AND d.workspace_id = $1
         AND d.stage NOT IN ('closed', 'lost')
       WHERE c.workspace_id = $1
       GROUP BY c.id, c.name
       ORDER BY overdue_amount DESC
       LIMIT 5`,
      [wsId]
    );

    for (const row of riskCoordResult.rows) {
      insights.push({
        type: 'revenue_collection_conflict',
        severity: 'high',
        title: `${row.contact_name} has overdue invoices and an open deal`,
        description: `${row.contact_name} has $${Math.round(row.overdue_amount).toLocaleString()} in overdue invoices (${row.invoice_count} invoice${row.invoice_count > 1 ? 's' : ''}) and $${Math.round(row.deal_value).toLocaleString()} in open deals (${row.deal_count} deal${row.deal_count > 1 ? 's' : ''}) — coordinate collection carefully to preserve the relationship.`,
        entities: [{ type: 'contact', id: row.contact_id, name: row.contact_name }],
        agents_involved: ['finance', 'revenue'],
      });
    }

    // 2. Tasks overdue that are related to active workflows (blocking progress)
    const blockingTasksResult = await pool.query(
      `SELECT t.id AS task_id, t.title AS task_title,
              w.id AS workflow_id, w.template AS workflow_type,
              EXTRACT(EPOCH FROM (NOW() - t.due_date)) / 86400 AS days_overdue
       FROM tasks t
       JOIN workflows w ON w.trigger_entity_id = t.id AND w.status = 'active'
       WHERE t.workspace_id = $1
         AND t.status NOT IN ('done', 'completed')
         AND t.due_date < NOW()
       ORDER BY days_overdue DESC
       LIMIT 5`,
      [wsId]
    );

    if (blockingTasksResult.rows.length > 0) {
      insights.push({
        type: 'overdue_tasks_blocking_workflows',
        severity: 'medium',
        title: `${blockingTasksResult.rows.length} overdue task${blockingTasksResult.rows.length > 1 ? 's' : ''} blocking active workflows`,
        description: `Overdue tasks are stalling active workflow progress. Completing these tasks will unblock automation.`,
        entities: blockingTasksResult.rows.map((r) => ({
          type: 'task',
          id: r.task_id,
          name: r.task_title,
        })),
        agents_involved: ['operations'],
      });
    }

    // 3. Deals closing this week with no invoice created
    const closingDealsResult = await pool.query(
      `SELECT d.id, d.title, d.value, d.expected_close_date, c.name AS contact_name
       FROM deals d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.workspace_id = $1
         AND d.stage NOT IN ('closed', 'lost')
         AND d.expected_close_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
         AND NOT EXISTS (
           SELECT 1 FROM invoices i
           WHERE i.contact_id = d.contact_id
             AND i.workspace_id = $1
             AND i.created_at > NOW() - INTERVAL '30 days'
             AND i.status NOT IN ('draft')
         )
       ORDER BY d.expected_close_date ASC
       LIMIT 5`,
      [wsId]
    );

    for (const row of closingDealsResult.rows) {
      insights.push({
        type: 'closing_deal_no_invoice',
        severity: 'medium',
        title: `Deal "${row.title}" closing this week with no invoice`,
        description: `"${row.title}" ($${Math.round(row.value || 0).toLocaleString()}) is expected to close on ${new Date(row.expected_close_date).toLocaleDateString()} but no invoice has been created yet.`,
        entities: [{ type: 'deal', id: row.id, name: row.title }],
        agents_involved: ['revenue', 'finance'],
      });
    }

    // 4. Communications sent 3+ days ago with no follow-up response
    const ghostedResult = await pool.query(
      `SELECT comm.id, comm.subject, comm.created_at, c.name AS contact_name, c.id AS contact_id
       FROM communications comm
       LEFT JOIN contacts c ON c.id = comm.contact_id
       WHERE comm.workspace_id = $1
         AND comm.direction = 'outbound'
         AND comm.status = 'sent'
         AND comm.created_at < NOW() - INTERVAL '3 days'
         AND NOT EXISTS (
           SELECT 1 FROM communications reply
           WHERE reply.workspace_id = $1
             AND reply.contact_id = comm.contact_id
             AND reply.direction = 'inbound'
             AND reply.created_at > comm.created_at
         )
       ORDER BY comm.created_at ASC
       LIMIT 5`,
      [wsId]
    );

    if (ghostedResult.rows.length > 0) {
      insights.push({
        type: 'unanswered_communications',
        severity: 'low',
        title: `${ghostedResult.rows.length} outbound message${ghostedResult.rows.length > 1 ? 's' : ''} with no response for 3+ days`,
        description: `Follow-up may be needed. These contacts have not responded to recent outreach.`,
        entities: ghostedResult.rows.map((r) => ({
          type: 'contact',
          id: r.contact_id,
          name: r.contact_name,
        })),
        agents_involved: ['revenue', 'support'],
      });
    }

    res.json(insights);
  } catch (err) {
    next(err);
  }
});

export default router;
