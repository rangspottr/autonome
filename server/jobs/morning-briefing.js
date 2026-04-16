import { pool } from '../db/index.js';
import { recordJobHealthRun } from '../lib/job-health.js';

/**
 * Generate a structured morning briefing for a workspace.
 *
 * Scans business signals — leads, invoices, tasks, deals, agent actions,
 * workflows, alerts — and produces a human-readable, owner-facing output
 * that answers: "what happened overnight, what needs my attention today."
 *
 * The finished output is stored in the `outputs` table so the UI can surface
 * it as a deliverable rather than a raw metric.
 */
export async function generateMorningBriefing(workspaceId) {
  const now = new Date();
  const since = new Date(now.getTime() - 16 * 60 * 60 * 1000); // last 16 hours (overnight)

  const [
    workspaceRow,
    overdueInvoices,
    pendingTasks,
    recentActions,
    staleDeals,
    pendingApprovals,
    recentLeads,
    blockedWorkflows,
    openAlerts,
  ] = await Promise.all([
    pool.query('SELECT name FROM workspaces WHERE id = $1 LIMIT 1', [workspaceId]),
    pool.query(
      `SELECT i.id, i.description, i.amount, i.due_date, c.name AS contact_name
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id
       WHERE i.workspace_id = $1 AND i.status IN ('overdue','escalated')
       ORDER BY i.due_date ASC LIMIT 10`,
      [workspaceId]
    ),
    pool.query(
      `SELECT title, priority, due_date
       FROM tasks
       WHERE workspace_id = $1 AND status = 'pending' AND due_date <= NOW() + INTERVAL '24 hours'
       ORDER BY due_date ASC LIMIT 10`,
      [workspaceId]
    ),
    pool.query(
      `SELECT agent, action_type, description, outcome, created_at
       FROM agent_actions
       WHERE workspace_id = $1 AND created_at >= $2
       ORDER BY created_at DESC LIMIT 20`,
      [workspaceId, since.toISOString()]
    ),
    pool.query(
      `SELECT title, stage, value, expected_close_date
       FROM deals
       WHERE workspace_id = $1
         AND stage NOT IN ('won','lost')
         AND updated_at < NOW() - INTERVAL '7 days'
       ORDER BY value DESC LIMIT 5`,
      [workspaceId]
    ),
    pool.query(
      `SELECT COUNT(*) AS count
       FROM agent_actions
       WHERE workspace_id = $1 AND outcome = 'pending'`,
      [workspaceId]
    ),
    pool.query(
      `SELECT name, company, type, created_at
       FROM contacts
       WHERE workspace_id = $1 AND type IN ('lead','prospect') AND created_at >= $2
       ORDER BY created_at DESC LIMIT 10`,
      [workspaceId, since.toISOString()]
    ),
    pool.query(
      `SELECT template AS title, status FROM workflows
       WHERE workspace_id = $1 AND status = 'blocked'
       LIMIT 5`,
      [workspaceId]
    ),
    pool.query(
      `SELECT severity, title AS message FROM proactive_alerts
       WHERE workspace_id = $1 AND status = 'active'
       ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, created_at DESC
       LIMIT 8`,
      [workspaceId]
    ),
  ]);

  const bizName = workspaceRow.rows[0]?.name || 'Your Business';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const sections = [];

  // ── Header ────────────────────────────────────────────────────────────────
  sections.push(`# Morning Briefing — ${dateStr}`);
  sections.push(`Prepared for **${bizName}**\n`);

  // ── Overnight Activity ────────────────────────────────────────────────────
  const agentActivity = recentActions.rows;
  const agentBuckets = {};
  let completedCount = 0;
  for (const a of agentActivity) {
    if (!agentBuckets[a.agent]) agentBuckets[a.agent] = [];
    agentBuckets[a.agent].push(a);
    if (a.outcome === 'completed') completedCount++;
  }

  sections.push('## What Happened Overnight');
  if (agentActivity.length === 0) {
    sections.push('No agent activity recorded in the last 16 hours.');
  } else {
    sections.push(`Your AI team completed **${completedCount}** action${completedCount !== 1 ? 's' : ''} overnight across ${Object.keys(agentBuckets).length} agent${Object.keys(agentBuckets).length !== 1 ? 's' : ''}.\n`);
    for (const [agent, actions] of Object.entries(agentBuckets)) {
      const label = agent.charAt(0).toUpperCase() + agent.slice(1);
      const completed = actions.filter((a) => a.outcome === 'completed').length;
      const pending = actions.filter((a) => a.outcome === 'pending').length;
      const recent = actions.slice(0, 2).map((a) => a.description || a.action_type).filter(Boolean);
      sections.push(`**${label} Agent** — ${completed} completed${pending > 0 ? `, ${pending} pending` : ''}`);
      if (recent.length > 0) sections.push(`  • ${recent.join('\n  • ')}`);
    }
  }

  // ── New Leads ────────────────────────────────────────────────────────────
  if (recentLeads.rows.length > 0) {
    sections.push('\n## New Leads Overnight');
    for (const lead of recentLeads.rows) {
      const co = lead.company ? ` (${lead.company})` : '';
      sections.push(`• **${lead.name}**${co} — ${lead.type}`);
    }
  }

  // ── Needs Attention Today ────────────────────────────────────────────────
  sections.push('\n## Needs Your Attention Today');

  const urgentCount = openAlerts.rows.filter((a) => a.severity === 'critical' || a.severity === 'high').length;
  const pendingApprovalsCount = parseInt(pendingApprovals.rows[0]?.count) || 0;

  if (urgentCount > 0 || pendingApprovalsCount > 0 || overdueInvoices.rows.length > 0 || pendingTasks.rows.length > 0) {
    if (urgentCount > 0) {
      sections.push(`🔴 **${urgentCount} urgent alert${urgentCount !== 1 ? 's' : ''}** require immediate attention`);
    }
    if (pendingApprovalsCount > 0) {
      sections.push(`⚠️  **${pendingApprovalsCount} agent decision${pendingApprovalsCount !== 1 ? 's' : ''}** awaiting your approval`);
    }
    if (overdueInvoices.rows.length > 0) {
      const total = overdueInvoices.rows.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
      sections.push(`💰 **${overdueInvoices.rows.length} overdue invoice${overdueInvoices.rows.length !== 1 ? 's' : ''}** totaling $${Math.round(total).toLocaleString()}`);
    }
    if (pendingTasks.rows.length > 0) {
      sections.push(`📋 **${pendingTasks.rows.length} task${pendingTasks.rows.length !== 1 ? 's' : ''}** due today or overdue`);
    }
  } else {
    sections.push('Nothing critical requires your immediate attention. Your agents are on top of things.');
  }

  // ── Overdue Invoices ──────────────────────────────────────────────────────
  if (overdueInvoices.rows.length > 0) {
    sections.push('\n## Overdue Invoices');
    for (const inv of overdueInvoices.rows) {
      const days = Math.round((now - new Date(inv.due_date)) / 86400000);
      const contact = inv.contact_name || 'Unknown';
      sections.push(`• **${contact}** — $${Math.round(inv.amount).toLocaleString()} overdue ${days}d (${inv.description || 'invoice'})`);
    }
  }

  // ── Tasks Due Today ──────────────────────────────────────────────────────
  if (pendingTasks.rows.length > 0) {
    sections.push('\n## Tasks Due Today');
    for (const t of pendingTasks.rows) {
      const due = t.due_date ? new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date';
      const prio = t.priority === 'high' ? ' 🔴' : t.priority === 'medium' ? ' 🟡' : '';
      sections.push(`• **${t.title}**${prio} — due ${due}`);
    }
  }

  // ── Stale Deals ──────────────────────────────────────────────────────────
  if (staleDeals.rows.length > 0) {
    sections.push('\n## Stale Deals (No Activity in 7+ Days)');
    for (const d of staleDeals.rows) {
      const val = d.value ? ` — $${Math.round(d.value).toLocaleString()}` : '';
      sections.push(`• **${d.title}** (${d.stage})${val}`);
    }
  }

  // ── Blocked Workflows ────────────────────────────────────────────────────
  if (blockedWorkflows.rows.length > 0) {
    sections.push('\n## Blocked Workflows');
    for (const wf of blockedWorkflows.rows) {
      sections.push(`• ${wf.title}`);
    }
  }

  // ── Agent Priorities ──────────────────────────────────────────────────────
  sections.push('\n## What Each Agent Is Handling');
  const agentNames = ['finance', 'revenue', 'operations', 'growth', 'support'];
  for (const agent of agentNames) {
    const label = agent.charAt(0).toUpperCase() + agent.slice(1);
    const bucket = agentBuckets[agent] || [];
    const recent = bucket.slice(0, 1);
    if (recent.length > 0) {
      sections.push(`**${label}:** ${recent[0].description || recent[0].action_type || 'Active'}`);
    } else {
      sections.push(`**${label}:** Monitoring — no overnight actions`);
    }
  }

  const content = sections.join('\n');

  // Store as an output artifact
  const row = await pool.query(
    `INSERT INTO outputs (workspace_id, output_type, title, content, data, period_start, period_end)
     VALUES ($1, 'morning_briefing', $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      workspaceId,
      `Morning Briefing — ${dateStr}`,
      content,
      JSON.stringify({
        overdue_invoices: overdueInvoices.rows.length,
        overdue_amount: overdueInvoices.rows.reduce((s, i) => s + parseFloat(i.amount || 0), 0),
        pending_tasks: pendingTasks.rows.length,
        pending_approvals: pendingApprovalsCount,
        stale_deals: staleDeals.rows.length,
        new_leads: recentLeads.rows.length,
        agent_actions: agentActivity.length,
        blocked_workflows: blockedWorkflows.rows.length,
      }),
      since.toISOString(),
      now.toISOString(),
    ]
  );

  console.log(`[MorningBriefing] Generated briefing ${row.rows[0].id} for workspace ${workspaceId}`);
  return { id: row.rows[0].id, content };
}

/**
 * Run morning briefing for all active workspaces.
 */
export async function runMorningBriefingForAllWorkspaces() {
  try {
    const result = await pool.query(
      `SELECT DISTINCT w.id FROM workspaces w
       JOIN subscriptions s ON s.workspace_id = w.id
       WHERE s.status IN ('active', 'trialing')`
    );
    console.log(`[MorningBriefing] Generating briefings for ${result.rows.length} workspace(s)`);
    for (const { id } of result.rows) {
      const startedAt = Date.now();
      await generateMorningBriefing(id)
        .then(async (output) => {
          await recordJobHealthRun({
            workspaceId: id,
            jobName: 'morning_briefing',
            status: 'success',
            durationMs: Date.now() - startedAt,
            metadata: { output_id: output?.id || null },
          });
        })
        .catch(async (err) => {
          console.error(`[MorningBriefing] Failed for workspace ${id}:`, err.message);
          await recordJobHealthRun({
            workspaceId: id,
            jobName: 'morning_briefing',
            status: 'failed',
            durationMs: Date.now() - startedAt,
            errorMessage: err.message,
          }).catch(() => {});
        });
    }
  } catch (err) {
    console.error('[MorningBriefing] Failed to run:', err.message);
    await recordJobHealthRun({
      jobName: 'morning_briefing',
      status: 'failed',
      errorMessage: `workspace_lookup_failed: ${err.message}`,
    }).catch(() => {});
  }
}

/**
 * Schedule the morning briefing to run every day at 7 AM server time.
 */
export function startMorningBriefingScheduler() {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function msUntil7AM() {
    const now = new Date();
    const target = new Date(now);
    target.setHours(7, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }

  const delay = msUntil7AM();
  console.log(`[MorningBriefing] Scheduler started — next run in ${Math.round(delay / 60000)} minutes`);

  setTimeout(() => {
    runMorningBriefingForAllWorkspaces();
    setInterval(runMorningBriefingForAllWorkspaces, ONE_DAY_MS);
  }, delay);
}
