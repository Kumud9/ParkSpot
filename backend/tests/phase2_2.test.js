process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('crypto');
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
  OccupancyEvent,
  AuditLog,
  Payment
} = require('../src/models');
const occupancyService = require('../src/services/occupancy.service');
const auditService = require('../src/services/audit.service');
const paymentService = require('../src/services/payment.service');
const bookingService = require('../src/services/booking.service');

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

function makeRequest(server, path, method = 'GET', token = null, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const payload = body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
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

test('PHASE 2.2: Occupancy, Events, Audit Logs, and Payments Test Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (process.argv[1] && process.argv[1].includes('phase2_2.test.js')) {
      await mongoose.disconnect();
    }
  });

  // Seed two distinct tenant organizations
  const orgA = await Organization.create({
    name: 'Tenant Alpha Operations',
    slug: `alpha-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: 'admin@alpha.test'
  });

  const orgB = await Organization.create({
    name: 'Tenant Beta Parking',
    slug: `beta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: 'admin@beta.test'
  });

  // Users for Org A
  const adminA = await User.create({
    name: 'Alpha Admin',
    email: `alpha-admin-${Date.now()}@test.com`,
    passwordHash: 'secret-hash-12345',
    role: 'ADMIN',
    organizationId: orgA._id
  });
  const tokenA = createToken(adminA);

  const operatorA = await User.create({
    name: 'Alpha Operator',
    email: `alpha-op-${Date.now()}@test.com`,
    passwordHash: 'secret-hash-12345',
    role: 'OPERATOR',
    organizationId: orgA._id
  });
  const tokenOpA = createToken(operatorA);

  // User for Org B
  const adminB = await User.create({
    name: 'Beta Admin',
    email: `beta-admin-${Date.now()}@test.com`,
    passwordHash: 'secret-hash-12345',
    role: 'ADMIN',
    organizationId: orgB._id
  });
  const tokenB = createToken(adminB);

  // Setup Facilities, Floors, and Slots
  const facilityA = await ParkingLot.create({
    organizationId: orgA._id,
    name: 'Alpha Plaza Garage',
    address: '100 Alpha St',
    city: 'AlphaCity',
    hourlyRate: 50,
    dailyRate: 300,
    active: true
  });

  const floorA1 = await Floor.create({
    facilityId: facilityA._id,
    organizationId: orgA._id,
    name: 'Floor 1',
    floorNumber: 1,
    capacity: 2
  });

  const floorA2 = await Floor.create({
    facilityId: facilityA._id,
    organizationId: orgA._id,
    name: 'Floor 2',
    floorNumber: 2,
    capacity: 2
  });

  // Spots for Facility A
  // Spot 1: Floor 1 - AVAILABLE
  const spotA1 = await ParkingSlot.create({
    lotId: facilityA._id,
    floorId: floorA1._id,
    organizationId: orgA._id,
    number: 'A-101',
    level: '1',
    type: 'STANDARD',
    status: 'AVAILABLE',
    isActive: true
  });

  // Spot 2: Floor 1 - OCCUPIED
  const spotA2 = await ParkingSlot.create({
    lotId: facilityA._id,
    floorId: floorA1._id,
    organizationId: orgA._id,
    number: 'A-102',
    level: '1',
    type: 'EV',
    status: 'OCCUPIED',
    isActive: true
  });

  // Spot 3: Floor 2 - RESERVED
  const spotA3 = await ParkingSlot.create({
    lotId: facilityA._id,
    floorId: floorA2._id,
    organizationId: orgA._id,
    number: 'A-201',
    level: '2',
    type: 'STANDARD',
    status: 'RESERVED',
    isActive: true
  });

  // Spot 4: Floor 2 - BLOCKED / MAINTENANCE
  const spotA4 = await ParkingSlot.create({
    lotId: facilityA._id,
    floorId: floorA2._id,
    organizationId: orgA._id,
    number: 'A-202',
    level: '2',
    type: 'ACCESSIBLE',
    status: 'BLOCKED',
    isActive: false
  });

  // Facility for Tenant B
  const facilityB = await ParkingLot.create({
    organizationId: orgB._id,
    name: 'Beta Central Lot',
    address: '200 Beta Blvd',
    city: 'BetaCity',
    hourlyRate: 40,
    dailyRate: 250,
    active: true
  });

  const spotB1 = await ParkingSlot.create({
    lotId: facilityB._id,
    organizationId: orgB._id,
    number: 'B-101',
    status: 'AVAILABLE',
    isActive: true
  });

  // ==================================================
  // 1. OCCUPANCY QUERYING TESTS
  // ==================================================
  await t.test('Occupancy: Tenant can query own facility occupancy with correct metrics and grouping', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/occupancy`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200, 'Should return 200 OK');
    const data = res.body;

    assert.equal(data.facility.id, String(facilityA._id));
    assert.equal(data.summary.totalSpots, 4);
    assert.equal(data.summary.occupied, 1);
    assert.equal(data.summary.reserved, 1);
    assert.equal(data.summary.available, 1);
    assert.equal(data.summary.blocked, 1);
    assert.equal(data.summary.occupancyPercentage, 25.0);

    // Grouping by floor
    assert.equal(data.floors.length, 2);
    const fl1 = data.floors.find((f) => f.name === 'Floor 1');
    assert.ok(fl1);
    assert.equal(fl1.summary.totalSpots, 2);
    assert.equal(fl1.summary.occupied, 1);
    assert.equal(fl1.summary.available, 1);

    // Individual spot state
    assert.equal(data.spots.length, 4);
    const s101 = data.spots.find((s) => s.number === 'A-101');
    assert.equal(s101.status, 'AVAILABLE');
    assert.equal(s101.isActive, true);
  });

  await t.test('Occupancy: Floor filtering works correctly', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/occupancy?floorId=${floorA1._id}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.summary.totalSpots, 2);
    assert.equal(res.body.spots.length, 2);
    assert.ok(res.body.spots.every((s) => s.floorId === String(floorA1._id)));
  });

  await t.test('Occupancy: Cross-tenant occupancy querying is blocked', async () => {
    // Tenant B trying to query Tenant A facility
    const res = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/occupancy`,
      'GET',
      tokenB
    );

    assert.ok(res.status === 404 || res.status === 403, 'Must return 404 or 403 for facility not belonging to tenant');
  });

  // ==================================================
  // 2. EVENT INGESTION TESTS
  // ==================================================
  await t.test('Events: Valid operational event updates spot state and appends OccupancyEvent', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/events`,
      'POST',
      tokenA,
      {
        spotId: String(spotA1._id),
        floorId: String(floorA1._id),
        eventType: 'OCCUPIED',
        source: 'SYSTEM',
        metadata: { confidence: 0.98, eventReference: 'EVT-9001' }
      }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.spot.status, 'OCCUPIED');

    // Verify spot in database
    const updatedSpot = await ParkingSlot.findById(spotA1._id);
    assert.equal(updatedSpot.status, 'OCCUPIED');

    // Verify append-only OccupancyEvent created
    const event = await OccupancyEvent.findOne({
      spotId: spotA1._id,
      eventType: 'SPOT_OCCUPIED',
      source: 'SYSTEM'
    });
    assert.ok(event);
    assert.equal(event.metadata.eventReference, 'EVT-9001');
  });

  await t.test('Events: Operator event creates an AuditLog record', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/events`,
      'POST',
      tokenOpA,
      {
        spotId: String(spotA1._id),
        floorId: String(floorA1._id),
        eventType: 'BLOCKED',
        source: 'OPERATOR',
        metadata: { reason: 'Oil spill clean up' }
      }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.spot.status, 'BLOCKED');

    // Verify AuditLog was recorded
    const audit = await AuditLog.findOne({
      entityId: String(spotA1._id),
      action: 'SPOT_BLOCKED'
    });
    assert.ok(audit, 'AuditLog must be recorded for operator state changes');
    assert.equal(audit.newValue.status, 'BLOCKED');
  });

  await t.test('Events: Invalid event type is rejected by validation', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/events`,
      'POST',
      tokenA,
      {
        spotId: String(spotA1._id),
        eventType: 'FLYING_CAR',
        source: 'SYSTEM'
      }
    );

    assert.equal(res.status, 400);
  });

  await t.test('Events: Cross-tenant spot event injection is blocked', async () => {
    // Tenant A attempts to send event for Tenant B spot
    const res = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/events`,
      'POST',
      tokenA,
      {
        spotId: String(spotB1._id),
        eventType: 'OCCUPIED',
        source: 'SYSTEM'
      }
    );

    assert.equal(res.status, 404, 'Must reject spot not in facility/tenant');
  });

  await t.test('Events: Repeated/duplicate events are handled safely and append history', async () => {
    // Send VACATED event twice
    const res1 = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/events`,
      'POST',
      tokenA,
      {
        spotId: String(spotA1._id),
        floorId: String(floorA1._id),
        eventType: 'VACATED',
        source: 'SYSTEM'
      }
    );
    assert.equal(res1.status, 201);
    assert.equal(res1.body.spot.status, 'AVAILABLE');

    const res2 = await makeRequest(
      server,
      `/api/v1/facilities/${facilityA._id}/events`,
      'POST',
      tokenA,
      {
        spotId: String(spotA1._id),
        floorId: String(floorA1._id),
        eventType: 'VACATED',
        source: 'SYSTEM'
      }
    );
    assert.equal(res2.status, 201);
    assert.equal(res2.body.spot.status, 'AVAILABLE');

    // Historical events are preserved (both exist)
    const eventCount = await OccupancyEvent.countDocuments({
      spotId: spotA1._id,
      eventType: 'SPOT_VACATED'
    });
    assert.ok(eventCount >= 2, 'Events must be append-only history');
  });

  // ==================================================
  // 3. AUDIT LOG VIEWER TESTS
  // ==================================================
  await t.test('Audit Logs: Tenant can retrieve own audit logs with pagination and deterministic sorting', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/admin/audit-logs?page=1&limit=5',
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.auditLogs);
    assert.ok(res.body.pagination);
    assert.equal(res.body.pagination.page, 1);
    assert.ok(res.body.pagination.total >= 1);
    assert.ok(res.body.auditLogs.length <= 5);

    // Verify sorting: newest first
    for (let i = 0; i < res.body.auditLogs.length - 1; i++) {
      const t1 = new Date(res.body.auditLogs[i].timestamp).getTime();
      const t2 = new Date(res.body.auditLogs[i + 1].timestamp).getTime();
      assert.ok(t1 >= t2, 'Audit logs must be sorted by newest first');
    }
  });

  await t.test('Audit Logs: Filters by action and entityType work correctly', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/admin/audit-logs?action=SPOT_BLOCKED&entityType=ParkingSlot',
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.auditLogs.length >= 1);
    assert.ok(res.body.auditLogs.every((l) => l.action === 'SPOT_BLOCKED' && l.entityType === 'ParkingSlot'));
  });

  await t.test('Audit Logs: Cross-tenant audit logs are completely isolated', async () => {
    // Tenant B queries audit logs
    const resB = await makeRequest(
      server,
      '/api/v1/admin/audit-logs',
      'GET',
      tokenB
    );

    assert.equal(resB.status, 200);
    // None of Tenant A's logs should appear in Tenant B's results
    for (const log of resB.body.auditLogs) {
      assert.equal(String(log.organizationId), String(orgB._id));
      assert.notEqual(String(log.organizationId), String(orgA._id));
    }
  });

  await t.test('Audit Logs: Sensitive credentials are never exposed at read or write time', async () => {
    // Create an audit log that deliberately includes sensitive fields
    const testLog = await auditService.logAction({
      organizationId: orgA._id,
      userId: adminA._id,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: adminA._id,
      oldValue: { name: 'Alpha Admin', passwordHash: 'hash-secret-999', token: 'jwt-super-secret' },
      newValue: { name: 'Alpha Admin 2', password: 'new-plain-password', secret: 'oauth-secret' }
    });

    // Verify stored log sanitized
    assert.equal(testLog.oldValue.passwordHash, undefined);
    assert.equal(testLog.oldValue.token, undefined);
    assert.equal(testLog.newValue.password, undefined);
    assert.equal(testLog.newValue.secret, undefined);

    // Verify endpoint read response sanitized
    const res = await makeRequest(
      server,
      `/api/v1/admin/audit-logs?action=USER_UPDATED&entityId=${adminA._id}`,
      'GET',
      tokenA
    );
    assert.equal(res.status, 200);
    const readLog = res.body.auditLogs.find((l) => l.id === String(testLog._id));
    assert.ok(readLog);
    assert.equal(readLog.oldValue?.passwordHash, undefined);
    assert.equal(readLog.newValue?.password, undefined);
  });

  // ==================================================
  // 4. PAYMENTS GATEWAY TESTS
  // ==================================================
  // Create a booking for payment testing
  const bookingA = await Booking.create({
    userId: adminA._id,
    lotId: facilityA._id,
    slotId: spotA3._id,
    floorId: floorA2._id,
    organizationId: orgA._id,
    startTime: new Date(Date.now() + 3600000),
    endTime: new Date(Date.now() + 7200000),
    type: 'HOURLY',
    status: 'PENDING_PAYMENT',
    totalAmount: 100
  });

  let createdOrderId = null;

  await t.test('Payments: Create payment order successfully', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      tokenA,
      { bookingId: String(bookingA._id) }
    );

    assert.equal(res.status, 201);
    assert.ok(res.body.payment);
    assert.ok(res.body.order);
    assert.equal(res.body.payment.amount, 100);
    assert.equal(res.body.payment.currency, 'INR');
    assert.equal(res.body.payment.status, 'CREATED');

    createdOrderId = res.body.order.id;
    assert.ok(createdOrderId);

    // Verify Payment document in database
    const payment = await Payment.findOne({ providerOrderId: createdOrderId });
    assert.ok(payment);
    assert.equal(String(payment.organizationId), String(orgA._id));
  });

  await t.test('Payments: Order creation idempotency returns existing active order', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      tokenA,
      { bookingId: String(bookingA._id) }
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.order.id, createdOrderId, 'Must return same providerOrderId');
    const paymentCount = await Payment.countDocuments({ bookingId: bookingA._id });
    assert.equal(paymentCount, 1, 'Should not create duplicate payment records');
  });

  await t.test('Payments: Cross-tenant payment order creation is forbidden', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      tokenB, // Tenant B attempting to pay for Tenant A booking
      { bookingId: String(bookingA._id) }
    );

    assert.equal(res.status, 403, 'Cross-tenant booking payment order must be forbidden');
  });

  await t.test('Payments: Invalid booking id is rejected', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      tokenA,
      { bookingId: '60c72b2f9b1d8b0015999999' }
    );

    assert.equal(res.status, 404);
  });

  await t.test('Payments: Signature verification rejects invalid signature and marks payment FAILED', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      tokenA,
      {
        orderId: createdOrderId,
        paymentId: 'pay_mock_12345',
        signature: 'invalid_fraudulent_signature'
      }
    );

    assert.equal(res.status, 400);

    const payment = await Payment.findOne({ providerOrderId: createdOrderId });
    assert.equal(payment.status, 'FAILED');
  });

  await t.test('Payments: Valid signature verification marks Payment PAID and Booking CONFIRMED', async () => {
    // Reset payment to PENDING/CREATED for valid verification test
    await Payment.updateOne({ providerOrderId: createdOrderId }, { $set: { status: 'CREATED' } });

    const res = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      tokenA,
      {
        orderId: createdOrderId,
        paymentId: 'pay_mock_verified_99',
        signature: 'mock_valid_signature'
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.payment.status, 'PAID');

    // Verify Booking updated to CONFIRMED
    const booking = await Booking.findById(bookingA._id);
    assert.equal(booking.status, 'CONFIRMED');

    // Verify Payment document in DB
    const payment = await Payment.findOne({ providerOrderId: createdOrderId });
    assert.equal(payment.status, 'PAID');
    assert.equal(payment.providerPaymentId, 'pay_mock_verified_99');
  });

  await t.test('Payments: Duplicate verification is idempotent', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      tokenA,
      {
        orderId: createdOrderId,
        paymentId: 'pay_mock_verified_99',
        signature: 'mock_valid_signature'
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.idempotent, true);
    assert.equal(res.body.payment.status, 'PAID');
  });

  await t.test('Payments: Cannot create payment order for already paid booking', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      tokenA,
      { bookingId: String(bookingA._id) }
    );

    assert.equal(res.status, 409);
    assert.ok(res.body.code === 'BOOKING_ALREADY_PAID' || res.body.error?.code === 'BOOKING_ALREADY_PAID');
  });

  await t.test('Payments: Webhook handling is safe and idempotent', async () => {
    // Create new booking and order for webhook verification
    const bookingW = await Booking.create({
      userId: adminA._id,
      lotId: facilityA._id,
      slotId: spotA1._id,
      organizationId: orgA._id,
      startTime: new Date(Date.now() + 86400000),
      endTime: new Date(Date.now() + 90000000),
      type: 'HOURLY',
      status: 'PENDING_PAYMENT',
      totalAmount: 150
    });

    const orderRes = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      tokenA,
      { bookingId: String(bookingW._id) }
    );
    const webhookOrderId = orderRes.body.order.id;

    // Simulate Razorpay webhook event payload
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_777',
            order_id: webhookOrderId,
            amount: 15000,
            status: 'captured'
          }
        }
      }
    };

    // First webhook call
    const hookRes1 = await makeRequest(
      server,
      '/api/v1/payments/webhook',
      'POST',
      null,
      webhookPayload
    );

    assert.equal(hookRes1.status, 200);
    assert.equal(hookRes1.body.status, 'PAID');

    const paymentW = await Payment.findOne({ providerOrderId: webhookOrderId });
    assert.equal(paymentW.status, 'PAID');
    assert.equal(paymentW.providerPaymentId, 'pay_webhook_777');

    const updatedBookingW = await Booking.findById(bookingW._id);
    assert.equal(updatedBookingW.status, 'CONFIRMED');

    // Duplicate webhook call
    const hookRes2 = await makeRequest(
      server,
      '/api/v1/payments/webhook',
      'POST',
      null,
      webhookPayload
    );

    assert.equal(hookRes2.status, 200);
    assert.equal(hookRes2.body.idempotent, true);
  });

  await t.test('Payments: Invalid state transition rejected', async () => {
    // Create a payment with REFUNDED status
    const cancelledPayment = await Payment.create({
      organizationId: orgA._id,
      userId: adminA._id,
      bookingId: bookingA._id,
      provider: 'MOCK',
      providerOrderId: `order_cancelled_${Date.now()}`,
      amount: 100,
      currency: 'INR',
      status: 'CANCELLED'
    });

    const res = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      tokenA,
      {
        orderId: cancelledPayment.providerOrderId,
        paymentId: 'pay_mock_refunded_1',
        signature: 'mock_valid_signature'
      }
    );

    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, 'INVALID_PAYMENT_STATE');
  });

  // ==================================================
  // 5. BOOKING / PAYMENT CONSISTENCY & LIFECYCLE
  // ==================================================
  await t.test('Consistency: Stale unpaid PENDING_PAYMENT booking is canceled by lifecycle worker', async () => {
    // Create a stale pending payment booking (older than 15 minutes)
    const staleTime = new Date(Date.now() - 20 * 60 * 1000);
    const staleBooking = await Booking.create({
      userId: adminA._id,
      lotId: facilityA._id,
      slotId: spotA1._id,
      organizationId: orgA._id,
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 7200000),
      type: 'HOURLY',
      status: 'PENDING_PAYMENT',
      totalAmount: 100,
      createdAt: staleTime
    });

    // Run completeExpiredBookings
    await bookingService.completeExpiredBookings();

    const checked = await Booking.findById(staleBooking._id);
    assert.equal(checked.status, 'CANCELED', 'Stale unpaid booking must be canceled by lifecycle cleanup');
  });
});
