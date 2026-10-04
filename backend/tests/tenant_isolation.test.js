const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { app } = require('../src/index');
const { Organization, User, ParkingLot, ParkingSlot, Floor, PricingRule, Booking } = require('../src/models');
const facilityService = require('../src/services/facility.service');
const floorService = require('../src/services/floor.service');
const spotService = require('../src/services/spot.service');
const pricingService = require('../src/services/pricing.service');
const adminController = require('../src/controllers/admin.controller');

function makeRequest(server, path, method = 'GET', token = null, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
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
    if (payload) req.write(payload);
    req.end();
  });
}

test('tenant isolation: full 10-point multi-tenancy verification suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  // Setup Organizations
  const orgA = await Organization.create({
    name: 'Tenant Alpha Corp',
    slug: `alpha-${Date.now()}`,
    email: 'admin@alpha.test'
  });

  const orgB = await Organization.create({
    name: 'Tenant Beta Corp',
    slug: `beta-${Date.now()}`,
    email: 'admin@beta.test'
  });

  // Setup Users
  const userA = await User.create({
    name: 'Admin Alpha',
    email: `admin-alpha-${Date.now()}@test.com`,
    passwordHash: 'hash',
    role: 'ADMIN',
    organizationId: orgA._id
  });

  const userB = await User.create({
    name: 'Admin Beta',
    email: `admin-beta-${Date.now()}@test.com`,
    passwordHash: 'hash',
    role: 'ADMIN',
    organizationId: orgB._id
  });

  const userNoOrg = await User.create({
    name: 'Admin NoOrg',
    email: `admin-noorg-${Date.now()}@test.com`,
    passwordHash: 'hash',
    role: 'ADMIN',
    organizationId: null
  });

  // Generate JWTs
  const tokenA = jwt.sign(
    { sub: String(userA._id), role: userA.role, email: userA.email, organizationId: String(orgA._id) },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const tokenB = jwt.sign(
    { sub: String(userB._id), role: userB.role, email: userB.email, organizationId: String(orgB._id) },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const tokenNoOrg = jwt.sign(
    { sub: String(userNoOrg._id), role: userNoOrg.role, email: userNoOrg.email, organizationId: null },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const tokenMalformedOrg = jwt.sign(
    { sub: String(userA._id), role: userA.role, email: userA.email, organizationId: 'invalid-not-an-id' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Setup Facilities
  const facilityA = await ParkingLot.create({
    name: 'Alpha Facility',
    address: '1 Alpha St',
    city: 'AlphaCity',
    hourlyRate: 50,
    dailyRate: 300,
    active: true,
    organizationId: orgA._id
  });

  const facilityB = await ParkingLot.create({
    name: 'Beta Facility',
    address: '2 Beta St',
    city: 'BetaCity',
    hourlyRate: 60,
    dailyRate: 400,
    active: true,
    organizationId: orgB._id
  });

  // Setup Floors
  const floorA = await Floor.create({
    name: 'Floor A1',
    floorNumber: 1,
    facilityId: facilityA._id,
    organizationId: orgA._id
  });

  const floorB = await Floor.create({
    name: 'Floor B1',
    floorNumber: 1,
    facilityId: facilityB._id,
    organizationId: orgB._id
  });

  // Setup Spots
  const spotA = await ParkingSlot.create({
    lotId: facilityA._id,
    floorId: floorA._id,
    organizationId: orgA._id,
    number: 'A-01',
    type: 'STANDARD',
    status: 'AVAILABLE'
  });

  const spotB = await ParkingSlot.create({
    lotId: facilityB._id,
    floorId: floorB._id,
    organizationId: orgB._id,
    number: 'B-01',
    type: 'STANDARD',
    status: 'AVAILABLE'
  });

  // Setup Pricing Rules
  const ruleA = await PricingRule.create({
    facilityId: facilityA._id,
    organizationId: orgA._id,
    name: 'Alpha Pricing Rule',
    pricePerHour: 55,
    pricePerDay: 320
  });

  const ruleB = await PricingRule.create({
    facilityId: facilityB._id,
    organizationId: orgB._id,
    name: 'Beta Pricing Rule',
    pricePerHour: 65,
    pricePerDay: 420
  });

  // Setup Bookings for reporting
  const bookingA = await Booking.create({
    userId: userA._id,
    lotId: facilityA._id,
    slotId: spotA._id,
    organizationId: orgA._id,
    startTime: new Date('2028-01-01T10:00:00Z'),
    endTime: new Date('2028-01-01T12:00:00Z'),
    type: 'HOURLY',
    status: 'CONFIRMED',
    totalAmount: 100
  });

  const bookingB = await Booking.create({
    userId: userB._id,
    lotId: facilityB._id,
    slotId: spotB._id,
    organizationId: orgB._id,
    startTime: new Date('2028-01-01T10:00:00Z'),
    endTime: new Date('2028-01-01T12:00:00Z'),
    type: 'HOURLY',
    status: 'CONFIRMED',
    totalAmount: 250
  });

  try {
    // TEST 1: Authenticated B2B user with organization A can access organization A facility
    const alphaLots = await facilityService.listTenantFacilities(orgA._id);
    assert.ok(alphaLots.some((l) => String(l.id) === String(facilityA._id)), 'Org A should see its own facility');
    const alphaFacility = await facilityService.getTenantFacilityById(facilityA._id, orgA._id);
    assert.equal(String(alphaFacility.id), String(facilityA._id));

    // TEST 2: Organization A cannot access organization B facility
    assert.ok(!alphaLots.some((l) => String(l.id) === String(facilityB._id)), 'Org A must NOT see Org B facility in list');
    await assert.rejects(
      async () => {
        await facilityService.getTenantFacilityById(facilityB._id, orgA._id);
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'FACILITY_NOT_FOUND');
        return true;
      },
      'Org A accessing Org B facility must be rejected with 404'
    );

    // TEST 3: Organization A cannot update organization B facility
    await assert.rejects(
      async () => {
        await facilityService.updateTenantFacility(facilityB._id, orgA._id, { name: 'Compromised Name' });
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'FACILITY_NOT_FOUND');
        return true;
      },
      'Org A updating Org B facility must be rejected with 404'
    );

    // TEST 4: Organization A cannot access organization B floor
    await assert.rejects(
      async () => {
        await floorService.getFloorById(floorB._id, orgA._id);
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'FLOOR_NOT_FOUND');
        return true;
      },
      'Org A accessing Org B floor must be rejected with 404'
    );
    await assert.rejects(
      async () => {
        await floorService.createFloor(facilityB._id, orgA._id, { name: 'Illegal Floor', floorNumber: 99 });
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'FACILITY_NOT_FOUND');
        return true;
      },
      'Org A creating floor in Org B facility must be rejected with 404'
    );

    // TEST 5: Organization A cannot access organization B parking spot
    await assert.rejects(
      async () => {
        await spotService.getSpotById(spotB._id, orgA._id);
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'SLOT_NOT_FOUND');
        return true;
      },
      'Org A accessing Org B spot must be rejected with 404'
    );
    await assert.rejects(
      async () => {
        await spotService.updateSpot(spotB._id, orgA._id, { number: 'COMPROMISED-01' });
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'SLOT_NOT_FOUND');
        return true;
      },
      'Org A updating Org B spot must be rejected with 404'
    );

    // TEST 6: Organization A cannot access organization B pricing rule
    await assert.rejects(
      async () => {
        await pricingService.getPricingRuleById(ruleB._id, orgA._id);
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'RULE_NOT_FOUND');
        return true;
      },
      'Org A accessing Org B pricing rule must be rejected with 404'
    );
    await assert.rejects(
      async () => {
        await pricingService.createPricingRule(facilityB._id, orgA._id, {
          name: 'Illegal Price',
          pricePerHour: 10,
          pricePerDay: 50
        });
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'FACILITY_NOT_FOUND');
        return true;
      },
      'Org A creating pricing rule in Org B facility must be rejected with 404'
    );

    // TEST 7: Organization A cannot access organization B admin/report data
    let adminOverviewRes;
    const reqMockA = { user: { organizationId: orgA._id } };
    const resMockA = { json: (data) => { adminOverviewRes = data; } };
    await adminController.getOverview(reqMockA, resMockA, (err) => { if (err) throw err; });
    assert.equal(adminOverviewRes.overview.lots, 1, 'Org A overview should count only Org A facilities');
    assert.equal(adminOverviewRes.overview.revenue, 100, 'Org A overview should only calculate Org A revenue ($100), not Org B ($250)');

    // TEST 8: Authenticated user with organizationId = null receives 403 TENANT_REQUIRED when accessing protected B2B endpoint
    const httpResNoOrg = await makeRequest(server, '/api/v1/facilities', 'GET', tokenNoOrg);
    assert.equal(httpResNoOrg.status, 403, 'Missing organizationId on protected endpoint must return 403');
    assert.equal(httpResNoOrg.body.error?.code, 'TENANT_REQUIRED');

    // Service check for null organizationId
    await assert.rejects(
      async () => {
        await facilityService.listTenantFacilities(null);
      },
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.code, 'TENANT_REQUIRED');
        return true;
      },
      'Service must reject missing tenant context with TENANT_REQUIRED'
    );

    // TEST 9: Authenticated user with malformed/invalid organizationId cannot bypass tenant filtering
    const httpResMalformedOrg = await makeRequest(server, '/api/v1/facilities', 'GET', tokenMalformedOrg);
    assert.equal(httpResMalformedOrg.status, 403, 'Malformed organizationId must return 403');
    assert.equal(httpResMalformedOrg.body.error?.code, 'INVALID_TENANT');

    // TEST 10: Public facility search/details continue working without tenant authentication
    const publicSearchRes = await makeRequest(server, '/api/v1/facilities/search?city=AlphaCity', 'GET', null);
    assert.equal(publicSearchRes.status, 200, 'Public facility search must succeed with 200 without authentication');
    assert.ok(Array.isArray(publicSearchRes.body.facilities), 'Public search returns facility array');

    const publicDetailRes = await makeRequest(server, `/api/v1/facilities/${facilityA._id}/public`, 'GET', null);
    assert.equal(publicDetailRes.status, 200, 'Public facility details must succeed with 200 without authentication');
    assert.equal(publicDetailRes.body.facility.name, 'Alpha Facility');
  } finally {
    server.close();
    await Booking.deleteMany({ _id: { $in: [bookingA._id, bookingB._id] } });
    await PricingRule.deleteMany({ _id: { $in: [ruleA._id, ruleB._id] } });
    await ParkingSlot.deleteMany({ _id: { $in: [spotA._id, spotB._id] } });
    await Floor.deleteMany({ _id: { $in: [floorA._id, floorB._id] } });
    await ParkingLot.deleteMany({ _id: { $in: [facilityA._id, facilityB._id] } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id, userNoOrg._id] } });
    await Organization.deleteMany({ _id: { $in: [orgA._id, orgB._id] } });
  }
});
