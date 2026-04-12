import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../db/index.js', () => ({ pool: { query: mockQuery } }));

// Mock crypto so tests don't need real encryption keys
vi.mock('../lib/crypto.js', () => ({
  encrypt: (text) => `encrypted:${text}`,
  decrypt: (text) => {
    if (text.startsWith('encrypted:')) return text.slice('encrypted:'.length);
    throw new Error('Not encrypted');
  },
}));

const { default: webhookRouter } = await import('../routes/webhooks.js');
import express from 'express';
import request from 'supertest';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/webhooks', webhookRouter);
  return app;
}

// The workspace now stores an encrypted key; the mock decrypt above handles 'encrypted:validkey'
const VALID_WORKSPACE = { id: 'ws-1', settings: { webhook_api_key: 'encrypted:validkey' } };

describe('POST /api/webhooks/lead', () => {
  beforeEach(() => mockQuery.mockReset());

  it('creates contact with valid API key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [VALID_WORKSPACE] }); // resolveWorkspaceByApiKey scan
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'contact-1' }] }); // insert contact
    mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

    const res = await request(buildApp())
      .post('/api/webhooks/lead')
      .set('x-api-key', 'validkey')
      .send({ name: 'Test Lead', email: 'lead@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('returns 401 for missing API key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no workspaces
    const res = await request(buildApp())
      .post('/api/webhooks/lead')
      .send({ name: 'Test Lead' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid API key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [VALID_WORKSPACE] }); // scan returns workspace but key won't match
    const res = await request(buildApp())
      .post('/api/webhooks/lead')
      .set('x-api-key', 'badkey')
      .send({ name: 'Test Lead' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [VALID_WORKSPACE] });
    const res = await request(buildApp())
      .post('/api/webhooks/lead')
      .set('x-api-key', 'validkey')
      .send({ email: 'lead@test.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/webhooks/payment', () => {
  beforeEach(() => mockQuery.mockReset());

  it('updates invoice with valid API key and data', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [VALID_WORKSPACE] });
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'inv-1' }] }); // update invoice
    mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

    const res = await request(buildApp())
      .post('/api/webhooks/payment')
      .set('x-api-key', 'validkey')
      .send({ invoice_id: 'inv-1', amount: 500 });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('returns 401 for invalid API key', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .post('/api/webhooks/payment')
      .set('x-api-key', 'badkey')
      .send({ invoice_id: 'inv-1', amount: 500 });
    expect(res.status).toBe(401);
  });
});
