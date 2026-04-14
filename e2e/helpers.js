/**
 * E2E test helpers — shared mocks and fixtures for all Playwright tests.
 *
 * These helpers set up realistic API mocks so every test runs
 * deterministically without a live server or database.
 */

// ── JWT token fixture ─────────────────────────────────────────────────────────
export const DEMO_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXItMSIsImVtYWlsIjoiZGVtb0BhY21lY29ycC5jb20ifQ.demo_signature';
export const DEMO_WORKSPACE_ID = 'ws-demo-1';
export const DEMO_USER = { id: 'user-1', email: 'demo@acmecorp.com', name: 'Alex Owner', email_verified: true };
export const DEMO_WORKSPACE = {
  id: DEMO_WORKSPACE_ID,
  name: 'Acme Corp',
  onboarding_completed: true,
  industry: 'professional_services',
  subscription_status: 'active',
  // settings.setupCompleted prevents the setup wizard overlay
  settings: { setupCompleted: true, webhook_api_key: 'enc:demokey123' },
  created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
};

// ── Fixture helpers ───────────────────────────────────────────────────────────
export function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}
export function daysFromNow(n) {
  return new Date(Date.now() + n * 86400000).toISOString();
}

// ── Seed fixtures ─────────────────────────────────────────────────────────────

export const SEED = {
  contacts: [
    { id: 'c1', name: 'Sarah Chen', email: 'sarah@meridianconsulting.com', type: 'customer', company: 'Meridian Consulting', created_at: daysAgo(25) },
    { id: 'c2', name: 'Marcus Webb', email: 'marcus@apexdigital.io', type: 'prospect', company: 'Apex Digital', created_at: daysAgo(15) },
    { id: 'c3', name: 'Omar Hassan', email: 'omar@ironclad.industries', type: 'customer', company: 'Ironclad Industries', created_at: daysAgo(60) },
    { id: 'c4', name: 'Alicia Torres', email: 'alicia@cascadegroup.com', type: 'customer', company: 'Cascade Group', created_at: daysAgo(45) },
    { id: 'c5', name: 'Rachel Simmons', email: 'rachel@novatech.co', type: 'lead', company: 'NovaTech', created_at: daysAgo(2) },
  ],
  deals: [
    { id: 'd1', title: 'Meridian Q3 Retainer', value: 8400, stage: 'won', contact_id: 'c1', contact_name: 'Sarah Chen', expected_close: daysAgo(5), updated_at: daysAgo(5) },
    { id: 'd2', title: 'Apex Digital Platform Build', value: 28500, stage: 'proposal', contact_id: 'c2', contact_name: 'Marcus Webb', expected_close: daysFromNow(14), updated_at: daysAgo(8) },
    { id: 'd3', title: 'Ironclad Industries Retainer', value: 6200, stage: 'qualified', contact_id: 'c3', contact_name: 'Omar Hassan', expected_close: daysFromNow(7), updated_at: daysAgo(3) },
  ],
  invoices: [
    { id: 'inv1', description: 'Meridian Q3 Retainer — Phase 1', amount: 8400, status: 'paid', contact_id: 'c1', contact_name: 'Sarah Chen', due_date: daysAgo(10), updated_at: daysAgo(10) },
    { id: 'inv2', description: 'Ironclad Industries Consulting', amount: 6200, status: 'overdue', contact_id: 'c3', contact_name: 'Omar Hassan', due_date: daysAgo(15), updated_at: daysAgo(15) },
    { id: 'inv3', description: 'Cascade Group Audit', amount: 2400, status: 'overdue', contact_id: 'c4', contact_name: 'Alicia Torres', due_date: daysAgo(6), updated_at: daysAgo(6) },
    { id: 'inv4', description: 'Apex Digital Phase 1 Deposit', amount: 5700, status: 'sent', contact_id: 'c2', contact_name: 'Marcus Webb', due_date: daysFromNow(5), updated_at: daysAgo(2) },
  ],
  tasks: [
    { id: 't1', title: 'Follow up with Marcus Webb on Apex proposal', status: 'pending', priority: 'high', due_date: daysFromNow(1), contact_name: 'Marcus Webb', assigned_agent: 'revenue' },
    { id: 't2', title: 'Send invoice reminder — Ironclad Industries', status: 'pending', priority: 'high', due_date: daysAgo(1), contact_name: 'Omar Hassan', assigned_agent: 'finance' },
    { id: 't3', title: 'Prepare onboarding docs — Meridian Q3', status: 'completed', priority: 'medium', due_date: daysAgo(3), contact_name: 'Sarah Chen', assigned_agent: 'operations' },
  ],
  outputs: [
    {
      id: 'out1',
      title: 'Morning Briefing — Monday, April 14, 2026',
      output_type: 'morning_briefing',
      created_at: daysAgo(0),
      period_start: daysAgo(1),
      period_end: daysAgo(0),
      content: '# Morning Briefing\n\nGood morning, Acme Corp. Here\'s what needs your attention today.\n\n## Overdue Invoices\n• **Omar Hassan** — $6,200 (15d overdue)\n• **Alicia Torres** — $2,400 (6d overdue)\n\n## Pending Tasks\n• Follow up with Marcus Webb on Apex proposal (HIGH)\n\n## Agent Activity\n**Finance:** Sent reminder to Omar Hassan\n**Revenue:** Followed up on Apex deal',
    },
    {
      id: 'out2',
      title: 'Weekly Owner Report — Week of April 7–14, 2026',
      output_type: 'weekly_report',
      created_at: daysAgo(0),
      period_start: daysAgo(7),
      period_end: daysAgo(0),
      content: '# Weekly Owner Report\n\n## Revenue Summary\n💰 Collected: $8,400\n🔴 Overdue: $8,600\n\n## Pipeline\n• Apex Digital Platform Build — $28,500 (proposal)\n\n## Agent Actions\nFinance: 3 actions | Revenue: 2 actions',
    },
    {
      id: 'out3',
      title: 'Collections Summary — Monday, April 14, 2026',
      output_type: 'collections_summary',
      created_at: daysAgo(0),
      period_start: daysAgo(1),
      period_end: daysAgo(0),
      content: '# Collections Summary\n\n## Cash Risk Overview\n💰 Total overdue: $8,600 across 2 invoices\n🔴 Escalated (14+ days): $6,200\n🟡 At risk (3–13 days): $2,400\n\n## Actions Taken\nReminders queued: 1\nEscalations: 1',
    },
  ],
  agentActions: [
    { id: 'aa1', agent: 'finance', action_type: 'remind', outcome: 'completed', description: 'Sent payment reminder to Omar Hassan', entity_type: 'invoice', entity_id: 'inv2', created_at: daysAgo(0) },
    { id: 'aa2', agent: 'revenue', action_type: 'followup', outcome: 'completed', description: 'Sent follow-up email to Marcus Webb', entity_type: 'deal', entity_id: 'd2', created_at: daysAgo(1) },
    { id: 'aa3', agent: 'finance', action_type: 'escalate', outcome: 'pending', description: 'Escalate Ironclad Industries overdue invoice', entity_type: 'invoice', entity_id: 'inv2', created_at: daysAgo(0) },
  ],
  approvals: [
    { id: 'ap1', agent: 'finance', action_type: 'escalate', outcome: 'pending', description: 'Escalate Ironclad Industries overdue invoice — $6,200 outstanding', entity_type: 'invoice', entity_id: 'inv2', metadata: { impact: 6200 }, created_at: daysAgo(0) },
    { id: 'ap2', agent: 'support', action_type: 'retention', outcome: 'pending', description: 'Initiate retention outreach for Omar Hassan — at-risk account', entity_type: 'contact', entity_id: 'c3', metadata: { impact: 12400 }, created_at: daysAgo(0) },
  ],
  alerts: [
    { id: 'alt1', severity: 'high', title: '$6,200 invoice overdue 15 days — Ironclad Industries', status: 'active', created_at: daysAgo(0) },
    { id: 'alt2', severity: 'medium', title: 'Apex Digital deal stale for 8 days — follow-up needed', status: 'active', created_at: daysAgo(1) },
  ],
  auditLogs: [
    { id: 'alog1', user_id: 'user-1', action: 'login', details: 'User logged in', ip_address: '127.0.0.1', created_at: daysAgo(0) },
    { id: 'alog2', user_id: 'user-1', action: 'agent_decision_approved', details: 'Approved: escalate invoice inv2', ip_address: '127.0.0.1', created_at: daysAgo(1) },
  ],
};

