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
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS open_count
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
 * Fetch rich entity details for fallback responses: top overdue invoices,
 * stale deals, blocked tasks, and open support issues.
 */
export async function buildRichLocalContext(workspaceId) {
  const [overdueInvoices, staleDeals, blockedTasks, openTasks] = await Promise.all([
    pool.query(
      `SELECT i.id, i.description, i.amount, i.due_date,
              EXTRACT(DAY FROM NOW() - i.due_date) AS days_overdue,
              c.name AS contact_name
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id
       WHERE i.workspace_id = $1 AND i.status = 'overdue'
       ORDER BY i.amount DESC LIMIT 5`,
      [workspaceId]
    ),
    pool.query(
      `SELECT d.id, d.title, d.value, d.stage,
              EXTRACT(DAY FROM NOW() - d.updated_at) AS days_stale,
              c.name AS contact_name
       FROM deals d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.workspace_id = $1
         AND d.stage NOT IN ('won', 'lost')
         AND d.updated_at < NOW() - INTERVAL '3 days'
       ORDER BY d.value DESC LIMIT 5`,
      [workspaceId]
    ),
    pool.query(
      `SELECT id, title, priority,
              EXTRACT(DAY FROM NOW() - due_date) AS days_overdue
       FROM tasks
       WHERE workspace_id = $1
         AND status = 'pending'
         AND due_date < NOW()
       ORDER BY priority DESC, due_date ASC LIMIT 5`,
      [workspaceId]
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM tasks
       WHERE workspace_id = $1 AND status = 'pending'`,
      [workspaceId]
    ),
  ]);

  return {
    overdueInvoices: overdueInvoices.rows,
    staleDeals: staleDeals.rows,
    blockedTasks: blockedTasks.rows,
    openTaskCount: parseInt(openTasks.rows[0]?.count) || 0,
  };
}

/**
 * Build a structured local briefing when Anthropic is unavailable.
 * Produces a prioritized business briefing with recommendations.
 */
export function buildLocalSummary(ctx, richCtx = null) {
  const lines = [`Business briefing for ${ctx.businessName} (${ctx.industry}):`];

  // Priority 1: Cash flow pressure
  if (ctx.invoices.overdueAmount > 0) {
    lines.push(`\n🔴 CASH FLOW ALERT: $${Math.round(ctx.invoices.overdueAmount).toLocaleString()} overdue across ${ctx.invoices.count} invoice${ctx.invoices.count !== 1 ? 's' : ''}`);
    if (richCtx?.overdueInvoices?.length > 0) {
      lines.push('Top overdue:');
      richCtx.overdueInvoices.slice(0, 3).forEach((inv) => {
        const days = Math.round(inv.days_overdue || 0);
        lines.push(`  • ${inv.contact_name || 'Unknown'} — $${Math.round(inv.amount).toLocaleString()} (${days}d overdue)`);
      });
      lines.push('→ Recommended: Prioritize collection outreach on highest-value overdue invoices.');
    }
  } else {
    lines.push(`\n✅ Finance: $${Math.round(ctx.invoices.paidAmount).toLocaleString()} collected, no overdue invoices`);
  }

  // Priority 2: Pipeline gaps
  if (ctx.deals.count > 0) {
    lines.push(`\n🔵 PIPELINE: ${ctx.deals.count} deal${ctx.deals.count !== 1 ? 's' : ''} — $${Math.round(ctx.deals.totalValue).toLocaleString()} total value`);
    if (richCtx?.staleDeals?.length > 0) {
      lines.push('Stale deals needing follow-up:');
      richCtx.staleDeals.slice(0, 3).forEach((deal) => {
        const days = Math.round(deal.days_stale || 0);
        lines.push(`  • "${deal.title}" — $${Math.round(deal.value || 0).toLocaleString()} (${days}d stale, ${deal.stage})`);
      });
      lines.push('→ Recommended: Re-engage stale deals before they go cold permanently.');
    }
  }

  // Priority 3: Operational blockers
  if (ctx.tasks.openCount > 0) {
    lines.push(`\n🟡 OPERATIONS: ${ctx.tasks.openCount} open task${ctx.tasks.openCount !== 1 ? 's' : ''}`);
    if (richCtx?.blockedTasks?.length > 0) {
      lines.push('Overdue tasks:');
      richCtx.blockedTasks.slice(0, 3).forEach((task) => {
        const days = Math.round(task.days_overdue || 0);
        lines.push(`  • ${task.title} (${task.priority} priority, ${days}d overdue)`);
      });
      lines.push('→ Recommended: Review and reassign or close overdue tasks.');
    }
  }

  // Agent activity summary
  lines.push(`\n📊 Agent activity: ${ctx.agentActionsToday} action${ctx.agentActionsToday !== 1 ? 's' : ''} in last 24h · ${ctx.contacts} contact${ctx.contacts !== 1 ? 's' : ''} in workspace`);

  lines.push('\n⚠️ Connect an Anthropic API key in Settings for full AI-powered analysis and recommendations.');
  return lines.join('\n');
}

/**
 * Extract likely entity names from a natural language message.
 * Returns an array of candidate search tokens (single words, bigrams, trigrams).
 */
export function extractEntityNames(message) {
  // Remove common stop words and punctuation
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'what', 'how', 'when', 'where', 'who',
    'which', 'that', 'this', 'these', 'those', 'their', 'them', 'they',
    'about', 'any', 'all', 'your', 'our', 'my', 'me', 'us', 'we', 'i',
    'it', 'its', 'get', 'tell', 'show', 'give', 'find', 'know', 'look',
    'up', 'down', 'status', 'update', 'check', 'latest', 'recent', 'new',
    'deal', 'deals', 'invoice', 'invoices', 'contact', 'contacts', 'task',
    'tasks', 'happening', 'going', 'doing', 'situation',
  ]);

  // Extract quoted strings first (highest confidence)
  const quoted = [];
  const quotedPattern = /["']([^"']+)["']/g;
  let match;
  while ((match = quotedPattern.exec(message)) !== null) {
    quoted.push(match[1]);
  }

  // Tokenize into words, filter stop words and short tokens
  const words = message
    .replace(/["']/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9\-_.]/g, '').trim())
    .filter((w) => w.length >= 2 && !stopWords.has(w.toLowerCase()));

  const candidates = [...quoted];

  // Add bigrams and trigrams (consecutive capitalized or mixed-case words likely to be names)
  for (let i = 0; i < words.length; i++) {
    // Single token
    if (words[i].length >= 3) candidates.push(words[i]);
    // Bigram
    if (i + 1 < words.length) candidates.push(`${words[i]} ${words[i + 1]}`);
    // Trigram
    if (i + 2 < words.length) candidates.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  // Deduplicate, preserve order
  const seen = new Set();
  return candidates.filter((c) => {
    const key = c.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Format a contact entity for context injection.
 */
function formatContactContext(c) {
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

/**
 * Format a deal entity for context injection.
 */
function formatDealContext(d) {
  const parts = [`Deal: "${d.title}" — $${Math.round(d.value || 0).toLocaleString()}, stage: ${d.stage}, contact: ${d.contact_name || 'N/A'}`];
  if (d.recent_actions?.length) {
    parts.push(`Recent agent actions: ${d.recent_actions.map((a) => `${a.agent}: ${a.description}`).join('; ')}`);
  }
  return parts.join('\n');
}

/**
 * Search for named entities in the workspace and return their context strings.
 * Supports multiple entity matches across contacts, deals, invoices, companies, and tasks.
 */
export async function findEntityContext(workspaceId, message) {
  const tokens = extractEntityNames(message);
  if (tokens.length === 0) return null;

  const found = [];
  const seenIds = new Set();

  for (const token of tokens.slice(0, 10)) {
    const pattern = `%${token.toLowerCase()}%`;

    // Search contacts
    const contactResult = await pool.query(
      `SELECT c.*,
              (SELECT json_agg(d ORDER BY d.value DESC NULLS LAST) FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1) AS deals,
              (SELECT json_agg(i ORDER BY i.amount DESC NULLS LAST) FROM invoices i WHERE i.contact_id = c.id AND i.workspace_id = $1) AS invoices,
              (SELECT json_agg(aa ORDER BY aa.created_at DESC) FROM (
                SELECT * FROM agent_actions aa2
                WHERE aa2.workspace_id = $1
                  AND (aa2.entity_id = c.id OR aa2.entity_id IN (
                    SELECT id FROM deals WHERE contact_id = c.id AND workspace_id = $1
                  ))
                ORDER BY aa2.created_at DESC LIMIT 5
              ) aa) AS recent_actions,
              (SELECT json_agg(am) FROM agent_memory am WHERE am.entity_id = c.id AND am.workspace_id = $1) AS memory
       FROM contacts c
       WHERE c.workspace_id = $1
         AND (LOWER(c.name) ILIKE $2 OR LOWER(c.company) ILIKE $2)
       LIMIT 3`,
      [workspaceId, pattern]
    );

    for (const c of contactResult.rows) {
      if (!seenIds.has(`contact:${c.id}`)) {
        seenIds.add(`contact:${c.id}`);
        found.push(formatContactContext(c));
      }
    }

    // Search deals
    const dealResult = await pool.query(
      `SELECT d.*, c.name AS contact_name,
              (SELECT json_agg(aa ORDER BY aa.created_at DESC) FROM (
                SELECT * FROM agent_actions aa2
                WHERE aa2.entity_id = d.id AND aa2.workspace_id = $1
                ORDER BY aa2.created_at DESC LIMIT 5
              ) aa) AS recent_actions
       FROM deals d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.workspace_id = $1 AND LOWER(d.title) ILIKE $2
       LIMIT 2`,
      [workspaceId, pattern]
    );

    for (const d of dealResult.rows) {
      if (!seenIds.has(`deal:${d.id}`)) {
        seenIds.add(`deal:${d.id}`);
        found.push(formatDealContext(d));
      }
    }

    // Search invoices
    const invoiceResult = await pool.query(
      `SELECT i.*, c.name AS contact_name
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id
       WHERE i.workspace_id = $1 AND LOWER(i.description) ILIKE $2
       LIMIT 2`,
      [workspaceId, pattern]
    );

    for (const inv of invoiceResult.rows) {
      if (!seenIds.has(`invoice:${inv.id}`)) {
        seenIds.add(`invoice:${inv.id}`);
        found.push(`Invoice: "${inv.description}" — $${Math.round(inv.amount || 0).toLocaleString()} (${inv.status}), contact: ${inv.contact_name || 'N/A'}`);
      }
    }

    // Search tasks
    const taskResult = await pool.query(
      `SELECT id, title, status, priority, due_date
       FROM tasks
       WHERE workspace_id = $1 AND LOWER(title) ILIKE $2
       LIMIT 2`,
      [workspaceId, pattern]
    );

    for (const t of taskResult.rows) {
      if (!seenIds.has(`task:${t.id}`)) {
        seenIds.add(`task:${t.id}`);
        found.push(`Task: "${t.title}" — status: ${t.status}, priority: ${t.priority}${t.due_date ? `, due: ${new Date(t.due_date).toLocaleDateString()}` : ''}`);
      }
    }

    // Stop searching more tokens if we have enough context
    if (found.length >= 5) break;
  }

  if (found.length === 0) return null;
  return found.join('\n\n');
}
