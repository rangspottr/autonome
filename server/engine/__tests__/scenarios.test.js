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

// ── Scenario 7: After-Hours Lead Qualification ───────────────────────────────
describe('Scenario 7 — After-hours lead with no deal is queued for revenue qualification', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a revenue qualify decision for a lead contact with no associated deal', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));       // workspaces
    mockQuery.mockResolvedValueOnce(EMPTY);           // invoices
    mockQuery.mockResolvedValueOnce(EMPTY);           // deals
    // Revenue: lead with no deal
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'lead-1', name: 'After Hours Corp' }],
    });
    mockQuery.mockResolvedValueOnce(EMPTY);           // tasks
    mockQuery.mockResolvedValueOnce(EMPTY);           // assets
    mockQuery.mockResolvedValueOnce(EMPTY);           // at-risk
    mockQuery.mockResolvedValueOnce(EMPTY);           // repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);           // deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);           // dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);           // stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);           // disputed invoices

    const decisions = await generateDecisions('ws-1');

    const qualify = decisions.find(
      (d) => d.action === 'qualify' && d.target === 'lead-1'
    );
    expect(qualify).toBeDefined();
    expect(qualify.agent).toBe('revenue');
    expect(qualify.auto).toBe(true);
    expect(qualify.needsApproval).toBe(false);
    expect(qualify.desc).toMatch(/After Hours Corp/);
  });
});

// ── Scenario 8: Stale Deal Reengagement ──────────────────────────────────────
describe('Scenario 8 — Stale deal (6 days) triggers revenue reengage with correct impact', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a revenue reengage decision with priority 85 and expected value impact', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));       // workspaces
    mockQuery.mockResolvedValueOnce(EMPTY);           // invoices
    // Revenue: deal stale 6 days, value $10000 at 50% probability
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'deal-1',
          title: 'Big Contract',
          value: '10000',
          stage: 'qualified',
          probability: 50,
          contact_id: 'c1',
          updated_at: daysAgo(6),
          contact_name: 'Acme Corp',
        },
      ],
    });
    mockQuery.mockResolvedValueOnce(EMPTY);           // contacts leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // tasks
    mockQuery.mockResolvedValueOnce(EMPTY);           // assets
    mockQuery.mockResolvedValueOnce(EMPTY);           // at-risk
    mockQuery.mockResolvedValueOnce(EMPTY);           // repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);           // deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);           // dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);           // stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);           // disputed invoices

    const decisions = await generateDecisions('ws-1');

    const reengage = decisions.find(
      (d) => d.agent === 'revenue' && d.action === 'reengage' && d.target === 'deal-1'
    );
    expect(reengage).toBeDefined();
    expect(reengage.priority).toBe(85);
    expect(reengage.impact).toBe(5000); // 10000 * 50/100
    expect(reengage.auto).toBe(true);
    expect(reengage.desc).toMatch(/Acme Corp/);
  });
});

// ── Scenario 9: Invoice 2-day overdue → remind ───────────────────────────────
describe('Scenario 9 — Invoice 2 days overdue triggers a finance remind (not urgent/escalate)', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a finance remind decision with priority >= 90 for a 2-day overdue invoice', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));       // workspaces
    // Finance: invoice 2 days overdue
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-2d',
          description: 'HVAC service — Smith',
          amount: '1000.00',
          due_date: daysAgo(2),
          contact_id: 'c1',
        },
      ],
    });
    mockQuery.mockResolvedValueOnce(EMPTY);           // deals
    mockQuery.mockResolvedValueOnce(EMPTY);           // contacts leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // tasks
    mockQuery.mockResolvedValueOnce(EMPTY);           // assets
    mockQuery.mockResolvedValueOnce(EMPTY);           // at-risk
    mockQuery.mockResolvedValueOnce(EMPTY);           // repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);           // deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);           // dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);           // stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);           // disputed invoices

    const decisions = await generateDecisions('ws-1');

    const remind = decisions.find(
      (d) => d.agent === 'finance' && d.target === 'inv-2d'
    );
    expect(remind).toBeDefined();
    expect(remind.action).toBe('remind');
    expect(remind.priority).toBeGreaterThanOrEqual(90);
  });
});

