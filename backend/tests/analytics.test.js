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
  Floor,
  ParkingSlot,
  Booking,
  Payment
} = require('../src/models');
const analyticsService = require('../src/services/analytics.service');

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

test('PHASE 2.3: Analytics & Operational Optimization Test Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (process.argv[1] && process.argv[1].includes('analytics.test.js')) {
      await mongoose.disconnect();
    }
  });

  // Seed two distinct tenant organizations
  const orgA = await Organization.create({
    name: 'Org A Analytics Logistics',
    slug: `org-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: 'admin@orga.test'
  });

  const orgB = await Organization.create({
    name: 'Org B Parking Corp',
    slug: `org-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: 'admin@orgb.test'
  });

  // Users for Org A
  const adminA = await User.create({
    name: 'Admin A',
    email: `admin-a-${Date.now()}@test.com`,
    passwordHash: 'hash123',
    role: 'ADMIN',
    organizationId: orgA._id
  });
  const tokenA = createToken(adminA);

  const operatorA = await User.create({
    name: 'Operator A',
    email: `op-a-${Date.now()}@test.com`,
    passwordHash: 'hash123',
    role: 'OPERATOR',
    organizationId: orgA._id
  });
  const tokenOpA = createToken(operatorA);

  // User for Org B
  const adminB = await User.create({
    name: 'Admin B',
    email: `admin-b-${Date.now()}@test.com`,
    passwordHash: 'hash123',
    role: 'ADMIN',
    organizationId: orgB._id
  });
  const tokenB = createToken(adminB);

  // Facilities for Org A
  const facilityA1 = await ParkingLot.create({
    organizationId: orgA._id,
    name: 'A1 Grand Terminal',
    address: '100 Terminal Way',
    city: 'Metroville',
    hourlyRate: 60,
    dailyRate: 360,
    active: true
  });

  const facilityA2 = await ParkingLot.create({
    organizationId: orgA._id,
    name: 'A2 North Lot',
    address: '200 North Way',
    city: 'Metroville',
    hourlyRate: 40,
    dailyRate: 240,
    active: true
  });

  // Facility for Org B
  const facilityB1 = await ParkingLot.create({
    organizationId: orgB._id,
    name: 'B1 Downtown Lot',
    address: '500 Center St',
    city: 'Betatown',
    hourlyRate: 50,
    dailyRate: 300,
    active: true
  });

  // Floors for A1
  const floorA1 = await Floor.create({
    facilityId: facilityA1._id,
    organizationId: orgA._id,
    name: 'Level 1',
    floorNumber: 1
  });

  const floorA2 = await Floor.create({
    facilityId: facilityA1._id,
    organizationId: orgA._id,
    name: 'Level 2',
    floorNumber: 2
  });

  // Spots for A1
  const spotA1 = await ParkingSlot.create({
    lotId: facilityA1._id,
    floorId: floorA1._id,
    organizationId: orgA._id,
    number: 'A1-01',
    level: '1',
    type: 'STANDARD',
    status: 'AVAILABLE',
    isActive: true
  });

  const spotA2 = await ParkingSlot.create({
    lotId: facilityA1._id,
    floorId: floorA1._id,
    organizationId: orgA._id,
    number: 'A1-02',
    level: '1',
    type: 'EV',
    status: 'OCCUPIED',
    isActive: true
  });

  const spotA3 = await ParkingSlot.create({
    lotId: facilityA1._id,
    floorId: floorA2._id,
    organizationId: orgA._id,
    number: 'A1-03',
    level: '2',
    type: 'STANDARD',
    status: 'RESERVED',
    isActive: true
  });

  // Spot for A2
  const spotA4 = await ParkingSlot.create({
    lotId: facilityA2._id,
    organizationId: orgA._id,
    number: 'A2-01',
    status: 'AVAILABLE',
    isActive: true
  });

  // Spot for B1
  const spotB1 = await ParkingSlot.create({
    lotId: facilityB1._id,
    organizationId: orgB._id,
    number: 'B1-01',
    status: 'AVAILABLE',
    isActive: true
  });

  // Time references for seeding predictable bookings
  const baseTime = new Date('2028-06-15T10:00:00Z');
  const winStart = new Date('2028-06-15T00:00:00Z');
  const winEnd = new Date('2028-06-15T23:59:59Z');

  // Bookings for Org A:
  // 1. Confirmed booking on spotA1 (10:00 - 12:00 = 2h), amount: 120
  const bookingA1 = await Booking.create({
    userId: adminA._id,
    lotId: facilityA1._id,
    floorId: floorA1._id,
    slotId: spotA1._id,
    organizationId: orgA._id,
    startTime: new Date('2028-06-15T10:00:00Z'),
    endTime: new Date('2028-06-15T12:00:00Z'),
    type: 'HOURLY',
    status: 'CONFIRMED',
    totalAmount: 120,
    createdAt: new Date('2028-06-15T09:30:00Z')
  });

  // 2. Completed booking on spotA2 (14:00 - 17:00 = 3h), amount: 180
  const bookingA2 = await Booking.create({
    userId: adminA._id,
    lotId: facilityA1._id,
    floorId: floorA1._id,
    slotId: spotA2._id,
    organizationId: orgA._id,
    startTime: new Date('2028-06-15T14:00:00Z'),
    endTime: new Date('2028-06-15T17:00:00Z'),
    type: 'HOURLY',
    status: 'COMPLETED',
    totalAmount: 180,
    createdAt: new Date('2028-06-15T13:30:00Z')
  });

  // 3. Cancelled booking on spotA3, amount: 60
  const bookingA3 = await Booking.create({
    userId: adminA._id,
    lotId: facilityA1._id,
    floorId: floorA2._id,
    slotId: spotA3._id,
    organizationId: orgA._id,
    startTime: new Date('2028-06-15T18:00:00Z'),
    endTime: new Date('2028-06-15T19:00:00Z'),
    type: 'HOURLY',
    status: 'CANCELED',
    totalAmount: 60,
    createdAt: new Date('2028-06-15T17:30:00Z')
  });

  // 4. Booking on Org B
  const bookingB1 = await Booking.create({
    userId: adminB._id,
    lotId: facilityB1._id,
    slotId: spotB1._id,
    organizationId: orgB._id,
    startTime: new Date('2028-06-15T10:00:00Z'),
    endTime: new Date('2028-06-15T12:00:00Z'),
    type: 'HOURLY',
    status: 'CONFIRMED',
    totalAmount: 100,
    createdAt: new Date('2028-06-15T09:00:00Z')
  });

  // Payments for Org A:
  // Payment 1: PAID (amount 120) for bookingA1
  await Payment.create({
    organizationId: orgA._id,
    userId: adminA._id,
    bookingId: bookingA1._id,
    provider: 'MOCK',
    providerOrderId: `ord_paid_${Date.now()}`,
    providerPaymentId: 'pay_paid_120',
    amount: 120,
    currency: 'INR',
    status: 'PAID',
    createdAt: new Date('2028-06-15T09:35:00Z')
  });

  // Payment 2: PAID (amount 180) for bookingA2
  await Payment.create({
    organizationId: orgA._id,
    userId: adminA._id,
    bookingId: bookingA2._id,
    provider: 'MOCK',
    providerOrderId: `ord_paid_2_${Date.now()}`,
    providerPaymentId: 'pay_paid_180',
    amount: 180,
    currency: 'INR',
    status: 'PAID',
    createdAt: new Date('2028-06-15T13:35:00Z')
  });

  // Payment 3: FAILED (amount 60)
  await Payment.create({
    organizationId: orgA._id,
    userId: adminA._id,
    bookingId: bookingA3._id,
    provider: 'MOCK',
    providerOrderId: `ord_failed_${Date.now()}`,
    amount: 60,
    currency: 'INR',
    status: 'FAILED',
    createdAt: new Date('2028-06-15T17:31:00Z')
  });

  // Payment 4: CANCELLED (amount 60)
  await Payment.create({
    organizationId: orgA._id,
    userId: adminA._id,
    bookingId: bookingA3._id,
    provider: 'MOCK',
    providerOrderId: `ord_canc_${Date.now()}`,
    amount: 60,
    currency: 'INR',
    status: 'CANCELLED',
    createdAt: new Date('2028-06-15T17:32:00Z')
  });

  // Payment for Org B: PAID (amount 100)
  await Payment.create({
    organizationId: orgB._id,
    userId: adminB._id,
    bookingId: bookingB1._id,
    provider: 'MOCK',
    providerOrderId: `ord_b_${Date.now()}`,
    amount: 100,
    currency: 'INR',
    status: 'PAID',
    createdAt: new Date('2028-06-15T09:05:00Z')
  });

  // ==================================================
  // 1. DASHBOARD SUMMARY TESTS
  // ==================================================
  await t.test('1. Tenant can access own analytics summary with correct KPIs', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/analytics/summary?startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    const data = res.body;

    assert.equal(data.facilities.total, 2, 'Org A has 2 active facilities');
    assert.equal(data.spots.total, 4, 'Org A has 4 total spots');
    assert.equal(data.spots.occupied, 1);
    assert.equal(data.spots.reserved, 1);
    assert.equal(data.spots.available, 2);

    assert.equal(data.bookings.total, 3, 'Org A has 3 bookings');
    assert.equal(data.bookings.completed, 1);
    assert.equal(data.bookings.confirmed, 1);
    assert.equal(data.bookings.cancelled, 1);
    assert.equal(data.bookings.cancellationRate, 33.3);

    // Financials: Only PAID payments count as revenue (120 + 180 = 300)
    assert.equal(data.financials.revenue, 300, 'Collected revenue must sum only PAID payments');
    assert.equal(data.financials.bookingValue, 300, 'Non-cancelled booking value (120+180=300)');
    assert.equal(data.financials.paidTransactions, 2);
    assert.equal(data.financials.failedTransactions, 1);
    assert.equal(data.financials.paymentSuccessRate, 66.7);
  });

  // ==================================================
  // 2. TENANT ISOLATION TESTS
  // ==================================================
  await t.test('2. Cross-tenant analytics are completely isolated', async () => {
    const resB = await makeRequest(
      server,
      `/api/v1/analytics/summary?startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenB
    );

    assert.equal(resB.status, 200);
    assert.equal(resB.body.facilities.total, 1, 'Org B has only 1 facility');
    assert.equal(resB.body.spots.total, 1, 'Org B has only 1 spot');
    assert.equal(resB.body.bookings.total, 1, 'Org B has only 1 booking');
    assert.equal(resB.body.financials.revenue, 100, 'Org B revenue must be 100, not seeing Org A');

    // Attempting to query Org A facility using Org B token must return 404
    const resForbidden = await makeRequest(
      server,
      `/api/v1/analytics/utilization?facilityId=${facilityA1._id}`,
      'GET',
      tokenB
    );
    assert.equal(resForbidden.status, 404, 'Must reject foreign facility query with 404');
  });

  // ==================================================
  // 3. UTILIZATION ANALYTICS TESTS
  // ==================================================
  await t.test('3. Utilization calculations are correct across facilities and spots', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/analytics/utilization?facilityId=${facilityA1._id}&startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.summary.totalSpots, 3, 'Facility A1 has 3 spots');

    // Booked hours: bookingA1 is 2 hours, bookingA2 is 3 hours => 5 hours total
    assert.equal(res.body.summary.occupiedHours, 5);
    assert.equal(res.body.summary.bookingsCount, 2);

    // Total capacity = 3 spots * 24 hours (approx) = 72 spot-hours
    assert.ok(res.body.summary.totalCapacitySpotHours >= 71);
    assert.ok(res.body.summary.averageUtilizationPercentage > 0);
  });

  await t.test('4. Floor filtering in utilization restricts scope to requested floor', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/analytics/utilization?facilityId=${facilityA1._id}&floorId=${floorA1._id}&startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.summary.totalSpots, 2, 'Floor 1 has exactly 2 spots');
    assert.equal(res.body.summary.occupiedHours, 5, 'Floor 1 contains both bookings (A1-01 and A1-02)');
  });

  // ==================================================
  // 5. OCCUPANCY TRENDS TESTS
  // ==================================================
  await t.test('5. Occupancy trends returns hourly and daily time buckets', async () => {
    const resHourly = await makeRequest(
      server,
      `/api/v1/analytics/occupancy?facilityId=${facilityA1._id}&bucket=hourly&startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );

    assert.equal(resHourly.status, 200);
    assert.equal(resHourly.body.bucketType, 'hourly');
    assert.ok(Array.isArray(resHourly.body.data));
    assert.ok(resHourly.body.data.length >= 2, 'Must have at least 2 active hourly buckets');

    const b10 = resHourly.body.data.find((d) => d.bucket.includes('10:00'));
    assert.ok(b10, 'Bucket for 10:00 must exist');
    assert.equal(b10.bookingsCount, 1);
    assert.equal(b10.totalSpots, 3);

    // Daily bucket
    const resDaily = await makeRequest(
      server,
      `/api/v1/analytics/occupancy?facilityId=${facilityA1._id}&bucket=daily&startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );
    assert.equal(resDaily.status, 200);
    assert.equal(resDaily.body.bucketType, 'daily');
    assert.equal(resDaily.body.data.length, 1);
    assert.equal(resDaily.body.data[0].bucket, '2028-06-15');
    assert.equal(resDaily.body.data[0].bookingsCount, 2);
  });

  // ==================================================
  // 6. PEAK HOURS TESTS
  // ==================================================
  await t.test('6. Peak hours identifies busiest hour and returns 24-hour distribution', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/analytics/peak-hours?facilityId=${facilityA1._id}&startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.hourlyDistribution.length, 24, 'Must return all 24 hours (0-23)');

    const hour10 = res.body.hourlyDistribution.find((h) => h.hour === 10);
    const hour14 = res.body.hourlyDistribution.find((h) => h.hour === 14);

    assert.equal(hour10.bookingVolume, 1);
    assert.equal(hour14.bookingVolume, 1);
    assert.ok(res.body.busiestHoursRanked.length > 0);
  });

  // ==================================================
  // 7. REVENUE ANALYTICS TESTS
  // ==================================================
  await t.test('7. Revenue analytics counts ONLY paid payments and excludes failed/cancelled', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/analytics/revenue?startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    const data = res.body;

    // Total collected revenue must be 120 + 180 = 300
    assert.equal(data.summary.collectedRevenue, 300);
    assert.equal(data.summary.paidTransactions, 2);
    assert.equal(data.summary.failedTransactions, 1);
    assert.equal(data.summary.cancelledTransactions, 1);
    assert.equal(data.summary.averageTransactionValue, 150); // (120+180)/2

    // Breakdown by facility
    assert.ok(Array.isArray(data.byFacility));
    const facA1 = data.byFacility.find((f) => f.facilityId === String(facilityA1._id));
    assert.ok(facA1);
    assert.equal(facA1.revenue, 300);

    // Breakdown by spot type (STANDARD had 120, EV had 180)
    assert.ok(Array.isArray(data.bySpotType));
    const evType = data.bySpotType.find((s) => s.spotType === 'EV');
    const stdType = data.bySpotType.find((s) => s.spotType === 'STANDARD');
    assert.equal(evType?.revenue, 180);
    assert.equal(stdType?.revenue, 120);
  });

  // ==================================================
  // 8. FACILITY PERFORMANCE TESTS
  // ==================================================
  await t.test('8. Facility performance returns operational KPIs per facility', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/analytics/facilities?startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.totalFacilities, 2);

    const f1 = res.body.facilities.find((f) => f.facilityId === String(facilityA1._id));
    assert.ok(f1);
    assert.equal(f1.totalSpots, 3);
    assert.equal(f1.bookingCount, 3);
    assert.equal(f1.completedCount, 1);
    assert.equal(f1.cancellationCount, 1);
    assert.equal(f1.revenue, 300);
    assert.ok(f1.averageBookingDurationHours > 0);
  });

  // ==================================================
  // 9. SPOT PERFORMANCE DRILL-DOWN TESTS
  // ==================================================
  await t.test('9. Spot performance drill-down returns per-spot KPIs and pagination', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/analytics/spots?facilityId=${facilityA1._id}&startDate=${winStart.toISOString()}&endDate=${winEnd.toISOString()}&limit=10`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.pagination.total, 3, 'Facility A1 has 3 spots');
    assert.equal(res.body.spots.length, 3);

    const s1 = res.body.spots.find((s) => s.number === 'A1-01');
    assert.ok(s1);
    assert.equal(s1.bookingsCount, 1);
    assert.equal(s1.revenue, 120);
    assert.equal(s1.totalHoursBooked, 2);

    const s2 = res.body.spots.find((s) => s.number === 'A1-02');
    assert.ok(s2);
    assert.equal(s2.bookingsCount, 1);
    assert.equal(s2.revenue, 180);
    assert.equal(s2.completedCount, 1);
  });

  // ==================================================
  // 10. ROLE-BASED ACCESS AUTHORIZATION TESTS
  // ==================================================
  await t.test('10. Operator can access operational analytics but is blocked from financial revenue analytics', async () => {
    // Operator can access summary
    const resSummary = await makeRequest(
      server,
      '/api/v1/analytics/summary',
      'GET',
      tokenOpA
    );
    assert.equal(resSummary.status, 200);

    // Operator can access utilization
    const resUtil = await makeRequest(
      server,
      '/api/v1/analytics/utilization',
      'GET',
      tokenOpA
    );
    assert.equal(resUtil.status, 200);

    // Operator is FORBIDDEN from revenue analytics
    const resRev = await makeRequest(
      server,
      '/api/v1/analytics/revenue',
      'GET',
      tokenOpA
    );
    assert.equal(resRev.status, 403, 'Operator role must be forbidden from /api/v1/analytics/revenue');
  });

  // ==================================================
  // 11. EXISTING ADMIN REPORTS AGGREGATION TEST
  // ==================================================
  await t.test('11. Existing admin reports endpoint (/api/v1/admin/reports) works via MongoDB aggregation', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/admin/reports?from=${winStart.toISOString()}&to=${winEnd.toISOString()}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.period);
    assert.ok(res.body.totals);
    assert.equal(res.body.totals.bookings, 3);
    assert.equal(res.body.totals.revenue, 300); // 120 + 180, excluding cancelled 60

    assert.ok(Array.isArray(res.body.bookings));
    assert.equal(res.body.bookings.length, 3);
    const b = res.body.bookings[0];
    assert.ok(b.lot);
    assert.ok(b.user);
    assert.ok(b.slot);
  });
});
