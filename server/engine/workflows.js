import { pool } from '../db/index.js';

/**
 * Map a business event type to a workflow template and entity details.
 * Returns { template, entityType, entityId } or null if no mapping.
 */
export function mapEventToWorkflow(event) {
  if (!event) return null;
  const type = event.event_type || '';
  const entityType = event.entity_type || null;
  const entityId = event.entity_id || null;

  if (type === 'invoice_created' || type === 'invoice_overdue') {
    return { template: 'invoice_collection', entityType: 'invoice', entityId };
  }
  if (type === 'deal_stale' || type === 'deal_created') {
    return { template: 'deal_followup', entityType: 'deal', entityId };
  }
  if (type === 'task_overdue' || type === 'task_blocked') {
    return { template: 'task_escalation', entityType: 'task', entityId };
  }
  if (type === 'support_ticket_created' || type === 'support_issue_opened') {
    return { template: 'issue_resolution', entityType: entityType || 'ticket', entityId };
  }
  if (type === 'lead_created' || type === 'contact_signed_up') {
    return { template: 'lead_nurture', entityType: 'contact', entityId };
  }
  return null;
}

/**
 * Pause a workflow. Returns the updated workflow row or null if not found.
 */
export async function pauseWorkflow(workspaceId, workflowId, reason = null) {
  const result = await pool.query(
    `UPDATE workflows
     SET status = 'paused', paused_at = NOW(), pause_reason = $1, updated_at = NOW()
     WHERE id = $2 AND workspace_id = $3 AND status = 'active'
     RETURNING *`,
    [reason, workflowId, workspaceId]
  );
  return result.rows[0] || null;
}

/**
 * Resume a paused workflow. Returns the updated workflow row or null.
 */
export async function resumeWorkflow(workspaceId, workflowId) {
  const result = await pool.query(
    `UPDATE workflows
     SET status = 'active', paused_at = NULL, pause_reason = NULL, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND status = 'paused'
     RETURNING *`,
    [workflowId, workspaceId]
  );
  return result.rows[0] || null;
}

/**
 * Reassign workflow ownership to another agent.
 */
export async function reassignWorkflow(workspaceId, workflowId, newAgent) {
  const result = await pool.query(
    `UPDATE workflows
     SET context = context || jsonb_build_object('assigned_agent', $1), updated_at = NOW()
     WHERE id = $2 AND workspace_id = $3
     RETURNING *`,
    [newAgent, workflowId, workspaceId]
  );
  return result.rows[0] || null;
}

export const WF_TEMPLATES = {
  invoice_collection: {
    agent: 'finance',
    steps: [
      { action: 'remind', delay: 0, channel: 'email', subject: 'Invoice reminder', tone: 'professional' },
      { action: 'followup', delay: 72, channel: 'email', subject: 'Follow-up: payment outstanding', tone: 'firm' },
      { action: 'urgent', delay: 120, channel: 'email', subject: 'Urgent: payment required', tone: 'urgent' },
      { action: 'escalate', delay: 168, channel: 'email', subject: 'Final notice before collections', tone: 'final' },
    ],
  },
  deal_followup: {
    agent: 'revenue',
    steps: [
      { action: 'followup', delay: 0, channel: 'email', subject: 'Following up', tone: 'friendly' },
      { action: 'followup', delay: 72, channel: 'email', subject: 'Checking in', tone: 'persistent' },
      { action: 'reengage', delay: 168, channel: 'email', subject: 'Still interested?', tone: 'direct' },
    ],
  },
  task_escalation: {
    agent: 'operations',
    steps: [
      { action: 'escalate', delay: 0, channel: 'email', subject: 'Task overdue — priority raised', tone: 'alert' },
      { action: 'escalate', delay: 48, channel: 'email', subject: 'Task still overdue — escalating', tone: 'urgent' },
      { action: 'escalate', delay: 120, channel: 'email', subject: 'Critical: unresolved task', tone: 'critical' },
    ],
  },
  issue_resolution: {
    agent: 'support',
    steps: [
      { action: 'followup', delay: 0, channel: 'email', subject: 'We received your request', tone: 'acknowledgment' },
      { action: 'followup', delay: 24, channel: 'email', subject: 'Update on your request', tone: 'progress' },
      { action: 'escalate', delay: 72, channel: 'email', subject: 'Escalating your request', tone: 'escalation' },
    ],
  },
  lead_nurture: {
    agent: 'revenue',
    steps: [
      { action: 'qualify', delay: 0, channel: 'email', subject: 'Introduction', tone: 'friendly' },
      { action: 'followup', delay: 72, channel: 'email', subject: 'Learn more about us', tone: 'informative' },
      { action: 'followup', delay: 168, channel: 'email', subject: 'Ready to connect?', tone: 'direct' },
    ],
  },
  campaign_optimization: {
    agent: 'growth',
    steps: [
      { action: 'scale', delay: 0, channel: 'email', subject: 'Campaign review initiated', tone: 'analytical' },
      { action: 'scale', delay: 168, channel: 'email', subject: 'Performance checkpoint', tone: 'review' },
      { action: 'scale', delay: 336, channel: 'email', subject: 'Budget reallocation recommendation', tone: 'strategic' },
    ],
  },
};

/**
 * Create a workflow record in the database for the given template and entity.
 * Returns the created workflow row or null if a duplicate active workflow exists.
 */