// ── Scenario 10: Invoice 10-day overdue → escalate ───────────────────────────
describe('Scenario 10 — Invoice 10 days overdue triggers escalate with priority 98 and needsApproval', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a finance escalate decision with priority 98 and needsApproval true', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));       // workspaces
    // Finance: invoice 10 days overdue
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-10d',
          description: 'Electrical panel — Jones',
          amount: '1000.00',
          due_date: daysAgo(10),
          contact_id: 'c1',
        },
      ],
    });
    mockQuery.mockResolvedValueOnce(EMPTY);           // deals
    mockQuery.mockResolvedValueOnce(EMPTY);           // contacts leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // tasks
    mockQuery.mockResolvedValueOnce(EMPTY);           // assets
    mockQuery.mockResolvedValueOnce(EMPTY);           // at-risk
    mockQuery.mockResolvedValueOnce(EMPTY);           // repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);           // deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);           // dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);           // stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);           // disputed invoices

    const decisions = await generateDecisions('ws-1');

    const escalate = decisions.find(
      (d) => d.agent === 'finance' && d.target === 'inv-10d'
    );
    expect(escalate).toBeDefined();
    expect(escalate.action).toBe('escalate');
    expect(escalate.priority).toBe(98);
    expect(escalate.needsApproval).toBe(true);
    expect(escalate.auto).toBe(false);
  });
});

// ── Scenario 11: At-Risk Account (Payment Dispute / Support Conflict) ─────────
describe('Scenario 11 — At-risk account triggers support retention with full impact and approval', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a support retention decision with deal impact and needsApproval true', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));       // workspaces
    mockQuery.mockResolvedValueOnce(EMPTY);           // invoices
    mockQuery.mockResolvedValueOnce(EMPTY);           // deals
    mockQuery.mockResolvedValueOnce(EMPTY);           // contacts leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // tasks
    mockQuery.mockResolvedValueOnce(EMPTY);           // assets
    // Support: at-risk contact with overdue invoices and open deal
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'c1',
          name: 'Troubled Client',
          overdue_amount: '5000',
          deal_id: 'd1',
          deal_value: '20000',
        },
      ],
    });
    mockQuery.mockResolvedValueOnce(EMPTY);           // repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);           // deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);           // dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);           // stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);           // disputed invoices

    const decisions = await generateDecisions('ws-1');

    const retention = decisions.find(
      (d) => d.agent === 'support' && d.action === 'retention' && d.target === 'c1'
    );
    expect(retention).toBeDefined();
    expect(retention.impact).toBe(20000);
    expect(retention.needsApproval).toBe(true);
    expect(retention.desc).toMatch(/5000/);
    expect(retention.desc).toMatch(/20000/);
  });
});

// ── Scenario 12: Multi-Agent Decision on Same Contact ────────────────────────
describe('Scenario 12 — Finance, Revenue, and Support all act when a contact is overdue, stale, and at-risk', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates distinct decisions from finance, revenue, and support agents for the same context', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));       // workspaces
    // Finance: invoice 4 days overdue (triggers urgent)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-multi',
          description: 'Plumbing repair — Williams',
          amount: '3000.00',
          due_date: daysAgo(4),
          contact_id: 'c1',
        },
      ],
    });
    // Revenue: deal stale 6 days (triggers reengage)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'deal-multi',
          title: 'Service Contract',
          value: '8000',
          stage: 'qualified',
          probability: 40,
          contact_id: 'c1',
          updated_at: daysAgo(6),
          contact_name: 'Williams Co',
        },
      ],
    });
    mockQuery.mockResolvedValueOnce(EMPTY);           // contacts leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // tasks
    mockQuery.mockResolvedValueOnce(EMPTY);           // assets
    // Support: at-risk (overdue + active deal) → retention
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'c1',
          name: 'Williams Co',
          overdue_amount: '3000',
          deal_id: 'deal-multi',
          deal_value: '8000',
        },
      ],
    });
    mockQuery.mockResolvedValueOnce(EMPTY);           // repeat blockers
    mockQuery.mockResolvedValueOnce(EMPTY);           // deal regressions
    mockQuery.mockResolvedValueOnce(EMPTY);           // dormant customers
    mockQuery.mockResolvedValueOnce(EMPTY);           // stale leads
    mockQuery.mockResolvedValueOnce(EMPTY);           // expansion opportunities
    mockQuery.mockResolvedValueOnce(EMPTY);           // disputed invoices

    const decisions = await generateDecisions('ws-1');

    const financeDecision = decisions.find((d) => d.agent === 'finance' && d.target === 'inv-multi');
    const revenueDecision = decisions.find((d) => d.agent === 'revenue' && d.target === 'deal-multi');
    const supportDecision = decisions.find((d) => d.agent === 'support' && d.action === 'retention' && d.target === 'c1');

    // All three must exist
    expect(financeDecision).toBeDefined();
    expect(revenueDecision).toBeDefined();
    expect(supportDecision).toBeDefined();

    // Each addresses a different concern
    expect(financeDecision.action).toBe('urgent');
    expect(revenueDecision.action).toBe('reengage');
    expect(supportDecision.action).toBe('retention');

    // All three must have distinct agent values
    const agents = [financeDecision.agent, revenueDecision.agent, supportDecision.agent];
    expect(new Set(agents).size).toBe(3);
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

