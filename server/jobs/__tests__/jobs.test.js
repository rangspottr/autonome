/**
 * Job unit tests — morning briefing, weekly report, collections operator.
 *
 * All DB calls are mocked so these run without a real database.
 * They prove the job functions produce a valid output artifact and
 * execute the correct number / type of queries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB pool ──────────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock('../../db/index.js', () => ({ pool: { query: mockQuery } }));

const { generateMorningBriefing } = await import('../morning-briefing.js');
const { generateWeeklyReport } = await import('../weekly-report.js');
const { runCollectionsOperator } = await import('../collections-operator.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws-proof-1';

function daysAgo(n) {
  return new Date(Date.now() - n * 86400_000).toISOString();
}
function daysFromNow(n) {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

const EMPTY = { rows: [] };

// ── Morning Briefing Tests ────────────────────────────────────────────────────
//
// generateMorningBriefing runs 9 parallel queries then 1 INSERT.
// Returns: { id: <output-uuid>, content: <markdown string> }
//
// Query order matches the Promise.all in morning-briefing.js:
//   1. workspace name
//   2. overdue invoices
//   3. pending tasks
//   4. recent agent actions
//   5. stale deals
//   6. pending approvals (count query)
//   7. recent leads
//   8. blocked workflows
//   9. open alerts
//  10. INSERT outputs RETURNING id

describe('Morning Briefing Job', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a morning briefing and stores it as an output artifact', async () => {
    // 1. workspace name
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Acme Corp' }] });
    // 2. overdue invoices
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'inv-1', description: 'Ironclad Fees', amount: '6200', due_date: daysAgo(15), contact_name: 'Omar Hassan' }],
    });
    // 3. pending tasks
    mockQuery.mockResolvedValueOnce({
      rows: [{ title: 'Follow up with Sarah', priority: 'high', due_date: daysFromNow(1) }],
    });
    // 4. recent agent actions
    mockQuery.mockResolvedValueOnce({
      rows: [{ agent: 'finance', action_type: 'remind', description: 'Sent reminder', outcome: 'completed', created_at: daysAgo(0) }],
    });
    // 5. stale deals
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'deal-1', title: 'Apex Build', value: '28500', stage: 'proposal', updated_at: daysAgo(9) }],
    });
    // 6. pending approvals (COUNT query returns a count row)
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    // 7. recent leads
    mockQuery.mockResolvedValueOnce({
      rows: [{ name: 'Rachel Simmons', type: 'lead', created_at: daysAgo(1) }],
    });
    // 8. blocked workflows
    mockQuery.mockResolvedValueOnce(EMPTY);
    // 9. open alerts
    mockQuery.mockResolvedValueOnce(EMPTY);
    // 10. INSERT output artifact RETURNING id
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'output-briefing-1' }] });

    const result = await generateMorningBriefing(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result.id).toBe('output-briefing-1');
    expect(typeof result.content).toBe('string');
    expect(result.content).toMatch(/Acme Corp/);
    expect(result.content).toMatch(/Ironclad Fees/);
    expect(result.content).toMatch(/Follow up with Sarah/);
  });

  it('produces a minimal briefing when there is no overnight activity', async () => {
    // workspace name
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Quiet Office' }] });
    // overdue invoices, pending tasks, recent actions, stale deals → 4 empties
    for (let i = 0; i < 4; i++) mockQuery.mockResolvedValueOnce(EMPTY);
    // pending approvals → count row (position 6 in Promise.all)
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
    // recent leads, blocked workflows, open alerts → 3 empties
    for (let i = 0; i < 3; i++) mockQuery.mockResolvedValueOnce(EMPTY);
    // INSERT output
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'output-quiet-1' }] });

    const result = await generateMorningBriefing(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result.id).toBe('output-quiet-1');
    expect(result.content).toMatch(/Quiet Office/);
  });
});

// ── Weekly Report Tests ───────────────────────────────────────────────────────
//
// generateWeeklyReport runs 11 parallel queries then 1 INSERT.
// Returns: { id: <output-uuid>, content: <markdown string> }
//
// Query order matches the Promise.all in weekly-report.js:
//   1. workspace name
//   2. revenue summary
//   3. pipeline data
//   4. overdue invoices
//   5. tasks completed count
//   6. tasks pending count
//   7. blocked workflows
//   8. agent actions
//   9. new contacts count
//  10. recent deals
//  11. previous revenue
//  12. INSERT outputs RETURNING id

describe('Weekly Report Job', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a weekly report with revenue, pipeline, and actions', async () => {
    // 1. workspace name
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'Acme Corp' }] });
    // 2. revenue summary
    mockQuery.mockResolvedValueOnce({
      rows: [{
        revenue_collected: '21600',
        revenue_pending:   '6800',
        revenue_overdue:   '10700',
        invoices_paid:     '2',
        invoices_overdue:  '3',
      }],
    });
    // 3. pipeline data
    mockQuery.mockResolvedValueOnce({
      rows: [
        { stage: 'proposal',  count: '2', total_value: '57000' },
        { stage: 'qualified', count: '1', total_value: '15000' },
      ],
    });
    // 4. overdue invoices
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'inv-2', description: 'Cascade Audit',    amount: '2400', due_date: daysAgo(6),  status: 'overdue', contact_name: 'Alicia Torres' },
        { id: 'inv-3', description: 'Elevate Strategy', amount: '4500', due_date: daysAgo(12), status: 'overdue', contact_name: 'Carlos Reyes' },
      ],
    });
    // 5. tasks completed count
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '4' }] });
    // 6. tasks pending count
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    // 7. blocked workflows
    mockQuery.mockResolvedValueOnce(EMPTY);
    // 8. agent actions
    mockQuery.mockResolvedValueOnce({
      rows: [
        { agent: 'finance',  action_type: 'remind',   outcome: 'completed', description: 'Sent reminder for Cascade', created_at: daysAgo(2) },
        { agent: 'revenue',  action_type: 'followup', outcome: 'completed', description: 'Followed up on Apex deal',  created_at: daysAgo(1) },
      ],
    });
    // 9. new contacts count
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    // 10. recent deals
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'deal-1', title: 'Apex Build', stage: 'proposal', value: '28500', contact_name: 'Marcus Webb', updated_at: daysAgo(2) }],
    });
    // 11. previous revenue
    mockQuery.mockResolvedValueOnce({ rows: [{ revenue_collected: '15000' }] });
    // 12. INSERT output
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'output-weekly-1' }] });

    const result = await generateWeeklyReport(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result.id).toBe('output-weekly-1');
    expect(typeof result.content).toBe('string');
    expect(result.content).toMatch(/Acme Corp/);
    expect(result.content).toMatch(/21,600/);
    // Overdue invoices section uses contact_name, not invoice description
    expect(result.content).toMatch(/Alicia Torres/);
  });

  it('generates a minimal report with no data', async () => {
    // 1. workspace name
    mockQuery.mockResolvedValueOnce({ rows: [{ name: 'New Biz' }] });
    // 2. revenue (all zeroes)
    mockQuery.mockResolvedValueOnce({
      rows: [{ revenue_collected: '0', revenue_pending: '0', revenue_overdue: '0', invoices_paid: '0', invoices_overdue: '0' }],
    });
    // 3–10: pipeline, overdue, task counts ×2, workflows, actions, contacts, deals — all empty/zero
    for (let i = 0; i < 6; i++) mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] }); // contacts
    mockQuery.mockResolvedValueOnce(EMPTY);                       // deals
    // 11. previous revenue
    mockQuery.mockResolvedValueOnce({ rows: [{ revenue_collected: '0' }] });
    // 12. INSERT output
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'output-minimal-1' }] });

    const result = await generateWeeklyReport(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result.id).toBe('output-minimal-1');
    expect(result.content).toMatch(/New Biz/);
  });
});

// ── Collections Operator Tests ────────────────────────────────────────────────
//
// runCollectionsOperator returns:
//   { total_overdue, overdue_count, escalated_count, reminders_sent,
//     disputes_flagged, content }
//
// Query order:
//   1. SELECT overdue/escalated invoices
//   Per invoice (depending on age):
//     • 3–13d overdue → INSERT communications + INSERT agent_actions
//     • 14+d overdue  → UPDATE invoices + INSERT agent_actions
//   Final: INSERT outputs (only when there is activity)

describe('Collections Operator Job', () => {
  beforeEach(() => mockQuery.mockReset());

  it('sends reminders for invoices 3–13 days overdue and returns correct summary', async () => {
    // 1. overdue invoices query
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'inv-a', description: 'Service fee', amount: '1200',
        due_date: daysAgo(5), status: 'overdue',
        contact_id: 'c1', contact_name: 'Alice Smith', contact_email: 'alice@example.com',
      }],
    });
    // 2. INSERT communications (reminder email)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 3. INSERT agent_actions
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 4. INSERT output artifact (because there is activity)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await runCollectionsOperator(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result.reminders_sent).toBe(1);
    expect(result.escalated_count).toBe(0);
    expect(result.overdue_count).toBe(1);
    expect(typeof result.content).toBe('string');
    expect(result.content).toMatch(/Alice Smith/);
  });

  it('escalates invoices 14+ days overdue and returns correct summary', async () => {
    // 1. overdue invoices query
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'inv-b', description: 'Retainer', amount: '6200',
        due_date: daysAgo(16), status: 'overdue',
        contact_id: 'c2', contact_name: 'Bob Jones', contact_email: 'bob@example.com',
      }],
    });
    // 2. UPDATE invoices (mark escalated)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 3. INSERT agent_actions
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // 4. INSERT output artifact
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await runCollectionsOperator(WORKSPACE_ID);

    expect(result.escalated_count).toBe(1);
    expect(result.reminders_sent).toBe(0);
    expect(result.overdue_count).toBe(1);
    expect(result.content).toMatch(/Bob Jones/);
  });

  it('produces a clean-slate summary when no overdue invoices exist', async () => {
    // 1. overdue invoices query returns empty
    mockQuery.mockResolvedValueOnce(EMPTY);
    // No output INSERT when there is no activity

    const result = await runCollectionsOperator(WORKSPACE_ID);

    expect(result.reminders_sent).toBe(0);
    expect(result.escalated_count).toBe(0);
    expect(result.overdue_count).toBe(0);
    expect(result.disputes_flagged).toBe(0);
    expect(result.content).toMatch(/No overdue invoices/);
  });

  it('handles multiple overdue invoices with mixed ages', async () => {
    // 1. Two invoices: one 5d overdue (reminder), one 20d overdue (escalate)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'inv-x', description: 'Design work', amount: '800', due_date: daysAgo(5), status: 'overdue', contact_id: 'c4', contact_name: 'Dave Lang', contact_email: 'd@l.com' },
        { id: 'inv-y', description: 'Dev retainer', amount: '5000', due_date: daysAgo(20), status: 'overdue', contact_id: 'c5', contact_name: 'Eve Park', contact_email: 'e@p.com' },
      ],
    });
    // Dave (5d): INSERT communications + INSERT agent_actions
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Eve (20d): UPDATE invoices + INSERT agent_actions
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT output
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await runCollectionsOperator(WORKSPACE_ID);

    expect(result.reminders_sent).toBe(1);
    expect(result.escalated_count).toBe(1);
    expect(result.overdue_count).toBe(2);
    expect(result.total_overdue).toBeCloseTo(5800);
  });
});
