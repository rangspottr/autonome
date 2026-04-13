import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

const ENTITY_NAME_SQL = `
  CASE aa.entity_type
    WHEN 'invoice' THEN (SELECT description FROM invoices WHERE id = aa.entity_id LIMIT 1)
    WHEN 'deal'    THEN (SELECT title       FROM deals    WHERE id = aa.entity_id LIMIT 1)
    WHEN 'contact' THEN (SELECT name        FROM contacts WHERE id = aa.entity_id LIMIT 1)
    WHEN 'task'    THEN (SELECT title       FROM tasks    WHERE id = aa.entity_id LIMIT 1)
    WHEN 'asset'   THEN (SELECT name        FROM assets   WHERE id = aa.entity_id LIMIT 1)
    ELSE NULL
  END AS entity_name
`;

/**
 * GET /api/activity/live
 * Real-time activity feed combining agent_actions + business_events + workflow updates.
 * Supports ?since=ISO_TIMESTAMP for polling.
 * Returns unified events array sorted by created_at DESC.
 */
router.get('/live', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;
    const since = req.query.since;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const sinceClause = since ? `AND aa.created_at > $2` : '';
    const params = since ? [wsId, since] : [wsId];

    const actionsResult = await pool.query(
      `SELECT aa.id, aa.agent, aa.action_type AS action, aa.entity_type, aa.entity_id,
              aa.description, aa.reasoning, aa.outcome, aa.handed_off_to,
              aa.metadata, aa.created_at,
              'agent_action' AS event_source,
              ${ENTITY_NAME_SQL}
       FROM agent_actions aa
       WHERE aa.workspace_id = $1 ${sinceClause}
       ORDER BY aa.created_at DESC
       LIMIT ${limit}`,
      params
    );

    // Also pull recent workflow completions
    const wfSinceClause = since ? `AND w.updated_at > $2` : '';
    const wfResult = await pool.query(
      `SELECT w.id, w.template AS action, w.status, w.current_step, w.completed_at,
              w.updated_at AS created_at, w.trigger_entity_type AS entity_type,
              w.trigger_entity_id AS entity_id, w.sla_breached, w.paused_at,
              'workflow' AS event_source,
              CASE w.template
                WHEN 'invoice_collection' THEN 'finance'
                WHEN 'deal_followup' THEN 'revenue'
                WHEN 'task_escalation' THEN 'operations'
                WHEN 'lead_nurture' THEN 'revenue'
                WHEN 'campaign_optimization' THEN 'growth'
                WHEN 'issue_resolution' THEN 'support'
                ELSE 'system'
              END AS agent
       FROM workflows w
       WHERE w.workspace_id = $1 ${wfSinceClause}
       ORDER BY w.updated_at DESC
       LIMIT 20`,
      params
    );

    // Merge and sort
    const events = [
      ...actionsResult.rows.map((r) => ({ ...r, event_source: 'agent_action' })),
      ...wfResult.rows.map((r) => ({ ...r, event_source: 'workflow' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    res.json({
      events,
      total: events.length,
      since: since || null,
      polledAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/activity/timeline/:agent
 * Per-agent timeline with actions, decisions, handoffs, and blockers.
 */
router.get('/timeline/:agent', ...guard, async (req, res, next) => {
  try {
    const { agent } = req.params;
    const wsId = req.workspace.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const since = req.query.since;

    const sinceClause = since ? `AND aa.created_at > $3` : '';
    const params = since ? [wsId, agent, since] : [wsId, agent];

    const actionsResult = await pool.query(
      `SELECT aa.id, aa.action_type AS action, aa.entity_type, aa.entity_id,
              aa.description, aa.outcome, aa.handed_off_to, aa.metadata, aa.created_at,
              ${ENTITY_NAME_SQL}
       FROM agent_actions aa
       WHERE aa.workspace_id = $1 AND aa.agent = $2 ${sinceClause}
       ORDER BY aa.created_at DESC
       LIMIT ${limit}`,
      params
    );

    // Active workflows for this agent
    const agentWfMap = {
      finance: 'invoice_collection',
      revenue: ['deal_followup', 'lead_nurture'],
      operations: 'task_escalation',
      growth: 'campaign_optimization',
      support: 'issue_resolution',
    };
    const agentTemplates = [].concat(agentWfMap[agent] || []);
    let activeWorkflows = [];
    if (agentTemplates.length > 0) {
      const placeholders = agentTemplates.map((_, i) => `$${i + 2}`).join(', ');
      const wfResult = await pool.query(
        `SELECT id, template, status, current_step, next_action_at, sla_deadline, sla_breached, paused_at,
                trigger_entity_type, trigger_entity_id, created_at, updated_at
         FROM workflows
         WHERE workspace_id = $1 AND template IN (${placeholders})
           AND status IN ('active', 'paused')
         ORDER BY updated_at DESC LIMIT 20`,
        [wsId, ...agentTemplates]
      );
      activeWorkflows = wfResult.rows;
    }

    // Blockers
    const blockersResult = await pool.query(
      `SELECT aa.id, aa.action_type AS action, aa.entity_type, aa.entity_id,
              aa.description, aa.created_at,
              ${ENTITY_NAME_SQL}
       FROM agent_actions aa
       WHERE aa.workspace_id = $1 AND aa.agent = $2 AND aa.outcome = 'blocked'
       ORDER BY aa.created_at DESC LIMIT 10`,
      [wsId, agent]
    );

    // Handoffs
    const handoffsResult = await pool.query(
      `SELECT aa.id, aa.action_type AS action, aa.entity_type, aa.entity_id,
              aa.description, aa.handed_off_to, aa.created_at,
              ${ENTITY_NAME_SQL}
       FROM agent_actions aa
       WHERE aa.workspace_id = $1 AND (aa.agent = $2 OR aa.handed_off_to = $2)
         AND aa.handed_off_to IS NOT NULL
       ORDER BY aa.created_at DESC LIMIT 20`,
      [wsId, agent]
    );

    // Memory highlights
    const memoryResult = await pool.query(
      `SELECT id, memory_type, entity_type, entity_id, content, confidence, created_at
       FROM agent_memory
       WHERE workspace_id = $1 AND agent = $2 AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 10`,
      [wsId, agent]
    );

    res.json({
      agent,
      actions: actionsResult.rows,
      activeWorkflows,
      blockers: blockersResult.rows,
      handoffs: handoffsResult.rows,
      memoryHighlights: memoryResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/activity/since-last-login
 * Summary of everything that happened since the owner was last active.
 */
router.get('/since-last-login', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;
    const userId = req.user.id;

    // Get user's last_login_at and last_active_at
    const userResult = await pool.query(
      `SELECT last_login_at, last_active_at FROM users WHERE id = $1`,
      [userId]
    );
    const lastLogin = userResult.rows[0]?.last_login_at;
    const lastActive = userResult.rows[0]?.last_active_at;

    // Use GREATEST of both timestamps; fall back to 24 hours ago if neither is set
    let since;
    if (lastLogin && lastActive) {
      since = lastLogin > lastActive ? lastLogin : lastActive;
    } else {
      since = lastLogin || lastActive || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }

    // Agent action summaries
    const actionsResult = await pool.query(
      `SELECT agent, COUNT(*) AS action_count,
              COUNT(CASE WHEN outcome = 'success' THEN 1 END) AS success_count,
              COUNT(CASE WHEN outcome = 'blocked' THEN 1 END) AS blocked_count,
              COUNT(CASE WHEN handed_off_to IS NOT NULL THEN 1 END) AS handoff_count
       FROM agent_actions
       WHERE workspace_id = $1 AND created_at > $2
       GROUP BY agent`,
      [wsId, since]
    );

    // New proactive alerts
    const alertsResult = await pool.query(
      `SELECT id, agent, alert_type, severity, title, description, created_at
       FROM proactive_alerts
       WHERE workspace_id = $1 AND created_at > $2
       ORDER BY created_at DESC LIMIT 20`,
      [wsId, since]
    );

    // Workflows that completed or stalled
    const workflowsResult = await pool.query(
      `SELECT id, template, status, current_step, updated_at, trigger_entity_type, trigger_entity_id
       FROM workflows
       WHERE workspace_id = $1 AND updated_at > $2
         AND status IN ('completed', 'paused')
       ORDER BY updated_at DESC LIMIT 10`,
      [wsId, since]
    );

    // Business events processed
    const eventsResult = await pool.query(
      `SELECT COUNT(*) AS event_count FROM business_events
       WHERE workspace_id = $1 AND created_at > $2 AND status = 'acted'`,
      [wsId, since]
    );

    // Decisions needing attention (from latest agent run)
    const latestRun = await pool.query(
      `SELECT summary FROM agent_runs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [wsId]
    );
    const pendingDecisions = latestRun.rows[0]?.summary?.pendingDecisions || [];

    // Update both last_login_at and last_active_at for current user
    await pool.query(
      `UPDATE users SET last_login_at = NOW(), last_active_at = NOW() WHERE id = $1`,
      [userId]
    );

    res.json({
      since,
      agentActivity: actionsResult.rows,
      newAlerts: alertsResult.rows,
      workflowChanges: workflowsResult.rows,
      businessEventsProcessed: parseInt(eventsResult.rows[0]?.event_count) || 0,
      pendingDecisions: pendingDecisions.slice(0, 10),
      hasActivity: actionsResult.rows.some((r) => parseInt(r.action_count) > 0),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
