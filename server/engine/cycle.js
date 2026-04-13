import { pool } from '../db/index.js';
import { processEmailQueue } from '../services/email.js';
import { processSMSQueue } from '../services/sms.js';
import { processBusinessEvent } from './intake.js';
import { generateProactiveAlerts, generateApprovalNotifications, generateCriticalRiskNotifications } from './notifications.js';

const CYCLE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Lazy-import engine modules to avoid circular deps at module load time
async function getModules() {
  const { generateDecisions } = await import('./decisions.js');
  const { executeAction } = await import('./execution.js');
  const { advanceWorkflows } = await import('./workflows.js');
  return { generateDecisions, executeAction, advanceWorkflows };
}

/**
 * Load autonomy settings for a workspace (global + per-agent merged).
 * Returns settings keyed by agent (null key = global).
 */
async function loadAutonomySettings(workspaceId) {
  try {
    const result = await pool.query(
      `SELECT * FROM autonomy_settings WHERE workspace_id = $1`,
      [workspaceId]
    );
    const settings = { global: null };
    for (const row of result.rows) {
      const key = row.agent || 'global';
      settings[key] = row;
    }
    return settings;
  } catch {
    return { global: null };
  }
}

/**
 * Check if current time is within quiet hours.
 */
function isQuietHours(setting) {
  if (!setting?.quiet_hours_start || !setting?.quiet_hours_end) return false;
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const start = setting.quiet_hours_start.slice(0, 5);
    const end = setting.quiet_hours_end.slice(0, 5);
    if (start <= end) return currentTime >= start && currentTime < end;
    return currentTime >= start || currentTime < end;
  } catch {
    return false;
  }
}

/**
 * Detect patterns from recent agent activity and persist them as agent_memory entries.
 */
async function writeAgentMemory(workspaceId) {
  // Pattern 1: Contacts that have received 3+ reminders
  const reminderResult = await pool.query(
    `SELECT c.id AS contact_id, c.name, COUNT(*) AS reminder_count
     FROM agent_actions aa
     JOIN invoices i ON i.id = aa.entity_id
     JOIN contacts c ON c.id = i.contact_id
     WHERE aa.workspace_id = $1
       AND aa.agent = 'finance'
       AND aa.action_type IN ('remind', 'pre', 'urgent')
     GROUP BY c.id, c.name
     HAVING COUNT(*) >= 3`,
    [workspaceId]
  );
  for (const row of reminderResult.rows) {
    await pool.query(
      `INSERT INTO agent_memory (workspace_id, agent, memory_type, entity_type, entity_id, content, confidence)
       VALUES ($1, 'finance', 'observation', 'contact', $2, $3, 0.9)
       ON CONFLICT DO NOTHING`,
      [
        workspaceId,
        row.contact_id,
        `Contact ${row.name} has been reminded ${row.reminder_count} times — may need escalation or direct call`,
      ]
    );
  }

  // Pattern 2: Deals stale 7+ days despite follow-ups
  const staleDealsResult = await pool.query(
    `SELECT d.id, d.title,
            EXTRACT(EPOCH FROM (NOW() - d.updated_at)) / 86400 AS days_stale
     FROM deals d
     WHERE d.workspace_id = $1
       AND d.stage NOT IN ('closed', 'lost')
       AND d.updated_at < NOW() - INTERVAL '7 days'
       AND EXISTS (
         SELECT 1 FROM agent_actions aa
         WHERE aa.workspace_id = $1 AND aa.entity_id = d.id AND aa.agent = 'revenue'
       )`,
    [workspaceId]
  );
  for (const row of staleDealsResult.rows) {
    const days = Math.floor(row.days_stale);
    await pool.query(
      `INSERT INTO agent_memory (workspace_id, agent, memory_type, entity_type, entity_id, content, confidence)
       VALUES ($1, 'revenue', 'blocker', 'deal', $2, $3, 0.85)
       ON CONFLICT DO NOTHING`,
      [
        workspaceId,
        row.id,
        `Deal "${row.title}" has been stale for ${days} days despite follow-ups`,
      ]
    );
  }

  // Pattern 3: Invoices paid after agent action — collection workflow effective
  const paidResult = await pool.query(
    `SELECT i.id, i.description AS label, c.name AS contact_name, aa.action_type
     FROM invoices i
     JOIN agent_actions aa ON aa.entity_id = i.id AND aa.workspace_id = i.workspace_id
     LEFT JOIN contacts c ON c.id = i.contact_id
     WHERE i.workspace_id = $1
       AND i.status = 'paid'
       AND aa.agent = 'finance'
     ORDER BY i.updated_at DESC
     LIMIT 10`,
    [workspaceId]
  );
  for (const row of paidResult.rows) {
    const contactName = row.contact_name || 'client';
    await pool.query(
      `INSERT INTO agent_memory (workspace_id, agent, memory_type, entity_type, entity_id, content, confidence)
       VALUES ($1, 'finance', 'learned_preference', 'invoice', $2, $3, 0.95)
       ON CONFLICT DO NOTHING`,
      [
        workspaceId,
        row.id,
        `Collection workflow effective for ${contactName} — paid after ${row.action_type}`,
      ]
    );
  }
}

