import { pool } from '../db/index.js';

const CYCLE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Lazy-import engine modules to avoid circular deps at module load time
async function getModules() {
  const { generateDecisions } = await import('./decisions.js');
  const { executeAction } = await import('./execution.js');
  const { advanceWorkflows } = await import('./workflows.js');
  return { generateDecisions, executeAction, advanceWorkflows };
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

  const decisions = await generateDecisions(workspaceId);

  const autoExecutable = decisions.filter((d) => d.auto === true && d.needsApproval === false);
  const needsApproval = decisions.filter((d) => d.needsApproval === true || d.auto === false);

  // Apply per-cycle auto-execute cap if configured
  const maxAutoPerCycle = limits.maxAutoPerCycle || 20;
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
    pendingDecisions,
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

  return { ...summary, runId: runResult.rows[0]?.id };
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
