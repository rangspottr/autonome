import { Router } from 'express';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth, requireWorkspace, requireActiveSubscription } from '../middleware/auth.js';
import { buildWorkspaceContext, findEntityContext } from '../lib/ai-context.js';
import { executeAction } from '../engine/execution.js';
import rateLimit from 'express-rate-limit';

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
       ORDER BY created_at DESC LIMIT 1`,
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
function buildAgentSystemPrompt(agent, agentCtx, workspaceCtx) {
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
    ? agentCtx.blockers.map((b) => `- ${b}`).join('\n')
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

Business context:
- Contacts: ${workspaceCtx.contacts}
- Deals: ${workspaceCtx.deals.count} deals, pipeline value $${Math.round(workspaceCtx.deals.totalValue).toLocaleString()}
- Invoices: $${Math.round(workspaceCtx.invoices.paidAmount).toLocaleString()} paid, $${Math.round(workspaceCtx.invoices.overdueAmount).toLocaleString()} overdue
- Open tasks: ${workspaceCtx.tasks.openCount}

Respond as this specific agent. Be direct, data-driven, and actionable. When you have recommendations that require owner approval, clearly label them as [APPROVAL NEEDED]. When you identify blockers, label them as [BLOCKER]. When you suggest specific actions, label them as [ACTION].`;
}

/**
 * Call Anthropic or fall back to a local structured response.
 */
async function callAI(systemPrompt, messages) {
  if (!config.ANTHROPIC_API_KEY) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!res.ok) {
      console.error('[Command] Anthropic API error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (err) {
    console.error('[Command] Anthropic fetch error:', err.message);
    return null;
  }
}

/**
 * Build a local fallback response for an agent when Anthropic is unavailable.
 */
function buildLocalAgentResponse(agent, agentCtx, workspaceCtx) {
  const lines = [
    `${agent.charAt(0).toUpperCase() + agent.slice(1)} Agent briefing for ${workspaceCtx.businessName}:`,
    `- ${agentCtx.actions.length} action${agentCtx.actions.length !== 1 ? 's' : ''} in the last 24h`,
    `- ${agentCtx.pendingDecisions} pending decision${agentCtx.pendingDecisions !== 1 ? 's' : ''}`,
    `- ${agentCtx.activeWorkflows} active workflow${agentCtx.activeWorkflows !== 1 ? 's' : ''}`,
    `- ${agentCtx.memory.length} active memory item${agentCtx.memory.length !== 1 ? 's' : ''}`,
  ];

  if (agentCtx.blockers.length > 0) {
    lines.push(`[BLOCKER] Current blockers: ${agentCtx.blockers.join(', ')}`);
  }

  if (agentCtx.actions.length > 0) {
    const recent = agentCtx.actions[0];
    lines.push(`Most recent action: ${recent.description}`);
  }

  lines.push('Connect an Anthropic API key for full AI-powered responses.');
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

    let entityContext = '';
    try {
      const found = await findEntityContext(workspaceId, trimmedMessage);
      if (found) entityContext = `\n\nEntity context for this query:\n${found}`;
    } catch (entityErr) {
      console.error('[Command] Entity context lookup failed:', entityErr.message);
    }

    const systemPrompt = buildAgentSystemPrompt(agent, agentCtx, workspaceCtx) + entityContext;

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

    let responseText = await callAI(systemPrompt, messages);
    const source = responseText ? 'anthropic' : 'local';
    if (!responseText) {
      responseText = buildLocalAgentResponse(agent, agentCtx, workspaceCtx);
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

    await saveCommandMessages(
      workspaceId, userId, resolvedSessionId, agent,
      trimmedMessage, responseText,
      { hasPendingActions }
    );

    res.json({
      response: responseText,
      source,
      agent,
      session_id: resolvedSessionId,
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

    // Gather context for all selected agents in parallel
    const agentContexts = await Promise.all(
      selectedAgents.map((agent) => buildAgentContext(workspaceId, agent).then((ctx) => ({ agent, ctx })))
    );

    let entityContext = '';
    try {
      const found = await findEntityContext(workspaceId, trimmedMessage);
      if (found) entityContext = `\n\nEntity context:\n${found}`;
    } catch (entityErr) {
      console.error('[Command] Entity context lookup failed:', entityErr.message);
    }

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

    // Call each agent in parallel
    const agentResponses = await Promise.all(
      agentContexts.map(async ({ agent, ctx }) => {
        const systemPrompt = buildAgentSystemPrompt(agent, ctx, workspaceCtx) + entityContext;
        const messages = [
          ...historyMessages,
          { role: 'user', content: trimmedMessage },
        ];

        let responseText = await callAI(systemPrompt, messages);
        const source = responseText ? 'anthropic' : 'local';
        if (!responseText) {
          responseText = buildLocalAgentResponse(agent, ctx, workspaceCtx);
        }

        return {
          agent,
          response: responseText,
          source,
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
    if (config.ANTHROPIC_API_KEY) {
      const synthesisPrompt = `You are a synthesis engine for ${workspaceCtx.businessName}.

The owner asked: "${trimmedMessage}"

Here are responses from each agent:
${agentResponses.map((r) => `--- ${r.agent.toUpperCase()} AGENT ---\n${r.response}`).join('\n\n')}

Produce a JSON object with exactly these fields:
{
  "recommendation": "unified recommendation text",
  "conflicts": ["list of areas where agents disagree"],
  "suggested_actions": [{"action": "description", "agent": "assigned agent", "priority": "high|medium|low"}],
  "approval_needed": [{"item": "description", "agent": "responsible agent", "impact": "impact description"}]
}

Return only valid JSON. No markdown, no explanation.`;

      let synthesisText = await callAI(synthesisPrompt, [{ role: 'user', content: 'Synthesize the agent responses.' }]);

      try {
        synthesis = synthesisText ? JSON.parse(synthesisText) : null;
      } catch {
        synthesis = null;
      }
    }

    if (!synthesis) {
      const approvalItems = agentResponses
        .filter((r) => r.response.includes('[APPROVAL NEEDED]'))
        .map((r) => ({ item: `Review ${r.agent} agent recommendations`, agent: r.agent, impact: 'Requires owner decision' }));

      synthesis = {
        recommendation: `${selectedAgents.length} agents have responded to your query. Review each perspective and the suggested actions below.`,
        conflicts: [],
        suggested_actions: agentResponses
          .filter((r) => r.response.includes('[ACTION]'))
          .map((r) => ({ action: `Follow up on ${r.agent} agent recommendations`, agent: r.agent, priority: 'medium' })),
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

    await saveCommandMessages(
      workspaceId, userId, resolvedSessionId, 'boardroom',
      trimmedMessage, boardroomContent,
      { synthesis, agentCount: selectedAgents.length }
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

export default router;