// ── API mock fixtures ─────────────────────────────────────────────────────────

export const API_MOCKS = {
  // AuthContext reads data.workspaces[] not data.workspace
  '/api/auth/me': () => ({ user: DEMO_USER, workspaces: [DEMO_WORKSPACE] }),
  '/api/auth/login': () => ({ token: DEMO_TOKEN, refreshToken: 'refresh-token', user: DEMO_USER, workspace: DEMO_WORKSPACE, workspaces: [DEMO_WORKSPACE] }),
  '/api/auth/signup': () => ({ token: DEMO_TOKEN, refreshToken: 'refresh-token', user: { ...DEMO_USER, email_verified: false }, workspace: null }),
  '/api/auth/refresh': () => ({ token: DEMO_TOKEN, refreshToken: 'refresh-token' }),
  '/api/workspace': () => ({ workspace: DEMO_WORKSPACE }),
  '/api/workspace/onboarding': () => ({ onboarding_completed: true }),
  // MainApp init calls
  '/api/metrics/health': () => ({ score: 78, label: 'Good' }),
  '/api/agent/status': () => ({ pendingDecisions: 2, activeAgents: 5, lastCycle: new Date().toISOString() }),
  '/api/settings/status': () => ({ status: 'ok', version: '1.0.0' }),
  '/api/proactive-alerts': () => ({ alerts: SEED.alerts, total: SEED.alerts.length }),
  '/api/settings/ai-status': () => ({
    status: 'operational',
    provider: 'openai',
    model: 'gpt-4o-mini',
    last_check: new Date().toISOString(),
  }),
  '/api/agent/decisions': () => ({ decisions: SEED.agentActions.map(a => ({ ...a, auto: true, needsApproval: a.outcome === 'pending', impact: a.metadata?.impact || 0, priority: 75 })) }),
  '/api/metrics/summary': () => ({
    total_contacts: SEED.contacts.length,
    total_deals: SEED.deals.length,
    total_invoices: SEED.invoices.length,
    overdue_invoices: 2,
    overdue_amount: 8600,
    active_workflows: 1,
    pending_approvals: SEED.approvals.length,
    pipeline_value: 35000,
    revenue_collected: 8400,
  }),
  '/api/agents/activity-feed': () => ({ events: SEED.agentActions }),
  '/api/intelligence/summary': () => ({ insights: SEED.alerts }),
  '/api/outputs': () => ({ outputs: SEED.outputs, total: SEED.outputs.length }),
  '/api/outputs/out1': () => ({ output: SEED.outputs[0] }),
  '/api/outputs/out2': () => ({ output: SEED.outputs[1] }),
  '/api/outputs/out3': () => ({ output: SEED.outputs[2] }),
  '/api/approvals': () => ({ approvals: SEED.approvals }),
  '/api/alerts': () => ({ alerts: SEED.alerts, total: SEED.alerts.length }),
  '/api/audit': () => ({ logs: SEED.auditLogs, total: SEED.auditLogs.length }),
  '/api/contacts': () => ({ contacts: SEED.contacts, total: SEED.contacts.length }),
  '/api/deals': () => ({ deals: SEED.deals, total: SEED.deals.length }),
  '/api/invoices': () => ({ invoices: SEED.invoices, total: SEED.invoices.length }),
  '/api/tasks': () => ({ tasks: SEED.tasks, total: SEED.tasks.length }),
  '/api/workflows': () => ({ workflows: [], total: 0 }),
  '/api/boardroom': () => ({
    sessionId: 'session-1',
    messages: [{ role: 'assistant', content: 'Good morning. Here\'s your Autonome boardroom. What would you like to review today?' }],
  }),
  '/api/briefing': () => ({ briefing: SEED.outputs[0] }),
  '/api/collections': () => ({
    overdue_count: 2,
    overdue_amount: 8600,
    reminders_sent: 1,
    escalated_count: 1,
    items: SEED.invoices.filter(i => i.status === 'overdue'),
  }),
  '/api/inbox': () => ({
    leads: [
      { id: 'lead1', name: 'Rachel Simmons', email: 'rachel@novatech.co', source: 'form', urgency: 'medium', created_at: daysAgo(2) },
    ],
    unread: 1,
    total: 1,
  }),
};