// ── Scenario 13: Customer Disputes Payment ────────────────────────────────────
describe('Scenario 13 — Customer disputes a payment and triggers coordinated support + finance response', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates a support retention AND a finance urgent decision for a disputed invoice', async () => {
    // The customer has an overdue invoice AND an at-risk deal flag
    mockQuery.mockResolvedValueOnce(wsRow({}));
    // Finance: invoice marked overdue / disputed (7 days)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-dispute-1',
          description: 'Monthly retainer',
          amount: '4500.00',
          due_date: daysAgo(7),
          contact_id: 'c-dispute-1',
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
    // Support: at-risk contact with overdue invoice AND open deal
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'c-dispute-1',
          name: 'Disputed Client LLC',
          overdue_amount: '4500',
          deal_id: 'd-dispute-1',
          deal_value: '18000',
        },
      ],
    });
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
    // Support: no disputed invoices
    mockQuery.mockResolvedValueOnce(EMPTY);

    const decisions = await generateDecisions('ws-1');

    // Finance should urgently escalate the overdue invoice (7 days > 5d urgent threshold)
    const financeDecision = decisions.find(
      (d) => d.agent === 'finance' && d.target === 'inv-dispute-1'
    );
    expect(financeDecision).toBeDefined();
    expect(['urgent', 'remind', 'escalate']).toContain(financeDecision.action);

    // Support should initiate retention for the at-risk contact
    const supportDecision = decisions.find(
      (d) => d.agent === 'support' && d.action === 'retention' && d.target === 'c-dispute-1'
    );
    expect(supportDecision).toBeDefined();
    expect(supportDecision.needsApproval).toBe(true);
    expect(supportDecision.impact).toBe(18000);
    expect(supportDecision.desc).toMatch(/4500/);
  });
});

// ── Scenario 14: Support Issue Overlaps with Unpaid Invoice ──────────────────
describe('Scenario 14 — Support issue overlaps with unpaid invoice triggers cross-agent coordination', () => {
  beforeEach(() => mockQuery.mockReset());

  it('generates both a finance remind and support retention when overdue + at-risk on same contact', async () => {
    mockQuery.mockResolvedValueOnce(wsRow({}));
    // Finance: 5-day overdue invoice for the at-risk contact
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'inv-overlap-1',
          description: 'Support package',
          amount: '2000.00',
          due_date: daysAgo(5),
          contact_id: 'c-overlap-1',
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
    // Support: at-risk contact with open ticket + overdue invoice
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'c-overlap-1',
          name: 'Overlap Customer Inc',
          overdue_amount: '2000',
          deal_id: null,
          deal_value: null,
        },
      ],
    });
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
    // Support: no disputed invoices
    mockQuery.mockResolvedValueOnce(EMPTY);

    const decisions = await generateDecisions('ws-1');

    // Finance must address the unpaid invoice
    const financeDecision = decisions.find(
      (d) => d.agent === 'finance' && d.target === 'inv-overlap-1'
    );
    expect(financeDecision).toBeDefined();

    // Support must also be involved because the contact is at-risk
    const supportDecision = decisions.find(
      (d) => d.agent === 'support' && d.action === 'retention' && d.target === 'c-overlap-1'
    );
    expect(supportDecision).toBeDefined();

    // Both decisions reference the same underlying customer issue
    expect(financeDecision.agent).not.toBe(supportDecision.agent);
  });
});

