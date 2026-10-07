const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { app } = require('../src/index');

test('health: liveness and readiness endpoints return valid status', async () => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const get = (path) =>
    new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        res.on('error', reject);
      });
    });

  // 0. Test /health
  const rootHealthRes = await get('/health');
  assert.equal(rootHealthRes.status, 200);
  assert.equal(rootHealthRes.body.status, 'ok');
  assert.equal(rootHealthRes.body.service, 'parkspot-api');

  // 1. Test /api/health
  const healthRes = await get('/api/health');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.body.status, 'ok');
  assert.ok(healthRes.body.timestamp);

  // 2. Test /api/health/ready
  const readyRes = await get('/api/health/ready');
  assert.equal(readyRes.status, 200);
  assert.equal(readyRes.body.status, 'ready');
  assert.equal(readyRes.body.database, 'connected');
  assert.ok(readyRes.body.timestamp);

  server.close();
});
