import { pool } from '../db/index.js';
import { advanceWorkflows } from './workflows.js';
import { runAgentCycle } from './cycle.js';

const WORKFLOW_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes
const CYCLE_INTERVAL_MS = 15 * 60 * 1000;    // 15 minutes

let cycleRunning = false;
let workflowRunning = false;

/**
 * Fetch all workspace IDs with active or trialing subscriptions.
 */
async function getActiveWorkspaceIds() {
  const result = await pool.query(
    `SELECT DISTINCT w.id
     FROM workspaces w
     JOIN subscriptions s ON s.workspace_id = w.id
     WHERE s.status IN ('active', 'trialing')`
  );
  return result.rows.map((r) => r.id);
}

/**
 * Advance workflows for all active workspaces (runs every 5 minutes).
 * Guarded against overlapping runs.
 */
async function workflowTick() {
  if (workflowRunning) {
    console.log('[Workflow Scheduler] Skipping tick — previous run still active');
    return;
  }
  workflowRunning = true;
  console.log(`[Workflow Scheduler] Advancing workflows at ${new Date().toISOString()}`);
  try {
    const ids = await getActiveWorkspaceIds();
    for (const wsId of ids) {
      try {
        const { advanced, completed } = await advanceWorkflows(wsId);
        if (advanced > 0 || completed > 0) {
          console.log(`[Workflow Scheduler] Workspace ${wsId}: ${advanced} advanced, ${completed} completed`);
        }
      } catch (err) {
        console.error(`[Workflow Scheduler] Workspace ${wsId} error:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Workflow Scheduler] Failed to fetch workspaces:', err.message);
  } finally {
    workflowRunning = false;
  }
}

/**
 * Run a full agent cycle for all active workspaces (runs every 15 minutes).
 * Guarded against overlapping runs.
 */
async function cycleTick() {
  if (cycleRunning) {
    console.log('[Cycle Scheduler] Skipping tick — previous run still active');
    return;
  }
  cycleRunning = true;
  console.log(`[Cycle Scheduler] Running agent cycle at ${new Date().toISOString()}`);
  try {
    const ids = await getActiveWorkspaceIds();
    console.log(`[Cycle Scheduler] Processing ${ids.length} workspace(s)`);
    for (const wsId of ids) {
      try {
        const result = await runAgentCycle(wsId);
        console.log(
          `[Cycle Scheduler] Workspace ${wsId}: ${result.decisionsAutoExecuted} auto-executed, ` +
          `${result.decisionsPending} pending, ${result.workflowsAdvanced} workflows advanced`
        );
      } catch (err) {
        console.error(`[Cycle Scheduler] Workspace ${wsId} error:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cycle Scheduler] Failed to fetch workspaces:', err.message);
  } finally {
    cycleRunning = false;
  }
}

/**
 * Start the combined scheduler:
 *  - Workflow advancement every 5 minutes
 *  - Full agent cycle every 15 minutes
 *
 * Runs both ticks immediately on start, then on their respective intervals.
 * Includes overlap guards so a slow run never causes concurrent execution.
 * Registers SIGTERM/SIGINT handlers for graceful shutdown.
 *
 * Returns an object with both interval IDs (useful for testing / manual teardown).
 */
export function startScheduler() {
  console.log(
    `[Scheduler] Starting — workflow interval: ${WORKFLOW_INTERVAL_MS / 60000}min, ` +
    `cycle interval: ${CYCLE_INTERVAL_MS / 60000}min`
  );

  // Fire immediately, then schedule
  workflowTick().catch((err) => console.error('[Scheduler] Initial workflow tick failed:', err.message));
  cycleTick().catch((err) => console.error('[Scheduler] Initial cycle tick failed:', err.message));

  const workflowIntervalId = setInterval(() => {
    workflowTick().catch((err) => console.error('[Workflow Scheduler] Tick error:', err.message));
  }, WORKFLOW_INTERVAL_MS);

  const cycleIntervalId = setInterval(() => {
    cycleTick().catch((err) => console.error('[Cycle Scheduler] Tick error:', err.message));
  }, CYCLE_INTERVAL_MS);

  function shutdown() {
    clearInterval(workflowIntervalId);
    clearInterval(cycleIntervalId);
    console.log('[Scheduler] Intervals cleared — shutting down gracefully');
  }

  if (typeof process !== 'undefined') {
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }

  return { workflowIntervalId, cycleIntervalId };
}
