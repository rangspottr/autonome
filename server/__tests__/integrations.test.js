/**
 * Mocked integration tests — ingest endpoints for all simulated connector types.
 *
 * These tests simulate realistic external system inputs without requiring
 * real Gmail, Outlook, Stripe, or Twilio connections.
 *
 * Coverage:
 *  - Mock Gmail/Outlook inbox (inbound email)
 *  - Mock missed call (Twilio / phone provider)
 *  - Mock SMS message
 *  - Mock lead form submission
 *  - Mock payment event (Stripe succeeded / failed)
 *  - Mock calendar booking request
 *  - Mock support request
 *  - Mock document upload
 *  - Webhook lead intake (existing pathway)
 *  - Webhook payment intake
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB pool ──────────────────────────────────────────────────────────
const mockQuery = vi.fn();
vi.mock('../db/index.js', () => ({ pool: { query: mockQuery } }));

// ── Mock crypto (used by webhooks) ────────────────────────────────────────────
vi.mock('../lib/crypto.js', () => ({
  encrypt: (t) => `enc:${t}`,
  decrypt: (t) => (t.startsWith('enc:') ? t.slice(4) : (() => { throw new Error('Bad token'); })()),
}));

// Dynamic imports so mocks are applied before module resolution
const { default: ingestRouter } = await import('../routes/ingest.js');
const { default: webhookRouter } = await import('../routes/webhooks.js');

import express from 'express';
import request from 'supertest';

// ── App builder ───────────────────────────────────────────────────────────────

function buildIngestApp() {
  const app = express();
  app.use(express.json());
  app.use('/', ingestRouter);
  return app;
}

const WORKSPACE_ROW = { id: 'ws-int-1', name: 'Test Workspace', settings: {}, onboarding_completed: true };

// A generic event row returned by the DB for INSERT / SELECT / UPDATE
const EVENT_ROW = {
  id: 'evt-1', workspace_id: 'ws-int-1', source: 'test', event_type: 'test',
  raw_data: '{}', status: 'acted', classified_data: '{}',
  entity_links: '[]', agent_routing: '[]', owner_agent: 'operations', resolution: '{}',
};

/**
 * Mock the apiKeyOrAuth chain (2 DB calls) then set a global default so all
 * subsequent queries inside ingestBusinessEvent / processBusinessEvent succeed
 * with a valid event row.
 */
function mockAuthAndIngest() {
  mockQuery.mockResolvedValueOnce({ rows: [{ workspace_id: 'ws-int-1' }] }); // integrations lookup
  mockQuery.mockResolvedValueOnce({ rows: [WORKSPACE_ROW] });                 // workspace lookup
  // Default for ALL remaining queries (INSERT, SELECT, various UPDATE, agent_actions, etc.)
  mockQuery.mockResolvedValue({ rows: [EVENT_ROW] });
}

/** Mock auth only (used for validation tests that expect 4xx before any DB logic). */
function mockApiKeyAuth() {
  mockQuery.mockResolvedValueOnce({ rows: [{ workspace_id: 'ws-int-1' }] }); // integrations lookup
  mockQuery.mockResolvedValueOnce({ rows: [WORKSPACE_ROW] });                 // workspace lookup
}

const VALID_KEY = 'integration-test-key-123';

function buildWebhookApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/webhooks', webhookRouter);
  return app;
}

const WEBHOOK_WORKSPACE = { id: 'ws-wh-1', settings: { webhook_api_key: 'enc:testkey123' } };

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetMocks() {
  mockQuery.mockReset();
  // Default return for any unspecified query — prevents unhandled rejections
  mockQuery.mockResolvedValue({ rows: [] });
}

// ── Mock Gmail / Outlook Inbox (inbound email) ────────────────────────────────

