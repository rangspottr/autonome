import { pool } from '../db/index.js';
import { startWorkflow } from './workflows.js';

const AGENT_LABELS = {
  finance: 'Finance',
  revenue: 'Revenue',
  operations: 'Operations',
  growth: 'Growth',
  support: 'Support',
};

/**
 * Build a human-readable reasoning string explaining why an agent took an action.
 */
function buildReasoning(agent, action, decision, description) {
  const targetName = decision.targetName || decision.target || 'entity';
  const impact = decision.impact ? ` ($${Math.round(decision.impact).toLocaleString()} at risk)` : '';
  if (agent === 'finance') {
    if (action === 'remind' || action === 'pre') return `Invoice for ${targetName} is overdue${impact}. Workspace policy triggers automatic payment reminders for outstanding balances.`;
    if (action === 'urgent') return `Invoice for ${targetName} is critically overdue${impact}. Escalating urgency to prompt immediate payment.`;
    if (action === 'escalate') return `Multiple reminders sent for ${targetName} with no response${impact}. Escalating to collections per workspace policy.`;
    if (action === 'mark_paid') return `Payment confirmed for ${targetName}. Marking invoice as paid and closing collection workflow.`;
  }
  if (agent === 'revenue') {
    if (action === 'qualify') return `${targetName} shows signs of purchase intent. Qualifying lead to progress through sales pipeline.`;
    if (action === 'followup') return `Deal with ${targetName} has been stale${impact}. Sending follow-up to re-engage and advance pipeline stage.`;
    if (action === 'reengage') return `${targetName} has been unresponsive for an extended period. Re-engagement sequence initiated to recover deal.`;
    if (action === 'close') return `Deal with ${targetName} meets closing criteria${impact}. Marking as closed-won.`;
  }
  if (agent === 'operations') {
    if (action === 'escalate') return `Task for ${targetName} is overdue and blocking progress. Escalating priority and creating escalation workflow.`;
    if (action === 'reorder') return `Asset ${targetName} is below reorder threshold. Initiating restock to prevent operational disruption.`;
  }
  return description;
}

/**
 * Determine if an action should be handed off to another agent.
 * Returns the target agent name, or null if no handoff.
 */
function resolveHandoff(agent, action) {
  if (agent === 'revenue' && action === 'close') return 'finance';
  if (agent === 'finance' && action === 'escalate') return 'support';
  return null;
}

/**
 * Execute a single agent decision against real database tables.
 * - Email actions: create a communication record (status='queued')
 * - Status updates: update the target entity
 * - All actions: write to audit_log
 * Returns { success, description, communicationId, workflowId }
 */
