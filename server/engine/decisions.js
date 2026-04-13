import { pool } from '../db/index.js';

/**
 * Generate agent decisions for a workspace by querying real PostgreSQL data.
 * Returns array of decision objects sorted by priority descending.
 */
export async function generateDecisions(workspaceId) {
  const decisions = [];

  // Deduplication guard
  const has = (agent, action, target) =>
    decisions.some((d) => d.agent === agent && d.action === action && d.target === target);

  // Fetch workspace settings for risk limits
  const wsResult = await pool.query('SELECT settings FROM workspaces WHERE id = $1', [workspaceId]);
  const settings = wsResult.rows[0]?.settings || {};
  const limits = settings.riskLimits || {};

  // ── Finance: overdue invoice collection ──────────────────────────────────────
  const invoiceResult = await pool.query(
    `SELECT id, description, amount, due_date, contact_id
     FROM invoices
     WHERE workspace_id = $1 AND status = 'pending'`,
    [workspaceId]
  );

  for (const inv of invoiceResult.rows) {
    const impact = parseFloat(inv.amount) || 0;
    const overdue = inv.due_date && new Date(inv.due_date) < new Date();
    const daysPast = inv.due_date
      ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)
      : 0;
    const label = inv.description || `Invoice #${inv.id.slice(0, 8)}`;

    if (overdue && daysPast <= 3) {
      if (has('finance', 'remind', inv.id)) continue;
      decisions.push({
        id: `finance-remind-${inv.id}`,
        agent: 'finance',
        action: 'remind',
        target: inv.id,
        targetName: label,
        priority: 90 + Math.min(impact / 100, 10),
        impact,
        desc: `Send reminder for $${impact.toFixed(2)} — ${daysPast}d overdue`,
        auto: impact <= (limits.maxAutoSpend || 500) * 10,
        needsApproval: false,
        reasoning: `Invoice for $${impact.toFixed(2)} is ${daysPast} ${daysPast === 1 ? 'day' : 'days'} overdue. A friendly reminder at this stage has the highest collection success rate before escalation becomes necessary.`,
      });
    } else if (overdue && daysPast > 3 && daysPast <= 7) {
      if (has('finance', 'urgent', inv.id)) continue;
      decisions.push({
        id: `finance-urgent-${inv.id}`,
        agent: 'finance',
        action: 'urgent',
        target: inv.id,
        targetName: label,
        priority: 95,
        impact,
        desc: `URGENT: $${impact.toFixed(2)} is ${daysPast}d overdue — escalate`,
        auto: true,
        needsApproval: false,
        reasoning: `$${impact.toFixed(2)} has been overdue for ${daysPast} ${daysPast === 1 ? 'day' : 'days'}. The payment window is closing — an urgent follow-up is needed before this moves to the collections escalation tier.`,
      });
    } else if (overdue && daysPast > 7) {
      if (has('finance', 'escalate', inv.id)) continue;
      decisions.push({
        id: `finance-escalate-${inv.id}`,
        agent: 'finance',
        action: 'escalate',
        target: inv.id,
        targetName: label,
        priority: 98,
        impact,
        desc: `CRITICAL: $${impact.toFixed(2)} is ${daysPast}d overdue — collections`,
        auto: false,
        needsApproval: true,
        reasoning: `This invoice has been overdue for ${daysPast} ${daysPast === 1 ? 'day' : 'days'} with $${impact.toFixed(2)} outstanding. Previous reminder stages have not resulted in payment. Escalating to collections is recommended to prevent further aging and potential write-off.`,
      });
    } else if (!overdue) {
      if (has('finance', 'pre', inv.id)) continue;
      decisions.push({
        id: `finance-pre-${inv.id}`,
        agent: 'finance',
        action: 'pre',
        target: inv.id,
        targetName: label,
        priority: 40,
        impact,
        desc: `Pre-due reminder for $${impact.toFixed(2)}`,
        auto: true,
        needsApproval: false,
        reasoning: `Invoice for $${impact.toFixed(2)} is approaching its due date. A proactive pre-due reminder reduces late payments and maintains positive client relationships.`,
      });
    }
  }

  // ── Revenue: stale deal follow-up and qualification ──────────────────────────
  const dealResult = await pool.query(
    `SELECT d.id, d.title, d.value, d.stage, d.probability, d.contact_id, d.updated_at,
            c.name AS contact_name
     FROM deals d
     LEFT JOIN contacts c ON c.id = d.contact_id
     WHERE d.workspace_id = $1 AND d.stage NOT IN ('won', 'lost')`,
    [workspaceId]
  );

  for (const deal of dealResult.rows) {
    const stale = Math.floor(
      (Date.now() - new Date(deal.updated_at).getTime()) / 86400000
    );
    const dealValue = parseFloat(deal.value) || 0;
    const prob = deal.probability || 0;
    const expectedValue = dealValue * prob / 100;
    const contactName = deal.contact_name || 'contact';

    if (stale >= 5) {
      if (has('revenue', 'reengage', deal.id)) continue;
      decisions.push({
        id: `revenue-reengage-${deal.id}`,
        agent: 'revenue',
        action: 'reengage',
        target: deal.id,
        targetName: contactName,
        priority: 85,
        impact: expectedValue,
        desc: `Re-engage ${contactName} — $${dealValue.toFixed(2)} deal stale ${stale}d`,
        auto: true,
        needsApproval: dealValue > (limits.approvalAbove || 5000),
        contactId: deal.contact_id,
        reasoning: `${contactName}'s $${dealValue.toFixed(2)} deal has had no activity for ${stale} ${stale === 1 ? 'day' : 'days'}. At ${prob}% probability, the expected value is $${expectedValue.toFixed(2)}. Re-engagement now prevents the deal from going cold permanently.`,
      });
    } else if (stale >= 3) {
      if (has('revenue', 'followup', deal.id)) continue;
      decisions.push({
        id: `revenue-followup-${deal.id}`,
        agent: 'revenue',
        action: 'followup',
        target: deal.id,
        targetName: contactName,
        priority: 70,
        impact: expectedValue,
        desc: `Follow up with ${contactName} — $${dealValue.toFixed(2)} at ${prob}%`,
        auto: true,
        needsApproval: false,
        contactId: deal.contact_id,
        reasoning: `${contactName}'s $${dealValue.toFixed(2)} deal has been inactive for ${stale} ${stale === 1 ? 'day' : 'days'}. At ${prob}% probability, a timely follow-up keeps momentum and improves close likelihood.`,
      });
    }

    if (prob >= 70 && deal.stage === 'negotiation') {
      if (has('revenue', 'close', deal.id)) continue;
      decisions.push({
        id: `revenue-close-${deal.id}`,
        agent: 'revenue',
        action: 'close',
        target: deal.id,
        targetName: contactName,
        priority: 92,
        impact: expectedValue,
        desc: `Close ${contactName} — $${dealValue.toFixed(2)} at ${prob}% (high confidence)`,
        auto: false,
        needsApproval: true,
        contactId: deal.contact_id,
        reasoning: `${contactName} is at ${prob}% close probability in the negotiation stage with $${dealValue.toFixed(2)} on the line. This is a high-confidence close opportunity — delaying risks losing momentum.`,
      });
    }
  }

  // ── Revenue: unqualified leads with no deal ───────────────────────────────────
  const leadResult = await pool.query(
    `SELECT c.id, c.name
     FROM contacts c
     WHERE c.workspace_id = $1 AND c.type = 'lead'
       AND NOT EXISTS (
         SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1
       )`,
    [workspaceId]
  );

  for (const contact of leadResult.rows) {
    if (has('revenue', 'qualify', contact.id)) continue;
    decisions.push({
      id: `revenue-qualify-${contact.id}`,
      agent: 'revenue',
      action: 'qualify',
      target: contact.id,
      targetName: contact.name,
      priority: 50,
      impact: 0,
      desc: `Qualify ${contact.name} — no deal created yet`,
      auto: true,
      needsApproval: false,
      contactId: contact.id,
      reasoning: `${contact.name} was added as a lead but has no deal attached yet. Qualifying leads into the pipeline ensures no revenue opportunity is missed.`,
    });
  }

  // ── Operations: overdue task escalation ──────────────────────────────────────
  const taskResult = await pool.query(
    `SELECT id, title
     FROM tasks
     WHERE workspace_id = $1 AND status NOT IN ('completed', 'cancelled') AND due_date < NOW()`,
    [workspaceId]
  );

  for (const task of taskResult.rows) {
    if (has('operations', 'escalate', task.id)) continue;
    decisions.push({
      id: `operations-escalate-${task.id}`,
      agent: 'operations',
      action: 'escalate',
      target: task.id,
      targetName: task.title,
      priority: 75,
      impact: 0,
      desc: `Escalate: "${task.title}" is overdue`,
      auto: true,
      needsApproval: false,
      reasoning: `Task "${task.title}" is past its due date. Overdue tasks create downstream bottlenecks and signal operational drag. Escalation ensures visibility and reassignment.`,
    });
  }

  // ── Operations: asset reorder (uses metadata.reorder_point if set) ───────────
  const assetResult = await pool.query(
    `SELECT id, name, quantity, unit_cost,
            (metadata->>'reorder_point')::int AS reorder_point
     FROM assets
     WHERE workspace_id = $1
       AND (metadata->>'reorder_point') IS NOT NULL
       AND (metadata->>'reorder_point')::int > 0
       AND quantity < (metadata->>'reorder_point')::int`,
    [workspaceId]
  );

  for (const asset of assetResult.rows) {
    if (has('operations', 'reorder', asset.id)) continue;
    const reorderPoint = asset.reorder_point || 0;
    const unitCost = parseFloat(asset.unit_cost) || 0;
    const reorderCost = unitCost * (reorderPoint - asset.quantity);
    decisions.push({
      id: `operations-reorder-${asset.id}`,
      agent: 'operations',
      action: 'reorder',
      target: asset.id,
      targetName: asset.name,
      priority: 80,
      impact: 0,
      desc: `Reorder ${asset.name} — ${asset.quantity}/${reorderPoint} units`,
      auto: true,
      needsApproval: reorderCost > (limits.maxAutoSpend || 500),
      reasoning: `${asset.name} is at ${asset.quantity} units, below the reorder point of ${reorderPoint}. Running out would disrupt operations. Reorder cost: ~$${reorderCost.toFixed(2)}.`,
    });
  }

  return decisions.sort((a, b) => b.priority - a.priority);
}
