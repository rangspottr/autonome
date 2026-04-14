import { Router } from 'express';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { buildWorkspaceContext, findEntityContext, buildRichLocalContext } from '../lib/ai-context.js';
import { executeAction } from '../engine/execution.js';
import rateLimit from 'express-rate-limit';
import { resolveCredentials } from '../lib/credential-resolver.js';
import { callAI } from '../lib/ai-client.js';

const router = Router();
const guard = [requireAuth, requireWorkspace, requireActiveSubscription];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const commandLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => `cmd:${req.workspace?.id || req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Command interface rate limit exceeded. Max 60 requests per hour.' },
});

const VALID_AGENTS = ['finance', 'revenue', 'operations', 'growth', 'support'];

/**
 * Build full context for a single agent.
 */
async function buildAgentContext(workspaceId, agent) {
  const [actions, memory, runs, instructions, events] = await Promise.all([
    pool.query(
      `SELECT aa.*, CASE aa.entity_type
         WHEN 'invoice' THEN (SELECT description FROM invoices WHERE id = aa.entity_id LIMIT 1)
         WHEN 'deal'    THEN (SELECT title FROM deals WHERE id = aa.entity_id LIMIT 1)
         WHEN 'contact' THEN (SELECT name FROM contacts WHERE id = aa.entity_id LIMIT 1)
         WHEN 'task'    THEN (SELECT title FROM tasks WHERE id = aa.entity_id LIMIT 1)
         ELSE NULL
       END AS entity_name
       FROM agent_actions aa
       WHERE aa.workspace_id = $1 AND aa.agent = $2
         AND aa.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY aa.created_at DESC LIMIT 20`,
      [workspaceId, agent]
    ),
    pool.query(
      `SELECT * FROM agent_memory
       WHERE workspace_id = $1 AND agent = $2
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC LIMIT 10`,
      [workspaceId, agent]
    ),
    pool.query(
      `SELECT * FROM agent_runs
       WHERE workspace_id = $1
       ORDER BY started_at DESC LIMIT 1`,
      [workspaceId]
    ),
    pool.query(
      `SELECT * FROM operator_instructions
       WHERE workspace_id = $1 AND (agent = $2 OR agent IS NULL) AND active = true
       ORDER BY priority DESC, created_at DESC`,
      [workspaceId, agent]
    ),
    pool.query(
      `SELECT * FROM business_events
       WHERE workspace_id = $1 AND owner_agent = $2
       ORDER BY created_at DESC LIMIT 10`,
      [workspaceId, agent]
    ),
  ]);

  const latestRun = runs.rows[0];
  const runSummary = latestRun?.summary || {};

  return {
    actions: actions.rows,
    memory: memory.rows,
    latestRun: latestRun || null,
    blockers: runSummary.blockers || [],
    pendingDecisions: runSummary.decisionsPending || 0,
    activeWorkflows: runSummary.activeWorkflows || 0,
    instructions: instructions.rows,
    events: events.rows,
  };
}

/**
 * Build a specialized system prompt for a single agent.
 */
function buildAgentSystemPrompt(agent, agentCtx, workspaceCtx, entityL1 = '') {
  const agentLabels = {
    finance: 'Finance Agent — responsible for invoices, cash flow, collections, and financial health',
    revenue: 'Revenue Agent — responsible for deals, pipeline, sales follow-ups, and lead qualification',
    operations: 'Operations Agent — responsible for tasks, workflows, asset management, and process efficiency',
    growth: 'Growth Agent — responsible for expansion, new opportunities, market positioning, and strategic initiatives',
    support: 'Support Agent — responsible for customer relationships, issue resolution, and satisfaction',
  };

  const recentActions = agentCtx.actions.slice(0, 10)
    .map((a) => `- [${a.outcome}] ${a.description}${a.entity_name ? ` (${a.entity_name})` : ''}`)
    .join('\n') || 'None in last 24h';

  const memoryItems = agentCtx.memory.slice(0, 5)
    .map((m) => `- [${m.memory_type}] ${m.content}`)
    .join('\n') || 'No active memory entries';

  const instructionItems = agentCtx.instructions
    .map((i) => `- [${i.type}] ${i.instruction}`)
    .join('\n') || 'No specific instructions';

  const recentEvents = agentCtx.events.slice(0, 5)
    .map((e) => `- [${e.event_type}] ${e.source}: ${JSON.stringify(e.classified_data).slice(0, 100)}`)
    .join('\n') || 'No recent business events';

  const blockers = agentCtx.blockers.length > 0
    ? agentCtx.blockers.map((b) => {
        const reason = b.blocked_reason ? ` [reason: ${b.blocked_reason}]` : '';
        const desc = typeof b === 'object' ? (b.description || b) : b;
        return `- ${desc}${reason}`;
      }).join('\n')
    : 'None';

  return `You are the ${agentLabels[agent] || agent} for ${workspaceCtx.businessName} (${workspaceCtx.industry}).

Your current operational status:
- Active workflows: ${agentCtx.activeWorkflows}
- Pending decisions: ${agentCtx.pendingDecisions}
- Actions in last 24h: ${agentCtx.actions.length}

Recent actions:
${recentActions}

Active memory:
${memoryItems}

Current blockers:
${blockers}

Recent business events you own:
${recentEvents}

Operator instructions for you:
${instructionItems}
${entityL1 ? `\nEntity context (directly relevant to this query):\n${entityL1}\n` : ''}
Business context:
- Contacts: ${workspaceCtx.contacts}
- Deals: ${workspaceCtx.deals.count} deals, pipeline value $${Math.round(workspaceCtx.deals.totalValue).toLocaleString()}
- Invoices: $${Math.round(workspaceCtx.invoices.paidAmount).toLocaleString()} paid, $${Math.round(workspaceCtx.invoices.overdueAmount).toLocaleString()} overdue
- Open tasks: ${workspaceCtx.tasks.openCount}

