import { Router } from 'express';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import { buildWorkspaceContext, buildLocalSummary, findEntityContext } from '../lib/ai-context.js';

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

