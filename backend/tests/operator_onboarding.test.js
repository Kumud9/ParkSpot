process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { app } = require('../src');
const { connectDatabase } = require('../src/db');
const { User, Organization, ParkingLot, Floor, ParkingSlot, Booking } = require('../src/models');
const authService = require('../src/services/auth.service');
const totpService = require('../src/services/totp.service');

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

test('PARKSPOT: Operator Onboarding and Facility Registration Workflow', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  const suffix = Date.now();
  const driverEmail = `driver-onboarding-${suffix}@parkspot.test`;
  const operatorAEmail = `operator-a-${suffix}@parkspot.test`;
  const operatorBEmail = `operator-b-${suffix}@parkspot.test`;

  let driverToken, operatorAToken, operatorBToken;
  let operatorAUser, operatorBUser;
  let facilityAId, floorA1Id, spotA1Id;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    const emails = [driverEmail, operatorAEmail, operatorBEmail];
    const users = await User.find({ email: { $in: emails } });
    const userIds = users.map((u) => u._id);
    const orgIds = users.map((u) => u.organizationId).filter(Boolean);

    const lots = await ParkingLot.find({
      $or: [
        { operatorId: { $in: userIds } },
        { organizationId: { $in: orgIds } }
      ]
    });
    const lotIds = lots.map((l) => l._id);

    await Booking.deleteMany({ lotId: { $in: lotIds } });
    await ParkingSlot.deleteMany({ lotId: { $in: lotIds } });
    await Floor.deleteMany({ facilityId: { $in: lotIds } });
    await ParkingLot.deleteMany({ _id: { $in: lotIds } });
    await Organization.deleteMany({ _id: { $in: orgIds } });
    await User.deleteMany({ email: { $in: emails } });
  });

  // 1. DRIVER SIGNUP REMAINING UNAFFECTED & DRIVER BLOCKED FROM ONBOARDING
  await t.test('1. Driver signup remains unaffected and driver cannot access operator onboarding', async () => {
    const signupRes = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'Alice Driver',
      email: driverEmail,
      password: 'StrongPassword@123',
      accountType: 'DRIVER'
    });

    assert.equal(signupRes.status, 201);
    assert.equal(signupRes.body.accountType, 'DRIVER');
    assert.equal(signupRes.body.user.facilityId, null);

    const otpCode = totpService.generateCurrentTotp(signupRes.body.manualSetupKey);
    const verifyRes = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: signupRes.body.setupToken,
      code: otpCode
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.user.accountType, 'DRIVER');
    assert.equal(verifyRes.body.user.internalRole, null);
    assert.equal(verifyRes.body.user.organizationId, null);
    assert.equal(verifyRes.body.user.facilityId, null);
    driverToken = verifyRes.body.token;

    // Driver attempting onboarding -> 403 Forbidden
    const onboardAttempt = await makeRequest(server, '/api/v1/facilities/onboard', 'POST', driverToken, {
      name: 'Driver Lot',
      address: 'Driver Way',
      city: 'Vadodara',
      latitude: 22.30,
      longitude: 73.18,
      floors: [{ name: 'G', floorNumber: 1, spots: [{ number: 'D1' }] }]
    });

    assert.equal(onboardAttempt.status, 403);
  });

  // 2. OPERATOR SIGNUP CREATES ACCOUNT WITH NO FAKE FACILITY
  await t.test('2. Operator signup creates OPERATOR account with null facility and no fake records', async () => {
    const signupRes = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'Bob Operator',
      email: operatorAEmail,
      password: 'StrongPassword@123',
      accountType: 'OPERATOR',
      organizationName: `Bob Hubs ${suffix}`
    });

    assert.equal(signupRes.status, 201);
    assert.equal(signupRes.body.accountType, 'OPERATOR');

    const otpCode = totpService.generateCurrentTotp(signupRes.body.manualSetupKey);
    const verifyRes = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: signupRes.body.setupToken,
      code: otpCode
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.user.accountType, 'OPERATOR');
    assert.equal(verifyRes.body.user.facilityId, null);
    assert.equal(verifyRes.body.user.facility, undefined);
    operatorAToken = verifyRes.body.token;
    operatorAUser = verifyRes.body.user;

    // Verify database has NO facilities for this operator
    const dbFacilities = await ParkingLot.find({ organizationId: operatorAUser.organizationId });
    assert.equal(dbFacilities.length, 0, 'No fake facilities must be auto-created on signup');

    // Operator has empty facility list initially
    const listRes = await makeRequest(server, '/api/v1/facilities', 'GET', operatorAToken);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.lots.length, 0);
  });

  // 3. PRE-ONBOARDING OPERATOR BLOCKED FROM OPERATIONAL ENDPOINTS
  await t.test('3. Pre-onboarding Operator attempting operational analytics is blocked with 403', async () => {
    const analyticsRes = await makeRequest(server, '/api/v1/analytics/summary', 'GET', operatorAToken);
    assert.equal(analyticsRes.status, 403);
    assert.equal(analyticsRes.body.error?.code, 'FACILITY_REQUIRED');
  });

  // 4. ONBOARDING VALIDATION: REJECTS DUPLICATE SPOT NUMBERS ACROSS FLOORS
  await t.test('4. Onboarding rejects duplicate spot identifiers across floors with 400', async () => {
    const dupRes = await makeRequest(server, '/api/v1/facilities/onboard', 'POST', operatorAToken, {
      name: 'Central Plaza Parking',
      address: '22 Station Circle, Sayajigunj',
      city: 'Vadodara',
      postalCode: '390002',
      latitude: 22.3105,
      longitude: 73.1814,
      hourlyRate: 50,
      dailyRate: 300,
      openingTime: '06:00',
      closingTime: '23:00',
      floors: [
        {
          name: 'Ground Floor',
          floorNumber: 1,
          spots: [
            { number: 'S-01', type: 'STANDARD' },
            { number: 'S-02', type: 'STANDARD' }
          ]
        },
        {
          name: 'Level 1',
          floorNumber: 2,
          spots: [
            { number: 'S-01', type: 'STANDARD' }, // Duplicate S-01
            { number: 'S-03', type: 'EV' }
          ]
        }
      ]
    });

    assert.equal(dupRes.status, 400);
    assert.equal(dupRes.body.error?.code, 'DUPLICATE_SPOT_IDENTIFIER');

    // Verify no partial records were persisted
    const dbLots = await ParkingLot.find({ organizationId: operatorAUser.organizationId });
    assert.equal(dbLots.length, 0);
  });

  // 5. ONBOARDING VALIDATION: REJECTS DUPLICATE FLOORS
  await t.test('5. Onboarding rejects duplicate floor names or numbers with 400', async () => {
    const dupFloorRes = await makeRequest(server, '/api/v1/facilities/onboard', 'POST', operatorAToken, {
      name: 'Central Plaza Parking',
      address: '22 Station Circle, Sayajigunj',
      city: 'Vadodara',
      latitude: 22.3105,
      longitude: 73.1814,
      floors: [
        { name: 'Ground Floor', floorNumber: 1, spots: [{ number: 'G-01' }] },
        { name: 'Ground Floor', floorNumber: 2, spots: [{ number: 'L-01' }] }
      ]
    });

    assert.equal(dupFloorRes.status, 400);
    assert.equal(dupFloorRes.body.error?.code, 'DUPLICATE_FLOOR');
  });

  // 6. SUCCESSFUL OPERATOR ONBOARDING CREATES FACILITY, FLOORS, AND ALL SPOTS AVAILABLE
  await t.test('6. Successful onboarding creates facility, floors, spots and starts spots as AVAILABLE', async () => {
    const onboardRes = await makeRequest(server, '/api/v1/facilities/onboard', 'POST', operatorAToken, {
      name: 'Sayaji Smart Mobility Hub',
      address: '100 Productivity Road, Sayajigunj',
      city: 'Vadodara',
      postalCode: '390005',
      latitude: 22.3120,
      longitude: 73.1820,
      hourlyRate: 60,
      dailyRate: 360,
      openingTime: '00:00',
      closingTime: '23:59',
      floors: [
        {
          name: 'Ground Level',
          floorNumber: 1,
          spots: [
            { number: 'G-01', type: 'EV' },
            { number: 'G-02', type: 'ACCESSIBLE' },
            { number: 'G-03', type: 'STANDARD' }
          ]
        },
        {
          name: 'Upper Deck',
          floorNumber: 2,
          spots: [
            { number: 'U-01', type: 'STANDARD' },
            { number: 'U-02', type: 'COMPACT' }
          ]
        }
      ]
    });

    assert.equal(onboardRes.status, 201);
    assert.ok(onboardRes.body.facility);
    assert.equal(onboardRes.body.facility.name, 'Sayaji Smart Mobility Hub');
    assert.equal(onboardRes.body.facility.city, 'Vadodara');
    assert.equal(onboardRes.body.facility.totalSpots, 5);
    assert.equal(onboardRes.body.facility.availableSlots, 5);
    assert.equal(onboardRes.body.facility.occupiedSpots, 0);
    assert.equal(onboardRes.body.facility.reservedSpots, 0);

    facilityAId = onboardRes.body.facility.id;
    operatorAToken = onboardRes.body.token || operatorAToken;

    // Verify all spots in database start AVAILABLE
    const dbSpots = await ParkingSlot.find({ lotId: facilityAId });
    assert.equal(dbSpots.length, 5);
    assert.ok(dbSpots.every((s) => s.status === 'AVAILABLE'), 'All new spots must start AVAILABLE');

    const evSpot = dbSpots.find((s) => s.number === 'G-01');
    assert.equal(evSpot.type, 'EV');
    spotA1Id = evSpot._id;

    // Verify User record is updated with facilityId
    const dbUser = await User.findById(operatorAUser.id);
    assert.equal(String(dbUser.facilityId), String(facilityAId));

    // Authenticated profile (/me) reflects newly onboarded facility
    const meRes = await makeRequest(server, '/api/v1/auth/me', 'GET', operatorAToken);
    assert.equal(meRes.status, 200);
    assert.equal(String(meRes.body.user.facilityId), String(facilityAId));
    assert.equal(meRes.body.user.facility.name, 'Sayaji Smart Mobility Hub');
  });

  // 7. ONE FACILITY PER OPERATOR: PREVENT REGISTERING MULTIPLE FACILITIES
  await t.test('7. Enforce one facility per operator: rejects second facility registration with 409', async () => {
    const secondOnboard = await makeRequest(server, '/api/v1/facilities/onboard', 'POST', operatorAToken, {
      name: 'Second Illegal Facility',
      address: '200 Another Road',
      city: 'Vadodara',
      latitude: 22.32,
      longitude: 73.19,
      floors: [{ name: 'G', floorNumber: 1, spots: [{ number: 'X-01' }] }]
    });

    assert.equal(secondOnboard.status, 409);
    assert.equal(secondOnboard.body.error?.code, 'FACILITY_ALREADY_EXISTS');

    // Also via standard POST /api/v1/facilities
    const directPost = await makeRequest(server, '/api/v1/facilities', 'POST', operatorAToken, {
      name: 'Second Direct Facility',
      address: '200 Direct Road',
      city: 'Vadodara',
      hourlyRate: 50,
      dailyRate: 300
    });

    assert.equal(directPost.status, 409);
    assert.equal(directPost.body.error?.code, 'FACILITY_ALREADY_EXISTS');
  });

  // 8. CROSS-OPERATOR ACCESS REJECTION
  await t.test('8. Cross-Operator isolation: Operator B cannot access or modify Operator A facility', async () => {
    // Signup Operator B
    const opBRes = await makeRequest(server, '/api/v1/auth/signup', 'POST', null, {
      name: 'Charlie Operator',
      email: operatorBEmail,
      password: 'StrongPassword@123',
      accountType: 'OPERATOR',
      organizationName: `Charlie Ops ${suffix}`
    });

    const opBCode = totpService.generateCurrentTotp(opBRes.body.manualSetupKey);
    const opBVerify = await makeRequest(server, '/api/v1/auth/mfa/verify-setup', 'POST', null, {
      setupToken: opBRes.body.setupToken,
      code: opBCode
    });
    operatorBToken = opBVerify.body.token;
    operatorBUser = opBVerify.body.user;

    // Operator B onboards own facility B
    const opBOnboard = await makeRequest(server, '/api/v1/facilities/onboard', 'POST', operatorBToken, {
      name: 'Charlie Downtown Parking',
      address: '50 Alkapuri Road',
      city: 'Vadodara',
      latitude: 22.3140,
      longitude: 73.1740,
      hourlyRate: 40,
      dailyRate: 240,
      floors: [{ name: 'G', floorNumber: 1, spots: [{ number: 'B-01' }] }]
    });
    assert.equal(opBOnboard.status, 201);
    const facilityBId = opBOnboard.body.facility.id;

    // Operator B attempts to get Operator A facility bookings -> 403 Forbidden
    const crossBookings = await makeRequest(server, `/api/v1/facilities/${facilityAId}/bookings`, 'GET', operatorBToken);
    assert.equal(crossBookings.status, 403);

    // Operator B attempts to create spot in Operator A facility -> 403 Forbidden
    const crossSpot = await makeRequest(server, `/api/v1/facilities/${facilityAId}/spots`, 'POST', operatorBToken, {
      number: 'HACK-01',
      level: 'Ground Level'
    });
    assert.equal(crossSpot.status, 403);
  });

  // 9. DRIVER FACILITY DISCOVERY OF NEWLY ONBOARDED FACILITY
  await t.test('9. Driver discovers newly onboarded facility through search and coordinates', async () => {
    // 1. Search by city
    const searchRes = await makeRequest(server, '/api/v1/facilities/search?city=Vadodara', 'GET');
    assert.equal(searchRes.status, 200);
    const foundInSearch = searchRes.body.facilities.find((f) => f.id === facilityAId);
    assert.ok(foundInSearch, 'Newly onboarded facility must be discoverable in public search');
    assert.equal(foundInSearch.name, 'Sayaji Smart Mobility Hub');
    assert.equal(foundInSearch.availableSlots, 5);

    // 2. Discover by nearby coordinates
    const nearbyRes = await makeRequest(server, '/api/v1/facilities/nearby?lat=22.3120&lng=73.1820&radius=2', 'GET');
    assert.equal(nearbyRes.status, 200);
    const foundInNearby = nearbyRes.body.facilities.find((f) => f.id === facilityAId);
    assert.ok(foundInNearby, 'Newly onboarded facility must be discoverable near coordinates');
  });

  // 10. BOOKING AVAILABILITY USING REGISTERED SPOTS
  await t.test('10. Driver can reserve an available spot from the newly onboarded facility', async () => {
    const startTime = new Date(Date.now() + 3600000);
    const endTime = new Date(Date.now() + 7200000);

    const bookingRes = await makeRequest(server, '/api/v1/bookings', 'POST', driverToken, {
      lotId: facilityAId,
      slotId: spotA1Id,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      type: 'HOURLY'
    });

    assert.equal(bookingRes.status, 201);
    assert.equal(String(bookingRes.body.booking.slotId), String(spotA1Id));
    assert.equal(bookingRes.body.booking.status, 'CONFIRMED');

    // Operator A checks bookings -> sees the new confirmed booking
    const opBookings = await makeRequest(server, `/api/v1/facilities/${facilityAId}/bookings`, 'GET', operatorAToken);
    assert.equal(opBookings.status, 200);
    assert.equal(opBookings.body.bookings.length, 1);
    assert.equal(opBookings.body.bookings[0].spotNumber, 'G-01');
  });

  // 11. OPERATOR ANALYTICS USING THE ASSIGNED FACILITY
  await t.test('11. Operator analytics uses assigned facility and reflects true operational data', async () => {
    const analyticsRes = await makeRequest(server, '/api/v1/analytics/summary', 'GET', operatorAToken);
    assert.equal(analyticsRes.status, 200);
    assert.equal(analyticsRes.body.facilities?.total, 1);
    assert.equal(analyticsRes.body.spots?.total, 5);
    assert.equal(analyticsRes.body.bookings?.total, 1);
  });
});
