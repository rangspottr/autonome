import { pool } from '../db/index.js';

/**
 * Check if current time is within quiet hours for a setting row.
 */
function isQuietHours(setting) {
  if (!setting?.quiet_hours_start || !setting?.quiet_hours_end) return false;
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const start = setting.quiet_hours_start.slice(0, 5);
    const end = setting.quiet_hours_end.slice(0, 5);
    if (start <= end) return currentTime >= start && currentTime < end;
    // overnight
    return currentTime >= start || currentTime < end;
  } catch {
    return false;
  }
}

/**
 * Create an in-app notification for all users of a workspace.
 */
export async function createWorkspaceNotification(workspaceId, type, title, body, data = {}) {
  try {
    const users = await pool.query(
      `SELECT u.id FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1`,
      [workspaceId]
    );
    for (const user of users.rows) {
      await pool.query(
        `INSERT INTO notifications (workspace_id, user_id, type, title, body, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [workspaceId, user.id, type, title, body, JSON.stringify(data)]
      );
    }
  } catch (err) {
    console.error('[Notifications] Failed to create workspace notification:', err.message);
  }
}

/**
 * Generate proactive alerts for a workspace by scanning DB conditions.
 * Returns array of alert objects inserted into proactive_alerts.
 */
export async function generateProactiveAlerts(workspaceId) {
  const alerts = [];

  // Helper: upsert alert (avoid duplicate active alerts for same workspace+agent+type+entity)
  async function upsertAlert(alert) {
    const existing = await pool.query(
      `SELECT id FROM proactive_alerts
       WHERE workspace_id = $1 AND agent = $2 AND alert_type = $3
         AND status = 'active'
         AND ($4::uuid IS NULL OR entity_id = $4)
       LIMIT 1`,
      [workspaceId, alert.agent, alert.alert_type, alert.entity_id || null]
    );
    if (existing.rows.length > 0) return null;

    const result = await pool.query(
      `INSERT INTO proactive_alerts
         (workspace_id, agent, alert_type, severity, title, description, entity_type, entity_id, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        workspaceId,
        alert.agent,
        alert.alert_type,
        alert.severity || 'medium',
        alert.title,
        alert.description || null,
        alert.entity_type || null,
        alert.entity_id || null,
        JSON.stringify(alert.data || {}),
      ]
    );
    return result.rows[0];
  }

  // ── Finance: critical cash flow risk ─────────────────────────────────────────
  try {
    const cashResult = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS overdue_total,
              COUNT(*) AS overdue_count
       FROM invoices
       WHERE workspace_id = $1 AND status = 'pending'
         AND due_date < NOW() - INTERVAL '14 days'`,
      [workspaceId]
    );
    const overdueTotal = parseFloat(cashResult.rows[0]?.overdue_total) || 0;
    const overdueCount = parseInt(cashResult.rows[0]?.overdue_count) || 0;
    if (overdueTotal > 5000 || overdueCount >= 5) {
      const severity = overdueTotal > 20000 ? 'critical' : overdueTotal > 10000 ? 'high' : 'medium';
      const a = await upsertAlert({
        agent: 'finance',
        alert_type: 'risk',
        severity,
        title: `Cash flow risk: $${overdueTotal.toFixed(0)} overdue (${overdueCount} invoices >14d)`,
        description: `${overdueCount} invoices totalling $${overdueTotal.toFixed(2)} are more than 14 days overdue. Immediate collection action recommended.`,
        data: { overdueTotal, overdueCount },
      });
      if (a) alerts.push(a);
    }
  } catch (err) {
    console.error('[ProactiveAlerts] Cash flow check error:', err.message);
  }

  // ── Revenue: pipeline at risk ─────────────────────────────────────────────────
  try {
    const pipelineResult = await pool.query(
      `SELECT COUNT(*) AS stale_count,
              COALESCE(SUM(value),0) AS stale_value
       FROM deals
       WHERE workspace_id = $1
         AND stage NOT IN ('won','lost')
         AND updated_at < NOW() - INTERVAL '14 days'`,
      [workspaceId]
    );
    const staleCount = parseInt(pipelineResult.rows[0]?.stale_count) || 0;
    const staleValue = parseFloat(pipelineResult.rows[0]?.stale_value) || 0;
    if (staleCount >= 3 || staleValue > 10000) {
      const severity = staleValue > 50000 ? 'high' : staleValue > 20000 ? 'medium' : 'low';
      const a = await upsertAlert({
        agent: 'revenue',
        alert_type: 'risk',
        severity,
        title: `Pipeline at risk: ${staleCount} deals stale (${staleValue > 0 ? '$' + staleValue.toFixed(0) : 'unknown value'})`,
        description: `${staleCount} open deals have had no activity in 14+ days. Pipeline health is degrading.`,
        data: { staleCount, staleValue },
      });
      if (a) alerts.push(a);
    }
  } catch (err) {
    console.error('[ProactiveAlerts] Pipeline check error:', err.message);
  }

  // ── Operations: bottleneck detection ─────────────────────────────────────────
  try {
    const taskResult = await pool.query(
      `SELECT COUNT(*) AS overdue_count
       FROM tasks
       WHERE workspace_id = $1 AND status NOT IN ('completed', 'cancelled')
         AND due_date < NOW() - INTERVAL '3 days'`,
      [workspaceId]
    );
    const overdueTaskCount = parseInt(taskResult.rows[0]?.overdue_count) || 0;
    if (overdueTaskCount >= 5) {
      const severity = overdueTaskCount >= 10 ? 'high' : 'medium';
      const a = await upsertAlert({
        agent: 'operations',
        alert_type: 'blocker',
        severity,
        title: `Operational bottleneck: ${overdueTaskCount} tasks overdue 3+ days`,
        description: `${overdueTaskCount} tasks are significantly overdue, indicating a potential operational bottleneck.`,
        data: { overdueTaskCount },
      });
      if (a) alerts.push(a);
    }
  } catch (err) {
    console.error('[ProactiveAlerts] Operations check error:', err.message);
  }

  // ── Revenue: growth opportunity — unqualified leads ──────────────────────────
  try {
    const leadResult = await pool.query(
      `SELECT COUNT(*) AS lead_count
       FROM contacts
       WHERE workspace_id = $1 AND type = 'lead'
         AND NOT EXISTS (
           SELECT 1 FROM deals d WHERE d.contact_id = contacts.id AND d.workspace_id = $1
         )
         AND created_at < NOW() - INTERVAL '3 days'`,
      [workspaceId]
    );
    const leadCount = parseInt(leadResult.rows[0]?.lead_count) || 0;
    if (leadCount >= 3) {
      const a = await upsertAlert({
        agent: 'revenue',
        alert_type: 'opportunity',
        severity: 'low',
        title: `Growth opportunity: ${leadCount} unqualified leads waiting`,
        description: `${leadCount} leads have not been qualified into deals yet. Revenue agent can auto-qualify.`,
        data: { leadCount },
      });
      if (a) alerts.push(a);
    }
  } catch (err) {
    console.error('[ProactiveAlerts] Lead opportunity check error:', err.message);
  }

  // ── Finance: SLA breaches on workflows ───────────────────────────────────────
  try {
    const slaResult = await pool.query(
      `SELECT COUNT(*) AS breached_count
       FROM workflows
       WHERE workspace_id = $1 AND status = 'active'
         AND sla_deadline IS NOT NULL AND sla_deadline < NOW()
         AND sla_breached = false`,
      [workspaceId]
    );
    const breachedCount = parseInt(slaResult.rows[0]?.breached_count) || 0;
    if (breachedCount > 0) {
      // Mark them as breached
      await pool.query(
        `UPDATE workflows SET sla_breached = true, updated_at = NOW()
         WHERE workspace_id = $1 AND status = 'active'
           AND sla_deadline < NOW() AND sla_breached = false`,
        [workspaceId]
      );
      const a = await upsertAlert({
        agent: 'operations',
        alert_type: 'escalation',
        severity: 'high',
        title: `SLA breached: ${breachedCount} workflow${breachedCount > 1 ? 's' : ''} overdue`,
        description: `${breachedCount} active workflow${breachedCount > 1 ? 's have' : ' has'} exceeded SLA deadline and require escalation.`,
        data: { breachedCount },
      });
      if (a) alerts.push(a);
    }
  } catch (err) {
    console.error('[ProactiveAlerts] SLA check error:', err.message);
  }

  return alerts;
}

/**
 * Generate daily digest notification for a workspace.
 * Summarises agent activity from last 24 hours.
 */
export async function generateDailyDigest(workspaceId) {
  try {
    const activityResult = await pool.query(
      `SELECT agent, COUNT(*) AS action_count,
              COUNT(CASE WHEN outcome = 'success' THEN 1 END) AS success_count
       FROM agent_actions
       WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY agent`,
      [workspaceId]
    );

    if (activityResult.rows.length === 0) return null;

    const workflowResult = await pool.query(
      `SELECT COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
              COUNT(CASE WHEN status = 'active' THEN 1 END) AS active
       FROM workflows WHERE workspace_id = $1`,
      [workspaceId]
    );

    const alertResult = await pool.query(
      `SELECT COUNT(*) AS active_alerts FROM proactive_alerts
       WHERE workspace_id = $1 AND status = 'active'`,
      [workspaceId]
    );

    const agentSummaries = activityResult.rows.map((r) => {
      return `${r.agent}: ${r.action_count} actions (${r.success_count} successful)`;
    }).join('; ');

    const wf = workflowResult.rows[0] || {};
    const alertCount = parseInt(alertResult.rows[0]?.active_alerts) || 0;

    const title = 'Daily Business Intelligence Digest';
    const body = `Agent activity (last 24h): ${agentSummaries}. Workflows: ${wf.active || 0} active, ${wf.completed || 0} completed. ${alertCount > 0 ? `${alertCount} active alert${alertCount > 1 ? 's' : ''} require attention.` : 'No active alerts.'}`;

    await createWorkspaceNotification(workspaceId, 'daily_digest', title, body, {
      agentActivity: activityResult.rows,
      workflows: wf,
      alertCount,
    });

    return { title, body };
  } catch (err) {
    console.error('[Notifications] Daily digest error:', err.message);
    return null;
  }
}

/**
 * Generate approval-needed notifications for pending decisions.
 */
export async function generateApprovalNotifications(workspaceId, pendingDecisions) {
  if (!pendingDecisions || pendingDecisions.length === 0) return;
  try {
    const users = await pool.query(
      `SELECT u.id FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1`,
      [workspaceId]
    );

    // Check preferences
    const recentCount = await pool.query(
      `SELECT COUNT(*) FROM notifications
       WHERE workspace_id = $1 AND type = 'approval_needed'
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [workspaceId]
    );
    if (parseInt(recentCount.rows[0]?.count) >= 3) return; // debounce

    const highPriorityDecisions = pendingDecisions.filter((d) => d.priority >= 80);
    if (highPriorityDecisions.length === 0) return;

    const title = `${highPriorityDecisions.length} decision${highPriorityDecisions.length > 1 ? 's' : ''} need your approval`;
    const body = highPriorityDecisions.slice(0, 3).map((d) => `• ${d.desc}`).join('\n');

    for (const user of users.rows) {
      // Check user preferences
      const pref = await pool.query(
        `SELECT approval_alerts FROM notification_preferences
         WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, user.id]
      );
      const approvalAlertsEnabled = pref.rows[0]?.approval_alerts !== false;
      if (!approvalAlertsEnabled) continue;

      await pool.query(
        `INSERT INTO notifications (workspace_id, user_id, type, title, body, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          workspaceId,
          user.id,
          'approval_needed',
          title,
          body,
          JSON.stringify({ decisions: highPriorityDecisions.slice(0, 10) }),
        ]
      );
    }
  } catch (err) {
    console.error('[Notifications] Approval notification error:', err.message);
  }
}

/**
 * Generate critical risk notifications from proactive alerts.
 */
export async function generateCriticalRiskNotifications(workspaceId, newAlerts) {
  const criticalAlerts = newAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high');
  if (criticalAlerts.length === 0) return;

  try {
    const users = await pool.query(
      `SELECT u.id FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE wm.workspace_id = $1`,
      [workspaceId]
    );

    for (const alert of criticalAlerts) {
      for (const user of users.rows) {
        const pref = await pool.query(
          `SELECT critical_risk_alerts FROM notification_preferences
           WHERE workspace_id = $1 AND user_id = $2`,
          [workspaceId, user.id]
        );
        const riskAlertsEnabled = pref.rows[0]?.critical_risk_alerts !== false;
        if (!riskAlertsEnabled) continue;

        await pool.query(
          `INSERT INTO notifications (workspace_id, user_id, type, title, body, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            workspaceId,
            user.id,
            'critical_risk',
            `[${alert.severity.toUpperCase()}] ${alert.title}`,
            alert.description || '',
            JSON.stringify({ alertId: alert.id, agent: alert.agent, alert_type: alert.alert_type }),
          ]
        );
      }
    }
  } catch (err) {
    console.error('[Notifications] Critical risk notification error:', err.message);
  }
}
