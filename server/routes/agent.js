import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { runAgentCycle } from '../engine/cycle.js';
import { executeAction } from '../engine/execution.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

/**
 * POST /api/agent/run-cycle
 * Manually trigger an agent cycle for the workspace.
 */
router.post('/run-cycle', ...guard, async (req, res, next) => {
  try {
    const result = await runAgentCycle(req.workspace.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agent/decisions
 * Return current pending decisions for the workspace (from the latest agent_run).
 */
router.get('/decisions', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT summary FROM agent_runs
       WHERE workspace_id = $1 AND agent = 'system' AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [req.workspace.id]
    );
    if (result.rows.length === 0) {
      return res.json({ pendingDecisions: [], total: 0 });
    }
    const summary = result.rows[0].summary || {};
    const pending = (summary.pendingDecisions || []).filter((d) => d.status === 'pending');
    res.json({ pendingDecisions: pending, total: pending.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/execute/:id
 * Manually execute a specific queued decision by its stable ID.
 * The decision data must be provided in the request body.
 */
router.post('/execute/:id', ...guard, async (req, res, next) => {
  try {
    const decisionId = req.params.id;
    const { agent, action, target, targetName, contactId, desc, auto, impact } = req.body;

    if (!agent || !action || !target) {
      return res.status(400).json({ message: 'agent, action, and target are required' });
    }

    const decision = { id: decisionId, agent, action, target, targetName, contactId, desc, auto, impact };
    const result = await executeAction(req.workspace.id, decision, { approvedBy: req.user.email });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/approve/:id
 * Approve and execute a pending decision. Decision data provided in body.
 */
router.post('/approve/:id', ...guard, async (req, res, next) => {
  try {
    const decisionId = req.params.id;
    const { agent, action, target, targetName, contactId, desc, impact } = req.body;

    if (!agent || !action || !target) {
      return res.status(400).json({ message: 'agent, action, and target are required' });
    }

    const decision = { id: decisionId, agent, action, target, targetName, contactId, desc, impact, auto: false };
    const result = await executeAction(req.workspace.id, decision, { approvedBy: req.user.email });

    // Log the approval
    await pool.query(
      `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
       VALUES ($1, $2, 'approved', $3, $4, $5, 'approved')`,
      [
        req.workspace.id,
        'system',
        agent === 'finance' ? 'invoice' : agent === 'revenue' ? 'deal' : 'task',
        target,
        JSON.stringify({ approvedBy: req.user.email, decisionId }),
      ]
    );

    res.json({ approved: true, decisionId, execution: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/agent/reject/:id
 * Reject a pending decision without executing it.
 */
router.post('/reject/:id', ...guard, async (req, res, next) => {
  try {
    const decisionId = req.params.id;
    const { agent, action, target, targetName, reason } = req.body;

    if (!agent || !action || !target) {
      return res.status(400).json({ message: 'agent, action, and target are required' });
    }

    // Log the rejection
    await pool.query(
      `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
       VALUES ($1, $2, 'rejected', $3, $4, $5, 'rejected')`,
      [
        req.workspace.id,
        'system',
        agent === 'finance' ? 'invoice' : agent === 'revenue' ? 'deal' : 'task',
        target,
        JSON.stringify({ rejectedBy: req.user.email, decisionId, reason: reason || null, targetName }),
      ]
    );

    res.json({ rejected: true, decisionId });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agent/status
 * Return agent system status: last run time, next run estimate, active workflow count.
 */
router.get('/status', ...guard, async (req, res, next) => {
  try {
    const lastRunResult = await pool.query(
      `SELECT id, completed_at, actions_taken, items_scanned, summary
       FROM agent_runs
       WHERE workspace_id = $1 AND agent = 'system' AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [req.workspace.id]
    );

    const activeWfResult = await pool.query(
      `SELECT COUNT(*) AS count FROM workflows WHERE workspace_id = $1 AND status = 'active'`,
      [req.workspace.id]
    );

    const pendingDecisionsResult = await pool.query(
      `SELECT COUNT(*) AS count FROM audit_log
       WHERE workspace_id = $1 AND (action = 'rejected' OR action = 'approved')`,
      [req.workspace.id]
    );

    const lastRun = lastRunResult.rows[0] || null;
    const activeWorkflows = parseInt(activeWfResult.rows[0].count, 10) || 0;

    let nextRunAt = null;
    if (lastRun?.completed_at) {
      nextRunAt = new Date(new Date(lastRun.completed_at).getTime() + 15 * 60 * 1000).toISOString();
    }

    const pendingCount = lastRun?.summary?.decisionsPending || 0;

    res.json({
      lastRunAt: lastRun?.completed_at || null,
      lastRunId: lastRun?.id || null,
      nextRunAt,
      activeWorkflows,
      pendingDecisions: pendingCount,
      actionsLastCycle: lastRun?.actions_taken || 0,
      itemsScannedLastCycle: lastRun?.items_scanned || 0,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