/**
 * Run a complete agent cycle for a workspace:
 * 1. Generate decisions from real DB data
 * 2. Filter by workspace risk limits
 * 3. Auto-execute eligible decisions
 * 4. Queue decisions that need approval
 * 5. Advance active workflows
 * 6. Write an agent_runs record with the full summary
 * Returns the cycle result summary.
 */
export async function runAgentCycle(workspaceId) {
  const { generateDecisions, executeAction, advanceWorkflows } = await getModules();

  const wsResult = await pool.query('SELECT settings FROM workspaces WHERE id = $1', [workspaceId]);
  const settings = wsResult.rows[0]?.settings || {};
  const limits = settings.riskLimits || {};

  // Load autonomy settings from DB (overrides workspace settings if present)
  const autonomy = await loadAutonomySettings(workspaceId);
  const globalAutonomy = autonomy.global;

  // Respect global quiet hours for communications
  const quietNow = isQuietHours(globalAutonomy);

  const decisions = await generateDecisions(workspaceId);

  const autoExecutable = decisions.filter((d) => {
    if (d.needsApproval) return false;
    if (!d.auto) return false;
    // Check per-agent autonomy settings
    const agentSetting = autonomy[d.agent] || globalAutonomy;
    if (agentSetting && agentSetting.enabled === false) return false;
    const threshold = agentSetting?.auto_execute_threshold ?? limits.maxAutoSpend ?? 500;
    if (d.impact && parseFloat(d.impact) > threshold) {
      d.needsApproval = true;
      return false;
    }
    return true;
  });
  const needsApproval = decisions.filter((d) => d.needsApproval === true || d.auto === false);

  // Apply per-cycle auto-execute cap
  const maxAutoPerCycle = globalAutonomy?.max_auto_actions_per_cycle ?? limits.maxAutoPerCycle ?? 20;
  const toExecute = autoExecutable.slice(0, maxAutoPerCycle);

  const executionResults = [];
  for (const decision of toExecute) {
    try {
      const result = await executeAction(workspaceId, decision);
      executionResults.push({ decision, result });
    } catch (execErr) {
      console.error(`Execution error for decision ${decision.id}:`, execErr);
      executionResults.push({ decision, result: { success: false, error: execErr.message } });
    }
  }

  // Advance workflows
  const wfResult = await advanceWorkflows(workspaceId);

  // Process queued email and SMS communications (respect quiet hours)
  let emailsSent = 0;
  let smsSent = 0;
  if (!quietNow) {
    try {
      const maxEmails = globalAutonomy?.max_daily_emails ?? limits.dailyEmailLimit ?? 50;
      emailsSent = await processEmailQueue(workspaceId, maxEmails);
    } catch (emailErr) {
      console.error(`[Agent Cycle] Email queue error for workspace ${workspaceId}:`, emailErr);
    }
    try {
      smsSent = await processSMSQueue(workspaceId);
    } catch (smsErr) {
      console.error(`[Agent Cycle] SMS queue error for workspace ${workspaceId}:`, smsErr);
    }
  }

  // Build pending decisions list with stable IDs
  const pendingDecisions = needsApproval.map((d) => ({
    ...d,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }));

  const summary = {
    decisionsGenerated: decisions.length,
    decisionsAutoExecuted: executionResults.filter((r) => r.result.success).length,
    decisionsSkipped: executionResults.filter((r) => !r.result.success).length,
    decisionsPending: pendingDecisions.length,
    workflowsAdvanced: wfResult.advanced,
    workflowsCompleted: wfResult.completed,
    emailsSent,
    smsSent,
    pendingDecisions,
    quietHoursActive: quietNow,
  };

  // Record the cycle in agent_runs
  const runResult = await pool.query(
    `INSERT INTO agent_runs (workspace_id, agent, status, actions_taken, items_scanned, summary, completed_at)
     VALUES ($1, 'system', 'completed', $2, $3, $4, NOW()) RETURNING *`,
    [
      workspaceId,
      summary.decisionsAutoExecuted,
      summary.decisionsGenerated,
      JSON.stringify(summary),
    ]
  );

  // Write agent_memory entries for patterns detected in this cycle
  try {
    await writeAgentMemory(workspaceId);
  } catch (memErr) {
    console.error(`[Agent Cycle] Memory write error for workspace ${workspaceId}:`, memErr);
  }

  // Generate proactive alerts
  let newAlerts = [];
  try {
    newAlerts = await generateProactiveAlerts(workspaceId);
  } catch (alertErr) {
    console.error(`[Agent Cycle] Proactive alerts error for workspace ${workspaceId}:`, alertErr.message);
  }

  // Generate notifications
  try {
    if (pendingDecisions.length > 0) {
      await generateApprovalNotifications(workspaceId, pendingDecisions);
    }
    if (newAlerts.length > 0) {
      await generateCriticalRiskNotifications(workspaceId, newAlerts);
    }
  } catch (notifErr) {
    console.error(`[Agent Cycle] Notification error for workspace ${workspaceId}:`, notifErr.message);
  }

  // Process any pending/classified business events
  try {
    const pendingEvents = await pool.query(
      `SELECT id FROM business_events WHERE workspace_id = $1 AND status IN ('pending', 'classified') ORDER BY created_at ASC LIMIT 50`,
      [workspaceId]
    );
    for (const row of pendingEvents.rows) {
      try {
        await processBusinessEvent(workspaceId, row.id);
      } catch (err) {
        console.error(`[Agent Cycle] Failed to process business event ${row.id}:`, err.message);
      }
    }
  } catch (eventsErr) {
    console.error(`[Agent Cycle] Business events processing error for workspace ${workspaceId}:`, eventsErr.message);
  }

  return { ...summary, runId: runResult.rows[0]?.id, newAlerts: newAlerts.length };
}

