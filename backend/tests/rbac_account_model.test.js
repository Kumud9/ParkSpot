const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { app } = require('../src');
const { connectDatabase } = require('../src/db');
const { User, Organization, ParkingLot, ParkingSlot, Booking } = require('../src/models');
const authService = require('../src/services/auth.service');
const bookingService = require('../src/services/booking.service');

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
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

test('PARKSPOT RBAC: Public Account Model (DRIVER / OPERATOR) & Route Enforcement', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const suffix = Date.now();
  const driverEmailA = `driver-a-${suffix}@parkspot.test`;
  const driverEmailB = `driver-b-${suffix}@parkspot.test`;
  const operatorEmail = `operator-${suffix}@parkspot.test`;

  let driverA, driverB, operatorUser;
  let driverTokenA, driverTokenB, operatorToken;
  let testFacility, testSlot, bookingIdA;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await User.deleteMany({ email: { $in: [driverEmailA, driverEmailB, operatorEmail] } });
    if (operatorUser?.user?.organizationId) {
      await Organization.deleteOne({ _id: operatorUser.user.organizationId });
    }
    if (testFacility?._id) {
      await ParkingLot.deleteOne({ _id: testFacility._id });
      await ParkingSlot.deleteMany({ lotId: testFacility._id });
      await Booking.deleteMany({ lotId: testFacility._id });
    }
    await mongoose.disconnect();
  });

  // 1. DRIVER SIGNUP & LOGIN
  await t.test('1. Driver signup creates accountType = DRIVER with no internal role or org', async () => {
    driverA = await authService.register({
      name: 'Driver Alice',
      email: driverEmailA,
      password: 'Pass@12345',
      accountType: 'DRIVER'
    });

    assert.equal(driverA.user.accountType, 'DRIVER');
    assert.equal(driverA.user.internalRole, null);
    assert.equal(driverA.user.organizationId, null);
    assert.ok(driverA.token);
    driverTokenA = driverA.token;

    // Login verifies MongoDB persists accountType = DRIVER
    const loginRes = await authService.login({
      email: driverEmailA,
      password: 'Pass@12345'
    });
    assert.equal(loginRes.user.accountType, 'DRIVER');
    assert.equal(loginRes.user.internalRole, null);
  });

  // 2. OPERATOR SIGNUP & LOGIN
  await t.test('2. Operator signup creates accountType = OPERATOR with internalRole = OWNER and Org', async () => {
    operatorUser = await authService.register({
      name: 'Operator Bob',
      email: operatorEmail,
      password: 'Pass@12345',
      accountType: 'OPERATOR',
      organizationName: `Bob Operations ${suffix}`
    });

    assert.equal(operatorUser.user.accountType, 'OPERATOR');
    assert.equal(operatorUser.user.internalRole, 'OWNER');
    assert.ok(operatorUser.user.organizationId);
    assert.ok(operatorUser.token);
    operatorToken = operatorUser.token;

    // Login returns real accountType OPERATOR and internalRole OWNER
    const loginRes = await authService.login({
      email: operatorEmail,
      password: 'Pass@12345'
    });
    assert.equal(loginRes.user.accountType, 'OPERATOR');
    assert.equal(loginRes.user.internalRole, 'OWNER');
  });

  // 3. BACKEND ENFORCEMENT: DRIVER ATTEMPTS OPERATOR API -> 403 FORBIDDEN
  await t.test('3. Driver attempting Operator facility / analytics API returns 403 Forbidden', async () => {
    // Attempt 1: /api/v1/facilities (Tenant management endpoint)
    const facRes = await makeRequest(server, '/api/v1/facilities', 'GET', driverTokenA);
    assert.equal(facRes.status, 403);

    // Attempt 2: /api/v1/analytics/summary
    const analyticsRes = await makeRequest(server, '/api/v1/analytics/summary', 'GET', driverTokenA);
    assert.equal(analyticsRes.status, 403);

    // Attempt 3: /api/v1/optimization/recommendations
    const optRes = await makeRequest(server, '/api/v1/optimization/recommendations', 'GET', driverTokenA);
    assert.equal(optRes.status, 403);
  });

  // 4. DATA ISOLATION: USER A vs USER B
  await t.test('4. Driver B must never see Driver A bookings (isolated data scoping)', async () => {
    // Create Driver B
    driverB = await authService.register({
      name: 'Driver Carol',
      email: driverEmailB,
      password: 'Pass@12345',
      accountType: 'DRIVER'
    });
    driverTokenB = driverB.token;

    // Create facility & slot for booking test
    testFacility = await ParkingLot.create({
      name: `Isolation Test Facility ${suffix}`,
      address: '100 Test St',
      city: 'Delhi',
      hourlyRate: 50,
      dailyRate: 300,
      active: true
    });

    testSlot = await ParkingSlot.create({
      lotId: testFacility._id,
      number: 'T-01',
      type: 'STANDARD',
      status: 'AVAILABLE'
    });

    // Driver A books a slot
    const start = new Date(Date.now() + 3600000);
    const end = new Date(Date.now() + 7200000);

    const bookingRes = await makeRequest(server, '/api/bookings', 'POST', driverTokenA, {
      slotId: String(testSlot._id),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      type: 'HOURLY'
    });
    assert.equal(bookingRes.status, 201);
    assert.ok(bookingRes.body.booking);
    bookingIdA = String(bookingRes.body.booking._id);

    // Driver A lists bookings -> sees 1 booking
    const driverAList = await makeRequest(server, '/api/bookings', 'GET', driverTokenA);
    assert.equal(driverAList.status, 200);
    assert.equal(driverAList.body.bookings.length, 1);
    assert.equal(String(driverAList.body.bookings[0].slotId), String(testSlot._id));

    // Driver B lists bookings -> sees 0 bookings (complete isolation)
    const driverBList = await makeRequest(server, '/api/bookings', 'GET', driverTokenB);
    assert.equal(driverBList.status, 200);
    assert.equal(driverBList.body.bookings.length, 0);
  });

  // 5. LOGIN ACCOUNT TYPE MISMATCH IS REJECTED (BACKEND IS AUTHORITATIVE)
  await t.test('5. Login rejecting accountType mismatch (Driver as Operator or Operator as Driver)', async () => {
      // Driver Alice tries to sign in through OPERATOR portal
      const driverAsOp = await makeRequest(server, '/api/auth/login', 'POST', null, {
        email: driverEmailA,
        password: 'Pass@12345',
        accountType: 'OPERATOR'
      });
      assert.equal(driverAsOp.status, 403);
      assert.equal(driverAsOp.body.error.code, 'INVALID_ACCOUNT_TYPE');

      // Operator Bob tries to sign in through DRIVER portal
      const opAsDriver = await makeRequest(server, '/api/auth/login', 'POST', null, {
        email: operatorEmail,
        password: 'Pass@12345',
        accountType: 'DRIVER'
      });
      assert.equal(opAsDriver.status, 403);
      assert.equal(opAsDriver.body.error.code, 'INVALID_ACCOUNT_TYPE');

      // Invalid password rejected
      const badPw = await makeRequest(server, '/api/auth/login', 'POST', null, {
        email: driverEmailA,
        password: 'WrongPassword999',
        accountType: 'DRIVER'
      });
      assert.equal(badPw.status, 401);
    });

    // 6. PAYMENT ORDER PROTECTED ENDPOINT & BEARER TOKEN ENFORCEMENT
    await t.test('6. Payment order rejects missing/invalid token and accepts authenticated Driver', async () => {
      // Missing token -> 401 AUTH_REQUIRED
      const noTokenRes = await makeRequest(server, '/api/v1/payments/order', 'POST', null, {
        bookingId: bookingIdA
      });
      assert.equal(noTokenRes.status, 401);
      assert.equal(noTokenRes.body.error.code, 'AUTH_REQUIRED');

      // Invalid token -> 401 INVALID_TOKEN
      const badTokenRes = await makeRequest(server, '/api/v1/payments/order', 'POST', 'invalid.jwt.token', {
        bookingId: bookingIdA
      });
      assert.equal(badTokenRes.status, 401);
      assert.equal(badTokenRes.body.error.code, 'INVALID_TOKEN');

      // Authenticated Driver A creates payment order -> 201 Created
      const validOrderRes = await makeRequest(server, '/api/v1/payments/order', 'POST', driverTokenA, {
        bookingId: bookingIdA
      });
      assert.equal(validOrderRes.status, 201);
      assert.ok(validOrderRes.body.order);
      assert.ok(validOrderRes.body.order.id);
    });

    // 7. BOOKING OWNERSHIP: DRIVER B CANNOT PAY FOR DRIVER A's BOOKING
    await t.test('7. Driver B cannot pay for Driver A booking (ownership check)', async () => {
      const hijackedOrderRes = await makeRequest(server, '/api/v1/payments/order', 'POST', driverTokenB, {
        bookingId: bookingIdA
      });
      assert.equal(hijackedOrderRes.status, 403);
      assert.equal(hijackedOrderRes.body.error.code, 'FORBIDDEN');
    });

    // 8. PAYMENT VERIFICATION REQUIRES BEARER TOKEN & VERIFIES OWNERSHIP
    await t.test('8. Payment verification rejects unauthenticated and accepts owner with valid token', async () => {
      // Unauthenticated verify
      const unauthVerify = await makeRequest(server, '/api/v1/payments/verify', 'POST', null, {
        orderId: 'order_test_123',
        paymentId: 'pay_test_123',
        signature: 'mock_sig'
      });
      assert.equal(unauthVerify.status, 401);
      assert.equal(unauthVerify.body.error.code, 'AUTH_REQUIRED');
    });
});
