import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { calculateROI, calculateHealth } from '../engine/metrics.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

/**
 * GET /api/metrics/roi
 * Return ROI calculation for the workspace.
 */
router.get('/roi', ...guard, async (req, res, next) => {
  try {
    const roi = await calculateROI(req.workspace.id);
    res.json(roi);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/metrics/health
 * Return health score (0–100) for the workspace.
 */
router.get('/health', ...guard, async (req, res, next) => {
  try {
    const score = await calculateHealth(req.workspace.id);
    res.json({ score });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/metrics/summary
 * Return dashboard summary: totals for contacts, deals, invoices, tasks,
 * active workflows, and recent agent runs.
 */
router.get('/summary', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;

    const [contacts, deals, invoices, tasks, workflows, agentRuns] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM contacts WHERE workspace_id = $1', [wsId]),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE stage != 'closed') AS open,
                COALESCE(SUM(value) FILTER (WHERE stage != 'closed'), 0) AS pipeline_value
         FROM deals WHERE workspace_id = $1`,
        [wsId]
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                COUNT(*) FILTER (WHERE status = 'paid') AS paid,
                COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS outstanding
         FROM invoices WHERE workspace_id = $1`,
        [wsId]
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'done') AS done,
                COUNT(*) FILTER (WHERE status != 'done' AND due_date IS NOT NULL AND due_date < NOW()) AS overdue
         FROM tasks WHERE workspace_id = $1`,
        [wsId]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'active') AS active,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed
         FROM workflows WHERE workspace_id = $1`,
        [wsId]
      ),
      pool.query(
        `SELECT id, agent, status, actions_taken, items_scanned, started_at, completed_at
         FROM agent_runs WHERE workspace_id = $1 ORDER BY started_at DESC LIMIT 5`,
        [wsId]
      ),
    ]);

    res.json({
      contacts: {
        total: parseInt(contacts.rows[0].total, 10) || 0,
      },
      deals: {
        total: parseInt(deals.rows[0].total, 10) || 0,
        open: parseInt(deals.rows[0].open, 10) || 0,
        pipelineValue: parseFloat(deals.rows[0].pipeline_value) || 0,
      },
      invoices: {
        total: parseInt(invoices.rows[0].total, 10) || 0,
        pending: parseInt(invoices.rows[0].pending, 10) || 0,
        paid: parseInt(invoices.rows[0].paid, 10) || 0,
        outstanding: parseFloat(invoices.rows[0].outstanding) || 0,
      },
      tasks: {
        total: parseInt(tasks.rows[0].total, 10) || 0,
        done: parseInt(tasks.rows[0].done, 10) || 0,
        overdue: parseInt(tasks.rows[0].overdue, 10) || 0,
      },
      workflows: {
        active: parseInt(workflows.rows[0].active, 10) || 0,
        completed: parseInt(workflows.rows[0].completed, 10) || 0,
      },
      recentAgentRuns: agentRuns.rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
