/**
 * Operator API — expose status and actions for the Inbox/Lead and Collections operators.
 *
 * GET  /api/operator/inbox       — inbox/lead operator status and recent leads
 * GET  /api/operator/collections — collections operator status and overdue accounts
 * POST /api/operator/inbox/process/:id — process a specific business event as a lead
 */
import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { getWorkspaceWorkflowHealth } from '../lib/job-health.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

// GET /api/operator/health — workspace workflow + job reliability snapshot
router.get('/health', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;
    const [health, outputRuns, integrations, latestOutputs] = await Promise.all([
      getWorkspaceWorkflowHealth(wsId),
      pool.query(
        `SELECT output_type, COUNT(*)::int AS count
         FROM outputs
         WHERE workspace_id = $1
           AND created_at >= NOW() - INTERVAL '7 days'
         GROUP BY output_type`,
        [wsId]
      ),
      pool.query(
        `SELECT type, status, last_sync_at, error_message
         FROM integrations
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [wsId]
      ),
      pool.query(
        `SELECT output_type, title, created_at
         FROM outputs
         WHERE workspace_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [wsId]
      ),
    ]);

    res.json({
      workflow_health: health.workflow_counts,
      job_runs: health.recent_runs,
      failed_runs_24h: health.failed_runs_24h,
      outputs_7d: outputRuns.rows,
      latest_outputs: latestOutputs.rows,
      integrations: integrations.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/operator/inbox — inbox/lead operator status
router.get('/inbox', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      newLeads,
      recentContacts,
      unprocessedEvents,
      recentActions,
      openDeals,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count FROM contacts
         WHERE workspace_id = $1 AND type IN ('lead','prospect') AND created_at >= $2`,
        [wsId, since]
      ),
      pool.query(
        `SELECT id, name, company, type, email, phone, created_at
         FROM contacts
         WHERE workspace_id = $1 AND type IN ('lead','prospect')
         ORDER BY created_at DESC LIMIT 10`,
        [wsId]
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM business_events
         WHERE workspace_id = $1 AND status = 'pending'
           AND event_type IN ('inbound_email','form_submission','missed_call','sms','lead')`,
        [wsId]
      ),
      pool.query(
        `SELECT agent, action_type, description, outcome, created_at
         FROM agent_actions
         WHERE workspace_id = $1 AND agent IN ('revenue','growth')
           AND created_at >= $2
         ORDER BY created_at DESC LIMIT 10`,
        [wsId, since]
      ),
      pool.query(
        `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value), 0) AS total_value
         FROM deals
         WHERE workspace_id = $1 AND stage NOT IN ('won','lost')
         GROUP BY stage`,
        [wsId]
      ),
    ]);

    const totalLeads = parseInt(newLeads.rows[0]?.count) || 0;
    const unprocessed = parseInt(unprocessedEvents.rows[0]?.count) || 0;

    // Determine operator health
    let status = 'active';
    let statusMessage = 'Monitoring inbound channels and routing leads automatically.';
    if (unprocessed > 5) {
      status = 'needs_attention';
      statusMessage = `${unprocessed} inbound events waiting to be processed.`;
    }

    res.json({
      status,
      status_message: statusMessage,
      metrics: {
        new_leads_7d: totalLeads,
        unprocessed_events: unprocessed,
        actions_7d: recentActions.rows.length,
        open_deals: openDeals.rows.reduce((s, r) => s + parseInt(r.count), 0),
        pipeline_value: openDeals.rows.reduce((s, r) => s + parseFloat(r.total_value || 0), 0),
      },
      recent_leads: recentContacts.rows,
      recent_actions: recentActions.rows,
      pipeline: openDeals.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/operator/collections — collections operator status
router.get('/collections', ...guard, async (req, res, next) => {
  try {
    const wsId = req.workspace.id;
    const now = new Date();

    const [overdueInvoices, recentCollectionsActions, collectionsSummary] = await Promise.all([
      pool.query(
        `SELECT i.id, i.description, i.amount, i.due_date, i.status,
                c.name AS contact_name, c.email AS contact_email,
                EXTRACT(EPOCH FROM (NOW() - i.due_date)) / 86400 AS days_overdue
         FROM invoices i
         LEFT JOIN contacts c ON c.id = i.contact_id
         WHERE i.workspace_id = $1 AND i.status IN ('overdue','escalated')
         ORDER BY i.due_date ASC`,
        [wsId]
      ),
      pool.query(
        `SELECT description, outcome, created_at
         FROM agent_actions
         WHERE workspace_id = $1 AND agent = 'finance'
           AND action_type IN ('remind','escalate')
           AND created_at >= $2
         ORDER BY created_at DESC LIMIT 10`,
        [wsId, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()]
      ),
      pool.query(
        `SELECT id, title, data, created_at
         FROM outputs
         WHERE workspace_id = $1 AND output_type = 'collections_summary'
         ORDER BY created_at DESC LIMIT 1`,
        [wsId]
      ),
    ]);

    const totalOverdue = overdueInvoices.rows.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const escalated = overdueInvoices.rows.filter((i) => i.status === 'escalated');
    const atRisk = overdueInvoices.rows.filter((i) => i.status === 'overdue');

    let status = 'active';
    let statusMessage = 'Monitoring invoices. No overdue accounts.';
    if (escalated.length > 0) {
      status = 'needs_attention';
      statusMessage = `${escalated.length} account${escalated.length !== 1 ? 's' : ''} escalated — owner action required.`;
    } else if (atRisk.length > 0) {
      status = 'monitoring';
      statusMessage = `${atRisk.length} overdue invoice${atRisk.length !== 1 ? 's' : ''} — reminders in progress.`;
    }

    res.json({
      status,
      status_message: statusMessage,
      metrics: {
        total_overdue_amount: totalOverdue,
        overdue_count: overdueInvoices.rows.length,
        escalated_count: escalated.length,
        reminders_sent_7d: recentCollectionsActions.rows.filter((a) => a.outcome === 'completed').length,
      },
      overdue_accounts: overdueInvoices.rows,
      recent_actions: recentCollectionsActions.rows,
      latest_summary: collectionsSummary.rows[0] || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