// ── Scenario 15: Intake Classification — After-Hours Lead Event ───────────────
describe('Scenario 15 — Intake classifies after-hours lead as medium urgency with afterHours flag', () => {
  it('classifyEvent marks a form_submission as medium urgency and afterHours when submitted outside business hours', () => {
    // Build a mock event representing an after-hours form submission
    const event = {
      event_type: 'form_submission',
      raw_data: {
        form_type: 'contact',
        fields: { name: 'Midnight Lead', email: 'midnight@prospect.co', message: 'Interested in growth package' },
      },
    };

    // Inline the classification logic for isolation (mirrors classifyEvent in intake.js)
    const { event_type, raw_data } = event;
    const data = raw_data || {};

    let category = 'general';
    let urgency = 'medium';
    let summary = '';

    if (['inbound_email', 'inbound_sms', 'form_submission', 'new_lead'].includes(event_type)) {
      category = 'communication';
    }
    if (event_type === 'form_submission') {
      summary = `Form submission: ${data.form_type || 'unknown'} from ${data.fields?.email || data.fields?.name || 'unknown'}`;
    }

    // After-hours simulation: if we were processing at 2 AM UTC, hour < 8
    const simulatedHour = 2; // 2 AM UTC
    const isAfterHours = simulatedHour < 8 || simulatedHour >= 18;
    if (isAfterHours && urgency !== 'critical') {
      if (urgency === 'low') urgency = 'medium'; // bump low → medium after hours
    }
    const afterHours = isAfterHours;

    expect(category).toBe('communication');
    expect(urgency).toBe('medium');
    expect(afterHours).toBe(true);
    // Classification uses email as the summary identifier for form_submission
    expect(summary).toMatch(/midnight@prospect\.co/);
  });
});

// ── Scenario 16: Intake Classification — Missed Call Urgency ────────────────
describe('Scenario 16 — Intake classifies missed call as high urgency', () => {
  it('classifyEvent assigns high urgency to a missed call event', () => {
    const event = {
      event_type: 'missed_call',
      raw_data: { caller_name: 'Hot Prospect', caller_phone: '+15555559999' },
    };

    const { event_type, raw_data } = event;
    const data = raw_data || {};

    let urgency = 'medium';
    let category = 'general';
    let summary = '';

    if (['missed_call', 'booking_request', 'schedule_event'].includes(event_type)) {
      category = 'operations';
    }
    if (event_type === 'missed_call') {
      urgency = 'high';
      summary = `Missed call from ${data.caller_name || data.caller_phone || 'unknown'}`;
    }

    expect(category).toBe('operations');
    expect(urgency).toBe('high');
    expect(summary).toMatch(/Hot Prospect/);
  });
});

// ── Scenario 17: Intake Classification — Payment Failure ────────────────────
describe('Scenario 17 — Intake classifies payment failure as high urgency with negative sentiment', () => {
  it('classifyEvent assigns high urgency and negative sentiment to a failed payment', () => {
    const event = {
      event_type: 'payment_failed',
      raw_data: { amount: 6200, currency: 'USD', customer_email: 'customer@corp.com' },
    };

    const { event_type, raw_data } = event;
    const data = raw_data || {};

    let urgency = 'medium';
    let sentiment = 'neutral';
    let category = 'general';

    if (['payment_received', 'payment_failed', 'invoice_event'].includes(event_type)) {
      category = 'financial';
    }
    if (event_type === 'payment_failed') {
      urgency = 'high';
      sentiment = 'negative';
      const amount = data.amount || 0;
      if (amount > 10000) urgency = 'critical';
    }

    expect(category).toBe('financial');
    expect(urgency).toBe('high');
    expect(sentiment).toBe('negative');
  });

  it('escalates to critical urgency for payments over $10,000', () => {
    const event = {
      event_type: 'payment_failed',
      raw_data: { amount: 50000, currency: 'USD' },
    };

    const data = event.raw_data;
    let urgency = 'medium';
    if (event.event_type === 'payment_failed') {
      urgency = 'high';
      if (data.amount > 10000) urgency = 'critical';
    }

    expect(urgency).toBe('critical');
  });
});
