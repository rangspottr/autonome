import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB pool ──────────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock('../../db/index.js', () => ({ pool: { query: mockQuery } }));

const { generateDecisions, buildDisputeDecision } = await import('../decisions.js');
const { detectConflict, executeAction } = await import('../execution.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a workspace settings query response.
 */
function wsRow(settings = {}) {
  return { rows: [{ settings }] };
}

/**
 * Empty result (no rows).
 */
const EMPTY = { rows: [] };

/**
 * Date offset helper — returns an ISO string N days in the past.
 */
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// ── Scenario 1: Missed Calls ──────────────────────────────────────────────────
describe('Scenario 1 — Missed calls create a follow-up task decision', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates an operations escalate decision for an overdue follow-up task', async () => {
    // Workspace settings
    mockQuery.mockResolvedValueOnce(wsRow({}));
    // Finance: no pending invoices
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Revenue: no stale deals
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Revenue: no unqualified leads
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Operations: overdue task representing a missed call follow-up
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'task-missed-call-1', title: 'Return missed call from Johnson' }],
    });
    // Operations: no assets below reorder point
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no at-risk accounts
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no disputed invoices (queried last in generateDecisions)
    mockQuery.mockResolvedValueOnce(EMPTY);

    const decisions = await generateDecisions('ws-1');

    const escalation = decisions.find(
      (d) => d.agent === 'operations' && d.action === 'escalate' && d.target === 'task-missed-call-1'
    );
    expect(escalation).toBeDefined();
    expect(escalation.desc).toMatch(/Return missed call from Johnson/);
  });
});

// ── Scenario 2: After-hours leads ────────────────────────────────────────────
describe('Scenario 2 — After-hours leads are queued for outreach', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a growth outreach decision for a lead with no prior contact', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));
    // Finance: no pending invoices
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Revenue: no stale deals
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Revenue: no unqualified leads
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Operations: no overdue tasks
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Operations: no asset reorders
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no at-risk accounts
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: stale lead created after-hours, 8 days ago with no agent outreach
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'contact-afterhours-1', name: 'Martinez Residence', days_since_added: 8 }],
    });
    // Growth: no expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no disputed invoices (queried last in generateDecisions)
    mockQuery.mockResolvedValueOnce(EMPTY);

    const decisions = await generateDecisions('ws-1');

    const outreach = decisions.find(
      (d) => d.agent === 'growth' && d.action === 'outreach' && d.target === 'contact-afterhours-1'
    );
    expect(outreach).toBeDefined();
    expect(outreach.auto).toBe(true);
    expect(outreach.needsApproval).toBe(false);
    expect(outreach.desc).toMatch(/Martinez Residence/);
  });
});

// ── Scenario 3: Invoice Escalation ───────────────────────────────────────────
describe('Scenario 3 — Invoice 8+ days overdue triggers escalation, not just a reminder', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a finance escalate decision (not remind or urgent) for an 8-day overdue invoice', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));
    // Finance: invoice 8 days overdue
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-overdue-8d',
          description: 'Roof replacement — Johnson',
          amount: '4500.00',
          due_date: daysAgo(8),
          contact_id: 'contact-1',
        },
      ],
    });
    // Revenue: no stale deals
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Revenue: no unqualified leads
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Operations: no overdue tasks
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Operations: no asset reorders
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no at-risk accounts
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no disputed invoices
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);

    const decisions = await generateDecisions('ws-1');

    const financeDecisions = decisions.filter((d) => d.agent === 'finance' && d.target === 'inv-overdue-8d');
    expect(financeDecisions).toHaveLength(1);

    const decision = financeDecisions[0];
    expect(decision.action).toBe('escalate');
    expect(decision.needsApproval).toBe(true);
    expect(decision.priority).toBeGreaterThanOrEqual(96);
    // Must NOT be remind (0-3d) or urgent (3-7d)
    expect(decision.action).not.toBe('remind');
    expect(decision.action).not.toBe('urgent');
  });

  it('generates urgent (not escalate) for a 5-day overdue invoice', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-overdue-5d',
          description: 'AC install — Thompson',
          amount: '6500.00',
          due_date: daysAgo(5),
          contact_id: 'contact-2',
        },
      ],
    });
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);
    mockQuery.mockResolvedValueOnce(EMPTY);

    const decisions = await generateDecisions('ws-1');
    const decision = decisions.find((d) => d.agent === 'finance' && d.target === 'inv-overdue-5d');
    expect(decision).toBeDefined();
    expect(decision.action).toBe('urgent');
  });
});

// ── Scenario 4: Payment Disputes ─────────────────────────────────────────────
describe('Scenario 4 — Disputed invoice is flagged by support agent', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a support flag_dispute decision for a disputed invoice', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));
    // Finance: no pending invoices
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Revenue: no stale deals
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Revenue: no unqualified leads
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Operations: no overdue tasks
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Operations: no asset reorders
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no at-risk accounts
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: no deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Growth: no expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);
    // Support: disputed invoice (queried last in generateDecisions)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-disputed-1',
          description: 'Solar install — Anderson',
          amount: '32000.00',
          contact_id: 'contact-3',
        },
      ],
    });

    const decisions = await generateDecisions('ws-1');

    const dispute = decisions.find(
      (d) => d.agent === 'support' && d.action === 'flag_dispute' && d.target === 'inv-disputed-1'
    );
    expect(dispute).toBeDefined();
    expect(dispute.needsApproval).toBe(true);
    expect(dispute.priority).toBeGreaterThanOrEqual(96);
    expect(dispute.desc).toMatch(/disputed/i);
  });

  it('buildDisputeDecision returns a well-formed support flag decision', () => {
    const decision = buildDisputeDecision({
      id: 'inv-test-1',
      description: 'Plumbing repair',
      amount: '1200.00',
    });
    expect(decision.agent).toBe('support');
    expect(decision.action).toBe('flag_dispute');
    expect(decision.needsApproval).toBe(true);
    expect(decision.auto).toBe(false);
    expect(decision.impact).toBe(1200);
  });
});

