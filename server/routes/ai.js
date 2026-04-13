import { Router } from 'express';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

// Rate limit: max 20 AI requests per workspace per hour
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `ai:${req.workspace?.id || req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'AI query rate limit exceeded. Max 20 requests per hour per workspace.' },
});

async function buildWorkspaceContext(workspaceId) {
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
      `SELECT summary FROM agent_runs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 3`,
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
 * Build structured local briefing when Anthropic is unavailable.
 */
function buildLocalSummary(ctx) {
  return `Here's your business briefing for ${ctx.businessName} (${ctx.industry}):
• ${ctx.invoices.count} invoice${ctx.invoices.count !== 1 ? 's' : ''} — $${Math.round(ctx.invoices.paidAmount).toLocaleString()} collected, $${Math.round(ctx.invoices.overdueAmount).toLocaleString()} overdue
• ${ctx.deals.count} deal${ctx.deals.count !== 1 ? 's' : ''} in pipeline (total value: $${Math.round(ctx.deals.totalValue).toLocaleString()})
• ${ctx.tasks.openCount} task${ctx.tasks.openCount !== 1 ? 's' : ''} open of ${ctx.tasks.count} total
• ${ctx.agentActionsToday} agent action${ctx.agentActionsToday !== 1 ? 's' : ''} in the last 24h
• ${ctx.contacts} contact${ctx.contacts !== 1 ? 's' : ''} in workspace
${ctx.recentAgentActivity.length > 0 ? `• Recent agent activity: ${ctx.recentAgentActivity.join(' | ')}` : ''}`;
}

/**
 * Search for a named entity in the workspace and return its context.
 */
async function findEntityContext(workspaceId, message) {
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

router.post('/query', ...guard, aiLimiter, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'message is required' });
    }

    const workspaceId = req.workspace.id;
    const userId = req.user.id;
    const trimmedMessage = message.trim();

    const ctx = await buildWorkspaceContext(workspaceId);

    if (!config.ANTHROPIC_API_KEY) {
      const summary = buildLocalSummary(ctx);
      // Save to chat history even for local responses
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary);
      return res.json({ response: summary, source: 'local' });
    }

    // Fetch last 5 chat messages for multi-turn context
    const historyResult = await pool.query(
      `SELECT role, content FROM chat_messages
       WHERE workspace_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [workspaceId]
    );
    const conversationHistory = historyResult.rows.reverse(); // oldest first

    // Entity-aware context injection
    let entityContext = '';
    try {
      const found = await findEntityContext(workspaceId, trimmedMessage);
      if (found) entityContext = `\n\nEntity context for this query:\n${found}`;
    } catch (entityErr) {
      console.error('[AI] Entity context lookup failed:', entityErr.message);
    }

    const systemPrompt = `You are Autonome, an AI business operator assistant for ${ctx.businessName} (${ctx.industry}).

Current business context:
- Contacts: ${ctx.contacts}
- Deals: ${ctx.deals.count} deals, pipeline value $${Math.round(ctx.deals.totalValue).toLocaleString()}
- Invoices: ${ctx.invoices.count} total — $${Math.round(ctx.invoices.paidAmount).toLocaleString()} paid, $${Math.round(ctx.invoices.overdueAmount).toLocaleString()} overdue
- Tasks: ${ctx.tasks.openCount} open tasks
- Agent actions today: ${ctx.agentActionsToday}
${ctx.recentAgentActivity.length > 0 ? `- Recent agent activity: ${ctx.recentAgentActivity.join(' | ')}` : ''}${entityContext}

Provide concise, actionable answers grounded in this data.`;

    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: trimmedMessage },
    ];

    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.AI_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        }),
      });
    } catch (fetchErr) {
      console.error('[AI] Anthropic fetch error:', fetchErr.message);
      const summary = buildLocalSummary(ctx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary);
      return res.json({ response: summary, source: 'local' });
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[AI] Anthropic API error:', anthropicRes.status, errText);
      const summary = buildLocalSummary(ctx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary);
      return res.json({ response: summary, source: 'local' });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      const summary = buildLocalSummary(ctx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary);
      return res.json({ response: summary, source: 'local' });
    }

    await saveChatMessages(workspaceId, userId, trimmedMessage, text);
    res.json({ response: text, source: 'anthropic' });
  } catch (err) {
    next(err);
  }
});

async function saveChatMessages(workspaceId, userId, userMessage, assistantMessage) {
  try {
    await pool.query(
      `INSERT INTO chat_messages (workspace_id, user_id, role, content)
       VALUES ($1, $2, 'user', $3), ($1, $2, 'assistant', $4)`,
      [workspaceId, userId, userMessage, assistantMessage]
    );
  } catch (err) {
    console.error('[AI] Failed to save chat messages:', err.message);
  }
}

export default router;

