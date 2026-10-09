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
  Organization,
  ParkingLot,
  Floor,
  ParkingSlot,
  PricingRule,
  Booking,
  Payment
} = require('../src/models');
const { rupeesToPaise, calculatePrice } = require('../src/utils/booking');
const facilityService = require('../src/services/facility.service');
const bookingService = require('../src/services/booking.service');
const paymentService = require('../src/services/payment.service');

function createToken(user) {
  const secret = process.env.JWT_SECRET || 'parkspot-local-development-secret-change-before-deployment';
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      accountType: user.accountType,
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
            parsed = data ? JSON.parse(data) : {};
          } catch (_e) {
            parsed = { raw: data };
          }
          resolve({ status: res.statusCode, body: parsed });
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

test('PARKSPOT PAYMENT REGRESSION: Pre-Seeded vs Newly Created Facilities', async (t) => {
  let server;
  let testOrg;
  let operatorUser;
  let operatorToken;
  let driverUser;
  let driverToken;

  await t.test('0. Setup test server and test actors', async () => {
    await connectDatabase();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });

    const timestamp = Date.now();
    testOrg = await Organization.create({
      name: `Operator Corp ${timestamp}`,
      slug: `operator-corp-${timestamp}`,
      email: `operator-corp-${timestamp}@test.com`
    });

    operatorUser = await User.create({
      name: 'Test Operator',
      email: `operator-${timestamp}@test.com`,
      passwordHash: 'hash123',
      accountType: 'OPERATOR',
      role: 'OPERATOR',
      organizationId: testOrg._id
    });
    operatorToken = createToken(operatorUser);

    driverUser = await User.create({
      name: 'Test Driver',
      email: `driver-${timestamp}@test.com`,
      passwordHash: 'hash123',
      accountType: 'DRIVER',
      role: 'DRIVER'
    });
    driverToken = createToken(driverUser);
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // 1. Pre-seeded facility payment test
  await t.test('1. Pre-seeded facility: Driver books spot and completes payment successfully', async () => {
    const timestamp = Date.now();
    const seededLot = await ParkingLot.create({
      name: `Seeded Mall Parking ${timestamp}`,
      address: '100 Commercial Road',
      city: 'Vadodara',
      hourlyRate: 60,
      dailyRate: 360,
      active: true,
      latitude: 22.3072,
      longitude: 73.1812
    });

    const seededFloor = await Floor.create({
      facilityId: seededLot._id,
      name: 'Ground Floor',
      floorNumber: 0,
      capacity: 10
    });

    const seededSlot = await ParkingSlot.create({
      lotId: seededLot._id,
      floorId: seededFloor._id,
      number: 'S-01',
      type: 'STANDARD',
      status: 'AVAILABLE',
      isActive: true
    });

    // Seeded pricing rule
    await PricingRule.create({
      facilityId: seededLot._id,
      name: 'Base Rate',
      spotType: 'ALL',
      pricePerHour: 60,
      pricePerDay: 360,
      isActive: true
    });

    // Driver creates booking for exactly 2 hours (₹60 * 2 = ₹120)
    const startMs = Date.now() + 3600000;
    const endMs = startMs + 2 * 3600000;
    const startTime = new Date(startMs).toISOString();
    const endTime = new Date(endMs).toISOString();

    const bookingRes = await makeRequest(
      server,
      '/api/v1/bookings',
      'POST',
      driverToken,
      {
        slotId: String(seededSlot._id),
        startTime,
        endTime,
        type: 'HOURLY'
      }
    );

    assert.equal(bookingRes.status, 201);
    assert.equal(bookingRes.body.booking.totalAmount, 120);

    // Create payment order
    const orderRes = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      driverToken,
      { bookingId: bookingRes.body.booking.id }
    );

    assert.equal(orderRes.status, 201);
    assert.equal(orderRes.body.order.amount, 120);
    assert.equal(orderRes.body.order.amountPaise, 12000);

    // Verify payment with valid HMAC signature
    const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
    const paymentId = `pay_seeded_${Date.now()}`;
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderRes.body.order.id}|${paymentId}`)
      .digest('hex');

    const verifyRes = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      driverToken,
      {
        orderId: orderRes.body.order.id,
        paymentId,
        signature: validSignature
      }
    );

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.equal(verifyRes.body.payment.status, 'PAID');
  });

  // 2. Newly created facility by operator
  await t.test('2. Operator onboards new facility with valid rates and baseline pricing rules are created', async () => {
    const timestamp = Date.now();
    const onboardPayload = {
      name: `Grand Central Facility ${timestamp}`,
      address: '77 Station Road, Sayajigunj',
      city: 'Vadodara',
      hourlyRate: 40,
      dailyRate: 240,
      openingTime: '00:00',
      closingTime: '23:59',
      latitude: 22.3100,
      longitude: 73.1800,
      floors: [
        {
          name: 'Ground Floor',
          floorNumber: 0,
          spots: [
            { number: 'N-01', type: 'STANDARD' },
            { number: 'N-02', type: 'EV' }
          ]
        }
      ]
    };

    const onboardRes = await makeRequest(
      server,
      '/api/v1/facilities/onboard',
      'POST',
      operatorToken,
      onboardPayload
    );

    assert.equal(onboardRes.status, 201);
    const facilityId = onboardRes.body.facility?._id || onboardRes.body.id || onboardRes.body._id;
    assert.ok(facilityId);

    const rules = await PricingRule.find({ facilityId });
    assert.ok(rules.length >= 2, 'Newly created facility must automatically have baseline pricing rules initialized');

    const baseRule = rules.find((r) => r.spotType === 'ALL');
    assert.ok(baseRule);
    assert.equal(baseRule.pricePerHour, 40);

    const evRule = rules.find((r) => r.spotType === 'EV');
    assert.ok(evRule);
    assert.equal(evRule.pricePerHour, 65); // 40 + 25 EV rate
  });

  // 3. Driver books a spot in newly onboarded facility and completes payment
  await t.test('3. Driver books a spot in newly created facility and completes Razorpay flow without amount errors', async () => {
    const lot = await ParkingLot.findOne({ operatorId: operatorUser._id });
    assert.ok(lot);

    const slot = await ParkingSlot.findOne({ lotId: lot._id, number: 'N-01' });
    assert.ok(slot);

    // Book 3 hours: 3 * ₹40 = ₹120
    const startTime = new Date(Date.now() + 3600000).toISOString();
    const endTime = new Date(Date.now() + 4 * 3600000).toISOString();

    const bookingRes = await makeRequest(
      server,
      '/api/v1/bookings',
      'POST',
      driverToken,
      {
        slotId: String(slot._id),
        startTime,
        endTime,
        type: 'HOURLY'
      }
    );

    assert.equal(bookingRes.status, 201);
    assert.equal(bookingRes.body.booking.totalAmount, 120);

    // Order creation: must NOT throw "Payable amount must be a valid positive number"
    const orderRes = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      driverToken,
      { bookingId: bookingRes.body.booking.id }
    );

    assert.equal(orderRes.status, 201);
    assert.equal(orderRes.body.order.amount, 120);
    assert.equal(orderRes.body.order.amountPaise, 12000);
    assert.equal(orderRes.body.order.currency, 'INR');

    // Verify payment
    const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
    const paymentId = `pay_newfac_${Date.now()}`;
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderRes.body.order.id}|${paymentId}`)
      .digest('hex');

    const verifyRes = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      driverToken,
      {
        orderId: orderRes.body.order.id,
        paymentId,
        signature: validSignature
      }
    );

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.equal(verifyRes.body.payment.status, 'PAID');
  });

  // 4. Missing or zero pricing defaults safely to positive business default
  await t.test('4. Facility with missing rates is safely defaulted to valid positive rates (no zero amounts)', async () => {
    const timestamp = Date.now();
    // Simulate facility created without explicit rate (schema pre-validate defaults to 50/300)
    const zeroFac = new ParkingLot({
      name: `Fallback Rate Facility ${timestamp}`,
      address: '50 Zero St',
      city: 'Vadodara',
      active: true,
      latitude: 22.3,
      longitude: 73.2
    });
    await zeroFac.save();

    assert.ok(zeroFac.hourlyRate >= 1, 'Facility must default hourlyRate to positive amount');
    assert.ok(zeroFac.dailyRate >= 1, 'Facility must default dailyRate to positive amount');

    const testSlot = await ParkingSlot.create({
      lotId: zeroFac._id,
      number: 'Z-01',
      type: 'STANDARD',
      status: 'AVAILABLE',
      isActive: true
    });

    const startTime = new Date(Date.now() + 3600000).toISOString();
    const endTime = new Date(Date.now() + 2 * 3600000).toISOString();

    const bookingRes = await makeRequest(
      server,
      '/api/v1/bookings',
      'POST',
      driverToken,
      {
        slotId: String(testSlot._id),
        startTime,
        endTime,
        type: 'HOURLY'
      }
    );

    assert.equal(bookingRes.status, 201);
    assert.ok(bookingRes.body.booking.totalAmount > 0, 'Booking must receive a valid positive payable amount');
  });

  // 5. Correct rupees to paise conversion
  await t.test('5. Rupees to paise conversion: ₹80 becomes 8000 paise; rejects invalid amounts', () => {
    assert.equal(rupeesToPaise(80), 8000);
    assert.equal(rupeesToPaise('80'), 8000);
    assert.equal(rupeesToPaise(1.50), 150);

    assert.throws(() => rupeesToPaise(0), /Payable amount must be a valid positive number/);
    assert.throws(() => rupeesToPaise(-10), /Payable amount must be a valid positive number/);
    assert.throws(() => rupeesToPaise(null), /Payable amount must be a valid positive number/);
    assert.throws(() => rupeesToPaise(undefined), /Payable amount must be a valid positive number/);
    assert.throws(() => rupeesToPaise(NaN), /Payable amount must be a valid positive number/);
    assert.throws(() => rupeesToPaise(0.50), /Order amount must be at least ₹1.00/);
  });

  // 6. Spot-facility mismatch rejection
  await t.test('6. Integrity: Rejects booking or order if spot does not belong to facility', async () => {
    const lotA = await ParkingLot.create({
      name: `Lot A ${Date.now()}`,
      address: '1 A St',
      city: 'Delhi',
      hourlyRate: 50,
      dailyRate: 300,
      active: true
    });
    const lotB = await ParkingLot.create({
      name: `Lot B ${Date.now()}`,
      address: '2 B St',
      city: 'Delhi',
      hourlyRate: 50,
      dailyRate: 300,
      active: true
    });

    const slotInLotB = await ParkingSlot.create({
      lotId: lotB._id,
      number: 'B-01',
      type: 'STANDARD',
      status: 'AVAILABLE',
      isActive: true
    });

    // Tampered booking claiming to be in Lot A while slot is in Lot B
    const tamperedBooking = await Booking.create({
      userId: driverUser._id,
      lotId: lotA._id,
      slotId: slotInLotB._id,
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 2 * 3600000),
      type: 'HOURLY',
      status: 'PENDING_PAYMENT',
      totalAmount: 50
    });

    const res = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      driverToken,
      { bookingId: String(tamperedBooking._id) }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_SPOT_FACILITY_RELATION');
  });

  // 7. Duplicate booking prevention (same spot cannot be double booked)
  await t.test('7. Concurrency: Cannot book the same spot twice during overlapping window', async () => {
    const lot = await ParkingLot.create({
      name: `Overlap Lot ${Date.now()}`,
      address: '10 Overlap St',
      city: 'Delhi',
      hourlyRate: 40,
      dailyRate: 240,
      active: true
    });

    const slot = await ParkingSlot.create({
      lotId: lot._id,
      number: 'OV-01',
      type: 'STANDARD',
      status: 'AVAILABLE',
      isActive: true
    });

    const startTime = new Date(Date.now() + 10 * 3600000).toISOString();
    const endTime = new Date(Date.now() + 12 * 3600000).toISOString();

    const firstBooking = await makeRequest(
      server,
      '/api/v1/bookings',
      'POST',
      driverToken,
      {
        slotId: String(slot._id),
        startTime,
        endTime,
        type: 'HOURLY'
      }
    );
    assert.equal(firstBooking.status, 201);

    // Second booking attempt for overlapping window
    const secondBooking = await makeRequest(
      server,
      '/api/v1/bookings',
      'POST',
      driverToken,
      {
        slotId: String(slot._id),
        startTime,
        endTime,
        type: 'HOURLY'
      }
    );
    assert.equal(secondBooking.status, 409);
    assert.equal(secondBooking.body.code, 'SPOT_ALREADY_BOOKED');
  });

  // 8. Invalid signature rejection
  await t.test('8. Verification: Tampered signature is rejected and does not confirm booking', async () => {
    const lot = await ParkingLot.create({
      name: `Sig Test Lot ${Date.now()}`,
      address: '20 Sig St',
      city: 'Delhi',
      hourlyRate: 50,
      dailyRate: 300,
      active: true
    });
    const slot = await ParkingSlot.create({
      lotId: lot._id,
      number: 'SIG-01',
      type: 'STANDARD',
      status: 'AVAILABLE',
      isActive: true
    });

    const bookingRes = await makeRequest(
      server,
      '/api/v1/bookings',
      'POST',
      driverToken,
      {
        slotId: String(slot._id),
        startTime: new Date(Date.now() + 20 * 3600000).toISOString(),
        endTime: new Date(Date.now() + 21 * 3600000).toISOString(),
        type: 'HOURLY'
      }
    );

    const orderRes = await makeRequest(
      server,
      '/api/v1/payments/order',
      'POST',
      driverToken,
      { bookingId: bookingRes.body.booking.id }
    );

    const verifyRes = await makeRequest(
      server,
      '/api/v1/payments/verify',
      'POST',
      driverToken,
      {
        orderId: orderRes.body.order.id,
        paymentId: 'pay_tampered_test',
        signature: 'deadbeef_tampered_signature'
      }
    );

    assert.equal(verifyRes.status, 400);
    assert.equal(verifyRes.body.code, 'INVALID_PAYMENT_SIGNATURE');

    const payment = await Payment.findOne({ providerOrderId: orderRes.body.order.id });
    assert.equal(payment.status, 'FAILED');
  });
});
