import { pool } from '../db/index.js';

/**
 * Build a high-level workspace context object for AI prompts.
 */
export async function buildWorkspaceContext(workspaceId) {
  const [contacts, deals, invoices, tasks, agentRuns, agentActions] = await Promise.all([
    pool.query('SELECT COUNT(*) AS count FROM contacts WHERE workspace_id = $1', [workspaceId]),
    pool.query('SELECT COUNT(*) AS count, SUM(value) AS total_value FROM deals WHERE workspace_id = $1', [workspaceId]),
    pool.query(
      `SELECT COUNT(*) AS count, SUM(amount) AS total_amount,
              SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount,
              SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END) AS overdue_amount
       FROM invoices WHERE workspace_id = $1`,
      [workspaceId]
    ),
    pool.query(
      `SELECT COUNT(*) AS count,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count
       FROM tasks WHERE workspace_id = $1`,
      [workspaceId]
    ),
    pool.query(
      `SELECT summary FROM agent_runs WHERE workspace_id = $1 ORDER BY started_at DESC LIMIT 3`,
      [workspaceId]
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM agent_actions
       WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [workspaceId]
    ),
  ]);

  const ws = await pool.query('SELECT name, industry, settings FROM workspaces WHERE id = $1', [workspaceId]);
  const workspace = ws.rows[0] || {};

  return {
    businessName: workspace.name || 'Unknown',
    industry: workspace.industry || 'Unknown',
    contacts: parseInt(contacts.rows[0]?.count) || 0,
    deals: {
      count: parseInt(deals.rows[0]?.count) || 0,
      totalValue: parseFloat(deals.rows[0]?.total_value) || 0,
    },
    invoices: {
      count: parseInt(invoices.rows[0]?.count) || 0,
      totalAmount: parseFloat(invoices.rows[0]?.total_amount) || 0,
      paidAmount: parseFloat(invoices.rows[0]?.paid_amount) || 0,
      overdueAmount: parseFloat(invoices.rows[0]?.overdue_amount) || 0,
    },
    tasks: {
      count: parseInt(tasks.rows[0]?.count) || 0,
      openCount: parseInt(tasks.rows[0]?.open_count) || 0,
    },
    agentActionsToday: parseInt(agentActions.rows[0]?.count) || 0,
    recentAgentActivity: agentRuns.rows.map((r) => {
      const s = r.summary || {};
      return `auto:${s.decisionsAutoExecuted ?? 0} pending:${s.decisionsPending ?? 0} emails:${s.emailsSent ?? 0} sms:${s.smsSent ?? 0}`;
    }),
  };
}

/**
 * Build a structured local briefing when Anthropic is unavailable.
 */
export function buildLocalSummary(ctx) {
  return `Here's your business briefing for ${ctx.businessName} (${ctx.industry}):
• ${ctx.invoices.count} invoice${ctx.invoices.count !== 1 ? 's' : ''} — $${Math.round(ctx.invoices.paidAmount).toLocaleString()} collected, $${Math.round(ctx.invoices.overdueAmount).toLocaleString()} overdue
• ${ctx.deals.count} deal${ctx.deals.count !== 1 ? 's' : ''} in pipeline (total value: $${Math.round(ctx.deals.totalValue).toLocaleString()})
• ${ctx.tasks.openCount} task${ctx.tasks.openCount !== 1 ? 's' : ''} open of ${ctx.tasks.count} total
• ${ctx.agentActionsToday} agent action${ctx.agentActionsToday !== 1 ? 's' : ''} in the last 24h
• ${ctx.contacts} contact${ctx.contacts !== 1 ? 's' : ''} in workspace
${ctx.recentAgentActivity.length > 0 ? `• Recent agent activity: ${ctx.recentAgentActivity.join(' | ')}` : ''}`;
}

/**
 * Search for a named entity in the workspace and return its context string.
 */
export async function findEntityContext(workspaceId, message) {
  const lowerMsg = message.toLowerCase();

  // Try contacts by name or company
  const contactResult = await pool.query(
    `SELECT c.*,
            (SELECT json_agg(d) FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1) AS deals,
            (SELECT json_agg(i) FROM invoices i WHERE i.contact_id = c.id AND i.workspace_id = $1) AS invoices,
            (SELECT json_agg(aa) FROM agent_actions aa WHERE aa.entity_id = c.id OR aa.entity_id IN (
              SELECT id FROM deals WHERE contact_id = c.id AND workspace_id = $1
            ) AND aa.workspace_id = $1 ORDER BY aa.created_at DESC LIMIT 5) AS recent_actions,
            (SELECT json_agg(am) FROM agent_memory am WHERE am.entity_id = c.id AND am.workspace_id = $1) AS memory
     FROM contacts c
     WHERE c.workspace_id = $1
       AND (LOWER(c.name) ILIKE $2 OR LOWER(c.company) ILIKE $2)
     LIMIT 1`,
    [workspaceId, `%${lowerMsg}%`]
  );

  if (contactResult.rows.length > 0) {
    const c = contactResult.rows[0];
    const parts = [`Contact: ${c.name} (${c.company || 'no company'}), ${c.type}`];
    if (c.deals?.length) {
      parts.push(`Deals: ${c.deals.map((d) => `${d.title} — $${Math.round(d.value || 0).toLocaleString()} (${d.stage})`).join('; ')}`);
    }
    if (c.invoices?.length) {
      parts.push(`Invoices: ${c.invoices.map((i) => `${i.description} — $${Math.round(i.amount || 0).toLocaleString()} (${i.status})`).join('; ')}`);
    }
    if (c.recent_actions?.length) {
      parts.push(`Recent agent actions: ${c.recent_actions.map((a) => `${a.agent}: ${a.description}`).join('; ')}`);
    }
    if (c.memory?.length) {
      parts.push(`Agent memory: ${c.memory.map((m) => m.content).join('; ')}`);
    }
    return parts.join('\n');
  }

  // Try deals by title
  const dealResult = await pool.query(
    `SELECT d.*, c.name AS contact_name,
            (SELECT json_agg(aa) FROM agent_actions aa WHERE aa.entity_id = d.id AND aa.workspace_id = $1
             ORDER BY aa.created_at DESC LIMIT 5) AS recent_actions
     FROM deals d
     LEFT JOIN contacts c ON c.id = d.contact_id
     WHERE d.workspace_id = $1 AND LOWER(d.title) ILIKE $2
     LIMIT 1`,
    [workspaceId, `%${lowerMsg}%`]
  );

  if (dealResult.rows.length > 0) {
    const d = dealResult.rows[0];
    const parts = [`Deal: "${d.title}" — $${Math.round(d.value || 0).toLocaleString()}, stage: ${d.stage}, contact: ${d.contact_name || 'N/A'}`];
    if (d.recent_actions?.length) {
      parts.push(`Recent agent actions: ${d.recent_actions.map((a) => `${a.agent}: ${a.description}`).join('; ')}`);
    }
    return parts.join('\n');
  }

  return null;
}