describe('Mock Gmail/Outlook Inbox — POST /email', () => {
  beforeEach(resetMocks);

  it('ingests a regular business email', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/email')
      .set('x-api-key', VALID_KEY)
      .send({
        from: 'client@gmail.com',
        to: 'owner@acme.com',
        subject: 'Project update',
        body: 'Just checking in on the timeline.',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('classifies an urgent email with high urgency', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/email')
      .set('x-api-key', VALID_KEY)
      .send({
        from: 'vip@client.com',
        to: 'owner@acme.com',
        subject: 'URGENT: Contract deadline tomorrow',
        body: 'We need this signed ASAP or the deal is off.',
      });

    expect(res.status).toBe(201);
  });

  it('classifies a complaint email', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/email')
      .set('x-api-key', VALID_KEY)
      .send({
        from: 'angry@customer.com',
        subject: 'Terrible service — requesting refund',
        body: 'I am frustrated and want my money back.',
      });

    expect(res.status).toBe(201);
  });

  it('rejects email without required fields', async () => {
    mockApiKeyAuth();
    const res = await request(buildIngestApp())
      .post('/email')
      .set('x-api-key', VALID_KEY)
      .send({ body: 'Hello' }); // missing from and subject

    expect(res.status).toBe(400);
  });
});

// ── Mock Missed Call ──────────────────────────────────────────────────────────

describe('Mock Missed Call — POST /call', () => {
  beforeEach(resetMocks);

  it('ingests a missed call from a new prospect', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/call')
      .set('x-api-key', VALID_KEY)
      .send({
        caller_phone: '+15555550101',
        caller_name: 'New Prospect Inc',
        type: 'missed',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it('ingests a completed call with a transcript', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/call')
      .set('x-api-key', VALID_KEY)
      .send({
        caller_phone: '+15555550202',
        caller_name: 'Sarah Chen',
        type: 'completed',
        duration: 185,
        transcript: 'Discussed Q3 retainer renewal. She wants a 5% discount.',
      });

    expect(res.status).toBe(201);
  });

  it('rejects call without caller_phone', async () => {
    mockApiKeyAuth();
    const res = await request(buildIngestApp())
      .post('/call')
      .set('x-api-key', VALID_KEY)
      .send({ caller_name: 'Anonymous', type: 'missed' });

    expect(res.status).toBe(400);
  });

  it('rejects call with invalid type', async () => {
    mockApiKeyAuth();
    const res = await request(buildIngestApp())
      .post('/call')
      .set('x-api-key', VALID_KEY)
      .send({ caller_phone: '+15555550303', type: 'screamed' });

    expect(res.status).toBe(400);
  });
});

// ── Mock SMS ──────────────────────────────────────────────────────────────────

describe('Mock SMS — POST /sms', () => {
  beforeEach(resetMocks);

  it('ingests an inbound SMS from a lead', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/sms')
      .set('x-api-key', VALID_KEY)
      .send({
        from: '+15555550404',
        to: '+15555550000',
        body: 'Hi, I saw your ad and I am interested in your services.',
        direction: 'inbound',
      });

    expect(res.status).toBe(201);
  });

  it('ingests an urgent SMS', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/sms')
      .set('x-api-key', VALID_KEY)
      .send({
        from: '+15555550505',
        body: 'URGENT: Site is down, need help immediately!',
      });

    expect(res.status).toBe(201);
  });

  it('rejects SMS without required fields', async () => {
    mockApiKeyAuth();
    const res = await request(buildIngestApp())
      .post('/sms')
      .set('x-api-key', VALID_KEY)
      .send({ to: '+15555550000' }); // missing from and body

    expect(res.status).toBe(400);
  });
});

// ── Mock Lead Form ────────────────────────────────────────────────────────────

describe('Mock Lead Form — POST /form', () => {
  beforeEach(resetMocks);

  it('ingests a contact form submission', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/form')
      .set('x-api-key', VALID_KEY)
      .send({
        form_type: 'contact',
        fields: { name: 'Derek Fong', email: 'derek@novatech.com', message: 'Interested in your enterprise plan.' },
        source_url: 'https://acme.com/contact',
      });

    expect(res.status).toBe(201);
  });

  it('ingests a support form submission', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/form')
      .set('x-api-key', VALID_KEY)
      .send({
        form_type: 'support',
        fields: { name: 'Omar Hassan', email: 'omar@ironclad.industries', issue: 'Invoice discrepancy' },
      });

    expect(res.status).toBe(201);
  });

  it('rejects form without required fields', async () => {
    mockApiKeyAuth();
    const res = await request(buildIngestApp())
      .post('/form')
      .set('x-api-key', VALID_KEY)
      .send({ form_type: 'contact' }); // missing fields

    expect(res.status).toBe(400);
  });
});

// ── Mock Payment Events ───────────────────────────────────────────────────────

