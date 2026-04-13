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
 * Score an entity candidate against search tokens.
 * Returns a score 0–1: exact name (1.0) > partial name (0.7) > exact company (0.6) >
 * partial company (0.5) > partial description (0.3).
 */
function scoreEntity(entityType, entity, tokensLower) {
  const nameLower = ((entityType === 'deal' || entityType === 'task')
    ? entity.title
    : entityType === 'invoice'
      ? entity.description
      : entity.name) || '';
  const nameL = nameLower.toLowerCase();
  const companyL = (entity.company || '').toLowerCase();

  let maxScore = 0;
  for (const t of tokensLower) {
    if (t.length < 2) continue;
    if (nameL === t) return 1.0;
    if (nameL.includes(t) && t.length >= 3) maxScore = Math.max(maxScore, 0.7);
    if (companyL && companyL === t) maxScore = Math.max(maxScore, 0.6);
    if (companyL && companyL.includes(t) && t.length >= 3) maxScore = Math.max(maxScore, 0.5);
    // Fuzzy prefix match: token starts with or contains the candidate (description match, score 0.3)
    if (maxScore === 0 && t.length >= 4 && (nameL.includes(t.slice(0, Math.ceil(t.length * 0.6))))) {
      maxScore = Math.max(maxScore, 0.3);
    }
  }
  return maxScore;
}

/**
 * Walk the relational graph for a matched entity in batched queries (not N+1).
 * Returns a structured object with all relationship data, or null if not found.
 */
export async function resolveEntityGraph(workspaceId, entityType, entityId) {
  if (entityType === 'contact') {
    const [contactRes, dealsRes, invoicesRes, workflowsRes, actionsRes, memoryRes] = await Promise.all([
      pool.query(
        'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
        [entityId, workspaceId]
      ),
      pool.query(
        'SELECT * FROM deals WHERE contact_id = $1 AND workspace_id = $2 ORDER BY value DESC NULLS LAST',
        [entityId, workspaceId]
      ),
      pool.query(
        'SELECT * FROM invoices WHERE contact_id = $1 AND workspace_id = $2 ORDER BY amount DESC NULLS LAST',
        [entityId, workspaceId]
      ),
      pool.query(
        `SELECT * FROM workflows WHERE workspace_id = $1 AND trigger_entity_type = 'contact' AND trigger_entity_id = $2`,
        [workspaceId, entityId]
      ),
      pool.query(
        `SELECT * FROM agent_actions
         WHERE workspace_id = $1 AND entity_type = 'contact' AND entity_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [workspaceId, entityId]
      ),
      pool.query(
        `SELECT * FROM agent_memory
         WHERE workspace_id = $1 AND entity_type = 'contact' AND entity_id = $2
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [workspaceId, entityId]
      ),
    ]);

    const contact = contactRes.rows[0];
    if (!contact) return null;
    return {
      type: 'contact',
      id: entityId,
      contact,
      deals: dealsRes.rows,
      invoices: invoicesRes.rows,
      workflows: workflowsRes.rows,
      actions: actionsRes.rows,
      memory: memoryRes.rows,
    };
  }

  if (entityType === 'deal') {
    const [dealRes, actionsRes, memoryRes, workflowsRes] = await Promise.all([
      pool.query(
        'SELECT * FROM deals WHERE id = $1 AND workspace_id = $2',
        [entityId, workspaceId]
      ),
      pool.query(
        `SELECT * FROM agent_actions
         WHERE workspace_id = $1 AND entity_type = 'deal' AND entity_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [workspaceId, entityId]
      ),
      pool.query(
        `SELECT * FROM agent_memory
         WHERE workspace_id = $1 AND entity_type = 'deal' AND entity_id = $2
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [workspaceId, entityId]
      ),
      pool.query(
        `SELECT * FROM workflows WHERE workspace_id = $1 AND trigger_entity_type = 'deal' AND trigger_entity_id = $2`,
        [workspaceId, entityId]
      ),
    ]);

    const deal = dealRes.rows[0];
    if (!deal) return null;

    // Walk contact → invoices if contact exists
    let contact = null;
    let contactInvoices = [];
    if (deal.contact_id) {
      const [contactRes, invoicesRes] = await Promise.all([
        pool.query(
          'SELECT id, name, company, type, email FROM contacts WHERE id = $1',
          [deal.contact_id]
        ),
        pool.query(
          'SELECT * FROM invoices WHERE contact_id = $1 AND workspace_id = $2 ORDER BY amount DESC NULLS LAST',
          [deal.contact_id, workspaceId]
        ),
      ]);
      contact = contactRes.rows[0] || null;
      contactInvoices = invoicesRes.rows;
    }

    return {
      type: 'deal',
      id: entityId,
      deal,
      contact,
      invoices: contactInvoices,
      workflows: workflowsRes.rows,
      actions: actionsRes.rows,
      memory: memoryRes.rows,
    };
  }

  if (entityType === 'invoice') {
    const [invoiceRes, actionsRes, memoryRes] = await Promise.all([
      pool.query(
        'SELECT * FROM invoices WHERE id = $1 AND workspace_id = $2',
        [entityId, workspaceId]
      ),
      pool.query(
        `SELECT * FROM agent_actions
         WHERE workspace_id = $1 AND entity_type = 'invoice' AND entity_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [workspaceId, entityId]
      ),
      pool.query(
        `SELECT * FROM agent_memory
         WHERE workspace_id = $1 AND entity_type = 'invoice' AND entity_id = $2
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [workspaceId, entityId]
      ),
    ]);

    const invoice = invoiceRes.rows[0];
    if (!invoice) return null;

    let contact = null;
    if (invoice.contact_id) {
      const contactRes = await pool.query(
        'SELECT id, name, company, type FROM contacts WHERE id = $1',
        [invoice.contact_id]
      );
      contact = contactRes.rows[0] || null;
    }

    return {
      type: 'invoice',
      id: entityId,
      invoice,
      contact,
      actions: actionsRes.rows,
      memory: memoryRes.rows,
    };
  }

  if (entityType === 'task') {
    const [taskRes, actionsRes, memoryRes] = await Promise.all([
      pool.query(
        'SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2',
        [entityId, workspaceId]
      ),
      pool.query(
        `SELECT * FROM agent_actions
         WHERE workspace_id = $1 AND entity_type = 'task' AND entity_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [workspaceId, entityId]
      ),
      pool.query(
        `SELECT * FROM agent_memory
         WHERE workspace_id = $1 AND entity_type = 'task' AND entity_id = $2
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [workspaceId, entityId]
      ),
    ]);

    const task = taskRes.rows[0];
    if (!task) return null;
    return {
      type: 'task',
      id: entityId,
      task,
      actions: actionsRes.rows,
      memory: memoryRes.rows,
    };
  }

  return null;
}

