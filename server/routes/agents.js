import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

/**
 * GET /api/agents/:agent/actions
 * Paginated action timeline for one agent.
 * Query params: limit, offset, entity_type, entity_id
 */
router.get('/:agent/actions', ...guard, async (req, res, next) => {
  try {
    const { agent } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const { entity_type, entity_id } = req.query;

    const conditions = ['aa.workspace_id = $1', 'aa.agent = $2'];
    const params = [req.workspace.id, agent];
    let idx = 3;

    if (entity_type) {
      conditions.push(`aa.entity_type = $${idx++}`);
      params.push(entity_type);
    }
    if (entity_id) {
      conditions.push(`aa.entity_id = $${idx++}`);
      params.push(entity_id);
    }

    const where = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT aa.*,
              CASE aa.entity_type
                WHEN 'invoice' THEN (SELECT description FROM invoices WHERE id = aa.entity_id LIMIT 1)
                WHEN 'deal'    THEN (SELECT title       FROM deals    WHERE id = aa.entity_id LIMIT 1)
                WHEN 'contact' THEN (SELECT name        FROM contacts WHERE id = aa.entity_id LIMIT 1)
                WHEN 'task'    THEN (SELECT title       FROM tasks    WHERE id = aa.entity_id LIMIT 1)
                ELSE NULL
              END AS entity_name
       FROM agent_actions aa
       WHERE ${where}
       ORDER BY aa.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM agent_actions aa WHERE ${where}`,
      params
    );

    res.json({
      actions: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agents/:agent/memory
 * Memory entries for one agent.
 * Query params: limit, memory_type
 */
router.get('/:agent/memory', ...guard, async (req, res, next) => {
  try {
    const { agent } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const { memory_type } = req.query;

    const conditions = [
      'workspace_id = $1',
      'agent = $2',
      '(expires_at IS NULL OR expires_at > NOW())',
    ];
    const params = [req.workspace.id, agent];
    let idx = 3;

    if (memory_type) {
      conditions.push(`memory_type = $${idx++}`);
      params.push(memory_type);
    }

    const where = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT * FROM agent_memory
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agents/:agent/workstream
 * Active work for an agent: pending decisions (from latest run), active workflows,
 * recent actions (last 24h), blockers (outcome='blocked').
 */
router.get('/:agent/workstream', ...guard, async (req, res, next) => {
  try {
    const { agent } = req.params;
    const wsId = req.workspace.id;

    const [activeWorkflowsResult, recentActionsResult, blockersResult, latestRunResult] =
      await Promise.all([
        pool.query(
          `SELECT w.*, c.name AS contact_name
           FROM workflows w
           LEFT JOIN contacts c ON c.id = w.trigger_entity_id
             AND w.trigger_entity_type = 'contact'
           WHERE w.workspace_id = $1 AND w.status = 'active'
           ORDER BY w.updated_at DESC
           LIMIT 20`,
          [wsId]
        ),
        pool.query(
          `SELECT * FROM agent_actions
           WHERE workspace_id = $1 AND agent = $2
             AND created_at > NOW() - INTERVAL '24 hours'
           ORDER BY created_at DESC
           LIMIT 20`,
          [wsId, agent]
        ),
        pool.query(
          `SELECT aa.*,
                  aa.metadata->>'blocked_reason' AS blocked_reason
           FROM agent_actions aa
           WHERE workspace_id = $1 AND agent = $2 AND outcome = 'blocked'
           ORDER BY created_at DESC
           LIMIT 10`,
          [wsId, agent]
        ),
        pool.query(
          `SELECT summary FROM agent_runs
           WHERE workspace_id = $1
           ORDER BY started_at DESC LIMIT 1`,
          [wsId]
        ),
      ]);

    const latestSummary = latestRunResult.rows[0]?.summary || {};
    const pendingDecisions = (latestSummary.pendingDecisions || []).filter(
      (d) => d.agent === agent
    );

    // Build domain-specific summary for agent card metrics
    let summary = {};
    try {
      if (agent === 'finance') {
        const invResult = await pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
           FROM invoices WHERE workspace_id = $1 AND status = 'overdue'`,
          [wsId]
        );
        summary = {
          overdueCount: parseInt(invResult.rows[0]?.count) || 0,
          overdueInvoices: parseFloat(invResult.rows[0]?.total) || 0,
        };
      } else if (agent === 'revenue') {
        const dealResult = await pool.query(
          `SELECT COALESCE(SUM(value), 0) AS pipeline,
                  COUNT(CASE WHEN updated_at < NOW() - INTERVAL '7 days' THEN 1 END) AS stale
           FROM deals WHERE workspace_id = $1 AND stage NOT IN ('won','lost')`,
          [wsId]
        );
        summary = {
          pipelineValue: parseFloat(dealResult.rows[0]?.pipeline) || 0,
          staleDeals: parseInt(dealResult.rows[0]?.stale) || 0,
        };
      } else if (agent === 'operations') {
        const taskResult = await pool.query(
          `SELECT COUNT(*) AS overdue_tasks
           FROM tasks WHERE workspace_id = $1 AND status = 'pending' AND due_date < NOW()`,
          [wsId]
        );
        summary = {
          overdueTasks: parseInt(taskResult.rows[0]?.overdue_tasks) || 0,
        };
      } else if (agent === 'support') {
        const riskResult = await pool.query(
          `SELECT COUNT(*) AS at_risk
           FROM agent_memory
           WHERE workspace_id = $1 AND agent = 'support' AND memory_type = 'blocker'`,
          [wsId]
        );
        summary = {
          atRiskContacts: parseInt(riskResult.rows[0]?.at_risk) || 0,
        };
      } else if (agent === 'growth') {
        const dormantResult = await pool.query(
          `SELECT COUNT(*) AS dormant
           FROM contacts c
           WHERE c.workspace_id = $1
             AND c.type IN ('lead', 'prospect')
             AND NOT EXISTS (
               SELECT 1 FROM agent_actions aa
               WHERE aa.entity_id = c.id AND aa.agent = 'growth'
                 AND aa.created_at > NOW() - INTERVAL '30 days'
             )`,
          [wsId]
        );
        summary = {
          dormantLeads: parseInt(dormantResult.rows[0]?.dormant) || 0,
        };
      }
    } catch (summaryErr) {
      console.error('[Agents] Domain summary error:', summaryErr.message);
    }

    res.json({
      pendingDecisions,
      activeWorkflows: activeWorkflowsResult.rows,
      recentActions: recentActionsResult.rows,
      blockers: blockersResult.rows,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agents/activity-feed
 * Unified cross-agent event feed from agent_actions, paginated, most recent first.
 */
router.get('/activity-feed', ...guard, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const since = req.query.since;

    const conditions = ['aa.workspace_id = $1'];
    const params = [req.workspace.id];
    let idx = 2;

    if (since) {
      conditions.push(`aa.created_at > $${idx++}`);
      params.push(since);
    }

    const where = conditions.join(' AND ');

    const result = await pool.query(
      `SELECT aa.*,
              CASE aa.entity_type
                WHEN 'invoice' THEN (SELECT description FROM invoices WHERE id = aa.entity_id LIMIT 1)
                WHEN 'deal'    THEN (SELECT title       FROM deals    WHERE id = aa.entity_id LIMIT 1)
                WHEN 'contact' THEN (SELECT name        FROM contacts WHERE id = aa.entity_id LIMIT 1)
                WHEN 'task'    THEN (SELECT title       FROM tasks    WHERE id = aa.entity_id LIMIT 1)
                WHEN 'asset'   THEN (SELECT name        FROM assets   WHERE id = aa.entity_id LIMIT 1)
                ELSE NULL
              END AS entity_name
       FROM agent_actions aa
       WHERE ${where}
       ORDER BY aa.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM agent_actions aa WHERE ${where}`,
      params
    );

    res.json({
      events: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/agents/handoffs
 * Recent cross-agent handoffs from agent_actions WHERE handed_off_to IS NOT NULL.
 */
router.get('/handoffs', ...guard, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT aa.*,
              CASE aa.entity_type
                WHEN 'invoice' THEN (SELECT description FROM invoices WHERE id = aa.entity_id LIMIT 1)
                WHEN 'deal'    THEN (SELECT title       FROM deals    WHERE id = aa.entity_id LIMIT 1)
                WHEN 'contact' THEN (SELECT name        FROM contacts WHERE id = aa.entity_id LIMIT 1)
                WHEN 'task'    THEN (SELECT title       FROM tasks    WHERE id = aa.entity_id LIMIT 1)
                ELSE NULL
              END AS entity_name
       FROM agent_actions aa
       WHERE aa.workspace_id = $1 AND aa.handed_off_to IS NOT NULL
       ORDER BY aa.created_at DESC
       LIMIT 50`,
      [req.workspace.id]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
