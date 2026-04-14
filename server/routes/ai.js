import { Router } from 'express';
import { pool } from '../db/index.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import { buildWorkspaceContext, buildLocalSummary, findEntityContext, buildRichLocalContext } from '../lib/ai-context.js';
import { resolveCredentials } from '../lib/credential-resolver.js';
import { callAI } from '../lib/ai-client.js';

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

// GET /api/ai/status — returns whether AI is active and which provider/model is configured
router.get('/status', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const workspaceId = req.workspace.id;
    const creds = await resolveCredentials(workspaceId);

    if (!creds.AI_PROVIDER || !creds.AI_API_KEY) {
      return res.json({
        active: false,
        status: 'not_configured',
        provider: null,
        model: null,
        source: null,
      });
    }

    // Check DB verification status
    let isVerified = null;
    try {
      const provider = creds.AI_PROVIDER;
      const verResult = await pool.query(
        'SELECT is_verified FROM workspace_credentials WHERE workspace_id = $1 AND provider = $2',
        [workspaceId, provider]
      );
      if (verResult.rows.length > 0) {
        isVerified = verResult.rows[0].is_verified;
      }
    } catch { /* non-fatal */ }

    let status;
    if (isVerified === true) {
      status = 'active';
    } else if (isVerified === false) {
      status = 'needs_attention';
    } else {
      // Credentials exist (possibly from env) but never tested via DB — treat as active
      status = 'active';
    }

    return res.json({
      active: status === 'active',
      status,
      provider: creds.AI_PROVIDER,
      model: creds.AI_MODEL,
      source: creds.AI_SOURCE,
    });
  } catch (err) {
    next(err);
  }
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

    // Resolve credentials: DB takes priority over env vars
    const creds = await resolveCredentials(workspaceId);

    if (!creds.AI_PROVIDER || !creds.AI_API_KEY) {
      let richCtx = null;
      try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }
      const summary = buildLocalSummary(ctx, richCtx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary, null, 'local');
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
    let entityResult = { matches: [], tokens_consumed: 0 };
    try {
      entityResult = await findEntityContext(workspaceId, trimmedMessage);
    } catch (entityErr) {
      console.error('[AI] Entity context lookup failed:', entityErr.message);
    }

    const hasEntityMatches = entityResult.matches.length > 0;

    let systemPrompt;
    if (hasEntityMatches) {
      const entityBlocks = entityResult.matches.map((m) => m.l1).join('\n\n---\n\n');
      systemPrompt = `You are Autonome, an AI business operator assistant for ${ctx.businessName} (${ctx.industry}).

Entity context (directly relevant to this query):
${entityBlocks}

Business overview:
- ${ctx.contacts} contacts, ${ctx.deals.count} deals ($${Math.round(ctx.deals.totalValue / 1000)}k pipeline), ${ctx.invoices.count} invoices ($${Math.round(ctx.invoices.overdueAmount / 1000)}k overdue)
- Open tasks: ${ctx.tasks.openCount} | Agent actions today: ${ctx.agentActionsToday}

Provide concise, actionable answers grounded in the entity context above.`;
    } else {
      systemPrompt = `You are Autonome, an AI business operator assistant for ${ctx.businessName} (${ctx.industry}).

Current business context:
- Contacts: ${ctx.contacts}
- Deals: ${ctx.deals.count} deals, pipeline value $${Math.round(ctx.deals.totalValue).toLocaleString()}
- Invoices: ${ctx.invoices.count} total — $${Math.round(ctx.invoices.paidAmount).toLocaleString()} paid, $${Math.round(ctx.invoices.overdueAmount).toLocaleString()} overdue
- Tasks: ${ctx.tasks.openCount} open tasks
- Agent actions today: ${ctx.agentActionsToday}
${ctx.recentAgentActivity.length > 0 ? `- Recent agent activity: ${ctx.recentAgentActivity.join(' | ')}` : ''}

Provide concise, actionable answers grounded in this data.`;
    }

    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: trimmedMessage },
    ];

    let aiResult;
    try {
      aiResult = await callAI({
        provider: creds.AI_PROVIDER,
        apiKey: creds.AI_API_KEY,
        model: creds.AI_MODEL,
        system: systemPrompt,
        messages,
        maxTokens: 2048,
      });
    } catch (fetchErr) {
      console.error('[AI] AI client fetch error:', fetchErr.message);
      let richCtx = null;
      try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }
      const summary = buildLocalSummary(ctx, richCtx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary, sessionId, 'local');
      return res.json({
        response: summary,
        source: 'local',
        ai_attempted: true,
        ai_error: fetchErr.message || 'Failed to reach AI provider',
        provider_attempted: creds.AI_PROVIDER,
      });
    }

    if (!aiResult.text) {
      let richCtx = null;
      try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }
      const summary = buildLocalSummary(ctx, richCtx);
      await saveChatMessages(workspaceId, userId, trimmedMessage, summary, sessionId, 'local');
      const aiAttempted = aiResult.attempted !== false && !!(creds.AI_PROVIDER && creds.AI_API_KEY);
      return res.json({
        response: summary,
        source: 'local',
        ai_attempted: aiAttempted,
        ai_error: aiAttempted ? (aiResult.error || 'AI provider returned an empty response') : null,
        provider_attempted: aiAttempted ? creds.AI_PROVIDER : null,
      });
    }

    const text = aiResult.text;
    const aiProvider = aiResult.provider || creds.AI_PROVIDER;
    const totalPromptTokens = aiResult.inputTokens ?? null;
    await saveChatMessages(workspaceId, userId, trimmedMessage, text, sessionId, aiProvider, entityResult, totalPromptTokens);
    if (!hasEntityMatches && totalPromptTokens !== null) {
      console.log(`[CONTEXT] workspace=${workspaceId} query="${trimmedMessage.slice(0, 60)}" entities=0 tier=aggregate total=${totalPromptTokens}`);
    }
    res.json({ response: text, source: aiProvider });
  } catch (err) {
    next(err);
  }
});

async function saveChatMessages(workspaceId, userId, userMessage, assistantMessage, sessionId = null, source = 'local', entityResult = null, totalPromptTokens = null) {
  try {
    const metadata = { source };
    if (entityResult && entityResult.matches.length > 0) {
      metadata.context_trace = {
        entities_matched: entityResult.matches.map((m) => ({ type: m.type, id: m.id, name: m.name, score: m.score })),
        entity_context_tier: 'L1',
        entity_tokens: entityResult.tokens_consumed,
        ...(totalPromptTokens !== null ? { total_prompt_tokens: totalPromptTokens } : {}),
        // matches are sorted by score desc; first entry is always the best match
        match_method: entityResult.matches[0].score >= 1.0 ? 'exact_name' : 'partial_match',
      };
      const entitySummary = entityResult.matches.map((m) => `${m.type}:${m.name} (score=${m.score.toFixed(2)})`).join(', ');
      const totalStr = totalPromptTokens !== null ? ` total=${totalPromptTokens}` : '';
      console.log(`[CONTEXT] workspace=${workspaceId} query="${userMessage.slice(0, 60)}" entities=${entityResult.matches.length} [${entitySummary}] tier=L1 tokens=${entityResult.tokens_consumed}${totalStr}`);
    }
    await pool.query(
      `INSERT INTO chat_messages (workspace_id, user_id, role, content, session_id, metadata)
       VALUES ($1, $2, 'user', $3, $4, NULL), ($1, $2, 'assistant', $5, $4, $6)`,
      [workspaceId, userId, userMessage, sessionId, assistantMessage, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('[AI] Failed to save chat messages:', err.message);
  }
}

export default router;