Respond as this specific agent. Be direct, data-driven, and actionable. When you have recommendations that require owner approval, clearly label them as [APPROVAL NEEDED]. When you identify blockers, label them as [BLOCKER]. When you suggest specific actions, label them as [ACTION].`;
}

/**
 * Invoke the shared AI client with resolved workspace credentials.
 * Returns { text, inputTokens, provider } from the active provider.
 */
async function callAIWithCreds(systemPrompt, messages, maxTokens = 2048, creds = null) {
  const provider = creds?.AI_PROVIDER ?? config.AI_PROVIDER ?? null;
  const apiKey = creds?.AI_API_KEY ?? null;
  const model = creds?.AI_MODEL ?? config.AI_MODEL ?? null;
  return callAI({ provider, apiKey, model, system: systemPrompt, messages, maxTokens });
}

/**
 * Build a rich, role-specific local fallback response for an agent.
 * Provides specialist reasoning, prioritized items, and recommended next actions.
 * @param {boolean} [hasProvider=false] - Whether an AI provider is configured (suppresses connection warning)
 */
function buildLocalAgentResponse(agent, agentCtx, workspaceCtx, richCtx = null, hasProvider = false) {
  const businessName = workspaceCtx.businessName;
  const lines = [];

  if (agent === 'finance') {
    lines.push(`Finance Agent briefing for ${businessName}:`);
    const overdueAmt = workspaceCtx.invoices.overdueAmount;
    if (overdueAmt > 0) {
      lines.push(`\n[CRITICAL] CASH FLOW PRESSURE: $${Math.round(overdueAmt).toLocaleString()} outstanding in overdue invoices`);
      if (richCtx?.overdueInvoices?.length > 0) {
        lines.push('Priority collection targets:');
        richCtx.overdueInvoices.forEach((inv) => {
          const days = Math.round(inv.days_overdue || 0);
          lines.push(`  • ${inv.contact_name || 'Unknown'} — $${Math.round(inv.amount).toLocaleString()} (${days} days overdue)`);
        });
        lines.push('\n[ACTION] Send payment reminders to top 3 overdue accounts immediately.');
        if (richCtx.overdueInvoices.some((inv) => (inv.days_overdue || 0) > 30)) {
          lines.push('[APPROVAL NEEDED] One or more invoices are 30+ days overdue — consider escalation to collections.');
        }
      }
    } else {
      lines.push(`\n✅ No overdue invoices — $${Math.round(workspaceCtx.invoices.paidAmount).toLocaleString()} collected`);
    }
    if (agentCtx.pendingDecisions > 0) {
      lines.push(`\n[APPROVAL NEEDED] ${agentCtx.pendingDecisions} pending financial decision${agentCtx.pendingDecisions !== 1 ? 's' : ''} awaiting your review`);
    }
    if (agentCtx.blockers.length > 0) {
      lines.push(`\n[BLOCKER] ${agentCtx.blockers.length} blocked action${agentCtx.blockers.length !== 1 ? 's' : ''}: ${agentCtx.blockers.slice(0, 2).join('; ')}`);
    }
    lines.push(`\nFinance activity: ${agentCtx.actions.length} action${agentCtx.actions.length !== 1 ? 's' : ''} in last 24h, ${agentCtx.activeWorkflows} active workflow${agentCtx.activeWorkflows !== 1 ? 's' : ''}`);

  } else if (agent === 'revenue') {
    lines.push(`Revenue Agent briefing for ${businessName}:`);
    const pipelineValue = workspaceCtx.deals.totalValue;
    lines.push(`\nPIPELINE: ${workspaceCtx.deals.count} deal${workspaceCtx.deals.count !== 1 ? 's' : ''} — $${Math.round(pipelineValue).toLocaleString()} total value`);
    if (richCtx?.staleDeals?.length > 0) {
      lines.push('\nStale deals requiring follow-up:');
      richCtx.staleDeals.forEach((deal) => {
        const days = Math.round(deal.days_stale || 0);
        lines.push(`  • "${deal.title}" — $${Math.round(deal.value || 0).toLocaleString()} (${days}d stale, stage: ${deal.stage})`);
      });
      lines.push('\n[ACTION] Re-engage top stale deals before pipeline value bleeds out.');
      if (richCtx.staleDeals.some((d) => (d.days_stale || 0) > 14)) {
        lines.push('[APPROVAL NEEDED] Deals stale 14+ days may need re-pricing or closure — review required.');
      }
    }
    if (agentCtx.pendingDecisions > 0) {
      lines.push(`\n[APPROVAL NEEDED] ${agentCtx.pendingDecisions} pending revenue decision${agentCtx.pendingDecisions !== 1 ? 's' : ''} awaiting your review`);
    }
    if (agentCtx.blockers.length > 0) {
      lines.push(`\n[BLOCKER] ${agentCtx.blockers.length} blocked deal action${agentCtx.blockers.length !== 1 ? 's' : ''}: ${agentCtx.blockers.slice(0, 2).join('; ')}`);
    }
    lines.push(`\nRevenue activity: ${agentCtx.actions.length} action${agentCtx.actions.length !== 1 ? 's' : ''} in last 24h, ${agentCtx.activeWorkflows} active workflow${agentCtx.activeWorkflows !== 1 ? 's' : ''}`);

  } else if (agent === 'operations') {
    lines.push(`Operations Agent briefing for ${businessName}:`);
    lines.push(`\nTASKS: ${workspaceCtx.tasks.openCount} open task${workspaceCtx.tasks.openCount !== 1 ? 's' : ''} of ${workspaceCtx.tasks.count} total`);
    if (richCtx?.blockedTasks?.length > 0) {
      lines.push('\nOverdue tasks (workflow bottlenecks):');
      richCtx.blockedTasks.forEach((task) => {
        const days = Math.round(task.days_overdue || 0);
        lines.push(`  • ${task.title} (${task.priority} priority, ${days}d overdue)`);
      });
      lines.push('\n[ACTION] Review and reassign or close overdue high-priority tasks immediately.');
    }
    if (agentCtx.activeWorkflows > 0) {
      lines.push(`\n[ACTION] ${agentCtx.activeWorkflows} active workflow${agentCtx.activeWorkflows !== 1 ? 's' : ''} in progress — check for stalled steps.`);
    }
    if (agentCtx.blockers.length > 0) {
      lines.push(`\n[BLOCKER] ${agentCtx.blockers.length} blocked operation${agentCtx.blockers.length !== 1 ? 's' : ''}: ${agentCtx.blockers.slice(0, 2).join('; ')}`);
    }
    if (agentCtx.pendingDecisions > 0) {
      lines.push(`\n[APPROVAL NEEDED] ${agentCtx.pendingDecisions} operational decision${agentCtx.pendingDecisions !== 1 ? 's' : ''} awaiting your review`);
    }
    lines.push(`\nOperations activity: ${agentCtx.actions.length} action${agentCtx.actions.length !== 1 ? 's' : ''} in last 24h`);

  } else if (agent === 'support') {
    lines.push(`Support Agent briefing for ${businessName}:`);
    lines.push(`\nCUSTOMER BASE: ${workspaceCtx.contacts} contact${workspaceCtx.contacts !== 1 ? 's' : ''} in workspace`);
    if (agentCtx.actions.length > 0) {
      const recentCustomerActions = agentCtx.actions.slice(0, 3);
      lines.push('\nRecent customer interactions:');
      recentCustomerActions.forEach((a) => {
        lines.push(`  • [${a.outcome}] ${a.description}${a.entity_name ? ` (${a.entity_name})` : ''}`);
      });
    }
    if (agentCtx.blockers.length > 0) {
      lines.push(`\n[BLOCKER] ${agentCtx.blockers.length} unresolved customer issue${agentCtx.blockers.length !== 1 ? 's' : ''}: ${agentCtx.blockers.slice(0, 2).join('; ')}`);
      lines.push('[APPROVAL NEEDED] Blocked customer issues need your intervention.');
    }
    if (agentCtx.pendingDecisions > 0) {
      lines.push(`\n[APPROVAL NEEDED] ${agentCtx.pendingDecisions} support decision${agentCtx.pendingDecisions !== 1 ? 's' : ''} awaiting your review`);
    }
    if (agentCtx.memory.length > 0) {
      const atRisk = agentCtx.memory.filter((m) => m.memory_type === 'blocker' || m.content?.toLowerCase().includes('risk'));
      if (atRisk.length > 0) {
        lines.push('\nAt-risk customer signals:');
        atRisk.slice(0, 2).forEach((m) => lines.push(`  • ${m.content}`));
      }
    }
    lines.push(`\nSupport activity: ${agentCtx.actions.length} action${agentCtx.actions.length !== 1 ? 's' : ''} in last 24h, ${agentCtx.activeWorkflows} active workflow${agentCtx.activeWorkflows !== 1 ? 's' : ''}`);

  } else if (agent === 'growth') {
    lines.push(`Growth Agent briefing for ${businessName}:`);
    lines.push(`\nGROWTH SIGNALS: ${workspaceCtx.contacts} total contacts, ${workspaceCtx.deals.count} deal${workspaceCtx.deals.count !== 1 ? 's' : ''} in pipeline`);
    if (agentCtx.memory.length > 0) {
      const opportunities = agentCtx.memory.filter((m) => m.memory_type === 'observation' || m.memory_type === 'entity_note');
      if (opportunities.length > 0) {
        lines.push('\nExpansion signals:');
        opportunities.slice(0, 3).forEach((m) => lines.push(`  • ${m.content}`));
      }
    }
    if (agentCtx.blockers.length > 0) {
      lines.push(`\n[BLOCKER] ${agentCtx.blockers.length} growth initiative${agentCtx.blockers.length !== 1 ? 's' : ''} stalled: ${agentCtx.blockers.slice(0, 2).join('; ')}`);
    }
    if (agentCtx.pendingDecisions > 0) {
      lines.push(`\n[APPROVAL NEEDED] ${agentCtx.pendingDecisions} growth opportunity${agentCtx.pendingDecisions !== 1 ? 's' : ''} awaiting your review`);
    }
    lines.push('\n[ACTION] Review dormant leads for reactivation opportunities.');
    lines.push(`\nGrowth activity: ${agentCtx.actions.length} action${agentCtx.actions.length !== 1 ? 's' : ''} in last 24h, ${agentCtx.activeWorkflows} active workflow${agentCtx.activeWorkflows !== 1 ? 's' : ''}`);

  } else {
    // Generic fallback
    lines.push(`${agent.charAt(0).toUpperCase() + agent.slice(1)} Agent briefing for ${businessName}:`);
    lines.push(`- ${agentCtx.actions.length} action${agentCtx.actions.length !== 1 ? 's' : ''} in last 24h`);
    lines.push(`- ${agentCtx.pendingDecisions} pending decision${agentCtx.pendingDecisions !== 1 ? 's' : ''}`);
    lines.push(`- ${agentCtx.activeWorkflows} active workflow${agentCtx.activeWorkflows !== 1 ? 's' : ''}`);
    if (agentCtx.blockers.length > 0) {
      lines.push(`[BLOCKER] ${agentCtx.blockers.join(', ')}`);
    }
  }

  if (!hasProvider) {
    lines.push('\n[WARNING] Connect an AI provider in Settings to unlock full specialist intelligence.');
  }
  return lines.join('\n');
}

/**
 * Save a message pair to chat_messages with session and agent context.
 */
async function saveCommandMessages(workspaceId, userId, sessionId, agent, userMsg, assistantMsg, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO chat_messages (workspace_id, user_id, role, content, session_id, agent, metadata)
       VALUES ($1, $2, 'user', $3, $4, $5, $6), ($1, $2, 'assistant', $7, $4, $5, $6)`,
      [workspaceId, userId, userMsg, sessionId, agent || null, JSON.stringify(metadata), assistantMsg]
    );
  } catch (err) {
    console.error('[Command] Failed to save messages:', err.message);
  }
}

