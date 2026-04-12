import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const mockQuery = vi.fn();
vi.mock('../db/index.js', () => ({ pool: { query: mockQuery } }));

const mockConfig = {
  JWT_SECRET: 'test-secret',
  JWT_EXPIRES_IN: '7d',
};
vi.mock('../config.js', () => ({ config: mockConfig }));

const { requireAuth, requireWorkspace } = await import('../middleware/auth.js');

import express from 'express';
import request from 'supertest';

function buildApp(middleware) {
  const app = express();
  app.use(express.json());
  app.get('/test', ...middleware, (req, res) => res.json({ ok: true }));
  return app;
}

describe('requireAuth middleware', () => {
  it('rejects requests without token', async () => {
    const res = await request(buildApp([requireAuth])).get('/test');
    expect(res.status).toBe(401);
  });

  it('rejects expired tokens', async () => {
    const token = jwt.sign({ id: 'uuid-1', email: 'a@b.com' }, 'test-secret', { expiresIn: -1 });
    const res = await request(buildApp([requireAuth]))
      .get('/test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('allows valid tokens', async () => {
    const token = jwt.sign({ id: 'uuid-1', email: 'a@b.com', full_name: 'Test' }, 'test-secret', { expiresIn: '1h' });
    const res = await request(buildApp([requireAuth]))
      .get('/test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('requireWorkspace middleware', () => {
  beforeEach(() => mockQuery.mockReset());

  it('rejects requests without workspace header', async () => {
    const token = jwt.sign({ id: 'uuid-1', email: 'a@b.com', full_name: 'Test' }, 'test-secret', { expiresIn: '1h' });
    const res = await request(buildApp([requireAuth, requireWorkspace]))
      .get('/test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('rejects when user is not a member of workspace', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const token = jwt.sign({ id: 'uuid-1', email: 'a@b.com', full_name: 'Test' }, 'test-secret', { expiresIn: '1h' });
    const res = await request(buildApp([requireAuth, requireWorkspace]))
      .get('/test')
      .set('Authorization', `Bearer ${token}`)
      .set('x-workspace-id', 'workspace-1');
    expect(res.status).toBe(403);
  });
});

describe('CSRF header middleware', () => {
  it('rejects non-GET state-changing requests without x-requested-with header', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
      if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
        return res.status(403).json({ message: 'Forbidden: missing required header' });
      }
      next();
    });
    app.post('/api/test', (req, res) => res.json({ ok: true }));
    const res = await request(app).post('/api/test').send({});
    expect(res.status).toBe(403);
  });

  it('allows POST requests with x-requested-with header', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
      if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
        return res.status(403).json({ message: 'Forbidden: missing required header' });
      }
      next();
    });
    app.post('/api/test', (req, res) => res.json({ ok: true }));
    const res = await request(app)
      .post('/api/test')
      .set('x-requested-with', 'XMLHttpRequest')
      .send({});
    expect(res.status).toBe(200);
  });
});
