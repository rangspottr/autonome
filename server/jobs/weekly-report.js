import { pool } from '../db/index.js';

/**
 * Generate a polished weekly owner report for a workspace.
 *
 * Covers: revenue summary, pipeline movement, overdue invoices, completed tasks,
 * blocked workflows, customer/support issues, growth opportunities,
 * agent actions, and next week's priorities.
 *
 * Stores the finished report in the `outputs` table as a deliverable.
 */
export async function generateWeeklyReport(workspaceId) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    workspaceRow,
    revenueSummary,
    pipelineData,
    overdueInvoices,
    tasksCompleted,
    tasksPending,
    blockedWorkflows,
    agentActions,
    newContacts,
    recentDeals,
    previousRevenue,
  ] = await Promise.all([
    pool.query('SELECT name FROM workspaces WHERE id = $1 LIMIT 1', [workspaceId]),
    pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS revenue_collected,
         COALESCE(SUM(CASE WHEN status IN ('pending','sent') THEN amount ELSE 0 END), 0) AS revenue_pending,
         COALESCE(SUM(CASE WHEN status IN ('overdue','escalated') THEN amount ELSE 0 END), 0) AS revenue_overdue,
         COUNT(CASE WHEN status = 'paid' THEN 1 END) AS invoices_paid,
         COUNT(CASE WHEN status IN ('overdue','escalated') THEN 1 END) AS invoices_overdue
       FROM invoices
       WHERE workspace_id = $1 AND updated_at >= $2`,
      [workspaceId, weekAgo.toISOString()]
    ),
    pool.query(
      `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value), 0) AS total_value
       FROM deals
       WHERE workspace_id = $1 AND stage NOT IN ('won','lost')
       GROUP BY stage ORDER BY total_value DESC`,
      [workspaceId]
    ),
    pool.query(
      `SELECT i.id, i.description, i.amount, i.due_date, i.status, c.name AS contact_name
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id
       WHERE i.workspace_id = $1 AND i.status IN ('overdue','escalated')
       ORDER BY i.due_date ASC LIMIT 10`,
      [workspaceId]
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM tasks
       WHERE workspace_id = $1 AND status = 'completed' AND updated_at >= $2`,
      [workspaceId, weekAgo.toISOString()]
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM tasks
       WHERE workspace_id = $1 AND status = 'pending' AND due_date <= NOW() + INTERVAL '7 days'`,
      [workspaceId]
    ),
    pool.query(
      `SELECT title FROM workflows WHERE workspace_id = $1 AND status = 'blocked' LIMIT 5`,
      [workspaceId]
    ),
    pool.query(
      `SELECT agent, action_type, outcome, description, created_at
       FROM agent_actions
       WHERE workspace_id = $1 AND created_at >= $2
       ORDER BY created_at DESC`,
      [workspaceId, weekAgo.toISOString()]
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM contacts
       WHERE workspace_id = $1 AND created_at >= $2`,
      [workspaceId, weekAgo.toISOString()]
    ),
    pool.query(
      `SELECT title, stage, value, updated_at FROM deals
       WHERE workspace_id = $1 AND updated_at >= $2
       ORDER BY updated_at DESC LIMIT 5`,
      [workspaceId, weekAgo.toISOString()]
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS revenue_collected
       FROM invoices
       WHERE workspace_id = $1 AND updated_at >= $2 AND updated_at < $3`,
      [workspaceId, twoWeeksAgo.toISOString(), weekAgo.toISOString()]
    ),
  ]);

  const bizName = workspaceRow.rows[0]?.name || 'Your Business';
  const periodEnd = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const periodStart = weekAgo.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const rev = revenueSummary.rows[0] || {};
  const revenueCollected = parseFloat(rev.revenue_collected) || 0;
  const revenuePending = parseFloat(rev.revenue_pending) || 0;
  const revenueOverdue = parseFloat(rev.revenue_overdue) || 0;
  const prevRevenue = parseFloat(previousRevenue.rows[0]?.revenue_collected) || 0;
  const revChange = prevRevenue > 0 ? Math.round(((revenueCollected - prevRevenue) / prevRevenue) * 100) : null;

  const agentBuckets = {};
  let totalCompleted = 0;
  for (const a of agentActions.rows) {
    if (!agentBuckets[a.agent]) agentBuckets[a.agent] = { completed: 0, pending: 0, total: 0 };
    agentBuckets[a.agent].total++;
    if (a.outcome === 'completed') { agentBuckets[a.agent].completed++; totalCompleted++; }
    if (a.outcome === 'pending') agentBuckets[a.agent].pending++;
  }

  const sections = [];

  sections.push(`# Weekly Owner Report`);
  sections.push(`**${bizName}** | Week of ${periodStart} – ${periodEnd}\n`);

  // ── Revenue Summary ────────────────────────────────────────────────────────
  sections.push('## Revenue Summary');
  sections.push(`💰 **Collected this week:** $${Math.round(revenueCollected).toLocaleString()}${revChange !== null ? ` (${revChange >= 0 ? '+' : ''}${revChange}% vs. prior week)` : ''}`);
  if (revenuePending > 0) sections.push(`⏳ **Outstanding (pending/sent):** $${Math.round(revenuePending).toLocaleString()}`);
  if (revenueOverdue > 0) sections.push(`🔴 **Overdue:** $${Math.round(revenueOverdue).toLocaleString()} — needs collection action`);
  if (rev.invoices_paid) sections.push(`✅ **Invoices paid:** ${rev.invoices_paid}`);
  if (rev.invoices_overdue) sections.push(`⚠️  **Invoices overdue:** ${rev.invoices_overdue}`);

  // ── Pipeline ──────────────────────────────────────────────────────────────
  sections.push('\n## Pipeline Movement');
  if (pipelineData.rows.length === 0) {
    sections.push('No active deals in pipeline.');
  } else {
    const totalPipeline = pipelineData.rows.reduce((s, r) => s + parseFloat(r.total_value || 0), 0);
    sections.push(`**Total active pipeline:** $${Math.round(totalPipeline).toLocaleString()}\n`);
    for (const row of pipelineData.rows) {
      sections.push(`• **${row.stage.charAt(0).toUpperCase() + row.stage.slice(1)}** — ${row.count} deal${row.count !== 1 ? 's' : ''} ($${Math.round(row.total_value).toLocaleString()})`);
    }
  }
  if (recentDeals.rows.length > 0) {
    sections.push('\n**Recently active deals:**');
    for (const d of recentDeals.rows) {
      const val = d.value ? ` — $${Math.round(d.value).toLocaleString()}` : '';
      sections.push(`  • ${d.title} (${d.stage})${val}`);
    }
  }

  // ── Overdue Invoices ──────────────────────────────────────────────────────
  if (overdueInvoices.rows.length > 0) {
    sections.push('\n## Overdue Invoices');
    for (const inv of overdueInvoices.rows) {
      const days = Math.round((now - new Date(inv.due_date)) / 86400000);
      sections.push(`• **${inv.contact_name || 'Unknown'}** — $${Math.round(inv.amount).toLocaleString()} (${days}d overdue) — ${inv.status}`);
    }
    sections.push(`\n*Collections operator is monitoring these accounts.*`);
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  sections.push('\n## Tasks');
  sections.push(`✅ Completed this week: **${tasksCompleted.rows[0]?.count || 0}**`);
  sections.push(`📋 Pending (due next 7 days): **${tasksPending.rows[0]?.count || 0}**`);

  // ── Blocked Workflows ─────────────────────────────────────────────────────
  if (blockedWorkflows.rows.length > 0) {
    sections.push('\n## Blocked Workflows');
    for (const wf of blockedWorkflows.rows) {
      sections.push(`• ⚠️  ${wf.title}`);
    }
  }

  // ── Agent Actions ─────────────────────────────────────────────────────────
  sections.push('\n## AI Agent Activity This Week');
  if (agentActions.rows.length === 0) {
    sections.push('No agent actions recorded this week.');
  } else {
    sections.push(`**Total actions:** ${agentActions.rows.length} | **Completed:** ${totalCompleted}\n`);
    for (const [agent, stats] of Object.entries(agentBuckets)) {
      const label = agent.charAt(0).toUpperCase() + agent.slice(1);
      sections.push(`**${label}:** ${stats.total} actions — ${stats.completed} completed, ${stats.pending} pending`);
    }
  }

  // ── Growth Opportunities ─────────────────────────────────────────────────
  sections.push('\n## Growth Opportunities');
  if (newContacts.rows[0]?.count > 0) {
    sections.push(`📈 **${newContacts.rows[0].count} new contact${newContacts.rows[0].count !== 1 ? 's' : ''} added** this week — ensure they receive timely follow-up`);
  }
  const negotiationDeals = pipelineData.rows.find((r) => r.stage === 'negotiation');
  if (negotiationDeals) {
    sections.push(`🎯 **${negotiationDeals.count} deal${negotiationDeals.count !== 1 ? 's' : ''} in negotiation** worth $${Math.round(negotiationDeals.total_value).toLocaleString()} — close this week`);
  }

  // ── Next Week Priorities ─────────────────────────────────────────────────
  sections.push('\n## Next Week\'s Priorities');
  const priorities = [];
  if (revenueOverdue > 0) priorities.push(`Resolve $${Math.round(revenueOverdue).toLocaleString()} in overdue invoices`);
  if (blockedWorkflows.rows.length > 0) priorities.push(`Unblock ${blockedWorkflows.rows.length} workflow${blockedWorkflows.rows.length !== 1 ? 's' : ''}`);
  if (negotiationDeals) priorities.push(`Close ${negotiationDeals.count} negotiation-stage deal${negotiationDeals.count !== 1 ? 's' : ''}`);
  if (tasksPending.rows[0]?.count > 0) priorities.push(`Complete ${tasksPending.rows[0].count} pending task${tasksPending.rows[0].count !== 1 ? 's' : ''}`);
  priorities.push('Review agent recommendations in Approvals');
  for (const p of priorities.slice(0, 5)) {
    sections.push(`• ${p}`);
  }

  const content = sections.join('\n');

  const row = await pool.query(
    `INSERT INTO outputs (workspace_id, output_type, title, content, data, period_start, period_end)
     VALUES ($1, 'weekly_report', $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      workspaceId,
      `Weekly Owner Report — ${periodEnd}`,
      content,
      JSON.stringify({
        revenue_collected: revenueCollected,
        revenue_pending: revenuePending,
        revenue_overdue: revenueOverdue,
        invoices_overdue: overdueInvoices.rows.length,
        tasks_completed: parseInt(tasksCompleted.rows[0]?.count) || 0,
        tasks_pending: parseInt(tasksPending.rows[0]?.count) || 0,
        pipeline_stages: pipelineData.rows,
        agent_actions: agentActions.rows.length,
        blocked_workflows: blockedWorkflows.rows.length,
        new_contacts: parseInt(newContacts.rows[0]?.count) || 0,
      }),
      weekAgo.toISOString(),
      now.toISOString(),
    ]
  );

  console.log(`[WeeklyReport] Generated report ${row.rows[0].id} for workspace ${workspaceId}`);
  return { id: row.rows[0].id, content };
}

/**
 * Run weekly report for all active workspaces.
 */
export async function runWeeklyReportForAllWorkspaces() {
  try {
    const result = await pool.query(
      `SELECT DISTINCT w.id FROM workspaces w
       JOIN subscriptions s ON s.workspace_id = w.id
       WHERE s.status IN ('active', 'trialing')`
    );
    console.log(`[WeeklyReport] Generating reports for ${result.rows.length} workspace(s)`);
    for (const { id } of result.rows) {
      await generateWeeklyReport(id).catch((err) => {
        console.error(`[WeeklyReport] Failed for workspace ${id}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[WeeklyReport] Failed to run:', err.message);
  }
}

/**
 * Schedule the weekly report to run every Friday at 8 AM.
 */
export function startWeeklyReportScheduler() {
  function msUntilNextFriday8AM() {
    const now = new Date();
    const target = new Date(now);
    // Day 5 = Friday
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    target.setDate(now.getDate() + daysUntilFriday);
    target.setHours(8, 0, 0, 0);
    return Math.max(0, target.getTime() - now.getTime());
  }

  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const delay = msUntilNextFriday8AM();
  console.log(`[WeeklyReport] Scheduler started — next run in ${Math.round(delay / 60000)} minutes (Friday 8 AM)`);

  setTimeout(() => {
    runWeeklyReportForAllWorkspaces();
    setInterval(runWeeklyReportForAllWorkspaces, ONE_WEEK_MS);
  }, delay);
}
