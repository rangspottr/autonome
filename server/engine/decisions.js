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

  // ── Support: at-risk accounts (overdue invoices + open deals) ─────────────────
  const atRiskResult = await pool.query(
    `SELECT id, name, overdue_amount, deal_id, deal_value
     FROM (
       SELECT c.id, c.name,
              (SELECT COALESCE(SUM(i.amount), 0)
               FROM invoices i
               WHERE i.contact_id = c.id AND i.workspace_id = $1
                 AND (i.status = 'overdue' OR (i.status = 'pending' AND i.due_date < NOW()))
              ) AS overdue_amount,
              (SELECT d.id FROM deals d
               WHERE d.contact_id = c.id AND d.workspace_id = $1
                 AND d.stage NOT IN ('won', 'lost')
               ORDER BY d.value DESC LIMIT 1
              ) AS deal_id,
              (SELECT COALESCE(SUM(d.value), 0) FROM deals d
               WHERE d.contact_id = c.id AND d.workspace_id = $1
                 AND d.stage NOT IN ('won', 'lost')
              ) AS deal_value
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
     ) sub
     WHERE overdue_amount > 0`,
    [workspaceId]
  );

  for (const row of atRiskResult.rows) {
    if (has('support', 'retention', row.id)) continue;
    const overdueAmt = parseFloat(row.overdue_amount) || 0;
    const dealVal = parseFloat(row.deal_value) || 0;
    decisions.push({
      id: `support-retention-${row.id}`,
      agent: 'support',
      action: 'retention',
      target: row.id,
      targetName: row.name,
      priority: 88,
      impact: dealVal,
      desc: `At-risk account: ${row.name} has $${overdueAmt.toFixed(2)} overdue while a $${dealVal.toFixed(2)} deal is open. Prioritize retention outreach.`,
      auto: false,
      needsApproval: true,
      contactId: row.id,
      reasoning: `${row.name} has $${overdueAmt.toFixed(2)} in overdue invoices while a $${dealVal.toFixed(2)} deal remains open. This combination signals account stress — if the overdue balance goes unresolved the open deal is at serious risk of being lost. Retention outreach should be prioritized immediately.`,
    });
  }

  // ── Support: repeat blockers (contacts with 3+ blocked agent actions) ─────────
  const blockerResult = await pool.query(
    `SELECT aa.entity_id AS contact_id, c.name, COUNT(*) AS blocked_count
     FROM agent_actions aa
     JOIN contacts c ON c.id = aa.entity_id AND c.workspace_id = $1
     WHERE aa.workspace_id = $1 AND aa.entity_type = 'contact' AND aa.outcome = 'blocked'
     GROUP BY aa.entity_id, c.name
     HAVING COUNT(*) >= 3`,
    [workspaceId]
  );

  for (const row of blockerResult.rows) {
    if (has('support', 'escalate', row.contact_id)) continue;
    const n = parseInt(row.blocked_count) || 0;
    decisions.push({
      id: `support-escalate-${row.contact_id}`,
      agent: 'support',
      action: 'escalate',
      target: row.contact_id,
      targetName: row.name,
      priority: 82,
      impact: 0,
      desc: `Repeat blocker: ${row.name} has ${n} unresolved issues. Escalate to owner for direct intervention.`,
      auto: false,
      needsApproval: true,
      contactId: row.contact_id,
      reasoning: `${row.name} has accumulated ${n} blocked agent actions, indicating a persistent unresolved issue that automated workflows cannot clear. Direct owner intervention is required to break the cycle and restore service continuity.`,
    });
  }

  // ── Support: deal regressions (high probability in early stage) ───────────────
  const regressionResult = await pool.query(
    `SELECT d.id, d.title, d.stage, d.probability, d.value, d.contact_id,
            c.name AS contact_name
     FROM deals d
     LEFT JOIN contacts c ON c.id = d.contact_id
     WHERE d.workspace_id = $1
       AND d.stage IN ('new', 'qualified', 'proposal')
       AND d.probability >= 70`,
    [workspaceId]
  );

  for (const deal of regressionResult.rows) {
    if (has('support', 'investigate', deal.id)) continue;
    const dealVal = parseFloat(deal.value) || 0;
    const contactName = deal.contact_name || 'contact';
    // Infer expected stage from probability to give meaningful regression context
    const expectedStage = deal.probability >= 80 ? 'negotiation' : 'proposal/negotiation';
    decisions.push({
      id: `support-investigate-${deal.id}`,
      agent: 'support',
      action: 'investigate',
      target: deal.id,
      targetName: deal.title,
      priority: 78,
      impact: dealVal,
      desc: `Deal regression: "${deal.title}" is in ${deal.stage} at ${deal.probability}% — expected to be at ${expectedStage}. Investigate and recover.`,
      auto: false,
      needsApproval: true,
      contactId: deal.contact_id,
      reasoning: `"${deal.title}" with ${contactName} carries ${deal.probability}% close probability but sits in the ${deal.stage} stage, which is inconsistent with normal deal progression. This misalignment suggests a potential regression from a more advanced stage. Investigating the cause and executing a recovery plan can prevent the $${dealVal.toFixed(2)} deal from stalling permanently.`,
    });
  }

  // ── Growth: dormant customers (type='customer', no deal activity in 30+ days) ─
  const dormantResult = await pool.query(
    `SELECT id, name, days_inactive
     FROM (
       SELECT c.id, c.name,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(
                (SELECT MAX(d.updated_at) FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1),
                c.created_at
              ))) / 86400)::int AS days_inactive
       FROM contacts c
       WHERE c.workspace_id = $1 AND c.type = 'customer'
     ) sub
     WHERE days_inactive >= 30`,
    [workspaceId]
  );

  for (const row of dormantResult.rows) {
    if (has('growth', 'reactivate', row.id)) continue;
    const days = parseInt(row.days_inactive) || 30;
    decisions.push({
      id: `growth-reactivate-${row.id}`,
      agent: 'growth',
      action: 'reactivate',
      target: row.id,
      targetName: row.name,
      priority: 72,
      impact: 0,
      desc: `Dormant customer: ${row.name} — no deal activity in ${days} days. Reactivation campaign recommended.`,
      auto: true,
      needsApproval: false,
      contactId: row.id,
      reasoning: `${row.name} has been a customer with no deal activity for ${days} days. Dormant customers represent high-probability reactivation opportunities since they already trust the business. A targeted reactivation campaign now is more cost-effective than acquiring a new customer.`,
    });
  }

  // ── Growth: stale leads (created 7+ days ago, no agent action) ───────────────
  const staleLeadResult = await pool.query(
    `SELECT c.id, c.name,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400)::int AS days_since_added
     FROM contacts c
     WHERE c.workspace_id = $1
       AND c.type = 'lead'
       AND c.created_at < NOW() - INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM agent_actions aa
         WHERE aa.entity_id = c.id AND aa.workspace_id = $1
           AND aa.entity_type = 'contact'
       )`,
    [workspaceId]
  );

  for (const row of staleLeadResult.rows) {
    if (has('growth', 'outreach', row.id)) continue;
    const days = parseInt(row.days_since_added) || 7;
    decisions.push({
      id: `growth-outreach-${row.id}`,
      agent: 'growth',
      action: 'outreach',
      target: row.id,
      targetName: row.name,
      priority: 60,
      impact: 0,
      desc: `Stale lead: ${row.name} added ${days} days ago with no outreach. Qualify or archive.`,
      auto: true,
      needsApproval: false,
      contactId: row.id,
      reasoning: `${row.name} was added as a lead ${days} days ago but has received zero agent outreach. Leads left untouched beyond 7 days show a steep drop-off in conversion rates. Qualifying or archiving this contact now keeps the pipeline clean and prevents future confusion.`,
    });
  }

  // ── Growth: expansion opportunities (paid > $5000, no active deal) ────────────
  const expansionResult = await pool.query(
    `SELECT c.id, c.name, SUM(i.amount) AS total_paid
     FROM contacts c
     JOIN invoices i ON i.contact_id = c.id AND i.workspace_id = $1 AND i.status = 'paid'
     WHERE c.workspace_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1
           AND d.stage NOT IN ('won', 'lost')
       )
     GROUP BY c.id, c.name
     HAVING SUM(i.amount) > 5000`,
    [workspaceId]
  );

  for (const row of expansionResult.rows) {
    if (has('growth', 'upsell', row.id)) continue;
    const totalPaid = parseFloat(row.total_paid) || 0;
    decisions.push({
      id: `growth-upsell-${row.id}`,
      agent: 'growth',
      action: 'upsell',
      target: row.id,
      targetName: row.name,
      priority: 68,
      impact: totalPaid * 0.3,
      desc: `Expansion opportunity: ${row.name} has paid $${totalPaid.toFixed(2)} total but has no active deal. Upsell recommended.`,
      auto: false,
      needsApproval: true,
      contactId: row.id,
      reasoning: `${row.name} has a strong payment history totalling $${totalPaid.toFixed(2)} with no active deal currently open. High-value customers with no open deal are prime expansion candidates — they have demonstrated willingness to pay and existing trust in the business. An upsell or cross-sell conversation now has a high probability of converting.`,
    });
  }

  // ── Support: disputed invoices ────────────────────────────────────────────────
  const disputeResult = await pool.query(
    `SELECT id, description, amount, contact_id
     FROM invoices
     WHERE workspace_id = $1 AND status = 'disputed'`,
    [workspaceId]
  );

  for (const inv of disputeResult.rows) {
    if (has('support', 'flag_dispute', inv.id)) continue;
    decisions.push(buildDisputeDecision(inv));
  }

  return decisions.sort((a, b) => b.priority - a.priority);
}

/**
 * Check if a single invoice is disputed and generate a support flag decision.
 * Exported for targeted testing of the dispute scenario.
 */
export function buildDisputeDecision(inv) {
  const impact = parseFloat(inv.amount) || 0;
  const label = inv.description || `Invoice #${String(inv.id).slice(0, 8)}`;
  return {
    id: `support-dispute-${inv.id}`,
    agent: 'support',
    action: 'flag_dispute',
    target: inv.id,
    targetName: label,
    priority: 96,
    impact,
    desc: `Payment dispute: ${label} ($${impact.toFixed(2)}) has been disputed — flag for owner review`,
    auto: false,
    needsApproval: true,
    reasoning: `Invoice ${label} has been marked as disputed. Disputed payments require immediate owner attention to prevent chargeback escalation and protect the business relationship.`,
  };
}