/**
 * Register all API mocks for a Playwright page using route interception.
 * Call this in beforeEach after navigating to inject auth state.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function setupApiMocks(page) {
  // Block actual API server requests
  await page.route('**/api/**', async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname;

    // Dynamic mock for individual output items
    const outputMatch = path.match(/^\/api\/outputs\/(.+)$/);
    if (outputMatch) {
      const id = outputMatch[1];
      const output = SEED.outputs.find(o => o.id === id);
      if (output && !path.includes('/trigger/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output }) });
      }
    }

    // POST to /outputs/trigger — return success
    if (path.startsWith('/api/outputs/trigger/')) {
      const type = path.split('/').pop();
      const mockOutput = SEED.outputs.find(o => o.output_type === type) || SEED.outputs[0];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: mockOutput }) });
    }

    // Per-agent memory
    if (path.match(/^\/api\/agents\/.+\/memory$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memory: [] }) });
    }

    // Proactive alerts (query string)
    if (path === '/api/proactive-alerts') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: SEED.alerts, total: SEED.alerts.length }) });
    }

    // Activity feed (query string)
    if (path === '/api/agents/activity-feed') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: SEED.agentActions }) });
    }

    // Boardroom chat
    if (path === '/api/boardroom/chat' || path === '/api/ai/query') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ response: 'Based on current data: 2 overdue invoices totalling $8,600. Finance agent has queued reminders for both.', sessionId: 'session-1' }),
      });
    }

    // Agent run trigger
    if (path === '/api/agent-runs/trigger') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, triggered: 3 }) });
    }

    // Try static mock
    const mockFn = API_MOCKS[path];
    if (mockFn) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFn()) });
    }

    // Fallback — return empty 200
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

/**
 * Inject auth session directly into localStorage so the app thinks the user
 * is already logged in without going through the login flow.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function injectAuthSession(page) {
  await page.addInitScript(
    ({ token, workspaceId }) => {
      localStorage.setItem('autonome_token', token);
      localStorage.setItem('autonome_workspace_id', workspaceId);
    },
    { token: DEMO_TOKEN, workspaceId: DEMO_WORKSPACE_ID }
  );
}