export async function executeAction(workspaceId, decision, options = {}) {
  const { agent, action, target, contactId } = decision;
  const agentLabel = AGENT_LABELS[agent] || agent;
  let description = decision.desc || `${agent}:${action}`;
  let communicationId = null;
  let workflowId = null;

  // Fetch workspace settings for daily email limit
  const wsResult = await pool.query('SELECT settings FROM workspaces WHERE id = $1', [workspaceId]);
  const settings = wsResult.rows[0]?.settings || {};
  const limits = settings.riskLimits || {};
  const dailyEmailLimit = limits.dailyEmailLimit || 50;

  async function checkEmailLimit() {
    const today = new Date().toISOString().slice(0, 10);
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM communications
       WHERE workspace_id = $1 AND channel = 'email' AND created_at::date = $2::date`,
      [workspaceId, today]
    );
    return parseInt(countResult.rows[0].count, 10);
  }

  async function createEmail(subject, body, toContactId, wfId = null) {
    const currentCount = await checkEmailLimit();
    if (currentCount >= dailyEmailLimit) {
      await pool.query(
        `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
         VALUES ($1, $2, 'email_skipped', $3, $4, $5, 'skipped')`,
        [
          workspaceId,
          agentLabel,
          agent === 'finance' ? 'invoice' : agent === 'revenue' ? 'deal' : 'task',
          target,
          JSON.stringify({ reason: `Daily email limit reached (${currentCount}/${dailyEmailLimit})`, subject }),
        ]
      );
      return null;
    }
    const commResult = await pool.query(
      `INSERT INTO communications (workspace_id, contact_id, workflow_id, channel, direction, subject, body, status)
       VALUES ($1, $2, $3, 'email', 'outbound', $4, $5, 'queued') RETURNING id`,
      [workspaceId, toContactId || null, wfId || null, subject, body || '']
    );
    return commResult.rows[0].id;
  }

  // ── Finance actions ─────────────────────────────────────────────────────────
  if (agent === 'finance') {
    const invResult = await pool.query(
      'SELECT * FROM invoices WHERE id = $1 AND workspace_id = $2',
      [target, workspaceId]
    );
    const inv = invResult.rows[0];

    if (!inv) {
      description = `Invoice not found: ${target}`;
    } else {
      let invContactId = inv.contact_id || null;
      const label = inv.description || `Invoice #${inv.id.slice(0, 8)}`;

      if (action === 'remind' || action === 'pre') {
        const wf = await startWorkflow(workspaceId, 'invoice_collection', 'invoice', inv.id, {});
        if (wf) workflowId = wf.id;
        const subject = action === 'pre'
          ? `Pre-due reminder: ${label}`
          : `Payment reminder: ${label}`;
        communicationId = await createEmail(subject, `Please settle your outstanding invoice: ${label}`, invContactId, workflowId);
        description = communicationId
          ? `Sent ${action === 'pre' ? 'pre-due' : 'overdue'} reminder for invoice: ${label}`
          : `Email skipped (daily limit): ${label}`;
      } else if (action === 'urgent') {
        const subject = `URGENT: ${label} — payment required`;
        communicationId = await createEmail(subject, `Urgent: your invoice ${label} requires immediate payment.`, invContactId, null);
        description = communicationId
          ? `Sent urgent payment notice for: ${label}`
          : `Email skipped (daily limit): ${label}`;
      } else if (action === 'escalate') {
        await pool.query(
          `UPDATE invoices SET status = 'escalated', updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
          [inv.id, workspaceId]
        );
        description = `Escalated to collections: ${label} ($${parseFloat(inv.amount).toFixed(2)})`;
      } else if (action === 'mark_paid') {
        await pool.query(
          `UPDATE invoices SET status = 'paid', amount_paid = amount, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
          [inv.id, workspaceId]
        );
        // Complete any active invoice_collection workflow for this invoice
        await pool.query(
          `UPDATE workflows SET status = 'completed', completed_at = NOW(), updated_at = NOW()
           WHERE workspace_id = $1 AND template = 'invoice_collection' AND trigger_entity_id = $2 AND status = 'active'`,
          [workspaceId, inv.id]
        );
        description = `Marked invoice paid: ${label}`;
      }
    }
  }

  // ── Revenue actions ─────────────────────────────────────────────────────────
  if (agent === 'revenue') {
    if (action === 'qualify') {
      const contactResult = await pool.query(
        'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
        [target, workspaceId]
      );
      const contact = contactResult.rows[0];
      if (contact) {
        await pool.query(
          `UPDATE contacts SET type = 'qualified', updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
          [contact.id, workspaceId]
        );
        description = `Qualified lead: ${contact.name}`;
      } else {
        description = `Contact not found: ${target}`;
      }
    } else if (action === 'followup' || action === 'reengage') {
      const dealResult = await pool.query(
        'SELECT * FROM deals WHERE id = $1 AND workspace_id = $2',
        [target, workspaceId]
      );
      const deal = dealResult.rows[0];
      if (deal) {
        const resolvedContactId = contactId || deal.contact_id;
        let contactEmail = null;
        let contactName = 'contact';
        if (resolvedContactId) {
          const cResult = await pool.query('SELECT name, email FROM contacts WHERE id = $1', [resolvedContactId]);
          // eslint-disable-next-line no-unused-vars
          contactEmail = cResult.rows[0]?.email || null;
          contactName = cResult.rows[0]?.name || 'contact';
        }
        if (action === 'followup') {
          const wf = await startWorkflow(workspaceId, 'deal_followup', 'deal', deal.id, {});
          if (wf) workflowId = wf.id;
        }
        const subject = action === 'followup'
          ? `Follow-up: ${deal.title}`
          : `Re-engagement: ${deal.title}`;
        communicationId = await createEmail(subject, `Reaching out regarding ${deal.title}.`, resolvedContactId, workflowId);
        await pool.query(
          `UPDATE deals SET updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
          [deal.id, workspaceId]
        );
        description = communicationId
          ? `Sent ${action} for deal with ${contactName}`
          : `${action} skipped (daily limit): ${contactName}`;
      } else {
        description = `Deal not found: ${target}`;
      }
    } else if (action === 'close') {
      const dealResult = await pool.query(
        'SELECT * FROM deals WHERE id = $1 AND workspace_id = $2',
        [target, workspaceId]
      );
      const deal = dealResult.rows[0];
      if (deal) {
        await pool.query(
          `UPDATE deals SET stage = 'won', updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
          [deal.id, workspaceId]
        );
        description = `Closed deal: ${deal.title} ($${parseFloat(deal.value || 0).toFixed(2)})`;
      } else {
        description = `Deal not found: ${target}`;
      }
    }
  }

  // ── Operations actions ──────────────────────────────────────────────────────
  if (agent === 'operations') {
    if (action === 'escalate') {
      const taskResult = await pool.query(
        'SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2',
        [target, workspaceId]
      );
      const task = taskResult.rows[0];
      if (task) {
        await pool.query(
          `UPDATE tasks SET priority = 'high', updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
          [task.id, workspaceId]
        );
        const wf = await startWorkflow(workspaceId, 'task_escalation', 'task', task.id, {});
        if (wf) workflowId = wf.id;
        description = `Escalated task: ${task.title}`;
      } else {
        description = `Task not found: ${target}`;
      }
    } else if (action === 'reorder') {
      const assetResult = await pool.query(
        'SELECT * FROM assets WHERE id = $1 AND workspace_id = $2',
        [target, workspaceId]
      );
      const asset = assetResult.rows[0];
      if (asset) {
        const updatedMeta = { ...(asset.metadata || {}), reorder_initiated_at: new Date().toISOString() };
        await pool.query(
          `UPDATE assets SET metadata = $1, updated_at = NOW() WHERE id = $2 AND workspace_id = $3`,
          [JSON.stringify(updatedMeta), asset.id, workspaceId]
        );
        description = `Initiated reorder for ${asset.name}`;
      } else {
        description = `Asset not found: ${target}`;
      }
    }
  }

  // ── Audit log ───────────────────────────────────────────────────────────────
  const entityTypeMap = {
    finance: 'invoice',
    revenue: action === 'qualify' ? 'contact' : 'deal',
    operations: action === 'reorder' ? 'asset' : 'task',
    growth: 'campaign',
    support: 'ticket',
  };

  const entityType = entityTypeMap[agent] || agent;

  await pool.query(
    `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, 'executed')`,
    [
      workspaceId,
      agentLabel,
      action,
      entityType,
      target,
      JSON.stringify({
        desc: description,
        auto: decision.auto || false,
        approvedBy: options.approvedBy || null,
        communicationId,
        workflowId,
      }),
    ]
  );

  // ── Persistent agent action record ──────────────────────────────────────────
  const reasoning = decision.reasoning || buildReasoning(agent, action, decision, description);
  const handedOffTo = resolveHandoff(agent, action);
  const outcome = handedOffTo ? 'handed_off' : 'completed';

  try {
    await pool.query(
      `INSERT INTO agent_actions
         (workspace_id, agent, action_type, entity_type, entity_id, description, reasoning, outcome, handed_off_to, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        workspaceId,
        agent,
        action,
        entityType,
        target || null,
        description,
        reasoning,
        outcome,
        handedOffTo,
        JSON.stringify({
          auto: decision.auto || false,
          approvedBy: options.approvedBy || null,
          communicationId,
          workflowId,
          impact: decision.impact || null,
        }),
      ]
    );
  } catch (agentActionErr) {
    // Non-fatal — log and continue
    console.error('[Execution] Failed to write agent_action:', agentActionErr.message);
  }

  return { success: true, description, communicationId, workflowId };
}