/**
 * Start the recurring scheduler that runs agent cycles for all workspaces
 * with active or trialing subscriptions every 15 minutes.
 * Errors in individual workspace cycles are caught and logged — the scheduler
 * itself will not crash.
 */
export function startScheduler() {
  async function tick() {
    console.log(`[Agent Scheduler] Running cycle at ${new Date().toISOString()}`);
    try {
      const result = await pool.query(
        `SELECT DISTINCT w.id
         FROM workspaces w
         JOIN subscriptions s ON s.workspace_id = w.id
         WHERE s.status IN ('active', 'trialing')`
      );
      const workspaceIds = result.rows.map((r) => r.id);
      console.log(`[Agent Scheduler] Processing ${workspaceIds.length} workspace(s)`);
      for (const wsId of workspaceIds) {
        try {
          const cycleResult = await runAgentCycle(wsId);
          console.log(
            `[Agent Scheduler] Workspace ${wsId}: ${cycleResult.decisionsAutoExecuted} auto-executed, ${cycleResult.decisionsPending} pending`
          );
        } catch (wsErr) {
          console.error(`[Agent Scheduler] Error for workspace ${wsId}:`, wsErr);
        }
      }
    } catch (err) {
      console.error('[Agent Scheduler] Error fetching workspaces:', err);
    }
  }

  // Run immediately on start, then on interval
  tick();
  const intervalId = setInterval(tick, CYCLE_INTERVAL_MS);

  // Allow graceful shutdown
  if (typeof process !== 'undefined') {
    process.on('SIGTERM', () => clearInterval(intervalId));
    process.on('SIGINT', () => clearInterval(intervalId));
  }

  console.log(`[Agent Scheduler] Started — running every ${CYCLE_INTERVAL_MS / 60000} minutes`);
  return intervalId;
}
