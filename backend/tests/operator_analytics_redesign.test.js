const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
const { app } = require('../src/index');
const { ParkingLot, ParkingSlot, Floor, Booking, Payment, User, Organization } = require('../src/models');

const JWT_SECRET = process.env.JWT_SECRET || 'parkspot-local-development-secret-change-before-deployment';

function createToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      accountType: user.accountType || user.role,
      organizationId: user.organizationId ? String(user.organizationId) : null,
      facilityId: user.facilityId ? String(user.facilityId) : null
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function makeRequest(server, path, method = 'GET', token = null, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${server.address().port}`);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      url,
      { method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('PARKSPOT: Operator Analytics & Demand Forecast Redesign Test Suite', async (t) => {
  let server;
  let orgA, orgB;
  let adminA, operatorA, adminB;
  let tokenAdminA, tokenOpA, tokenAdminB;
  let facilityA, facilityB;
  let slotA1, slotA2;
  let bookingA1, bookingA2;

  t.before(async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/parkspot');
      }

      server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, resolve));

    // Setup Org A
    orgA = await Organization.create({
      name: `Org Analytics ${Date.now()}`,
      slug: `org-analytics-${Date.now()}`,
      email: `org-analytics-${Date.now()}@test.com`
    });

    facilityA = await ParkingLot.create({
      organizationId: orgA._id,
      name: 'Downtown Analytics Plaza',
      address: '100 Main St',
      city: 'Metropolis',
      hourlyRate: 50,
      dailyRate: 300,
      active: true
    });

    adminA = await User.create({
      name: 'Admin A',
      email: `admin-a-${Date.now()}@test.com`,
      passwordHash: 'hash123',
      role: 'ADMIN',
      organizationId: orgA._id
    });
    tokenAdminA = createToken(adminA);

    operatorA = await User.create({
      name: 'Operator A',
      email: `op-a-${Date.now()}@test.com`,
      passwordHash: 'hash123',
      role: 'OPERATOR',
      organizationId: orgA._id,
      facilityId: facilityA._id
    });
    tokenOpA = createToken(operatorA);

    // Setup Floor & Slots
    const floorA = await Floor.create({
      facilityId: facilityA._id,
      lotId: facilityA._id,
      organizationId: orgA._id,
      name: 'Ground Level',
      floorNumber: 1,
      capacity: 2
    });

    slotA1 = await ParkingSlot.create({
      lotId: facilityA._id,
      floorId: floorA._id,
      organizationId: orgA._id,
      number: 'A-01',
      slotNumber: 'A-01',
      identifier: 'A-01',
      status: 'AVAILABLE',
      isActive: true,
      pricePerHour: 50
    });

    slotA2 = await ParkingSlot.create({
      lotId: facilityA._id,
      floorId: floorA._id,
      organizationId: orgA._id,
      number: 'A-02',
      slotNumber: 'A-02',
      identifier: 'A-02',
      status: 'AVAILABLE',
      isActive: true,
      pricePerHour: 50
    });

    // Create bookings in current window
    const now = new Date();
    const start1 = new Date(now.getTime() - 4 * 3600000);
    const end1 = new Date(now.getTime() - 2 * 3600000);

    bookingA1 = await Booking.create({
      organizationId: orgA._id,
      userId: new mongoose.Types.ObjectId(),
      lotId: facilityA._id,
      floorId: floorA._id,
      slotId: slotA1._id,
      startTime: start1,
      endTime: end1,
      type: 'HOURLY',
      totalAmount: 100,
      hourlyRate: 50,
      status: 'COMPLETED'
    });

    await Payment.create({
      organizationId: orgA._id,
      bookingId: bookingA1._id,
      userId: bookingA1.userId,
      amount: 100,
      currency: 'INR',
      status: 'PAID',
      provider: 'RAZORPAY',
      providerOrderId: `order_${Date.now()}_1`,
      providerPaymentId: `pay_${Date.now()}_1`
    });

    // Setup Org B for isolation
    orgB = await Organization.create({
      name: `Org B Isolation ${Date.now()}`,
      slug: `org-b-${Date.now()}`,
      email: `org-b-${Date.now()}@test.com`
    });

    facilityB = await ParkingLot.create({
      organizationId: orgB._id,
      name: 'Foreign Lot B',
      address: '200 North St',
      city: 'Betatown',
      hourlyRate: 60,
      dailyRate: 360,
      active: true
    });

    adminB = await User.create({
      name: 'Admin B',
      email: `admin-b-${Date.now()}@test.com`,
      passwordHash: 'hash123',
      role: 'ADMIN',
      organizationId: orgB._id
    });
    tokenAdminB = createToken(adminB);
    } catch (err) {
      console.error('BEFORE HOOK ERROR OCCURRED:', err);
      throw err;
    }
  });

  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (orgA) {
      await Booking.deleteMany({ organizationId: orgA._id });
      await Payment.deleteMany({ organizationId: orgA._id });
      await ParkingSlot.deleteMany({ organizationId: orgA._id });
      await Floor.deleteMany({ organizationId: orgA._id });
      await ParkingLot.deleteMany({ organizationId: orgA._id });
      await User.deleteMany({ organizationId: orgA._id });
      await Organization.deleteMany({ _id: orgA._id });
    }
    if (orgB) {
      await ParkingLot.deleteMany({ organizationId: orgB._id });
      await User.deleteMany({ organizationId: orgB._id });
      await Organization.deleteMany({ _id: orgB._id });
    }
  });

  await t.test('1. GET /api/v1/analytics/summary: Operator retrieves facility-scoped KPI summary', async () => {
    const res = await makeRequest(server, '/api/v1/analytics/summary', 'GET', tokenOpA);
    if (res.status !== 200) console.error('TEST 1 FAILED STATUS:', res.status, res.body);
    assert.equal(res.status, 200);
    assert.ok(res.body.spots, 'Must return spots data');
    assert.ok(res.body.utilization, 'Must return utilization data');
    assert.ok(res.body.bookings, 'Must return bookings breakdown');
    assert.equal(res.body.spots.total, 2);
    assert.ok(res.body.bookings.total >= 1);
  });

  await t.test('2. GET /api/v1/analytics/utilization: Returns valid capacity spot-hours and floor breakdown', async () => {
    const res = await makeRequest(server, `/api/v1/analytics/utilization?facilityId=${facilityA._id}`, 'GET', tokenOpA);
    assert.equal(res.status, 200);
    assert.ok(res.body.summary);
    assert.equal(res.body.summary.totalSpots, 2);
    assert.ok(Array.isArray(res.body.byFloor));
    assert.equal(res.body.byFloor.length, 1);
    assert.equal(res.body.byFloor[0].name, 'Ground Level');
  });

  await t.test('3. GET /api/v1/analytics/occupancy: Returns hourly and daily trend time buckets', async () => {
    const resHourly = await makeRequest(server, `/api/v1/analytics/occupancy?facilityId=${facilityA._id}&bucket=hourly`, 'GET', tokenOpA);
    assert.equal(resHourly.status, 200);
    assert.equal(resHourly.body.bucketType, 'hourly');
    assert.ok(Array.isArray(resHourly.body.data));

    const resDaily = await makeRequest(server, `/api/v1/analytics/occupancy?facilityId=${facilityA._id}&bucket=daily`, 'GET', tokenOpA);
    assert.equal(resDaily.status, 200);
    assert.equal(resDaily.body.bucketType, 'daily');
  });

  await t.test('4. GET /api/v1/analytics/peak-hours: Identifies busiest hour with complete 24-hour distribution', async () => {
    const res = await makeRequest(server, `/api/v1/analytics/peak-hours?facilityId=${facilityA._id}`, 'GET', tokenOpA);
    assert.equal(res.status, 200);
    assert.ok(res.body.summary);
    assert.ok(Array.isArray(res.body.hourlyDistribution));
    assert.equal(res.body.hourlyDistribution.length, 24);
    assert.equal(res.body.hourlyDistribution[0].hour, 0);
    assert.equal(res.body.hourlyDistribution[23].hour, 23);
  });

  await t.test('5. RBAC Protection: Operator role is blocked from raw financial revenue (403), Admin is allowed', async () => {
    // Operator forbidden
    const resOp = await makeRequest(server, `/api/v1/analytics/revenue?facilityId=${facilityA._id}`, 'GET', tokenOpA);
    assert.equal(resOp.status, 403);

    // Admin allowed
    const resAdmin = await makeRequest(server, `/api/v1/analytics/revenue?facilityId=${facilityA._id}`, 'GET', tokenAdminA);
    assert.equal(resAdmin.status, 200);
    assert.ok(resAdmin.body.summary !== undefined);
    assert.ok(typeof resAdmin.body.summary.collectedRevenue === 'number');
  });

  await t.test('6. GET /api/v1/forecasting/demand: Generates demand forecast with model info and confidence', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/forecasting/demand?facilityId=${facilityA._id}&horizon=24&granularity=hour`,
      'GET',
      tokenOpA
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.facility);
    assert.equal(res.body.facility.name, 'Downtown Analytics Plaza');
    assert.equal(res.body.horizon, 24);
    assert.equal(res.body.granularity, 'hour');
    assert.ok(res.body.model, 'Must declare active model');
    assert.ok(Array.isArray(res.body.predictedDemand));
    assert.equal(res.body.predictedDemand.length, 24);

    const firstItem = res.body.predictedDemand[0];
    assert.ok(typeof firstItem.predictedBookings === 'number');
    assert.ok(typeof firstItem.confidence === 'number');
    assert.ok(firstItem.confidence >= 0 && firstItem.confidence <= 1);
  });

  await t.test('7. Tenant Isolation: Operator cannot query demand forecast for a foreign organization facility', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/forecasting/demand?facilityId=${facilityB._id}&horizon=24`,
      'GET',
      tokenOpA
    );
    // Blocked by enforceOperatorFacility or verifyFacility
    assert.ok([403, 404].includes(res.status));
  });
});
