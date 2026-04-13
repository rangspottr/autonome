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
        const [atRiskResult, blockedResult, regressionResult] = await Promise.all([
          pool.query(
            `SELECT COUNT(*) AS at_risk
             FROM (
               SELECT c.id
               FROM contacts c
               WHERE c.workspace_id = $1
                 AND EXISTS (
                   SELECT 1 FROM invoices i WHERE i.contact_id = c.id AND i.workspace_id = $1
                     AND (i.status = 'overdue' OR (i.status = 'pending' AND i.due_date < NOW()))
                 )
                 AND EXISTS (
                   SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1
                     AND d.stage NOT IN ('won', 'lost')
                 )
             ) sub`,
            [wsId]
          ),
          pool.query(
            `SELECT COUNT(*) AS blocked_count
             FROM (
               SELECT entity_id
               FROM agent_actions
               WHERE workspace_id = $1 AND entity_type = 'contact' AND outcome = 'blocked'
               GROUP BY entity_id
               HAVING COUNT(*) >= 3
             ) sub`,
            [wsId]
          ),
          pool.query(
            `SELECT COUNT(*) AS regressions
             FROM deals
             WHERE workspace_id = $1
               AND stage IN ('new', 'qualified', 'proposal')
               AND probability >= 70`,
            [wsId]
          ),
        ]);
        summary = {
          atRiskContacts: parseInt(atRiskResult.rows[0]?.at_risk) || 0,
          blockedActionCount: parseInt(blockedResult.rows[0]?.blocked_count) || 0,
          dealRegressions: parseInt(regressionResult.rows[0]?.regressions) || 0,
        };
      } else if (agent === 'growth') {
        const [dormantResult, staleResult, expansionResult] = await Promise.all([
          pool.query(
            `SELECT COUNT(*) AS dormant
             FROM (
               SELECT c.id,
                      FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(
                        (SELECT MAX(d.updated_at) FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1),
                        c.created_at
                      ))) / 86400)::int AS days_inactive
               FROM contacts c
               WHERE c.workspace_id = $1 AND c.type = 'customer'
             ) sub
             WHERE days_inactive >= 30`,
            [wsId]
          ),
          pool.query(
            `SELECT COUNT(*) AS stale
             FROM contacts c
             WHERE c.workspace_id = $1
               AND c.type = 'lead'
               AND c.created_at < NOW() - INTERVAL '7 days'
               AND NOT EXISTS (
                 SELECT 1 FROM agent_actions aa
                 WHERE aa.entity_id = c.id AND aa.workspace_id = $1
                   AND aa.entity_type = 'contact'
               )`,
            [wsId]
          ),
          pool.query(
            `SELECT COUNT(*) AS expansion
             FROM (
               SELECT c.id
               FROM contacts c
               JOIN invoices i ON i.contact_id = c.id AND i.workspace_id = $1 AND i.status = 'paid'
               WHERE c.workspace_id = $1
                 AND NOT EXISTS (
                   SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1
                     AND d.stage NOT IN ('won', 'lost')
                 )
               GROUP BY c.id
               HAVING SUM(i.amount) > 5000
             ) sub`,
            [wsId]
          ),
        ]);
        summary = {
          dormantCustomers: parseInt(dormantResult.rows[0]?.dormant) || 0,
          staleLeads: parseInt(staleResult.rows[0]?.stale) || 0,
          expansionOpportunities: parseInt(expansionResult.rows[0]?.expansion) || 0,
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
