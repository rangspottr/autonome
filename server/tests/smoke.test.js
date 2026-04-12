import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../index.js';

let server;
let baseUrl;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /api/health returns 200 with required fields', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status === 'ok' || body.status === 'degraded', true);
  assert.ok('db' in body, 'response should include db field');
  assert.ok('uptime' in body, 'response should include uptime field');
  assert.ok('node' in body, 'response should include node field');
});

test('GET /api/settings/status without auth returns 401', async () => {
  const res = await fetch(`${baseUrl}/api/settings/status`);
  assert.equal(res.status, 401);
});

test('GET /api/health response includes timestamp field', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok('timestamp' in body, 'response should include timestamp field');
});
