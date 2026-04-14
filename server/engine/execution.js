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
  if (agent === 'growth') {
    if (action === 'reactivate' || action === 'reactivate_dormant_lead') return `${targetName} has been dormant for an extended period. Reactivation outreach is more cost-effective than acquiring a new customer — sending re-engagement email now.`;
    if (action === 'outreach' || action === 'nurture_lead' || action === 'follow_up_stale_lead') return `${targetName} has been in the pipeline without meaningful contact. Sending nurture sequence to qualify intent and move them forward.`;
    if (action === 'upsell' || action === 'flag_expansion_opportunity') return `${targetName} has a strong payment history with no active deal. Flagging as expansion opportunity for owner review.`;
    if (action === 'launch_campaign_action') return `Executing campaign action for ${targetName}. Triggering targeted outreach sequence.`;
  }
  if (agent === 'support') {
    if (action === 'retention' || action === 'respond_to_at_risk_customer') return `${targetName} shows signs of account stress — overdue balance with an open deal at risk. Sending proactive retention outreach to preserve the relationship.`;
    if (action === 'escalate' || action === 'escalate_issue') return `${targetName} has accumulated multiple unresolved issues that automated workflows cannot clear. Escalating to owner for direct intervention.`;
    if (action === 'investigate' || action === 'follow_up_open_issue') return `${targetName} has an open issue that requires follow-up. Sending status update to customer.`;
    if (action === 'handle_complaint') return `Complaint received from ${targetName}. Acknowledging and creating tracking task to ensure resolution.`;
    if (action === 'flag_churn_risk') return `${targetName} is exhibiting churn signals — multiple complaints or overdue invoices combined with support issues. Creating churn risk alert for owner.`;
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
  if (agent === 'support' && (action === 'escalate' || action === 'escalate_issue')) return 'operations';
  if (agent === 'growth' && (action === 'upsell' || action === 'flag_expansion_opportunity')) return 'revenue';
  return null;
}

/**
 * Detect cross-agent conflicts before executing an action.
 * Returns { conflict: boolean, conflictingAgent, conflictingAction, details }
 */
