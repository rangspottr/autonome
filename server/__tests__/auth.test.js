import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('../db/index.js', () => ({ pool: { query: mockQuery } }));
vi.mock('../services/email.js', () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));

const mockConfig = {
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_IN: '7d',
  CLIENT_URL: 'http://localhost:3001',
  SMTP_HOST: null,
  SMTP_USER: null,
  SMTP_PASS: null,
};
vi.mock('../config.js', () => ({ config: mockConfig }));

// Import router after mocks are set up
const { default: authRouter } = await import('../routes/auth.js');
import express from 'express';
import request from 'supertest';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => mockQuery.mockReset());

  it('creates user and returns JWT', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no existing user
    const userId = 'uuid-1';
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: userId, email: 'user@test.com', full_name: 'Test User', created_at: new Date() }],
    });
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send({ email: 'user@test.com', password: 'password123', full_name: 'Test User' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('user@test.com');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send({ email: 'user@test.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send({ email: 'user@test.com', password: 'short', full_name: 'Test User' });
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate email', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send({ email: 'user@test.com', password: 'password123', full_name: 'Test User' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns token for correct credentials', async () => {
    const hash = await bcrypt.hash('password123', 10);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', email: 'user@test.com', full_name: 'Test', created_at: new Date(), password_hash: hash, workspace_id: null }],
    });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('returns 401 for wrong password', async () => {
    const hash = await bcrypt.hash('password123', 10);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', email: 'user@test.com', full_name: 'Test', created_at: new Date(), password_hash: hash, workspace_id: null }],
    });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'user@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 200 for existing email', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // token insert
    const res = await request(buildApp())
      .post('/api/auth/forgot-password')
      .send({ email: 'user@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reset link');
  });

  it('returns 200 for non-existing email (no leak)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no user found
    const res = await request(buildApp())
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reset link');
  });
});

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns 200 for valid token', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'token-uuid', user_id: 'uuid-1', token: 'validtoken', expires_at: new Date(Date.now() + 3600000) }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update password
    mockQuery.mockResolvedValueOnce({ rows: [] }); // delete token
    const res = await request(buildApp())
      .post('/api/auth/reset-password')
      .send({ token: 'validtoken', newPassword: 'newpassword123' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password updated');
  });

  it('returns 400 for expired/invalid token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no matching token
    const res = await request(buildApp())
      .post('/api/auth/reset-password')
      .send({ token: 'badtoken', newPassword: 'newpassword123' });
    expect(res.status).toBe(400);
  });
});
