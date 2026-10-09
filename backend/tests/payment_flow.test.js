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
  User,
  ParkingLot,
  Floor,
  ParkingSlot,
  Booking,
  Payment
} = require('../src/models');
const { rupeesToPaise, calculatePrice } = require('../src/utils/booking');
const paymentService = require('../src/services/payment.service');
const { AppError } = require('../src/errors');

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

test('PAYMENT FLOW: Comprehensive Razorpay Amount & Verification Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (process.argv[1] && process.argv[1].includes('payment_flow.test.js')) {
      await mongoose.disconnect();
    }
  });

  // -------------------------------------------------------------
  // 1. AMOUNT HANDLING & RUPEES-TO-PAISE CONVERSION
  // -------------------------------------------------------------
  await t.test('1.1 Amount Handling: ₹80 produces exactly 8000 paise', () => {
    const paise = rupeesToPaise(80);
    assert.equal(paise, 8000, '₹80 must produce exactly 8000 paise');
    assert.notEqual(paise, 80, 'Paise must not be passed as unconverted rupees');
    assert.notEqual(paise, 800000, 'Paise must not be multiplied twice');
  });

  await t.test('1.2 Amount Handling: ₹100 produces exactly 10000 paise', () => {
    const paise = rupeesToPaise(100);
    assert.equal(paise, 10000, '₹100 must produce exactly 10000 paise');
  });

  await t.test('1.3 Amount Handling: Rejects zero, negative, and non-finite amounts', () => {
    assert.throws(() => rupeesToPaise(0), (err) => err instanceof AppError && err.code === 'INVALID_PAYMENT_AMOUNT');
    assert.throws(() => rupeesToPaise(-50), (err) => err instanceof AppError && err.code === 'INVALID_PAYMENT_AMOUNT');
    assert.throws(() => rupeesToPaise(NaN), (err) => err instanceof AppError && err.code === 'INVALID_PAYMENT_AMOUNT');
    assert.throws(() => rupeesToPaise(Infinity), (err) => err instanceof AppError && err.code === 'INVALID_PAYMENT_AMOUNT');
    assert.throws(() => rupeesToPaise('invalid'), (err) => err instanceof AppError && err.code === 'INVALID_PAYMENT_AMOUNT');
  });

  await t.test('1.4 Amount Handling: Fractional prices are rounded correctly to integer paise', () => {
    assert.equal(rupeesToPaise(80.50), 8050);
    assert.equal(rupeesToPaise(80.456), 8046);
    assert.equal(rupeesToPaise(1.00), 100);
  });

  await t.test('1.5 Amount Handling: Enforces minimum Razorpay amount of ₹1.00 (100 paise)', () => {
    assert.throws(() => rupeesToPaise(0.50), (err) => err instanceof AppError && err.code === 'AMOUNT_BELOW_MINIMUM');
    assert.throws(() => rupeesToPaise(0.99), (err) => err instanceof AppError && err.code === 'AMOUNT_BELOW_MINIMUM');
  });

  // -------------------------------------------------------------
  // SEED DATA FOR ORDER AND VERIFICATION TESTS
  // -------------------------------------------------------------
  const operator = await User.create({
    name: 'Operator Test',
    email: `operator-pay-${Date.now()}@test.com`,
    passwordHash: 'hashed-secret',
    role: 'OPERATOR'
  });

  const driver = await User.create({
    name: 'Driver Test',
    email: `driver-pay-${Date.now()}@test.com`,
    passwordHash: 'hashed-secret',
    role: 'DRIVER'
  });
  const driverToken = createToken(driver);

  const otherDriver = await User.create({
    name: 'Other Driver',
    email: `other-driver-${Date.now()}@test.com`,
    passwordHash: 'hashed-secret',
    role: 'DRIVER'
  });
  const otherDriverToken = createToken(otherDriver);

  // Newly registered operator facility with ₹40/hr
  const facility = await ParkingLot.create({
    name: 'Downtown Metro Park',
    address: '100 Metro Central Way, Connaught Place',
    city: 'New Delhi',
    operatorId: operator._id,
    capacity: 20,
    totalSpots: 20,
    hourlyRate: 40,
    dailyRate: 350,
    active: true,
    location: { type: 'Point', coordinates: [77.2167, 28.6328] }
  });

  const floor = await Floor.create({
    facilityId: facility._id,
    floorNumber: 1,
    name: 'Floor 1',
    floorName: 'Floor 1',
    capacity: 20
  });

  const slot = await ParkingSlot.create({
    lotId: facility._id,
    floorId: floor._id,
    number: 'P-101',
    spotNumber: 'P-101',
    type: 'STANDARD',
    status: 'AVAILABLE',
    isActive: true
  });

  // -------------------------------------------------------------
  // 2. ORDER CREATION TESTS
  // -------------------------------------------------------------
  let booking80;
  await t.test('2.1 Order Creation: Valid booking calculates ₹80 for 2 hours and creates correct order amount', async () => {
    const startTime = new Date(Date.now() + 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    const price = calculatePrice({
      start: startTime,
      end: endTime,
      type: 'HOURLY',
      hourlyRate: facility.hourlyRate,
      dailyRate: facility.dailyRate,
      spotType: slot.type
    });
    assert.equal(price.amount, 80, 'Price for 2 hours at ₹40/hr must be exactly ₹80');

    booking80 = await Booking.create({
      userId: driver._id,
      lotId: facility._id,
      slotId: slot._id,
      floorId: floor._id,
      startTime,
      endTime,
      type: 'HOURLY',
      status: 'PENDING_PAYMENT',
      totalAmount: 80
    });

    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      driverToken,
      { bookingId: String(booking80._id) }
    );

    assert.equal(res.status, 201);
    assert.ok(res.body.order);
    assert.equal(res.body.order.amount, 80, 'Order amount in rupees must match authoritative booking total');
    assert.equal(res.body.order.amountPaise, 8000, 'Order amount in paise must be exactly 8000 for ₹80');
    assert.equal(res.body.order.currency, 'INR');
    assert.ok(res.body.order.id);
  });

  await t.test('2.2 Order Creation: Client cannot override authoritative booking total', async () => {
    // Attempting to send client-supplied manipulated amount
    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      driverToken,
      {
        bookingId: String(booking80._id),
        amount: 1, // Manipulated amount
        amountPaise: 100
      }
    );

    // Endpoint must ignore client-supplied amount and return existing idempotent order of ₹80 (8000 paise)
    assert.equal(res.status, 201);
    assert.equal(res.body.order.amount, 80);
    assert.equal(res.body.order.amountPaise, 8000);
  });

  await t.test('2.3 Order Creation: Unauthorized driver cannot create order for another driver booking', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      otherDriverToken,
      { bookingId: String(booking80._id) }
    );

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FORBIDDEN');
  });

  await t.test('2.4 Order Creation: Below-minimum amounts are rejected before reaching payment provider', async () => {
    const subZeroBooking = await Booking.create({
      userId: driver._id,
      lotId: facility._id,
      slotId: slot._id,
      floorId: floor._id,
      startTime: new Date(Date.now() + 10 * 3600000),
      endTime: new Date(Date.now() + 11 * 3600000),
      type: 'HOURLY',
      status: 'PENDING_PAYMENT',
      totalAmount: 0.50 // Below ₹1.00 minimum
    });

    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      driverToken,
      { bookingId: String(subZeroBooking._id) }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'AMOUNT_BELOW_MINIMUM');
  });

  // -------------------------------------------------------------
  // 3. PAYMENT VERIFICATION TESTS
  // -------------------------------------------------------------
  let testPaymentOrder;
  await t.test('3.1 Setup fresh order for verification tests', async () => {
    const freshBooking = await Booking.create({
      userId: driver._id,
      lotId: facility._id,
      slotId: slot._id,
      floorId: floor._id,
      startTime: new Date(Date.now() + 20 * 3600000),
      endTime: new Date(Date.now() + 22 * 3600000),
      type: 'HOURLY',
      status: 'PENDING_PAYMENT',
      totalAmount: 80
    });

    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      driverToken,
      { bookingId: String(freshBooking._id) }
    );

    assert.equal(res.status, 201);
    testPaymentOrder = res.body.order;
  });

  await t.test('3.2 Verification: Tampered signature fails and marks payment failed', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      driverToken,
      {
        orderId: testPaymentOrder.id,
        paymentId: 'pay_test_tampered_123',
        signature: 'invalid_tampered_signature_abcd'
      }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_PAYMENT_SIGNATURE');

    const payment = await Payment.findOne({ providerOrderId: testPaymentOrder.id });
    assert.equal(payment.status, 'FAILED');
  });

  await t.test('3.3 Verification: Valid signature successfully verifies and confirms booking', async () => {
    // Generate valid signature using test secret
    const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
    const paymentId = 'pay_test_valid_999';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${testPaymentOrder.id}|${paymentId}`)
      .digest('hex');

    // Reset payment status to CREATED for valid attempt
    await Payment.updateOne({ providerOrderId: testPaymentOrder.id }, { status: 'CREATED' });

    const res = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      driverToken,
      {
        orderId: testPaymentOrder.id,
        paymentId,
        signature: validSignature
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.payment.status, 'PAID');

    const payment = await Payment.findOne({ providerOrderId: testPaymentOrder.id });
    assert.equal(payment.status, 'PAID');
    assert.equal(payment.providerPaymentId, paymentId);

    const booking = await Booking.findById(payment.bookingId);
    assert.equal(booking.status, 'CONFIRMED');
  });

  await t.test('3.4 Verification: Duplicate verification is idempotent', async () => {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
    const paymentId = 'pay_test_valid_999';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${testPaymentOrder.id}|${paymentId}`)
      .digest('hex');

    const res = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      driverToken,
      {
        orderId: testPaymentOrder.id,
        paymentId,
        signature: validSignature
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.idempotent, true);
    assert.equal(res.body.success, true);
  });

  await t.test('3.5 Verification: Non-existent order returns 404', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      driverToken,
      {
        orderId: 'order_nonexistent_99999999',
        paymentId: 'pay_test_123',
        signature: 'some_sig'
      }
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'PAYMENT_NOT_FOUND');
  });
});