export async function startWorkflow(workspaceId, template, entityType, entityId, context = {}) {
  const tmpl = WF_TEMPLATES[template];
  if (!tmpl) return null;

  // Check for existing active workflow for same template + entity
  const existing = await pool.query(
    `SELECT id FROM workflows
     WHERE workspace_id = $1 AND template = $2 AND trigger_entity_id = $3 AND status = 'active'`,
    [workspaceId, template, entityId]
  );
  if (existing.rows.length > 0) return null;

  // Check for completed workflow within last 7 days
  const recentCompleted = await pool.query(
    `SELECT id FROM workflows
     WHERE workspace_id = $1 AND template = $2 AND trigger_entity_id = $3
       AND status = 'completed' AND completed_at > NOW() - INTERVAL '7 days'`,
    [workspaceId, template, entityId]
  );
  if (recentCompleted.rows.length > 0) return null;

  const steps = tmpl.steps.map((s) => ({ ...s, executed: false }));
  const now = new Date();
  // next_action_at = now + delay hours of first step (first step delay is always 0)
  const firstDelay = steps[0]?.delay || 0;
  const nextActionAt = new Date(now.getTime() + firstDelay * 3600000);

  const result = await pool.query(
    `INSERT INTO workflows
       (workspace_id, template, status, current_step, steps, trigger_entity_type, trigger_entity_id, context, next_action_at, started_at)
     VALUES ($1, $2, 'active', 0, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [
      workspaceId,
      template,
      JSON.stringify(steps),
      entityType || null,
      entityId || null,
      JSON.stringify(context),
      nextActionAt.toISOString(),
    ]
  );

  return result.rows[0];
}

/**
 * Advance all active workflows for a workspace.
 * Executes steps whose next_action_at has passed; creates communication records.
 * Returns { advanced, completed } counts.
 */
export async function advanceWorkflows(workspaceId) {
  let advanced = 0;
  let completed = 0;

  // Check SLA breaches on all active workflows
  try {
    await pool.query(
      `UPDATE workflows SET sla_breached = true, updated_at = NOW()
       WHERE workspace_id = $1 AND status = 'active'
         AND sla_deadline IS NOT NULL AND sla_deadline < NOW()
         AND (sla_breached IS NULL OR sla_breached = false)`,
      [workspaceId]
    );
  } catch {
    // non-fatal
  }

  const wfResult = await pool.query(
    `SELECT * FROM workflows
     WHERE workspace_id = $1 AND status = 'active' AND next_action_at <= NOW()`,
    [workspaceId]
  );

  for (const wf of wfResult.rows) {
    try {
      const steps = Array.isArray(wf.steps) ? wf.steps : JSON.parse(wf.steps || '[]');
      const currentStep = wf.current_step || 0;

      if (currentStep >= steps.length) {
        // All steps exhausted — mark completed
        await pool.query(
          `UPDATE workflows SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [wf.id]
        );
        completed++;
        continue;
      }

      const step = steps[currentStep];
      if (!step || step.executed) {
        // Skip already-executed step; advance index
        const nextStep = currentStep + 1;
        if (nextStep >= steps.length) {
          await pool.query(
            `UPDATE workflows SET status = 'completed', completed_at = NOW(), current_step = $1, updated_at = NOW() WHERE id = $2`,
            [nextStep, wf.id]
          );
          completed++;
        } else {
          const nextDelay = steps[nextStep]?.delay || 0;
          const nextActionAt = new Date(Date.now() + nextDelay * 3600000);
          await pool.query(
            `UPDATE workflows SET current_step = $1, next_action_at = $2, updated_at = NOW() WHERE id = $3`,
            [nextStep, nextActionAt.toISOString(), wf.id]
          );
        }
        continue;
      }

      // Mark step as executed and create communication record
      step.executed = true;
      steps[currentStep] = step;
      const nextStep = currentStep + 1;

      // Resolve contact for communication
      let contactId = null;
      if (wf.trigger_entity_type === 'contact') {
        contactId = wf.trigger_entity_id;
      } else if (wf.trigger_entity_type === 'deal') {
        const dealRow = await pool.query('SELECT contact_id FROM deals WHERE id = $1', [wf.trigger_entity_id]);
        contactId = dealRow.rows[0]?.contact_id || null;
      } else if (wf.trigger_entity_type === 'invoice') {
        const invRow = await pool.query('SELECT contact_id FROM invoices WHERE id = $1', [wf.trigger_entity_id]);
        contactId = invRow.rows[0]?.contact_id || null;
      }

      if (contactId) {
        await pool.query(
          `INSERT INTO communications (workspace_id, contact_id, workflow_id, channel, direction, subject, body, status)
           VALUES ($1, $2, $3, $4, 'outbound', $5, $6, 'queued')`,
          [
            workspaceId,
            contactId,
            wf.id,
            step.channel || 'email',
            step.subject || `${step.action} — step ${currentStep + 1}`,
            `Automated ${step.tone || ''} message for ${wf.template} workflow step ${currentStep + 1}`,
          ]
        );
      }

      // Advance to next step or complete
      if (nextStep >= steps.length) {
        await pool.query(
          `UPDATE workflows SET status = 'completed', completed_at = NOW(), current_step = $1, steps = $2, updated_at = NOW() WHERE id = $3`,
          [nextStep, JSON.stringify(steps), wf.id]
        );
        completed++;
      } else {
        const nextDelay = steps[nextStep]?.delay || 0;
        const nextActionAt = new Date(Date.now() + nextDelay * 3600000);
        await pool.query(
          `UPDATE workflows SET current_step = $1, steps = $2, next_action_at = $3, updated_at = NOW() WHERE id = $4`,
          [nextStep, JSON.stringify(steps), nextActionAt.toISOString(), wf.id]
        );
      }

      advanced++;
    } catch (wfErr) {
      console.error(`Error advancing workflow ${wf.id}:`, wfErr);
    }
  }

  return { advanced, completed };
}