async function detectConflict(workspaceId, agent, action, entityId) {
  if (!entityId) return { conflict: false };
  try {
    // Look for pending/recent actions by OTHER agents on the same entity within the last 2 hours
    const result = await pool.query(
      `SELECT agent, action_type, description, created_at
       FROM agent_actions
       WHERE workspace_id = $1
         AND entity_id = $2
         AND agent != $3
         AND outcome IN ('pending', 'completed', 'handed_off')
         AND created_at > NOW() - INTERVAL '2 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId, entityId, agent]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        conflict: true,
        conflictingAgent: row.agent,
        conflictingAction: row.action_type,
        details: row.description,
      };
    }
  } catch (_err) {
    // non-fatal — don't block execution on conflict check failure
  }
  return { conflict: false };
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

  // ── Cross-agent conflict detection ─────────────────────────────────────────
  const entityId = contactId || target;
  const conflictCheck = await detectConflict(workspaceId, agent, action, entityId);
  if (conflictCheck.conflict) {
    // Log the conflict and defer to the already-active agent
    const conflictDesc = `Conflict detected: ${agent}:${action} deferred — ${conflictCheck.conflictingAgent} already acted on this entity (${conflictCheck.conflictingAction})`;
    try {
      await pool.query(
        `INSERT INTO audit_log (workspace_id, agent, action, entity_type, entity_id, details, outcome)
         VALUES ($1, $2, 'conflict_deferred', $3, $4, $5, 'skipped')`,
        [
          workspaceId,
          agentLabel,
          'entity',
          entityId,
          JSON.stringify({
            desc: conflictDesc,
            conflictingAgent: conflictCheck.conflictingAgent,
            conflictingAction: conflictCheck.conflictingAction,
          }),
        ]
      );
      // Create an owner alert task for the conflict
      await pool.query(
        `INSERT INTO tasks (workspace_id, title, description, priority, status)
         VALUES ($1, $2, $3, 'medium', 'todo')`,
        [
          workspaceId,
          `Agent conflict: ${agent} vs ${conflictCheck.conflictingAgent}`,
          conflictDesc,
        ]
      );
    } catch (_err) {
      // non-fatal
    }
    return { success: false, description: conflictDesc, conflict: true, communicationId: null, workflowId: null };
  }

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

  // ── Growth actions ──────────────────────────────────────────────────────────
  if (agent === 'growth') {
    const resolvedContactId = contactId || target;
    const contactResult = await pool.query(
      'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
      [resolvedContactId, workspaceId]
    );
    const contact = contactResult.rows[0];
    const contactName = contact?.name || decision.targetName || resolvedContactId;

    if (action === 'reactivate' || action === 'reactivate_dormant_lead') {
      if (contact) {
        const wf = await startWorkflow(workspaceId, 'lead_nurture', 'contact', contact.id, { source: 'reactivation' });
        if (wf) workflowId = wf.id;
        communicationId = await createEmail(
          `We'd love to reconnect — ${contact.name}`,
          `Hi ${contact.name},\n\nIt's been a while since we last connected. We wanted to reach out and see if there's anything we can help you with.\n\nWould you be open to a quick conversation?`,
          contact.id,
          workflowId
        );
        description = communicationId
          ? `Sent reactivation email to dormant customer: ${contactName}`
          : `Reactivation email skipped (daily limit): ${contactName}`;
      } else {
        description = `Contact not found for reactivation: ${resolvedContactId}`;
      }
    } else if (
      action === 'outreach' || action === 'nurture_lead' ||
      action === 'follow_up_stale_lead'
    ) {
      if (contact) {
        const wf = await startWorkflow(workspaceId, 'lead_nurture', 'contact', contact.id, { source: 'nurture' });
        if (wf) workflowId = wf.id;
        communicationId = await createEmail(
          `Following up — ${contact.name}`,
          `Hi ${contact.name},\n\nJust wanted to follow up and see if you had any questions or if there's anything we can help with.\n\nLet us know!`,
          contact.id,
          workflowId
        );
        description = communicationId
          ? `Sent nurture email to lead: ${contactName}`
          : `Nurture email skipped (daily limit): ${contactName}`;
      } else {
        description = `Contact not found for nurture: ${resolvedContactId}`;
      }
    } else if (action === 'upsell' || action === 'flag_expansion_opportunity') {
      if (contact) {
        // Create a task flagging the expansion opportunity for the owner
        await pool.query(
          `INSERT INTO tasks (workspace_id, title, description, priority, status, contact_id)
           VALUES ($1, $2, $3, 'medium', 'todo', $4) RETURNING id`,
          [
            workspaceId,
            `Expansion opportunity: ${contactName}`,
            `Growth agent flagged ${contactName} as an upsell/expansion candidate based on payment history. Review and initiate conversation.`,
            contact.id,
          ]
        );
        description = `Flagged expansion opportunity for ${contactName} — task created`;
      } else {
        description = `Contact not found for expansion flag: ${resolvedContactId}`;
      }
    } else if (action === 'launch_campaign_action') {
      if (contact) {
        communicationId = await createEmail(
          `Special update — ${contactName}`,
          `Hi ${contactName},\n\nWe have an exciting update we'd like to share with you. Please reach out to learn more.`,
          contact.id,
          null
        );
        description = communicationId
          ? `Executed campaign outreach for ${contactName}`
          : `Campaign outreach skipped (daily limit): ${contactName}`;
      } else {
        description = `Contact not found for campaign action: ${resolvedContactId}`;
      }
    }
  }

  // ── Support actions ─────────────────────────────────────────────────────────
  if (agent === 'support') {
    const resolvedContactId = contactId || target;

    if (action === 'retention' || action === 'respond_to_at_risk_customer') {
      const contactResult = await pool.query(
        'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
        [resolvedContactId, workspaceId]
      );
      const contact = contactResult.rows[0];
      const contactName = contact?.name || decision.targetName || resolvedContactId;
      if (contact) {
        const wf = await startWorkflow(workspaceId, 'issue_resolution', 'contact', contact.id, { source: 'retention' });
        if (wf) workflowId = wf.id;
        communicationId = await createEmail(
          `Reaching out personally — ${contactName}`,
          `Hi ${contactName},\n\nWe noticed a few things we want to make right. I'd like to personally connect to ensure you're having a great experience with us.\n\nWhen would be a good time to connect?`,
          contact.id,
          workflowId
        );
        description = communicationId
          ? `Sent retention outreach to at-risk customer: ${contactName}`
          : `Retention email skipped (daily limit): ${contactName}`;
      } else {
        description = `Contact not found for retention: ${resolvedContactId}`;
      }
    } else if (action === 'escalate' || action === 'escalate_issue') {
      // Target may be a contact or a task
      const contactResult = await pool.query(
        'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
        [resolvedContactId, workspaceId]
      );
      const contact = contactResult.rows[0];
      const contactName = contact?.name || decision.targetName || resolvedContactId;
      await pool.query(
        `INSERT INTO tasks (workspace_id, title, description, priority, status, contact_id)
         VALUES ($1, $2, $3, 'high', 'todo', $4) RETURNING id`,
        [
          workspaceId,
          `Escalation required: ${contactName}`,
          `Support agent flagged ${contactName} for direct owner intervention — multiple unresolved issues detected. Review immediately.`,
          contact?.id || null,
        ]
      );
      const wf = await startWorkflow(workspaceId, 'issue_resolution', 'contact', resolvedContactId, { source: 'escalation' });
      if (wf) workflowId = wf.id;
      description = `Escalated to owner — task created for: ${contactName}`;
    } else if (action === 'investigate' || action === 'follow_up_open_issue') {
      const contactResult = await pool.query(
        'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
        [resolvedContactId, workspaceId]
      );
      const contact = contactResult.rows[0];
      const targetName = decision.targetName || contact?.name || resolvedContactId;
      if (contact) {
        communicationId = await createEmail(
          `Update on your request`,
          `Hi ${contact.name},\n\nWe wanted to follow up on your open issue. Our team is actively working on a resolution and will be in touch shortly. Thank you for your patience.`,
          contact.id,
          null
        );
        description = communicationId
          ? `Sent follow-up email for open issue: ${targetName}`
          : `Follow-up email skipped (daily limit): ${targetName}`;
      } else {
        description = `Contact not found for issue follow-up: ${resolvedContactId}`;
      }
    } else if (action === 'handle_complaint') {
      const contactResult = await pool.query(
        'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
        [resolvedContactId, workspaceId]
      );
      const contact = contactResult.rows[0];
      const contactName = contact?.name || decision.targetName || resolvedContactId;
      if (contact) {
        // Create a tracking task
        await pool.query(
          `INSERT INTO tasks (workspace_id, title, description, priority, status, contact_id)
           VALUES ($1, $2, $3, 'high', 'todo', $4)`,
          [
            workspaceId,
            `Complaint follow-up: ${contactName}`,
            `Support agent received complaint from ${contactName}. Acknowledgment sent — follow up to ensure resolution.`,
            contact.id,
          ]
        );
        communicationId = await createEmail(
          `We heard you — and we're on it`,
          `Hi ${contactName},\n\nThank you for bringing this to our attention. We take your feedback seriously and want to make this right. A member of our team will follow up with you shortly.\n\nWe appreciate your patience.`,
          contact.id,
          null
        );
        description = communicationId
          ? `Acknowledged complaint from ${contactName} — task created`
          : `Complaint acknowledgment skipped (daily limit): ${contactName}`;
      } else {
        description = `Contact not found for complaint handling: ${resolvedContactId}`;
      }
    } else if (action === 'flag_churn_risk') {
      const contactResult = await pool.query(
        'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
        [resolvedContactId, workspaceId]
      );
      const contact = contactResult.rows[0];
      const contactName = contact?.name || decision.targetName || resolvedContactId;
      // Create a high-priority churn risk alert task
      await pool.query(
        `INSERT INTO tasks (workspace_id, title, description, priority, status, contact_id)
         VALUES ($1, $2, $3, 'high', 'todo', $4)`,
        [
          workspaceId,
          `Churn risk alert: ${contactName}`,
          `Support agent detected churn signals for ${contactName} — multiple complaints or overdue invoices combined with support issues. Immediate owner review recommended.`,
          contact?.id || null,
        ]
      );
      description = `Flagged churn risk for ${contactName} — high-priority task created`;
    }
  }

  // ── Audit log ───────────────────────────────────────────────────────────────
  const entityTypeMap = {
    finance: 'invoice',
    revenue: action === 'qualify' ? 'contact' : 'deal',
    operations: action === 'reorder' ? 'asset' : 'task',
    growth: 'contact',
    support: 'contact',
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