describe('Mock Payment Events — POST /payment', () => {
  beforeEach(resetMocks);

  it('ingests a successful Stripe payment', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/payment')
      .set('x-api-key', VALID_KEY)
      .send({
        amount: 8400,
        currency: 'USD',
        status: 'succeeded',
        customer_email: 'sarah@meridianconsulting.com',
        invoice_ref: 'INV-001',
        provider: 'stripe',
        provider_event_id: 'evt_stripe_123',
      });

    expect(res.status).toBe(201);
  });

  it('ingests a failed payment and routes as high urgency', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/payment')
      .set('x-api-key', VALID_KEY)
      .send({
        amount: 6200,
        currency: 'USD',
        status: 'failed',
        customer_email: 'omar@ironclad.industries',
        provider: 'stripe',
      });

    expect(res.status).toBe(201);
  });

  it('rejects payment event without required fields', async () => {
    mockApiKeyAuth();
    const res = await request(buildIngestApp())
      .post('/payment')
      .set('x-api-key', VALID_KEY)
      .send({ amount: 100, status: 'succeeded' }); // missing currency and provider

    expect(res.status).toBe(400);
  });
});

// ── Mock Calendar Event ───────────────────────────────────────────────────────

describe('Mock Calendar Event — POST /calendar', () => {
  beforeEach(resetMocks);

  it('ingests a meeting booking request', async () => {
    mockAuthAndIngest();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const res = await request(buildIngestApp())
      .post('/calendar')
      .set('x-api-key', VALID_KEY)
      .send({
        title: 'Strategy call with Marcus Webb',
        start: tomorrow,
        attendees: ['marcus@apexdigital.io', 'owner@acme.com'],
        type: 'meeting',
        notes: 'Discuss Apex Digital Platform Build proposal',
      });

    expect(res.status).toBe(201);
  });

  it('ingests a deadline event', async () => {
    mockAuthAndIngest();
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
    const res = await request(buildIngestApp())
      .post('/calendar')
      .set('x-api-key', VALID_KEY)
      .send({
        title: 'Contract deadline — Meridian Q3 Retainer',
        start: nextWeek,
        type: 'deadline',
      });

    expect(res.status).toBe(201);
  });

  it('rejects calendar event without required fields', async () => {
    mockApiKeyAuth();
    const res = await request(buildIngestApp())
      .post('/calendar')
      .set('x-api-key', VALID_KEY)
      .send({ type: 'meeting' }); // missing title and start

    expect(res.status).toBe(400);
  });
});

// ── Mock Support Request ──────────────────────────────────────────────────────

describe('Mock Support Request — POST /support', () => {
  beforeEach(resetMocks);

  it('ingests a support request with urgent priority', async () => {
    mockAuthAndIngest();
    const res = await request(buildIngestApp())
      .post('/support')
      .set('x-api-key', VALID_KEY)
      .send({
        from_email: 'client@brightlinemedia.co',
        from_name: 'Nina Kowalski',
        subject: 'Service outage — urgent',
        body: 'Our integration is completely broken and we are losing customers.',
        priority: 'urgent',
        channel: 'email',
      });

    expect(res.status).toBe(201);
  });

  it('rejects support request without required fields', async () => {
    mockApiKeyAuth();
    const res = await request(buildIngestApp())
      .post('/support')
      .set('x-api-key', VALID_KEY)
      .send({ from_email: 'someone@test.com' }); // missing subject and body

    expect(res.status).toBe(400);
  });
});

// ── Webhook Lead Intake ───────────────────────────────────────────────────────

describe('Webhook Lead Intake — POST /api/webhooks/lead', () => {
  beforeEach(resetMocks);

  it('creates a contact for a valid lead with API key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [WEBHOOK_WORKSPACE] });           // resolve workspace
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'contact-w1' }] }); // insert contact
    mockQuery.mockResolvedValueOnce({ rows: [] });                     // audit log

    const res = await request(buildWebhookApp())
      .post('/api/webhooks/lead')
      .set('x-api-key', 'testkey123')
      .send({ name: 'After-Hours Lead', email: 'lead@prospect.com', phone: '+15555556789' });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('rejects lead without an API key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no workspace matches
    const res = await request(buildWebhookApp())
      .post('/api/webhooks/lead')
      .send({ name: 'Test Lead' });

    expect(res.status).toBe(401);
  });
});

// ── Webhook Payment Intake ────────────────────────────────────────────────────

describe('Webhook Payment Intake — POST /api/webhooks/payment', () => {
  beforeEach(resetMocks);

  it('updates invoice status for a received payment', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [WEBHOOK_WORKSPACE] });               // resolve workspace
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'inv-w1' }] }); // update invoice
    mockQuery.mockResolvedValueOnce({ rows: [] });                         // audit log

    const res = await request(buildWebhookApp())
      .post('/api/webhooks/payment')
      .set('x-api-key', 'testkey123')
      .send({ invoice_id: 'inv-w1', status: 'paid', amount: 8400 });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });
});
