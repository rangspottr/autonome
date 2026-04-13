import { Router } from 'express';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import { buildWorkspaceContext, buildLocalSummary, findEntityContext, buildRichLocalContext } from '../lib/ai-context.js';

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


/**
 * Get or create a quick-query session for this user (continuing if within window).
 */
async function getOrCreateQuickSession(workspaceId, userId) {
  try {
    // Look for a recent session within the window
    const existing = await pool.query(
      `SELECT id FROM conversation_sessions
       WHERE workspace_id = $1 AND user_id = $2 AND mode = 'quick'
         AND updated_at > NOW() - INTERVAL '30 minutes'
       ORDER BY updated_at DESC LIMIT 1`,
      [workspaceId, userId]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE conversation_sessions SET updated_at = NOW() WHERE id = $1`,
        [existing.rows[0].id]
      );
      return existing.rows[0].id;
    }
    // Create new session
    const created = await pool.query(
      `INSERT INTO conversation_sessions (workspace_id, user_id, mode, title, has_pending_actions)
       VALUES ($1, $2, 'quick', 'AI Query', false)
       RETURNING id`,
      [workspaceId, userId]
    );
    return created.rows[0].id;
  } catch {
    return null;
  }
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
      let richCtx = null;
      try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }
      const summary = buildLocalSummary(ctx, richCtx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary);
      return res.json({ response: summary, source: 'local' });
    }

    // Get or create a session for this user (scoped to user, continued within 30min window)
    const sessionId = await getOrCreateQuickSession(workspaceId, userId);

    // Fetch last 5 chat messages scoped to THIS USER's session
    const historyResult = await pool.query(
      `SELECT role, content FROM chat_messages
       WHERE workspace_id = $1
         AND user_id = $2
         ${sessionId ? 'AND session_id = $3' : ''}
       ORDER BY created_at DESC LIMIT 5`,
      sessionId ? [workspaceId, userId, sessionId] : [workspaceId, userId]
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
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        }),
      });
    } catch (fetchErr) {
      console.error('[AI] Anthropic fetch error:', fetchErr.message);
      let richCtx = null;
      try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }
      const summary = buildLocalSummary(ctx, richCtx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary, sessionId);
      return res.json({ response: summary, source: 'local' });
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[AI] Anthropic API error:', anthropicRes.status, errText);
      let richCtx = null;
      try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }
      const summary = buildLocalSummary(ctx, richCtx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary, sessionId);
      return res.json({ response: summary, source: 'local' });
    }

    const data = await anthropicRes.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      let richCtx = null;
      try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }
      const summary = buildLocalSummary(ctx, richCtx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary, sessionId);
      return res.json({ response: summary, source: 'local' });
    }

    await saveChatMessages(workspaceId, userId, trimmedMessage, text, sessionId);
    res.json({ response: text, source: 'anthropic' });
  } catch (err) {
    next(err);
  }
});

async function saveChatMessages(workspaceId, userId, userMessage, assistantMessage, sessionId = null) {
  try {
    await pool.query(
      `INSERT INTO chat_messages (workspace_id, user_id, role, content, session_id)
       VALUES ($1, $2, 'user', $3, $4), ($1, $2, 'assistant', $5, $4)`,
      [workspaceId, userId, userMessage, sessionId, assistantMessage]
    );
  } catch (err) {
    console.error('[AI] Failed to save chat messages:', err.message);
  }
}

export default router;

