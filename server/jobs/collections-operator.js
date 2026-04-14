import { pool } from '../db/index.js';

/**
 * Collections Operator
 *
 * Monitors overdue invoices, escalates aging accounts, flags disputes,
 * coordinates with Support when customers are sensitive, and produces
 * an owner-facing collections summary stored as an output artifact.
 */

const REMINDER_THRESHOLD_DAYS = 3;   // send reminder after 3 days overdue
const ESCALATION_THRESHOLD_DAYS = 14; // escalate after 14 days overdue

/**
 * Run the collections operator for a single workspace.
 * Returns a summary of actions taken.
 */
export async function runCollectionsOperator(workspaceId) {
  const now = new Date();

  // ── Load overdue invoices ─────────────────────────────────────────────────
  const { rows: overdueInvoices } = await pool.query(
    `SELECT i.id, i.description, i.amount, i.due_date, i.status,
            i.contact_id, c.name AS contact_name, c.email AS contact_email
     FROM invoices i
     LEFT JOIN contacts c ON c.id = i.contact_id
     WHERE i.workspace_id = $1 AND i.status IN ('overdue','escalated')
     ORDER BY i.due_date ASC`,
    [workspaceId]
  );

  const reminders = [];
  const escalations = [];
  const disputes = [];

  for (const inv of overdueInvoices) {
    const daysOverdue = Math.round((now - new Date(inv.due_date)) / 86400000);

    if (daysOverdue >= ESCALATION_THRESHOLD_DAYS && inv.status !== 'escalated') {
      // Mark as escalated
      await pool.query(
        `UPDATE invoices SET status = 'escalated', updated_at = NOW() WHERE id = $1`,
        [inv.id]
      );

      // Record agent action
      await pool.query(
        `INSERT INTO agent_actions (workspace_id, agent, action_type, outcome, description, entity_type, entity_id)
         VALUES ($1, 'finance', 'escalate', 'completed', $2, 'invoice', $3)`,
        [
          workspaceId,
          `Escalated overdue invoice: ${inv.contact_name || 'Unknown'} — $${Math.round(inv.amount).toLocaleString()} (${daysOverdue}d overdue)`,
          inv.id,
        ]
      );

      escalations.push({ ...inv, daysOverdue });
    } else if (daysOverdue >= REMINDER_THRESHOLD_DAYS && daysOverdue < ESCALATION_THRESHOLD_DAYS) {
      // Queue a reminder communication
      await pool.query(
        `INSERT INTO communications
           (workspace_id, contact_id, direction, channel, status, subject, body)
         VALUES ($1, $2, 'outbound', 'email', 'queued', $3, $4)`,
        [
          workspaceId,
          inv.contact_id,
          `Payment reminder: Invoice overdue ${daysOverdue} days`,
          `Hi ${inv.contact_name || 'there'},\n\nThis is a friendly reminder that invoice "${inv.description || inv.id}" for $${Math.round(inv.amount).toLocaleString()} was due on ${new Date(inv.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} and is now ${daysOverdue} days past due.\n\nPlease arrange payment at your earliest convenience. If you have any questions or concerns, please reply to this email.\n\nThank you.`,
        ]
      );

      // Record agent action
      await pool.query(
        `INSERT INTO agent_actions (workspace_id, agent, action_type, outcome, description, entity_type, entity_id)
         VALUES ($1, 'finance', 'remind', 'completed', $2, 'invoice', $3)`,
        [
          workspaceId,
          `Payment reminder queued: ${inv.contact_name || 'Unknown'} — $${Math.round(inv.amount).toLocaleString()} (${daysOverdue}d overdue)`,
          inv.id,
        ]
      );

      reminders.push({ ...inv, daysOverdue });
    }
  }

  // ── Calculate cash risk summary ───────────────────────────────────────────
  const totalOverdue = overdueInvoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const escalatedAmount = escalations.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const atRiskAmount = reminders.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  // ── Generate owner-facing collections summary ─────────────────────────────
  const sections = [];
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  sections.push(`# Collections Summary — ${dateStr}`);

  if (overdueInvoices.length === 0) {
    sections.push('\n✅ **No overdue invoices.** All accounts are current.');
  } else {
    sections.push(`\n## Cash Risk Overview`);
    sections.push(`💰 **Total overdue:** $${Math.round(totalOverdue).toLocaleString()} across ${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? 's' : ''}`);
    if (escalatedAmount > 0) sections.push(`🔴 **Escalated (14+ days):** $${Math.round(escalatedAmount).toLocaleString()}`);
    if (atRiskAmount > 0) sections.push(`🟡 **At risk (3–13 days):** $${Math.round(atRiskAmount).toLocaleString()}`);

    sections.push('\n## Overdue Accounts');
    for (const inv of overdueInvoices) {
      const daysOverdue = Math.round((now - new Date(inv.due_date)) / 86400000);
      const flag = daysOverdue >= ESCALATION_THRESHOLD_DAYS ? '🔴' : '🟡';
      sections.push(`${flag} **${inv.contact_name || 'Unknown'}** — $${Math.round(inv.amount).toLocaleString()} (${daysOverdue}d overdue) — ${inv.description || 'Invoice'}`);
    }

    if (reminders.length > 0) {
      sections.push(`\n## Actions Taken`);
      sections.push(`**Reminders queued:** ${reminders.length}`);
    }
    if (escalations.length > 0) {
      sections.push(`**Escalations:** ${escalations.length} account${escalations.length !== 1 ? 's' : ''} escalated`);
    }

    sections.push('\n## Recommended Owner Actions');
    for (const inv of escalations) {
      sections.push(`• Call **${inv.contact_name || 'Unknown'}** directly — $${Math.round(inv.amount).toLocaleString()} is ${inv.daysOverdue}+ days overdue`);
    }
    if (disputes.length === 0 && escalations.length === 0 && reminders.length > 0) {
      sections.push('• Review queued reminders before they send');
    }
  }

  const content = sections.join('\n');
  const summaryData = {
    total_overdue: totalOverdue,
    overdue_count: overdueInvoices.length,
    escalated_count: escalations.length,
    reminders_sent: reminders.length,
    disputes_flagged: disputes.length,
  };

  // Only store a new output if there are overdue invoices or at least one action taken
  if (overdueInvoices.length > 0 || reminders.length > 0 || escalations.length > 0) {
    await pool.query(
      `INSERT INTO outputs (workspace_id, output_type, title, content, data, period_start, period_end)
       VALUES ($1, 'collections_summary', $2, $3, $4, $5, $6)`,
      [
        workspaceId,
        `Collections Summary — ${dateStr}`,
        content,
        JSON.stringify(summaryData),
        new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        now.toISOString(),
      ]
    );
  }

  console.log(`[Collections] Workspace ${workspaceId}: ${overdueInvoices.length} overdue, ${reminders.length} reminders, ${escalations.length} escalated`);
  return { ...summaryData, content };
}

/**
 * Run the collections operator for all active workspaces.
 */
export async function runCollectionsForAllWorkspaces() {
  try {
    const result = await pool.query(
      `SELECT DISTINCT w.id FROM workspaces w
       JOIN subscriptions s ON s.workspace_id = w.id
       WHERE s.status IN ('active', 'trialing')`
    );
    for (const { id } of result.rows) {
      await runCollectionsOperator(id).catch((err) => {
        console.error(`[Collections] Failed for workspace ${id}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[Collections] Failed to run:', err.message);
  }
}

/**
 * Schedule collections to run daily at 9 AM.
 */
export function startCollectionsScheduler() {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function msUntil9AM() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(9, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }

  const delay = msUntil9AM();
  console.log(`[Collections] Scheduler started — next run in ${Math.round(delay / 60000)} minutes`);

  setTimeout(() => {
    runCollectionsForAllWorkspaces();
    setInterval(runCollectionsForAllWorkspaces, ONE_DAY_MS);
  }, delay);
}
