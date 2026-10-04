const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { app } = require('../src/index');
const {
  Organization,
  User,
  ParkingLot,
  ParkingSlot,
  Booking,
  AuditLog
} = require('../src/models');
const { mlForecastService } = require('../src/services/ml-forecast.service');

function createToken(user) {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret-parkspot';
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      organizationId: user.organizationId ? String(user.organizationId) : null
    },
    secret,
    { expiresIn: '1h' }
  );
}

function makeRequest(server, path, method = 'GET', token = null, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const payload = body !== null ? JSON.stringify(body) : null;
    if (payload !== null) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (_e) {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

test('PHASE 3.2: Machine Learning Demand Forecasting Service Test Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  // Ephemeral Mock Python ML Server
  let mockMLStatus = 200;
  let mockMLDelayMs = 0;
  let mockMLResponseBody = null;

  const mockPythonServer = http.createServer((req, res) => {
    if (mockMLDelayMs > 0) {
      setTimeout(() => respond(), mockMLDelayMs);
    } else {
      respond();
    }

    function respond() {
      if (mockMLStatus === 200) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const body = mockMLResponseBody || {
          facilityId: 'fac_123',
          modelVersion: 'gradient-boosting-v1.0',
          predictions: [
            {
              timestamp: new Date().toISOString(),
              hourOfDay: 10,
              dayOfWeek: 1,
              predictedDemand: 35,
              confidence: 0.88
            }
          ]
        };
        res.end(JSON.stringify(body));
      } else {
        res.writeHead(mockMLStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'Service Error' }));
      }
    }
  });

  await new Promise((resolve) => mockPythonServer.listen(0, resolve));
  const mockMLPort = mockPythonServer.address().port;
  const originalMLUrl = process.env.ML_FORECAST_URL;
  const originalMLTimeout = process.env.ML_FORECAST_TIMEOUT_MS;
  const originalModelMode = process.env.FORECAST_MODEL_MODE;

  process.env.ML_FORECAST_URL = `http://127.0.0.1:${mockMLPort}`;
  mlForecastService.baseUrl = `http://127.0.0.1:${mockMLPort}`;

  t.after(async () => {
    process.env.ML_FORECAST_URL = originalMLUrl;
    process.env.ML_FORECAST_TIMEOUT_MS = originalMLTimeout;
    process.env.FORECAST_MODEL_MODE = originalModelMode;
    await new Promise((resolve) => mockPythonServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    if (process.argv[1] && process.argv[1].includes('phase3_2.test.js')) {
      await mongoose.disconnect();
    }
  });

  // Seed two distinct tenant organizations
  const orgA = await Organization.create({
    name: 'Org A ML Innovations',
    slug: `org-a-ml-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: 'admin@orga-ml.test'
  });

  const orgB = await Organization.create({
    name: 'Org B ML Systems',
    slug: `org-b-ml-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: 'admin@orgb-ml.test'
  });

  const adminA = await User.create({
    name: 'Admin Alpha ML',
    email: `admin-ml-${Date.now()}@test.com`,
    passwordHash: 'hash123',
    role: 'ADMIN',
    organizationId: orgA._id
  });
  const tokenA = createToken(adminA);

  const adminB = await User.create({
    name: 'Admin Beta ML',
    email: `admin-b-ml-${Date.now()}@test.com`,
    passwordHash: 'hash123',
    role: 'ADMIN',
    organizationId: orgB._id
  });
  const tokenB = createToken(adminB);

  // Facilities
  const facilityA = await ParkingLot.create({
    organizationId: orgA._id,
    name: 'Grand City ML Terminal',
    address: '100 Machine Learning Blvd',
    city: 'Technopolis',
    hourlyRate: 60,
    dailyRate: 360,
    active: true
  });

  // 10 spots in facilityA
  const slotsA = [];
  for (let i = 1; i <= 10; i++) {
    const slot = await ParkingSlot.create({
      lotId: facilityA._id,
      organizationId: orgA._id,
      number: `ML-A${i}`,
      status: 'AVAILABLE',
      isActive: true
    });
    slotsA.push(slot);
  }

  // Seed 10 historical bookings over past 5 days
  const now = new Date();
  const seedBookings = [];
  for (let i = 1; i <= 10; i++) {
    const tStart = new Date(now.getTime() - (i % 5 + 1) * 86400000);
    tStart.setUTCHours(10, 0, 0, 0);
    const tEnd = new Date(tStart.getTime() + 2 * 3600000);
    seedBookings.push({
      userId: adminA._id,
      lotId: facilityA._id,
      slotId: slotsA[i - 1]._id,
      organizationId: orgA._id,
      startTime: tStart,
      endTime: tEnd,
      type: 'HOURLY',
      status: 'COMPLETED',
      totalAmount: 120
    });
  }
  await Booking.create(seedBookings);

  // ==================================================
  // TESTS
  // ==================================================
  await t.test('1. ML Forecasting: Successful prediction from Python ML service in auto/ml mode', async () => {
    process.env.FORECAST_MODEL_MODE = 'auto';
    mockMLStatus = 200;
    mockMLDelayMs = 0;
    mockMLResponseBody = {
      facilityId: String(facilityA._id),
      modelVersion: 'gradient-boosting-v1.0',
      predictions: [
        {
          timestamp: new Date().toISOString(),
          hourOfDay: 10,
          dayOfWeek: 1,
          predictedDemand: 8,
          confidence: 0.91
        }
      ]
    };

    const res = await makeRequest(
      server,
      `/api/v1/forecasting/demand?facilityId=${facilityA._id}&horizon=1&granularity=hour`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    const data = res.body;

    assert.equal(data.model, 'ml');
    assert.equal(data.modelVersion, 'gradient-boosting-v1.0');
    assert.equal(data.fallbackUsed, false);
    assert.equal(data.fallbackReason, null);
    assert.equal(data.predictedDemand[0].predictedBookings, 8);
    assert.equal(data.predictedDemand[0].confidence, 0.91);
    assert.ok(data.contributingFactors.some((f) => f.includes('Gradient Boosting ML')));
  });

  await t.test('2. ML Forecasting: Python service unavailable triggers fallback to Phase 3.1 baseline', async () => {
    process.env.FORECAST_MODEL_MODE = 'auto';
    // Configure client to unreachable port
    process.env.ML_FORECAST_URL = 'http://127.0.0.1:59999';
    mlForecastService.baseUrl = 'http://127.0.0.1:59999';

    const res = await makeRequest(
      server,
      `/api/v1/forecasting/demand?facilityId=${facilityA._id}&horizon=24&granularity=hour`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    const data = res.body;

    assert.equal(data.model, 'baseline');
    assert.equal(data.fallbackUsed, true);
    assert.equal(data.fallbackReason, 'ML_SERVICE_UNAVAILABLE');
    assert.equal(data.predictedDemand.length, 24);
    assert.ok(data.predictedDemand[0].predictedBookings >= 0);
    assert.ok(data.contributingFactors.some((f) => f.includes('fallback')));

    // Restore URL
    process.env.ML_FORECAST_URL = `http://127.0.0.1:${mockMLPort}`;
    mlForecastService.baseUrl = `http://127.0.0.1:${mockMLPort}`;
  });

  await t.test('3. ML Forecasting: Python service timeout triggers fallback to Phase 3.1 baseline', async () => {
    process.env.FORECAST_MODEL_MODE = 'ml';
    process.env.ML_FORECAST_TIMEOUT_MS = '50';
    mlForecastService.timeoutMs = 50;
    mockMLDelayMs = 200; // Longer than 50ms timeout

    const res = await makeRequest(
      server,
      `/api/v1/forecasting/demand?facilityId=${facilityA._id}&horizon=12&granularity=hour`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    const data = res.body;

    assert.equal(data.model, 'baseline');
    assert.equal(data.fallbackUsed, true);
    assert.equal(data.fallbackReason, 'ML_SERVICE_TIMEOUT');

    // Restore timeout & delay
    process.env.ML_FORECAST_TIMEOUT_MS = '2500';
    mlForecastService.timeoutMs = 2500;
    mockMLDelayMs = 0;
  });

  await t.test('4. ML Forecasting: Malformed Python response triggers fallback with schema rejection', async () => {
    process.env.FORECAST_MODEL_MODE = 'auto';
    mockMLStatus = 200;
    mockMLResponseBody = {
      garbageField: 'not-valid-prediction',
      modelVersion: 12345 // Should be string
    };

    const res = await makeRequest(
      server,
      `/api/v1/forecasting/demand?facilityId=${facilityA._id}&horizon=6&granularity=hour`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    const data = res.body;

    assert.equal(data.model, 'baseline');
    assert.equal(data.fallbackUsed, true);
    assert.equal(data.fallbackReason, 'MALFORMED_ML_RESPONSE');
  });

  await t.test('5. ML Forecasting: FORECAST_MODEL_MODE=baseline strictly bypasses ML service', async () => {
    process.env.FORECAST_MODEL_MODE = 'baseline';

    const res = await makeRequest(
      server,
      `/api/v1/forecasting/demand?facilityId=${facilityA._id}&horizon=12&granularity=hour`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    const data = res.body;

    assert.equal(data.model, 'baseline');
    assert.equal(data.modelVersion, 'baseline-moving-average-v1.0');
    assert.equal(data.fallbackUsed, false, 'Baseline mode does not count as fallback');
  });

  await t.test('6. ML Forecasting: Tenant isolation prevents cross-tenant ML forecast execution', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/forecasting/demand?facilityId=${facilityA._id}&horizon=12`,
      'GET',
      tokenB // Tenant B requesting Tenant A facility
    );

    assert.equal(res.status, 404);
  });

  await t.test('7. ML Forecasting: AuditLog records ML model usage and fallback metrics', async () => {
    const auditRecord = await AuditLog.findOne({
      organizationId: orgA._id,
      action: 'FORECAST_GENERATED',
      'newValue.model': 'ml'
    }).sort({ createdAt: -1 });

    assert.ok(auditRecord, 'Must record AuditLog entry with model: ml');
    assert.equal(auditRecord.newValue.fallbackUsed, false);
  });

  await t.test('8. ML Forecasting: Optimization recommendations consume ML-enhanced forecast evidence', async () => {
    process.env.FORECAST_MODEL_MODE = 'auto';
    mockMLStatus = 200;
    mockMLResponseBody = {
      facilityId: String(facilityA._id),
      modelVersion: 'gradient-boosting-v1.0',
      predictions: [
        {
          timestamp: new Date().toISOString(),
          hourOfDay: 10,
          dayOfWeek: 1,
          predictedDemand: 9,
          confidence: 0.90
        }
      ]
    };

    const res = await makeRequest(
      server,
      '/api/v1/optimization/recommendations/generate',
      'POST',
      tokenA,
      {
        facilityId: String(facilityA._id),
        thresholds: { minBookingCountForSignal: 1, highUtilizationThreshold: 30 }
      }
    );

    assert.equal(res.status, 201);
    const recs = res.body.recommendations;
    assert.ok(Array.isArray(recs));
    const surgeRec = recs.find((r) => r.type === 'PRICING_SURGE');
    if (surgeRec) {
      assert.ok(surgeRec.metrics.forecastEvidence);
      assert.ok(surgeRec.metrics.forecastEvidence.trend);
    }
  });
});
