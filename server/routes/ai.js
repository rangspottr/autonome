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
  const [contacts, deals, invoices, tasks, agentRuns] = await Promise.all([
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
    recentAgentActivity: agentRuns.rows.map((r) => {
      const s = r.summary || {};
      return `auto:${s.decisionsAutoExecuted ?? 0} pending:${s.decisionsPending ?? 0} emails:${s.emailsSent ?? 0} sms:${s.smsSent ?? 0}`;
    }),
  };
}

function buildLocalSummary(ctx) {
  return `Business Snapshot for ${ctx.businessName} (${ctx.industry}):
• Contacts: ${ctx.contacts}
• Deals: ${ctx.deals.count} (pipeline value: $${Math.round(ctx.deals.totalValue).toLocaleString()})
• Invoices: ${ctx.invoices.count} total — $${Math.round(ctx.invoices.paidAmount).toLocaleString()} paid, $${Math.round(ctx.invoices.overdueAmount).toLocaleString()} overdue
• Tasks: ${ctx.tasks.openCount} open of ${ctx.tasks.count} total
• AI answers require an Anthropic API key configured on the server (ANTHROPIC_API_KEY).`;
}

router.post('/query', ...guard, aiLimiter, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'message is required' });
    }

    const ctx = await buildWorkspaceContext(req.workspace.id);

    if (!config.ANTHROPIC_API_KEY) {
      const summary = buildLocalSummary(ctx);
      return res.json({ response: summary, source: 'local' });
    }

    const systemPrompt = `You are Autonome, an AI business operator assistant for ${ctx.businessName} (${ctx.industry}).

Current business context:
- Contacts: ${ctx.contacts}
- Deals: ${ctx.deals.count} deals, pipeline value $${Math.round(ctx.deals.totalValue).toLocaleString()}
- Invoices: ${ctx.invoices.count} total — $${Math.round(ctx.invoices.paidAmount).toLocaleString()} paid, $${Math.round(ctx.invoices.overdueAmount).toLocaleString()} overdue
- Tasks: ${ctx.tasks.openCount} open tasks
${ctx.recentAgentActivity.length > 0 ? `- Recent agent activity: ${ctx.recentAgentActivity.join(' | ')}` : ''}

Provide concise, actionable answers grounded in this data.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [{ role: 'user', content: message.trim() }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[AI] Anthropic API error:', anthropicRes.status, errText);
      const summary = buildLocalSummary(ctx);
      return res.json({ response: summary, source: 'local' });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      const summary = buildLocalSummary(ctx);
      return res.json({ response: summary, source: 'local' });
    }

    res.json({ response: text, source: 'anthropic' });
  } catch (err) {
    next(err);
  }
});

export default router;