/**
 * Build a one-line (~50-100 token) summary for a resolved entity graph.
 */
export function buildEntityL0(entityGraph) {
  if (!entityGraph) return '';

  if (entityGraph.type === 'contact') {
    const c = entityGraph.contact;
    const activeDeals = (entityGraph.deals || []).filter((d) => !['won', 'lost'].includes(d.stage));
    const paidAmt = (entityGraph.invoices || [])
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const overdueAmt = (entityGraph.invoices || [])
      .filter((i) => i.status === 'overdue')
      .reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    const parts = [`${c.company || c.name} (${c.name}) — ${c.type}`];
    if (paidAmt > 0) parts.push(`$${Math.round(paidAmt).toLocaleString()} paid`);
    if (overdueAmt > 0) parts.push(`$${Math.round(overdueAmt).toLocaleString()} overdue`);
    if (activeDeals.length > 0) parts.push(`${activeDeals.length} active deal${activeDeals.length !== 1 ? 's' : ''}`);
    return parts.join(', ');
  }

  if (entityGraph.type === 'deal') {
    const d = entityGraph.deal;
    const daysSince = d.updated_at
      ? Math.round((Date.now() - new Date(d.updated_at).getTime()) / 86400000)
      : 0;
    const parts = [
      `"${d.title}" — $${Math.round(parseFloat(d.value) || 0).toLocaleString()}, ${d.stage} stage, ${d.probability || 0}% probability`,
    ];
    if (daysSince > 1) parts.push(`stale ${daysSince}d`);
    if (entityGraph.contact?.name) parts.push(`contact: ${entityGraph.contact.company || entityGraph.contact.name}`);
    return parts.join(', ');
  }

  if (entityGraph.type === 'invoice') {
    const inv = entityGraph.invoice;
    let statusStr = inv.status;
    if (inv.status === 'overdue' && inv.due_date) {
      const daysOverdue = Math.round((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
      statusStr = `overdue ${daysOverdue}d`;
    }
    const parts = [`"${inv.description}" — $${Math.round(parseFloat(inv.amount) || 0).toLocaleString()}, ${statusStr}`];
    if (entityGraph.contact?.name) parts.push(`contact: ${entityGraph.contact.company || entityGraph.contact.name}`);
    return parts.join(', ');
  }

  if (entityGraph.type === 'task') {
    const t = entityGraph.task;
    const parts = [`"${t.title}" — ${t.priority} priority`];
    if (t.due_date && new Date(t.due_date) < new Date()) {
      const daysOverdue = Math.round((Date.now() - new Date(t.due_date).getTime()) / 86400000);
      parts.push(`overdue ${daysOverdue}d`);
    } else {
      parts.push(t.status);
    }
    return parts.join(', ');
  }

  return '';
}

/**
 * Build a full context block (~500-1500 tokens) for a resolved entity graph.
 */
export function buildEntityL1(entityGraph) {
  if (!entityGraph) return '';
  const lines = [];

  if (entityGraph.type === 'contact') {
    const c = entityGraph.contact;
    lines.push(`## ${c.company || c.name} (${c.name})`);
    lines.push(`Type: ${c.type} | Company: ${c.company || 'N/A'} | Email: ${c.email || 'N/A'}${c.phone ? ` | Phone: ${c.phone}` : ''}`);

    const activeDeals = (entityGraph.deals || []).filter((d) => !['won', 'lost'].includes(d.stage));
    if (activeDeals.length > 0) {
      lines.push(`\n### Deals (${activeDeals.length} active)`);
      activeDeals.slice(0, 5).forEach((d) => {
        const daysSince = d.updated_at
          ? Math.round((Date.now() - new Date(d.updated_at).getTime()) / 86400000)
          : 0;
        lines.push(`- "${d.title}" — $${Math.round(parseFloat(d.value) || 0).toLocaleString()} at ${d.stage} (${d.probability || 0}%)${daysSince > 1 ? ` — stale ${daysSince} days` : ''}`);
      });
    }
    const wonLostDeals = (entityGraph.deals || []).filter((d) => ['won', 'lost'].includes(d.stage));
    if (wonLostDeals.length > 0) {
      lines.push(`\n### Closed Deals`);
      wonLostDeals.slice(0, 3).forEach((d) => {
        lines.push(`- "${d.title}" — $${Math.round(parseFloat(d.value) || 0).toLocaleString()} (${d.stage})`);
      });
    }

    if ((entityGraph.invoices || []).length > 0) {
      lines.push(`\n### Invoices`);
      entityGraph.invoices.slice(0, 6).forEach((inv) => {
        let statusStr = inv.status;
        if (inv.status === 'overdue' && inv.due_date) {
          const daysOverdue = Math.round((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
          statusStr = `OVERDUE (${daysOverdue} days)`;
        }
        lines.push(`- "${inv.description}" — $${Math.round(parseFloat(inv.amount) || 0).toLocaleString()} ${statusStr}`);
      });
    }

    if ((entityGraph.actions || []).length > 0) {
      lines.push(`\n### Recent Agent Activity`);
      entityGraph.actions.slice(0, 5).forEach((a) => {
        const daysAgo = Math.round((Date.now() - new Date(a.created_at).getTime()) / 86400000);
        lines.push(`- [${a.agent}] ${a.description}${daysAgo > 0 ? ` (${daysAgo}d ago)` : ' (today)'}`);
      });
    }

    if ((entityGraph.memory || []).length > 0) {
      lines.push(`\n### Agent Memory`);
      entityGraph.memory.slice(0, 5).forEach((m) => {
        lines.push(`- [${m.agent}] "${m.content}"`);
      });
    }

    if ((entityGraph.workflows || []).length > 0) {
      lines.push(`\n### Active Workflows`);
      entityGraph.workflows.slice(0, 3).forEach((w) => {
        const totalSteps = Array.isArray(w.steps) ? w.steps.length : '?';
        lines.push(`- ${w.template}: Step ${w.current_step}/${totalSteps} (${w.status})`);
      });
    }
  }

  if (entityGraph.type === 'deal') {
    const d = entityGraph.deal;
    const daysSince = d.updated_at
      ? Math.round((Date.now() - new Date(d.updated_at).getTime()) / 86400000)
      : 0;
    lines.push(`## Deal: "${d.title}"`);
    lines.push(`Value: $${Math.round(parseFloat(d.value) || 0).toLocaleString()} | Stage: ${d.stage} | Probability: ${d.probability || 0}%${daysSince > 1 ? ` | Last updated: ${daysSince}d ago` : ''}`);

    if (entityGraph.contact) {
      const ct = entityGraph.contact;
      lines.push(`\n### Contact`);
      lines.push(`- ${ct.company || ct.name} (${ct.name}) — ${ct.type}${ct.email ? `, ${ct.email}` : ''}`);
    }

    if ((entityGraph.invoices || []).length > 0) {
      lines.push(`\n### Contact's Invoices`);
      entityGraph.invoices.slice(0, 5).forEach((inv) => {
        let statusStr = inv.status;
        if (inv.status === 'overdue' && inv.due_date) {
          const daysOverdue = Math.round((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
          statusStr = `OVERDUE (${daysOverdue} days)`;
        }
        lines.push(`- "${inv.description}" — $${Math.round(parseFloat(inv.amount) || 0).toLocaleString()} ${statusStr}`);
      });
    }

    if ((entityGraph.actions || []).length > 0) {
      lines.push(`\n### Recent Agent Activity`);
      entityGraph.actions.slice(0, 5).forEach((a) => {
        const daysAgo = Math.round((Date.now() - new Date(a.created_at).getTime()) / 86400000);
        lines.push(`- [${a.agent}] ${a.description}${daysAgo > 0 ? ` (${daysAgo}d ago)` : ' (today)'}`);
      });
    }

    if ((entityGraph.memory || []).length > 0) {
      lines.push(`\n### Agent Memory`);
      entityGraph.memory.slice(0, 5).forEach((m) => {
        lines.push(`- [${m.agent}] "${m.content}"`);
      });
    }

    if ((entityGraph.workflows || []).length > 0) {
      lines.push(`\n### Active Workflows`);
      entityGraph.workflows.slice(0, 3).forEach((w) => {
        const totalSteps = Array.isArray(w.steps) ? w.steps.length : '?';
        lines.push(`- ${w.template}: Step ${w.current_step}/${totalSteps} (${w.status})`);
      });
    }
  }

  if (entityGraph.type === 'invoice') {
    const inv = entityGraph.invoice;
    let statusStr = inv.status;
    if (inv.status === 'overdue' && inv.due_date) {
      const daysOverdue = Math.round((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
      statusStr = `OVERDUE (${daysOverdue} days)`;
    }
    lines.push(`## Invoice: "${inv.description}"`);
    lines.push(`Amount: $${Math.round(parseFloat(inv.amount) || 0).toLocaleString()} | Status: ${statusStr}${inv.due_date ? ` | Due: ${new Date(inv.due_date).toLocaleDateString()}` : ''}`);

    if (entityGraph.contact) {
      const ct = entityGraph.contact;
      lines.push(`Contact: ${ct.company || ct.name} (${ct.name}) — ${ct.type}`);
    }

    if ((entityGraph.actions || []).length > 0) {
      lines.push(`\n### Recent Agent Activity`);
      entityGraph.actions.slice(0, 5).forEach((a) => {
        const daysAgo = Math.round((Date.now() - new Date(a.created_at).getTime()) / 86400000);
        lines.push(`- [${a.agent}] ${a.description}${daysAgo > 0 ? ` (${daysAgo}d ago)` : ' (today)'}`);
      });
    }

    if ((entityGraph.memory || []).length > 0) {
      lines.push(`\n### Agent Memory`);
      entityGraph.memory.slice(0, 5).forEach((m) => {
        lines.push(`- [${m.agent}] "${m.content}"`);
      });
    }
  }

  if (entityGraph.type === 'task') {
    const t = entityGraph.task;
    let dueStr = '';
    if (t.due_date) {
      const daysOverdue = Math.round((Date.now() - new Date(t.due_date).getTime()) / 86400000);
      dueStr = daysOverdue > 0 ? ` | OVERDUE ${daysOverdue} days` : ` | Due: ${new Date(t.due_date).toLocaleDateString()}`;
    }
    lines.push(`## Task: "${t.title}"`);
    lines.push(`Status: ${t.status} | Priority: ${t.priority}${dueStr}`);

    if ((entityGraph.actions || []).length > 0) {
      lines.push(`\n### Recent Agent Activity`);
      entityGraph.actions.slice(0, 5).forEach((a) => {
        const daysAgo = Math.round((Date.now() - new Date(a.created_at).getTime()) / 86400000);
        lines.push(`- [${a.agent}] ${a.description}${daysAgo > 0 ? ` (${daysAgo}d ago)` : ' (today)'}`);
      });
    }

    if ((entityGraph.memory || []).length > 0) {
      lines.push(`\n### Agent Memory`);
      entityGraph.memory.slice(0, 5).forEach((m) => {
        lines.push(`- [${m.agent}] "${m.content}"`);
      });
    }
  }

  return lines.join('\n');
}

/**
 * Search for named entities in the workspace.
 * Uses batch queries (one per entity type) with scoring.
 *
 * Returns { matches: [{type, id, name, score, l0, l1, graph}], tokens_consumed }
 */
export async function findEntityContext(workspaceId, message) {
  const tokens = extractEntityNames(message);
  if (tokens.length === 0) return { matches: [], tokens_consumed: 0 };

  const tokensLower = [...new Set(tokens.slice(0, 10).map((t) => t.toLowerCase()))];

  // Batch search: one query per entity type using unnest + ILIKE
  const [contactRows, dealRows, invoiceRows, taskRows] = await Promise.all([
    pool.query(
      `SELECT id, name, company, type, email, phone
       FROM contacts
       WHERE workspace_id = $1
         AND EXISTS (
           SELECT 1 FROM unnest($2::text[]) t(token)
           WHERE LOWER(contacts.name) ILIKE '%' || t.token || '%'
              OR LOWER(contacts.company) ILIKE '%' || t.token || '%'
         )
       LIMIT 10`,
      [workspaceId, tokensLower]
    ),
    pool.query(
      `SELECT d.id, d.title, d.value, d.stage, d.probability, d.updated_at, d.contact_id
       FROM deals d
       WHERE d.workspace_id = $1
         AND EXISTS (
           SELECT 1 FROM unnest($2::text[]) t(token)
           WHERE LOWER(d.title) ILIKE '%' || t.token || '%'
         )
       LIMIT 10`,
      [workspaceId, tokensLower]
    ),
    pool.query(
      `SELECT i.id, i.description, i.amount, i.status, i.due_date, i.contact_id
       FROM invoices i
       WHERE i.workspace_id = $1
         AND EXISTS (
           SELECT 1 FROM unnest($2::text[]) t(token)
           WHERE LOWER(i.description) ILIKE '%' || t.token || '%'
         )
       LIMIT 10`,
      [workspaceId, tokensLower]
    ),
    pool.query(
      `SELECT id, title, status, priority, due_date
       FROM tasks
       WHERE workspace_id = $1
         AND EXISTS (
           SELECT 1 FROM unnest($2::text[]) t(token)
           WHERE LOWER(tasks.title) ILIKE '%' || t.token || '%'
         )
       LIMIT 10`,
      [workspaceId, tokensLower]
    ),
  ]);

  // Score all candidates and deduplicate
  const seenIds = new Set();
  const candidates = [];
  for (const r of contactRows.rows) {
    const key = `contact:${r.id}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      const score = scoreEntity('contact', r, tokensLower);
      if (score > 0) candidates.push({ type: 'contact', id: r.id, name: r.name, entity: r, score });
    }
  }
  for (const r of dealRows.rows) {
    const key = `deal:${r.id}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      const score = scoreEntity('deal', r, tokensLower);
      if (score > 0) candidates.push({ type: 'deal', id: r.id, name: r.title, entity: r, score });
    }
  }
  for (const r of invoiceRows.rows) {
    const key = `invoice:${r.id}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      const score = scoreEntity('invoice', r, tokensLower);
      if (score > 0) candidates.push({ type: 'invoice', id: r.id, name: r.description, entity: r, score });
    }
  }
  for (const r of taskRows.rows) {
    const key = `task:${r.id}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      const score = scoreEntity('task', r, tokensLower);
      if (score > 0) candidates.push({ type: 'task', id: r.id, name: r.title, entity: r, score });
    }
  }

  if (candidates.length === 0) {
    console.log(`[CONTEXT] workspace=${workspaceId} query="${message.slice(0, 60)}" entities=0 tier=aggregate tokens=0`);
    return { matches: [], tokens_consumed: 0 };
  }

  // Sort by score descending, resolve graph for top 3
  candidates.sort((a, b) => b.score - a.score);
  const top3 = candidates.slice(0, 3);

  const graphs = await Promise.all(top3.map((c) => resolveEntityGraph(workspaceId, c.type, c.id)));

  let totalTokens = 0;
  const matches = top3
    .map((c, i) => {
      const graph = graphs[i];
      if (!graph) return null;
      const l0 = buildEntityL0(graph);
      const l1 = buildEntityL1(graph);
      const approxTokens = Math.round(l1.length / 4);
      totalTokens += approxTokens;
      return { type: c.type, id: c.id, name: c.name, score: c.score, l0, l1, graph };
    })
    .filter(Boolean);

  // Structured context log
  const entitySummary = matches.map((m) => `${m.type}:${m.name} (score=${m.score.toFixed(2)})`).join(', ');
  console.log(`[CONTEXT] workspace=${workspaceId} query="${message.slice(0, 60)}" entities=${matches.length} [${entitySummary}] tier=L1 tokens=${totalTokens}`);

  return { matches, tokens_consumed: totalTokens };
}