/**
 * Update or create a conversation session.
 */
async function upsertSession(sessionId, workspaceId, userId, mode, agent, title, hasPendingActions) {
  if (sessionId) {
    await pool.query(
      `UPDATE conversation_sessions
       SET updated_at = NOW(), has_pending_actions = $1
       WHERE id = $2 AND workspace_id = $3`,
      [hasPendingActions, sessionId, workspaceId]
    );
    return sessionId;
  }

  const result = await pool.query(
    `INSERT INTO conversation_sessions (workspace_id, user_id, mode, agent, title, has_pending_actions)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [workspaceId, userId, mode, agent || null, title || null, hasPendingActions]
  );
  return result.rows[0].id;
}

// ── POST /api/command/agent-chat ─────────────────────────────────────────────

router.post('/agent-chat', ...guard, commandLimiter, async (req, res, next) => {
  try {
    const { agent, message, session_id } = req.body;

    if (!agent || !VALID_AGENTS.includes(agent)) {
      return res.status(400).json({ message: `agent must be one of: ${VALID_AGENTS.join(', ')}` });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'message is required' });
    }

    const workspaceId = req.workspace.id;
    const userId = req.user.id;
    const trimmedMessage = message.trim();

    const [agentCtx, workspaceCtx] = await Promise.all([
      buildAgentContext(workspaceId, agent),
      buildWorkspaceContext(workspaceId),
    ]);

    // Resolve credentials: DB takes priority over env vars
    const creds = await resolveCredentials(workspaceId);

    let entityResult = { matches: [], tokens_consumed: 0 };
    try {
      entityResult = await findEntityContext(workspaceId, trimmedMessage);
    } catch (entityErr) {
      console.error('[Command] Entity context lookup failed:', entityErr.message);
    }

    const entityL1 = entityResult.matches.length > 0
      ? entityResult.matches.map((m) => m.l1).join('\n\n---\n\n')
      : '';

    const systemPrompt = buildAgentSystemPrompt(agent, agentCtx, workspaceCtx, entityL1);

    // Fetch recent conversation history for this session
    let conversationHistory = [];
    if (session_id) {
      const historyResult = await pool.query(
        `SELECT role, content FROM chat_messages
         WHERE workspace_id = $1 AND session_id = $2
         ORDER BY created_at DESC LIMIT 10`,
        [workspaceId, session_id]
      );
      conversationHistory = historyResult.rows.reverse();
    }

    const messages = [
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: trimmedMessage },
    ];

    let responseText = null;
    let agentChatInputTokens = null;
    const aiResult = await callAIWithCreds(systemPrompt, messages, 2048, creds);
    responseText = aiResult.text;
    agentChatInputTokens = aiResult.inputTokens;
    const aiProvider = aiResult.provider || creds.AI_PROVIDER || null;
    const source = responseText ? (aiProvider || 'local') : 'local';
    const hasProvider = !!(creds.AI_PROVIDER && creds.AI_API_KEY);
    const aiAttempted = aiResult.attempted !== false && hasProvider;
    if (!responseText) {
      let richCtx = null;
      try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }
      responseText = buildLocalAgentResponse(agent, agentCtx, workspaceCtx, richCtx, hasProvider);
    }

    const hasPendingActions = responseText.includes('[APPROVAL NEEDED]') || responseText.includes('[ACTION]');

    const resolvedSessionId = await upsertSession(
      session_id || null,
      workspaceId,
      userId,
      'agent',
      agent,
      trimmedMessage.slice(0, 80),
      hasPendingActions
    );

    if (entityResult.matches.length > 0) {
      const entitySummary = entityResult.matches.map((m) => `${m.type}:${m.name} (score=${m.score.toFixed(2)})`).join(', ');
      const totalStr = agentChatInputTokens !== null ? ` total=${agentChatInputTokens}` : '';
      console.log(`[CONTEXT] workspace=${workspaceId} agent=${agent} query="${trimmedMessage.slice(0, 60)}" entities=${entityResult.matches.length} [${entitySummary}] tier=L1 tokens=${entityResult.tokens_consumed}${totalStr}`);
    } else if (agentChatInputTokens !== null) {
      console.log(`[CONTEXT] workspace=${workspaceId} agent=${agent} query="${trimmedMessage.slice(0, 60)}" entities=0 tier=aggregate total=${agentChatInputTokens}`);
    }

    await saveCommandMessages(
      workspaceId, userId, resolvedSessionId, agent,
      trimmedMessage, responseText,
      {
        source,
        hasPendingActions,
        ...(entityResult.matches.length > 0 ? {
          context_trace: {
            entities_matched: entityResult.matches.map((m) => ({ type: m.type, id: m.id, name: m.name, score: m.score })),
            entity_context_tier: 'L1',
            entity_tokens: entityResult.tokens_consumed,
            ...(agentChatInputTokens !== null ? { total_prompt_tokens: agentChatInputTokens } : {}),
            // matches are sorted by score desc; first entry is always the best match
            match_method: entityResult.matches[0].score >= 1.0 ? 'exact_name' : 'partial_match',
          },
        } : {}),
      }
    );

    res.json({
      response: responseText,
      source,
      agent,
      session_id: resolvedSessionId,
      ai_attempted: aiAttempted && source === 'local',
      ai_error: (aiAttempted && source === 'local') ? (aiResult.error || 'AI provider did not return a response') : null,
      provider_attempted: (aiAttempted && source === 'local') ? (creds.AI_PROVIDER || null) : null,
      context_summary: {
        actions: agentCtx.actions.length,
        memory: agentCtx.memory.length,
        instructions: agentCtx.instructions.length,
        events: agentCtx.events.length,
        blockers: agentCtx.blockers.length,
        pending_decisions: agentCtx.pendingDecisions,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/command/boardroom ───────────────────────────────────────────────

router.post('/boardroom', ...guard, commandLimiter, async (req, res, next) => {
  try {
    const { message, agents: requestedAgents, session_id } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'message is required' });
    }

    const selectedAgents = Array.isArray(requestedAgents) && requestedAgents.length > 0
      ? (requestedAgents.includes('all') ? VALID_AGENTS : requestedAgents.filter((a) => VALID_AGENTS.includes(a)))
      : VALID_AGENTS;

    if (selectedAgents.length === 0) {
      return res.status(400).json({ message: 'No valid agents selected' });
    }

    const workspaceId = req.workspace.id;
    const userId = req.user.id;
    const trimmedMessage = message.trim();

    const workspaceCtx = await buildWorkspaceContext(workspaceId);

    // Resolve credentials: DB takes priority over env vars
    const creds = await resolveCredentials(workspaceId);

    // Gather context for all selected agents in parallel
    const agentContexts = await Promise.all(
      selectedAgents.map((agent) => buildAgentContext(workspaceId, agent).then((ctx) => ({ agent, ctx })))
    );

    // Resolve entity context ONCE — shared by all agents (eliminates silo problem)
    let entityResult = { matches: [], tokens_consumed: 0 };
    try {
      entityResult = await findEntityContext(workspaceId, trimmedMessage);
    } catch (entityErr) {
      console.error('[Command] Entity context lookup failed:', entityErr.message);
    }
    const entityL1 = entityResult.matches.length > 0
      ? entityResult.matches.map((m) => m.l1).join('\n\n---\n\n')
      : '';

    // Fetch boardroom conversation history
    let conversationHistory = [];
    if (session_id) {
      const historyResult = await pool.query(
        `SELECT role, content FROM chat_messages
         WHERE workspace_id = $1 AND session_id = $2 AND agent = 'boardroom'
         ORDER BY created_at DESC LIMIT 6`,
        [workspaceId, session_id]
      );
      conversationHistory = historyResult.rows.reverse();
    }

    const historyMessages = conversationHistory.map((m) => ({ role: m.role, content: m.content }));

    // Call each agent in parallel — all agents receive the SAME entity context
    let richCtx = null;
    try { richCtx = await buildRichLocalContext(workspaceId); } catch { /* non-fatal */ }

    let boardroomTotalInputTokens = 0;
    const agentResponses = await Promise.all(
      agentContexts.map(async ({ agent, ctx }) => {
        const systemPrompt = buildAgentSystemPrompt(agent, ctx, workspaceCtx, entityL1);
        const messages = [
          ...historyMessages,
          { role: 'user', content: trimmedMessage },
        ];

        const aiResult = await callAIWithCreds(systemPrompt, messages, 2048, creds);
        const aiProvider = aiResult.provider || creds.AI_PROVIDER || null;
        const source = aiResult.text ? (aiProvider || 'local') : 'local';
        const hasProvider = !!(creds.AI_PROVIDER && creds.AI_API_KEY);
        const responseText = aiResult.text || buildLocalAgentResponse(agent, ctx, workspaceCtx, richCtx, hasProvider);
        const agentAiAttempted = aiResult.attempted !== false && hasProvider && !aiResult.text;
        if (aiResult.inputTokens !== null) boardroomTotalInputTokens += aiResult.inputTokens;

        return {
          agent,
          response: responseText,
          source,
          ai_attempted: agentAiAttempted,
          ai_error: agentAiAttempted ? (aiResult.error || 'AI provider did not return a response') : null,
          provider_attempted: agentAiAttempted ? (creds.AI_PROVIDER || null) : null,
          context_summary: {
            actions: ctx.actions.length,
            memory: ctx.memory.length,
            instructions: ctx.instructions.length,
            events: ctx.events.length,
            blockers: ctx.blockers.length,
            pending_decisions: ctx.pendingDecisions,
          },
        };
      })
    );

    // Synthesize all agent responses
    let synthesis;
    if (creds.AI_PROVIDER && creds.AI_API_KEY) {
      const entityContext = entityL1 ? `\nShared entity context (all agents have this):\n${entityL1}\n` : '';
      const synthesisPrompt = `You are a synthesis engine for ${workspaceCtx.businessName}.
${entityContext}
The owner asked: "${trimmedMessage}"

Here are responses from each specialized agent:
${agentResponses.map((r) => `--- ${r.agent.toUpperCase()} AGENT ---\n${r.response}`).join('\n\n')}

Analyze these responses and produce a JSON object with exactly these fields:
{
  "recommendation": "A unified, prioritized recommendation that combines the most important insights from all agents. Be specific about what to do first.",
  "conflicts": ["List specific areas where agents recommend contradictory actions or disagree on priority. If none, use empty array."],
  "suggested_actions": [{"action": "Specific actionable step", "agent": "responsible agent name", "priority": "high|medium|low"}],
  "approval_needed": [{"item": "Description of what needs approval", "agent": "responsible agent", "impact": "Business impact if approved or rejected"}]
}

Rules:
- A conflict exists when one agent says pursue/escalate and another says hold/defer on the same entity
- Overlapping entity references across agents should be noted
- Priority disagreements (one agent marks high, another marks low for related work) are conflicts
- Return ONLY valid JSON. No markdown code fences, no explanation text before or after.`;

      let synthesisText = null;
      const synthesisResult = await callAIWithCreds(synthesisPrompt, [{ role: 'user', content: 'Synthesize the agent responses now.' }], 2048, creds);
      synthesisText = synthesisResult.text;
      if (synthesisResult.inputTokens !== null) boardroomTotalInputTokens += synthesisResult.inputTokens;

      if (synthesisText) {
        // Try direct JSON parse first
        try {
          synthesis = JSON.parse(synthesisText);
        } catch {
          // Try extracting JSON from text (handles cases where model adds prose)
          const jsonMatch = synthesisText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              synthesis = JSON.parse(jsonMatch[0]);
            } catch {
              synthesis = null;
            }
          }
        }

        // If still null, retry with a simpler structured-text prompt
        if (!synthesis) {
          const retryResult = await callAIWithCreds(
            'You must output only a valid JSON object, no other text.',
            [{ role: 'user', content: `Return this as valid JSON only:\n${synthesisText}` }],
            1024,
            creds
          );
          if (retryResult.text) {
            if (retryResult.inputTokens !== null) boardroomTotalInputTokens += retryResult.inputTokens;
            try { synthesis = JSON.parse(retryResult.text); } catch { synthesis = null; }
          }
        }
      }
    }

    if (!synthesis) {
      // Strengthened fallback synthesis — analyze actual response texts
      const approvalItems = agentResponses
        .filter((r) => r.response.includes('[APPROVAL NEEDED]'))
        .flatMap((r) => {
          const matches = r.response.match(/\[APPROVAL NEEDED\][^\n]*/g) || [];
          return matches.map((m) => ({
            item: m.replace('[APPROVAL NEEDED]', '').trim() || `Review ${r.agent} agent recommendations`,
            agent: r.agent,
            impact: 'Requires owner decision',
          }));
        });

      const actionItems = agentResponses
        .filter((r) => r.response.includes('[ACTION]'))
        .flatMap((r) => {
          const matches = r.response.match(/\[ACTION\][^\n]*/g) || [];
          return matches.map((m) => ({
            action: m.replace('[ACTION]', '').trim() || `Follow up on ${r.agent} agent recommendations`,
            agent: r.agent,
            priority: r.response.includes('[CRITICAL]') ? 'high' : r.response.includes('[MEDIUM]') ? 'medium' : 'low',
          }));
        });

      // Detect conflicts: agents referencing same entity with different urgency signals
      const conflictSignals = [];
      const agentResponseTexts = agentResponses.map((r) => ({ agent: r.agent, text: r.response.toLowerCase() }));
      const urgencyPairs = [
        ['escalate', 'hold'],
        ['immediate', 'defer'],
        ['urgent', 'low priority'],
        ['overdue', 'paid'],
      ];
      for (const [urgentWord, calmWord] of urgencyPairs) {
        const urgentAgents = agentResponseTexts.filter((r) => r.text.includes(urgentWord)).map((r) => r.agent);
        const calmAgents = agentResponseTexts.filter((r) => r.text.includes(calmWord)).map((r) => r.agent);
        if (urgentAgents.length > 0 && calmAgents.length > 0) {
          conflictSignals.push(`${urgentAgents.join(', ')} signal urgency (${urgentWord}) while ${calmAgents.join(', ')} signal calm (${calmWord})`);
        }
      }

      // Build recommendation from highest-priority signals
      const hasBlocking = agentResponses.some((r) => r.response.includes('[BLOCKER]'));
      const hasCashPressure = agentResponses.some((r) => r.response.includes('[CRITICAL]'));
      let recommendation = '';
      if (hasCashPressure) recommendation += 'Immediate attention required on cash flow and overdue accounts. ';
      if (hasBlocking) recommendation += 'Active blockers need resolution before work can advance. ';
      if (approvalItems.length > 0) recommendation += `${approvalItems.length} item${approvalItems.length !== 1 ? 's' : ''} pending your approval. `;
      if (!recommendation) recommendation = `${selectedAgents.length} agents have responded. Review each perspective and the suggested actions below.`;

      synthesis = {
        recommendation: recommendation.trim(),
        conflicts: conflictSignals,
        suggested_actions: actionItems.length > 0 ? actionItems : agentResponses
          .filter((r) => r.response.includes('[ACTION]'))
          .map((r) => ({ action: `Follow up on ${r.agent} recommendations`, agent: r.agent, priority: 'medium' })),
        approval_needed: approvalItems,
      };
    }

    const hasPendingActions = synthesis.approval_needed?.length > 0;
    const boardroomContent = JSON.stringify({ message: trimmedMessage, agents_responses: agentResponses, synthesis });

    const resolvedSessionId = await upsertSession(
      session_id || null,
      workspaceId,
      userId,
      'boardroom',
      null,
      trimmedMessage.slice(0, 80),
      hasPendingActions
    );

    if (entityResult.matches.length > 0) {
      const entitySummary = entityResult.matches.map((m) => `${m.type}:${m.name} (score=${m.score.toFixed(2)})`).join(', ');
      const totalStr = boardroomTotalInputTokens > 0 ? ` total=${boardroomTotalInputTokens}` : '';
      console.log(`[CONTEXT] workspace=${workspaceId} mode=boardroom query="${trimmedMessage.slice(0, 60)}" entities=${entityResult.matches.length} [${entitySummary}] tier=L1 tokens=${entityResult.tokens_consumed}${totalStr}`);
    } else if (boardroomTotalInputTokens > 0) {
      console.log(`[CONTEXT] workspace=${workspaceId} mode=boardroom query="${trimmedMessage.slice(0, 60)}" entities=0 tier=aggregate total=${boardroomTotalInputTokens}`);
    }

    await saveCommandMessages(
      workspaceId, userId, resolvedSessionId, 'boardroom',
      trimmedMessage, boardroomContent,
      {
        source: 'boardroom',
        synthesis,
        agentCount: selectedAgents.length,
        ...(entityResult.matches.length > 0 ? {
          context_trace: {
            entities_matched: entityResult.matches.map((m) => ({ type: m.type, id: m.id, name: m.name, score: m.score })),
            entity_context_tier: 'L1',
            entity_tokens: entityResult.tokens_consumed,
            ...(boardroomTotalInputTokens > 0 ? { total_prompt_tokens: boardroomTotalInputTokens } : {}),
            // matches are sorted by score desc; first entry is always the best match
            match_method: entityResult.matches[0].score >= 1.0 ? 'exact_name' : 'partial_match',
          },
        } : {}),
      }
    );

    res.json({
      agents_responses: agentResponses,
      synthesis,
      session_id: resolvedSessionId,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/command/conversations ───────────────────────────────────────────

router.get('/conversations', ...guard, async (req, res, next) => {
  try {
    const workspaceId = req.workspace.id;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT cs.*,
              (SELECT content FROM chat_messages
               WHERE session_id = cs.id
               ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id) AS message_count
       FROM conversation_sessions cs
       WHERE cs.workspace_id = $1 AND cs.user_id = $2
       ORDER BY cs.updated_at DESC
       LIMIT 20`,
      [workspaceId, userId]
    );

    res.json({ sessions: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/command/unresolved ───────────────────────────────────────────────

router.get('/unresolved', ...guard, async (req, res, next) => {
  try {
    const workspaceId = req.workspace.id;
    const userId = req.user.id;

    const [sessionsResult, pendingDecisionsResult] = await Promise.all([
      pool.query(
        `SELECT cs.*,
                (SELECT content FROM chat_messages
                 WHERE session_id = cs.id
                 ORDER BY created_at DESC LIMIT 1) AS last_message
         FROM conversation_sessions cs
         WHERE cs.workspace_id = $1 AND cs.user_id = $2
           AND cs.resolved = false AND cs.has_pending_actions = true
         ORDER BY cs.updated_at DESC
         LIMIT 10`,
        [workspaceId, userId]
      ),
      pool.query(
        `SELECT aa.*,
                CASE aa.entity_type
                  WHEN 'invoice' THEN (SELECT description FROM invoices WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'deal'    THEN (SELECT title FROM deals WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'contact' THEN (SELECT name FROM contacts WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'task'    THEN (SELECT title FROM tasks WHERE id = aa.entity_id LIMIT 1)
                  ELSE NULL
                END AS entity_name
         FROM agent_actions aa
         WHERE aa.workspace_id = $1 AND aa.outcome = 'pending'
         ORDER BY aa.created_at DESC LIMIT 10`,
        [workspaceId]
      ),
    ]);

    res.json({
      unresolved_sessions: sessionsResult.rows,
      pending_decisions: pendingDecisionsResult.rows,
      total: sessionsResult.rows.length + pendingDecisionsResult.rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/command/action ──────────────────────────────────────────────────

router.post('/action', ...guard, async (req, res, next) => {
  try {
    const { action, target_id, target_type, agent, metadata = {}, session_id } = req.body;

    const VALID_ACTIONS = ['approve', 'reject', 'defer', 'assign', 'follow_up'];
    if (!action || !VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ message: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
    }

    const workspaceId = req.workspace.id;
    const userId = req.user.id;

    let result = null;
    let nextSteps = [];

    if (action === 'approve' && target_id && target_type && agent) {
      try {
        result = await executeAction(workspaceId, {
          agent,
          action: metadata.sub_action || 'execute',
          target: target_id,
          contactId: metadata.contact_id || null,
          desc: `Owner approved: ${metadata.description || target_type}`,
        });
        nextSteps.push('Decision executed. Agent will continue with approved action.');
      } catch (execErr) {
        console.error('[Command] Execute action failed:', execErr.message);
        result = { success: false, error: execErr.message };
      }
    }

    if (action === 'reject' && target_id) {
      await pool.query(
        `UPDATE agent_actions SET outcome = 'rejected', metadata = metadata || $1
         WHERE id = $2 AND workspace_id = $3`,
        [JSON.stringify({ rejected_at: new Date().toISOString(), rejected_by: userId }), target_id, workspaceId]
      );
      result = { success: true };
      nextSteps.push('Decision marked as rejected.');
    }

    if (action === 'defer' && target_id) {
      const reviewDate = metadata.review_date || new Date(Date.now() + ONE_DAY_MS).toISOString();
      await pool.query(
        `UPDATE agent_actions SET outcome = 'deferred', metadata = metadata || $1
         WHERE id = $2 AND workspace_id = $3`,
        [JSON.stringify({ deferred_at: new Date().toISOString(), review_date: reviewDate }), target_id, workspaceId]
      );
      result = { success: true };
      nextSteps.push(`Deferred for review on ${new Date(reviewDate).toLocaleDateString()}.`);
    }

    if (action === 'assign' && target_id && metadata.new_agent && VALID_AGENTS.includes(metadata.new_agent)) {
      await pool.query(
        `UPDATE agent_actions SET handed_off_to = $1, outcome = 'reassigned', metadata = metadata || $2
         WHERE id = $3 AND workspace_id = $4`,
        [metadata.new_agent, JSON.stringify({ assigned_by: userId }), target_id, workspaceId]
      );
      result = { success: true };
      nextSteps.push(`Reassigned to ${metadata.new_agent} agent.`);
    }

    if (action === 'follow_up' && session_id) {
      nextSteps.push('Follow-up request logged. The agent will provide more detail in the next response.');
      result = { success: true };
    }

    // Log the owner action
    await pool.query(
      `INSERT INTO agent_actions
         (workspace_id, agent, action_type, entity_type, entity_id, description, outcome, metadata)
       VALUES ($1, $2, 'owner_command', $3, $4, $5, 'completed', $6)`,
      [
        workspaceId,
        agent || 'owner',
        target_type || null,
        target_id || null,
        `Owner ${action}: ${metadata.description || target_type || action}`,
        JSON.stringify({ action, session_id, ...metadata }),
      ]
    );

    // Create a business event for significant actions
    if (action === 'approve' && target_id) {
      try {
        await pool.query(
          `INSERT INTO business_events
             (workspace_id, source, event_type, status, raw_data, owner_agent, processed_at)
           VALUES ($1, 'owner_command', 'decision_approved', 'processed', $2, $3, NOW())`,
          [
            workspaceId,
            JSON.stringify({ target_id, target_type, agent, metadata }),
            agent || null,
          ]
        );
      } catch (beErr) {
        console.error('[Command] Business event creation failed:', beErr.message);
      }
    }

    // Mark session as resolved if action is approve/reject
    if (session_id && (action === 'approve' || action === 'reject')) {
      await pool.query(
        `UPDATE conversation_sessions SET has_pending_actions = false, updated_at = NOW()
         WHERE id = $1 AND workspace_id = $2`,
        [session_id, workspaceId]
      );
    }

    res.json({ success: true, result, next_steps: nextSteps });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/command/briefing — "since last login" operator briefing ──────────

router.get('/briefing', ...guard, async (req, res, next) => {
  try {
    const workspaceId = req.workspace.id;
    const userId = req.user.id;

    // Get user's last_login_at and last_active_at (use GREATEST of both, fall back to 24h ago)
    const userResult = await pool.query(
      `SELECT last_login_at, last_active_at FROM users WHERE id = $1`,
      [userId]
    );
    const rawLastLogin = userResult.rows[0]?.last_login_at
      ? new Date(userResult.rows[0].last_login_at)
      : null;
    const rawLastActive = userResult.rows[0]?.last_active_at
      ? new Date(userResult.rows[0].last_active_at)
      : null;
    const fallback = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let lastActive;
    if (rawLastLogin && rawLastActive) {
      lastActive = rawLastLogin > rawLastActive ? rawLastLogin : rawLastActive;
    } else {
      lastActive = rawLastLogin || rawLastActive || fallback;
    }

    // Update last_active_at now
    await pool.query(
      `UPDATE users SET last_active_at = NOW() WHERE id = $1`,
      [userId]
    ).catch(() => { /* non-fatal if column doesn't exist yet */ });

    const [agentActions, pendingDecisions, businessEvents, metricsNow] = await Promise.all([
      pool.query(
        `SELECT aa.*,
                CASE aa.entity_type
                  WHEN 'invoice' THEN (SELECT description FROM invoices WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'deal'    THEN (SELECT title FROM deals WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'contact' THEN (SELECT name FROM contacts WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'task'    THEN (SELECT title FROM tasks WHERE id = aa.entity_id LIMIT 1)
                  ELSE NULL
                END AS entity_name
         FROM agent_actions aa
         WHERE aa.workspace_id = $1
           AND aa.created_at > $2
         ORDER BY aa.created_at DESC LIMIT 50`,
        [workspaceId, lastActive.toISOString()]
      ),
      pool.query(
        `SELECT aa.*,
                CASE aa.entity_type
                  WHEN 'invoice' THEN (SELECT description FROM invoices WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'deal'    THEN (SELECT title FROM deals WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'contact' THEN (SELECT name FROM contacts WHERE id = aa.entity_id LIMIT 1)
                  WHEN 'task'    THEN (SELECT title FROM tasks WHERE id = aa.entity_id LIMIT 1)
                  ELSE NULL
                END AS entity_name
         FROM agent_actions aa
         WHERE aa.workspace_id = $1 AND aa.outcome = 'pending'
         ORDER BY aa.created_at DESC LIMIT 20`,
        [workspaceId]
      ),
      pool.query(
        `SELECT * FROM business_events
         WHERE workspace_id = $1
           AND created_at > $2
         ORDER BY created_at DESC LIMIT 20`,
        [workspaceId, lastActive.toISOString()]
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM invoices WHERE workspace_id = $1 AND status = 'overdue') AS overdue_invoices,
           (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE workspace_id = $1 AND status = 'overdue') AS overdue_amount,
           (SELECT COUNT(*) FROM deals WHERE workspace_id = $1 AND stage NOT IN ('won','lost')) AS active_deals,
           (SELECT COUNT(*) FROM tasks WHERE workspace_id = $1 AND status = 'pending') AS open_tasks,
           (SELECT COUNT(*) FROM agent_actions WHERE workspace_id = $1 AND outcome = 'blocked') AS blockers`,
        [workspaceId]
      ),
    ]);

    const metrics = metricsNow.rows[0] || {};
    const actionsByAgent = {};
    for (const a of agentActions.rows) {
      if (!actionsByAgent[a.agent]) actionsByAgent[a.agent] = [];
      actionsByAgent[a.agent].push(a);
    }

    // Upcoming deadlines
    const upcomingDeadlines = await pool.query(
      `SELECT title, due_date, priority FROM tasks
       WHERE workspace_id = $1
         AND status = 'pending'
         AND due_date BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
       ORDER BY due_date ASC LIMIT 5`,
      [workspaceId]
    );

    // Support & growth signal counts for owner briefing
    const [supportSignalsResult, growthSignalsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS at_risk
         FROM (
           SELECT c.id
           FROM contacts c
           WHERE c.workspace_id = $1
             AND EXISTS (
               SELECT 1 FROM invoices i WHERE i.contact_id = c.id AND i.workspace_id = $1
                 AND (i.status = 'overdue' OR (i.status = 'pending' AND i.due_date < NOW()))
             )
             AND EXISTS (
               SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1
                 AND d.stage NOT IN ('won', 'lost')
             )
         ) sub`,
        [workspaceId]
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM (
             SELECT c.id,
                    FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(
                      (SELECT MAX(d.updated_at) FROM deals d WHERE d.contact_id = c.id AND d.workspace_id = $1),
                      c.created_at
                    ))) / 86400)::int AS days_inactive
             FROM contacts c
             WHERE c.workspace_id = $1 AND c.type = 'customer'
           ) sub WHERE days_inactive >= 30) AS dormant_customers,
           (SELECT COUNT(*) FROM contacts c
            WHERE c.workspace_id = $1 AND c.type = 'lead'
              AND c.created_at < NOW() - INTERVAL '7 days'
              AND NOT EXISTS (
                SELECT 1 FROM agent_actions aa
                WHERE aa.entity_id = c.id AND aa.workspace_id = $1
                  AND aa.entity_type = 'contact'
              )
           ) AS stale_leads`,
        [workspaceId]
      ),
    ]);

    const supportSignals = parseInt(supportSignalsResult.rows[0]?.at_risk) || 0;
    const dormantCustomers = parseInt(growthSignalsResult.rows[0]?.dormant_customers) || 0;
    const staleLeads = parseInt(growthSignalsResult.rows[0]?.stale_leads) || 0;
    const growthSignals = dormantCustomers + staleLeads;

    res.json({
      since: lastActive.toISOString(),
      agent_actions: agentActions.rows,
      agent_actions_by_agent: actionsByAgent,
      pending_decisions: pendingDecisions.rows,
      new_business_events: businessEvents.rows,
      upcoming_deadlines: upcomingDeadlines.rows,
      current_metrics: {
        overdue_invoices: parseInt(metrics.overdue_invoices) || 0,
        overdue_amount: parseFloat(metrics.overdue_amount) || 0,
        active_deals: parseInt(metrics.active_deals) || 0,
        open_tasks: parseInt(metrics.open_tasks) || 0,
        blockers: parseInt(metrics.blockers) || 0,
      },
      support_signals: supportSignals,
      growth_signals: growthSignals,
      summary: {
        total_actions: agentActions.rows.length,
        total_pending: pendingDecisions.rows.length,
        total_events: businessEvents.rows.length,
        needs_attention: pendingDecisions.rows.length > 0 || parseInt(metrics.overdue_invoices) > 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