// ── Scenario 5: Support Conflict ─────────────────────────────────────────────
describe('Scenario 5 — Two agents acting on the same entity are detected as a conflict', () => {
  beforeEach(() => mockQuery.mockReset());

  it('detectConflict returns conflict=true when another agent acted on the same entity', async () => {
    // Mock: another agent (support) already has a pending action on this entity
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          agent: 'support',
          action_type: 'retention',
          description: 'Support retention outreach sent',
          created_at: new Date().toISOString(),
        },
      ],
    });

    const result = await detectConflict('ws-1', 'finance', 'remind', 'contact-entity-1');
    expect(result.conflict).toBe(true);
    expect(result.conflictingAgent).toBe('support');
    expect(result.conflictingAction).toBe('retention');
  });

  it('detectConflict returns conflict=false when no other agents acted on the entity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await detectConflict('ws-1', 'finance', 'remind', 'contact-entity-2');
    expect(result.conflict).toBe(false);
  });

  it('detectConflict returns conflict=false when entityId is null', async () => {
    const result = await detectConflict('ws-1', 'revenue', 'qualify', null);
    expect(result.conflict).toBe(false);
  });

  it('executeAction returns conflict=true and skips execution when conflict is detected', async () => {
    // detectConflict query: conflicting agent found
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          agent: 'revenue',
          action_type: 'reengage',
          description: 'Revenue re-engagement in progress',
          created_at: new Date().toISOString(),
        },
      ],
    });
    // audit_log insert (non-fatal)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // tasks insert for conflict alert (non-fatal)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const decision = {
      agent: 'support',
      action: 'retention',
      target: 'contact-entity-3',
      contactId: 'contact-entity-3',
      desc: 'Support retention outreach',
      impact: 0,
    };

    const result = await executeAction('ws-1', decision);
    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
  });
});

// ── Scenario 6: Owner-Away Continuity ────────────────────────────────────────
describe('Scenario 6 — Owner-away mode auto-executes pre-approved action types', () => {
  it('pre-approved action types skip needsApproval when ownerAwayMode is true', () => {
    // Replicate the filtering logic from runAgentCycle for isolated unit testing
    const ownerAwayMode = true;
    const limits = { maxAutoSpend: 500 };
    const ownerAwayAutoActions = ['remind', 'pre', 'followup', 'reactivate', 'outreach', 'follow_up_open_issue', 'nurture_lead'];

    const decisions = [
      { id: 'd1', agent: 'finance', action: 'remind', auto: true, needsApproval: false, impact: 200 },
      { id: 'd2', agent: 'growth', action: 'outreach', auto: true, needsApproval: false, impact: 0 },
      // This one normally needs approval but should be allowed in owner-away for pre-approved types
      { id: 'd3', agent: 'revenue', action: 'reactivate', auto: true, needsApproval: true, impact: 100 },
      // This one needs approval and is NOT a pre-approved type — should stay blocked
      { id: 'd4', agent: 'finance', action: 'escalate', auto: false, needsApproval: true, impact: 9000 },
      // This one exceeds even the 2x owner-away threshold
      { id: 'd5', agent: 'revenue', action: 'close', auto: false, needsApproval: true, impact: 50000 },
    ];

    const baseThreshold = limits.maxAutoSpend;
    const threshold = ownerAwayMode ? baseThreshold * 2 : baseThreshold;

    const autoExecutable = decisions.filter((d) => {
      if (!d.auto && !ownerAwayMode) return false;
      if (d.impact && parseFloat(d.impact) > threshold) {
        d.needsApproval = true;
        return false;
      }
      if (ownerAwayMode && d.needsApproval) {
        if (ownerAwayAutoActions.includes(d.action)) {
          d.needsApproval = false;
          return true;
        }
        return false;
      }
      if (d.needsApproval) return false;
      return true;
    });

    const ids = autoExecutable.map((d) => d.id);

    // remind and outreach are auto + no approval → always execute
    expect(ids).toContain('d1');
    expect(ids).toContain('d2');
    // reactivate was needsApproval but is a pre-approved type → unlocked by owner-away
    expect(ids).toContain('d3');
    // escalate is NOT a pre-approved type → still blocked
    expect(ids).not.toContain('d4');
    // close has impact > 2x threshold → still blocked
    expect(ids).not.toContain('d5');
  });

  it('normal mode (ownerAwayMode=false) does NOT auto-execute needsApproval decisions', () => {
    const ownerAwayMode = false;
    const ownerAwayAutoActions = ['remind', 'pre', 'followup', 'reactivate', 'outreach', 'follow_up_open_issue', 'nurture_lead'];

    const decisions = [
      { id: 'd1', agent: 'growth', action: 'reactivate', auto: true, needsApproval: true, impact: 0 },
    ];

    const autoExecutable = decisions.filter((d) => {
      if (!d.auto && !ownerAwayMode) return false;
      if (ownerAwayMode && d.needsApproval) {
        if (ownerAwayAutoActions.includes(d.action)) {
          d.needsApproval = false;
          return true;
        }
        return false;
      }
      if (d.needsApproval) return false;
      return true;
    });

    // In normal mode, needsApproval=true is NOT auto-executed even for pre-approved types
    expect(autoExecutable).toHaveLength(0);
  });
});
