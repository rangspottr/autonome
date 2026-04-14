/**
 * Scheduler proof tests.
 *
 * Verifies that the three scheduled job functions (morning briefing,
 * weekly report, collections) correctly invoke the underlying runner
 * when the time arrives, using vitest fake timers so we don't have to
 * wait for wall-clock time.
 *
 * These tests prove the scheduler wiring exists and fires — not just
 * that the scheduler code is present.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock pool so module imports succeed without a real DB ─────────────────────
const mockQuery = vi.fn();
vi.mock('../../db/index.js', () => ({ pool: { query: mockQuery } }));

// ── Import scheduler starters and the underlying run functions ────────────────
const { startMorningBriefingScheduler, runMorningBriefingForAllWorkspaces } = await import('../morning-briefing.js');
const { startWeeklyReportScheduler, runWeeklyReportForAllWorkspaces } = await import('../weekly-report.js');
const { startCollectionsScheduler, runCollectionsForAllWorkspaces } = await import('../collections-operator.js');
const { startScheduler } = await import('../../engine/scheduler.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fast-forward all pending timers then flush micro-tasks. */
async function advanceTimers(ms) {
  vi.advanceTimersByTime(ms);
  // Allow any resolved Promises to settle
  await Promise.resolve();
}

// ── Morning Briefing Scheduler ────────────────────────────────────────────────

describe('Morning Briefing Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuery.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires runMorningBriefingForAllWorkspaces after the initial delay', async () => {
    // Pool returns empty workspaces so the run function completes without error
    mockQuery.mockResolvedValue({ rows: [] });

    // Start scheduler and immediately jump past 25 hours (> any possible delay to 7 AM)
    startMorningBriefingScheduler();
    await advanceTimers(25 * 60 * 60 * 1000);

    // The pool must have been queried (workspace lookup inside the run function)
    expect(mockQuery).toHaveBeenCalled();
    const calls = mockQuery.mock.calls;
    const workspaceQuery = calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('subscriptions')
    );
    expect(workspaceQuery).toBeDefined();
  });
});

// ── Weekly Report Scheduler ───────────────────────────────────────────────────

describe('Weekly Report Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuery.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires runWeeklyReportForAllWorkspaces after the initial delay', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    // Start scheduler and advance 8 days to guarantee we're past the next Friday 8 AM
    startWeeklyReportScheduler();
    await advanceTimers(8 * 24 * 60 * 60 * 1000);

    expect(mockQuery).toHaveBeenCalled();
    const calls = mockQuery.mock.calls;
    const workspaceQuery = calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('subscriptions')
    );
    expect(workspaceQuery).toBeDefined();
  });
});

// ── Collections Scheduler ─────────────────────────────────────────────────────

describe('Collections Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuery.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires runCollectionsForAllWorkspaces after the initial delay', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    startCollectionsScheduler();
    await advanceTimers(25 * 60 * 60 * 1000);

    expect(mockQuery).toHaveBeenCalled();
    const calls = mockQuery.mock.calls;
    const workspaceQuery = calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('subscriptions')
    );
    expect(workspaceQuery).toBeDefined();
  });
});

// ── Agent Cycle / Workflow Scheduler ─────────────────────────────────────────

describe('Engine Scheduler (workflow + agent cycle)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuery.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts without throwing and returns interval handles', () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = startScheduler();

    // startScheduler returns an object with workflowIntervalId and cycleIntervalId
    expect(result).toBeDefined();
    expect(result).toHaveProperty('workflowIntervalId');
    expect(result).toHaveProperty('cycleIntervalId');
  });

  it('advances workflows within the first 5-minute interval', async () => {
    // Workspace query used by workflowTick
    mockQuery.mockResolvedValue({ rows: [] });

    const { workflowIntervalId, cycleIntervalId } = startScheduler();

    // Advance past the first workflow interval (5 minutes)
    await advanceTimers(6 * 60 * 1000);

    expect(mockQuery).toHaveBeenCalled();

    clearInterval(workflowIntervalId);
    clearInterval(cycleIntervalId);
  });
});

// ── Direct runner function tests ──────────────────────────────────────────────
// These test the "all workspaces" runner independently of the scheduler wiring.

describe('runMorningBriefingForAllWorkspaces', () => {
  beforeEach(() => mockQuery.mockReset());

  it('queries active workspace subscriptions and attempts a briefing', async () => {
    // Workspace lookup: 1 active workspace
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ws-sched-1' }] });
    // generateMorningBriefing inner queries (9 parallel + 1 insert); return empties/counts
    mockQuery.mockResolvedValue({ rows: [{ name: 'Sched Test', count: '0' }] });

    await runMorningBriefingForAllWorkspaces();

    // Should have queried workspace subscriptions
    const subscriptionQuery = mockQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('subscriptions')
    );
    expect(subscriptionQuery).toBeDefined();
  });

  it('handles empty workspace list without throwing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(runMorningBriefingForAllWorkspaces()).resolves.not.toThrow();
  });
});

describe('runWeeklyReportForAllWorkspaces', () => {
  beforeEach(() => mockQuery.mockReset());

  it('queries active workspace subscriptions and attempts a report', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ws-sched-2' }] });
    mockQuery.mockResolvedValue({ rows: [{ name: 'Sched Biz', count: '0', revenue_collected: '0', revenue_pending: '0', revenue_overdue: '0', invoices_paid: '0', invoices_overdue: '0' }] });

    await runWeeklyReportForAllWorkspaces();

    const subscriptionQuery = mockQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('subscriptions')
    );
    expect(subscriptionQuery).toBeDefined();
  });

  it('handles empty workspace list without throwing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(runWeeklyReportForAllWorkspaces()).resolves.not.toThrow();
  });
});

describe('runCollectionsForAllWorkspaces', () => {
  beforeEach(() => mockQuery.mockReset());

  it('queries active workspace subscriptions and runs collections scan', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ws-sched-3' }] }); // workspace lookup
    mockQuery.mockResolvedValueOnce({ rows: [] }); // overdue invoices (collections scan)

    await runCollectionsForAllWorkspaces();

    const subscriptionQuery = mockQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('subscriptions')
    );
    expect(subscriptionQuery).toBeDefined();
  });

  it('handles empty workspace list without throwing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(runCollectionsForAllWorkspaces()).resolves.not.toThrow();
  });
});
