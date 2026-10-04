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
  OccupancyEvent,
  AuditLog,
  PricingRule,
  OptimizationRecommendation
} = require('../src/models');

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

test('PHASE 3.0: Dynamic Optimization & Algorithmic Pricing Test Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (process.argv[1] && process.argv[1].includes('optimization.test.js')) {
      await mongoose.disconnect();
    }
  });

  // Seed two distinct tenant organizations
  const orgA = await Organization.create({
    name: 'Alpha Optimization Systems',
    slug: `alpha-opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: 'admin@alpha-opt.test'
  });

  const orgB = await Organization.create({
    name: 'Beta Parking Hub',
    slug: `beta-opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    email: 'admin@beta-opt.test'
  });

  // Users for Org A
  const adminA = await User.create({
    name: 'Admin Alpha',
    email: `admin-opt-${Date.now()}@test.com`,
    passwordHash: 'hash123',
    role: 'ADMIN',
    organizationId: orgA._id
  });
  const tokenA = createToken(adminA);

  const operatorA = await User.create({
    name: 'Operator Alpha',
    email: `op-opt-${Date.now()}@test.com`,
    passwordHash: 'hash123',
    role: 'OPERATOR',
    organizationId: orgA._id
  });
  const tokenOpA = createToken(operatorA);

  // User for Org B
  const adminB = await User.create({
    name: 'Admin Beta',
    email: `admin-beta-opt-${Date.now()}@test.com`,
    passwordHash: 'hash123',
    role: 'ADMIN',
    organizationId: orgB._id
  });
  const tokenB = createToken(adminB);

  // Facilities for Org A
  // Facility 1: High Demand facility (Metro Central)
  const facilityHighDemand = await ParkingLot.create({
    organizationId: orgA._id,
    name: 'Metro Central Hub',
    address: '100 Central Ave',
    city: 'Metroville',
    hourlyRate: 50,
    dailyRate: 300,
    active: true
  });

  // Facility 2: Low Demand facility (Suburban Depot)
  const facilityLowDemand = await ParkingLot.create({
    organizationId: orgA._id,
    name: 'Suburban Depot',
    address: '900 Outer Ring',
    city: 'Metroville',
    hourlyRate: 30,
    dailyRate: 180,
    active: true
  });

  // Facility for Org B
  const facilityB = await ParkingLot.create({
    organizationId: orgB._id,
    name: 'Beta Plaza',
    address: '500 Beta St',
    city: 'Betatown',
    hourlyRate: 40,
    dailyRate: 240,
    active: true
  });

  // Spots for Facility 1 (High Demand)
  const spotHD1 = await ParkingSlot.create({
    lotId: facilityHighDemand._id,
    organizationId: orgA._id,
    number: 'HD-01',
    type: 'STANDARD',
    status: 'OCCUPIED',
    isActive: true
  });

  const spotHD2 = await ParkingSlot.create({
    lotId: facilityHighDemand._id,
    organizationId: orgA._id,
    number: 'HD-02',
    type: 'EV',
    status: 'OCCUPIED',
    isActive: true
  });

  // Spots for Facility 2 (Low Demand)
  const spotLD1 = await ParkingSlot.create({
    lotId: facilityLowDemand._id,
    organizationId: orgA._id,
    number: 'LD-01',
    type: 'STANDARD',
    status: 'AVAILABLE',
    isActive: true
  });

  const spotLD2 = await ParkingSlot.create({
    lotId: facilityLowDemand._id,
    organizationId: orgA._id,
    number: 'LD-02',
    type: 'STANDARD',
    status: 'AVAILABLE',
    isActive: true
  });

  // Spot for Facility B
  const spotB = await ParkingSlot.create({
    lotId: facilityB._id,
    organizationId: orgB._id,
    number: 'B-01',
    status: 'AVAILABLE',
    isActive: true
  });

  // Date range for testing
  const winStart = new Date('2028-08-01T00:00:00Z');
  const winEnd = new Date('2028-08-01T23:59:59Z');

  // Seed high demand bookings in High Demand facility around 11:00 AM (Hour 11)
  await Booking.create([
    {
      userId: adminA._id,
      lotId: facilityHighDemand._id,
      slotId: spotHD1._id,
      organizationId: orgA._id,
      startTime: new Date('2028-08-01T11:00:00Z'),
      endTime: new Date('2028-08-01T13:00:00Z'),
      type: 'HOURLY',
      status: 'CONFIRMED',
      totalAmount: 100,
      createdAt: new Date('2028-08-01T10:00:00Z')
    },
    {
      userId: adminA._id,
      lotId: facilityHighDemand._id,
      slotId: spotHD2._id,
      organizationId: orgA._id,
      startTime: new Date('2028-08-01T11:30:00Z'),
      endTime: new Date('2028-08-01T13:30:00Z'),
      type: 'HOURLY',
      status: 'COMPLETED',
      totalAmount: 100,
      createdAt: new Date('2028-08-01T10:30:00Z')
    },
    {
      userId: adminA._id,
      lotId: facilityHighDemand._id,
      slotId: spotHD1._id,
      organizationId: orgA._id,
      startTime: new Date('2028-08-01T14:00:00Z'),
      endTime: new Date('2028-08-01T16:00:00Z'),
      type: 'HOURLY',
      status: 'COMPLETED',
      totalAmount: 100,
      createdAt: new Date('2028-08-01T13:00:00Z')
    }
  ]);

  // Seed sparse booking in Low Demand facility (1 booking of 1 hour = ~2% util across 48 spot-hours)
  await Booking.create({
    userId: adminA._id,
    lotId: facilityLowDemand._id,
    slotId: spotLD1._id,
    organizationId: orgA._id,
    startTime: new Date('2028-08-01T08:00:00Z'),
    endTime: new Date('2028-08-01T09:00:00Z'),
    type: 'HOURLY',
    status: 'COMPLETED',
    totalAmount: 30,
    createdAt: new Date('2028-08-01T07:30:00Z')
  });

  // ==================================================
  // 1. DEMAND ANALYSIS & PRICING RECOMMENDATIONS
  // ==================================================
  let createdSurgeRecId = null;

  await t.test('1. High demand triggers PRICING_SURGE recommendation with explainable reasons', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/optimization/recommendations/generate',
      'POST',
      tokenA,
      {
        facilityId: String(facilityHighDemand._id),
        startDate: winStart.toISOString(),
        endDate: winEnd.toISOString(),
        thresholds: {
          highUtilizationThreshold: 50,
          minBookingCountForSignal: 2,
          surgePriceIncreasePct: 30
        }
      }
    );

    assert.equal(res.status, 201);
    const data = res.body;

    assert.ok(data.recommendationsCount >= 1);
    const surgeRec = data.recommendations.find((r) => r.type === 'PRICING_SURGE');
    assert.ok(surgeRec, 'Must generate a PRICING_SURGE recommendation');
    assert.equal(surgeRec.status, 'PENDING');
    assert.ok(surgeRec.reason.includes('Peak utilization'));
    assert.ok(surgeRec.recommendation.pricePerHour > facilityHighDemand.hourlyRate);
    assert.equal(surgeRec.recommendation.pricePerHour, 65); // 50 + 30% = 65

    createdSurgeRecId = surgeRec.id;
  });

  await t.test('2. Recommendation generation does NOT automatically alter PricingRule', async () => {
    // Verify that NO PricingRule was created yet
    const rules = await PricingRule.find({ facilityId: facilityHighDemand._id });
    assert.equal(rules.length, 0, 'Recommendations must not silently change production pricing rules');
  });

  await t.test('3. Low demand triggers PRICING_DISCOUNT recommendation', async () => {
    // Add 1 more short booking so minBookingCountForSignal >= 2
    await Booking.create({
      userId: adminA._id,
      lotId: facilityLowDemand._id,
      slotId: spotLD2._id,
      organizationId: orgA._id,
      startTime: new Date('2028-08-01T09:00:00Z'),
      endTime: new Date('2028-08-01T10:00:00Z'),
      type: 'HOURLY',
      status: 'COMPLETED',
      totalAmount: 30,
      createdAt: new Date('2028-08-01T08:30:00Z')
    });

    const res = await makeRequest(
      server,
      '/api/v1/optimization/recommendations/generate',
      'POST',
      tokenA,
      {
        facilityId: String(facilityLowDemand._id),
        startDate: winStart.toISOString(),
        endDate: winEnd.toISOString(),
        thresholds: {
          lowUtilizationThreshold: 30,
          minBookingCountForSignal: 2,
          discountPriceDecreasePct: 20
        }
      }
    );

    assert.equal(res.status, 201);
    const discountRec = res.body.recommendations.find((r) => r.type === 'PRICING_DISCOUNT');
    assert.ok(discountRec, 'Must generate a PRICING_DISCOUNT recommendation for low-utilization facility');
    assert.ok(discountRec.recommendation.pricePerHour < facilityLowDemand.hourlyRate);
    assert.equal(discountRec.recommendation.pricePerHour, 24); // 30 - 20% = 24
  });

  // ==================================================
  // 2. PRICING SIMULATION (WHAT-IF API)
  // ==================================================
  await t.test('4. Price increase simulation models volume contraction and revenue delta', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/optimization/simulate-pricing',
      'POST',
      tokenA,
      {
        facilityId: String(facilityHighDemand._id),
        proposedPriceChangePct: 20, // +20% price hike
        priceElasticity: -0.5,      // 20% * -0.5 = -10% volume change
        startDate: winStart.toISOString(),
        endDate: winEnd.toISOString()
      }
    );

    assert.equal(res.status, 200);
    const data = res.body;

    assert.equal(data.facility.currentHourlyRate, 50);
    assert.equal(data.simulationInput.proposedHourlyRate, 60); // 50 + 20%
    assert.equal(data.deltas.volumeDeltaPercentage, -10.0);

    // Projected revenue is calculated mathematically and labeled
    assert.ok(data.disclaimer.isSimulation, 'Must be explicitly labeled as simulation');
    assert.ok(data.simulatedMetrics.projectedRevenue > 0);
  });

  await t.test('5. Price decrease simulation models volume expansion', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/optimization/simulate-pricing',
      'POST',
      tokenA,
      {
        facilityId: String(facilityLowDemand._id),
        proposedPriceChangePct: -20, // -20% discount
        priceElasticity: -0.5,       // -20% * -0.5 = +10% volume change
        startDate: winStart.toISOString(),
        endDate: winEnd.toISOString()
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.deltas.volumeDeltaPercentage, 10.0);
    assert.equal(res.body.simulationInput.proposedHourlyRate, 24);
  });

  await t.test('6. Invalid simulation inputs are rejected by validation', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/optimization/simulate-pricing',
      'POST',
      tokenA,
      {
        facilityId: String(facilityHighDemand._id)
        // Missing proposedPriceChangePct and proposedHourlyRate
      }
    );

    assert.equal(res.status, 400);
  });

  await t.test('7. Cross-tenant facility simulation is forbidden', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/optimization/simulate-pricing',
      'POST',
      tokenB, // Tenant B attempting to simulate Tenant A facility
      {
        facilityId: String(facilityHighDemand._id),
        proposedPriceChangePct: 15
      }
    );

    assert.equal(res.status, 404, 'Foreign facility must return 404');
  });

  // ==================================================
  // 3. RECOMMENDATION WORKFLOW (LIST, ACCEPT, REJECT)
  // ==================================================
  await t.test('8. Tenant can list recommendations with filtering and pagination', async () => {
    const res = await makeRequest(
      server,
      '/api/v1/optimization/recommendations?status=PENDING&page=1&limit=10',
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.ok(res.body.recommendations.length >= 1);
    assert.ok(res.body.pagination.total >= 1);
    assert.ok(res.body.recommendations.every((r) => r.status === 'PENDING'));
  });

  await t.test('9. Cross-tenant recommendations are completely isolated', async () => {
    const resB = await makeRequest(
      server,
      '/api/v1/optimization/recommendations',
      'GET',
      tokenB
    );

    assert.equal(resB.status, 200);
    assert.equal(resB.body.recommendations.length, 0, 'Tenant B has no recommendations');
  });

  await t.test('10. Accept recommendation applies PricingRule and logs audit trail', async () => {
    assert.ok(createdSurgeRecId, 'Must have created surge rec ID');

    const res = await makeRequest(
      server,
      `/api/v1/optimization/recommendations/${createdSurgeRecId}/accept`,
      'POST',
      tokenA
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.recommendation.status, 'ACCEPTED');
    assert.ok(res.body.appliedPricingRule, 'Accepting pricing recommendation must create PricingRule');

    // Verify PricingRule was actually created
    const appliedRule = await PricingRule.findById(res.body.appliedPricingRule.id);
    assert.ok(appliedRule);
    assert.equal(appliedRule.pricePerHour, 65);
    assert.equal(appliedRule.isActive, true);

    // Verify AuditLog entries
    const auditAccept = await AuditLog.findOne({
      entityId: createdSurgeRecId,
      action: 'RECOMMENDATION_ACCEPTED'
    });
    assert.ok(auditAccept, 'AuditLog must record RECOMMENDATION_ACCEPTED');

    const auditRule = await AuditLog.findOne({
      entityId: String(appliedRule._id),
      action: 'PRICING_RULE_APPLIED'
    });
    assert.ok(auditRule, 'AuditLog must record PRICING_RULE_APPLIED');
  });

  await t.test('11. Invalid recommendation state transition is rejected (cannot re-accept)', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/optimization/recommendations/${createdSurgeRecId}/accept`,
      'POST',
      tokenA
    );

    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, 'INVALID_RECOMMENDATION_STATE');
  });

  await t.test('12. Reject recommendation updates status and logs audit trail', async () => {
    // Generate one more recommendation to test rejection
    const genRes = await makeRequest(
      server,
      '/api/v1/optimization/recommendations/generate',
      'POST',
      tokenA,
      {
        facilityId: String(facilityHighDemand._id),
        startDate: winStart.toISOString(),
        endDate: winEnd.toISOString(),
        thresholds: { highUtilizationThreshold: 40, minBookingCountForSignal: 1 }
      }
    );
    const recToReject = genRes.body.recommendations[0];
    assert.ok(recToReject);

    const res = await makeRequest(
      server,
      `/api/v1/optimization/recommendations/${recToReject.id}/reject`,
      'POST',
      tokenA,
      { reason: 'Local community holiday tomorrow; pricing surge not suitable' }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.recommendation.status, 'REJECTED');

    // Verify in database
    const rec = await OptimizationRecommendation.findById(recToReject.id);
    assert.equal(rec.status, 'REJECTED');
    assert.ok(rec.reason.includes('Local community holiday'));
  });

  await t.test('13. Role authorization: Operator cannot accept or reject recommendations', async () => {
    // Operator attempts to accept recommendation
    const res = await makeRequest(
      server,
      `/api/v1/optimization/recommendations/${createdSurgeRecId}/accept`,
      'POST',
      tokenOpA
    );

    assert.equal(res.status, 403, 'Operator role must be forbidden from accepting recommendations');
  });

  // ==================================================
  // 4. OVERSTAY DETECTION TESTS
  // ==================================================
  // Create past bookings for overstay test scenarios
  const pastTimeStart = new Date(Date.now() - 4 * 3600000);
  const pastTimeEnd = new Date(Date.now() - 2 * 3600000);

  // Scenario 1: Active overstay (booking ended, spot still OCCUPIED)
  const spotActiveOverstay = await ParkingSlot.create({
    lotId: facilityHighDemand._id,
    organizationId: orgA._id,
    number: 'OS-ACTIVE',
    status: 'OCCUPIED',
    isActive: true
  });

  await Booking.create({
    userId: adminA._id,
    lotId: facilityHighDemand._id,
    slotId: spotActiveOverstay._id,
    organizationId: orgA._id,
    startTime: pastTimeStart,
    endTime: pastTimeEnd,
    type: 'HOURLY',
    status: 'COMPLETED',
    totalAmount: 100
  });

  // Scenario 2: Resolved overstay (vacated 45 minutes after booking end)
  const spotResolvedOverstay = await ParkingSlot.create({
    lotId: facilityHighDemand._id,
    organizationId: orgA._id,
    number: 'OS-RESOLVED',
    status: 'AVAILABLE',
    isActive: true
  });

  const bResolved = await Booking.create({
    userId: adminA._id,
    lotId: facilityHighDemand._id,
    slotId: spotResolvedOverstay._id,
    organizationId: orgA._id,
    startTime: pastTimeStart,
    endTime: pastTimeEnd,
    type: 'HOURLY',
    status: 'COMPLETED',
    totalAmount: 100
  });

  // Record late departure event (45 mins past endTime)
  await OccupancyEvent.create({
    organizationId: orgA._id,
    facilityId: facilityHighDemand._id,
    spotId: spotResolvedOverstay._id,
    bookingId: bResolved._id,
    eventType: 'SPOT_VACATED',
    source: 'SYSTEM',
    timestamp: new Date(pastTimeEnd.getTime() + 45 * 60000)
  });

  // Scenario 3: On schedule departure (vacated 5 mins before endTime)
  const spotOnTime = await ParkingSlot.create({
    lotId: facilityHighDemand._id,
    organizationId: orgA._id,
    number: 'OS-ONTIME',
    status: 'AVAILABLE',
    isActive: true
  });

  const bOnTime = await Booking.create({
    userId: adminA._id,
    lotId: facilityHighDemand._id,
    slotId: spotOnTime._id,
    organizationId: orgA._id,
    startTime: pastTimeStart,
    endTime: pastTimeEnd,
    type: 'HOURLY',
    status: 'COMPLETED',
    totalAmount: 100
  });

  await OccupancyEvent.create({
    organizationId: orgA._id,
    facilityId: facilityHighDemand._id,
    spotId: spotOnTime._id,
    bookingId: bOnTime._id,
    eventType: 'SPOT_VACATED',
    source: 'SYSTEM',
    timestamp: new Date(pastTimeEnd.getTime() - 5 * 60000)
  });

  // Scenario 4: Missing departure event (spot is AVAILABLE, but no departure event recorded)
  const spotMissing = await ParkingSlot.create({
    lotId: facilityHighDemand._id,
    organizationId: orgA._id,
    number: 'OS-MISSING',
    status: 'AVAILABLE',
    isActive: true
  });

  await Booking.create({
    userId: adminA._id,
    lotId: facilityHighDemand._id,
    slotId: spotMissing._id,
    organizationId: orgA._id,
    startTime: pastTimeStart,
    endTime: pastTimeEnd,
    type: 'HOURLY',
    status: 'COMPLETED',
    totalAmount: 100
  });

  await t.test('14. Overstay detection detects ACTIVE, RESOLVED, and MISSING overstay cases', async () => {
    const res = await makeRequest(
      server,
      `/api/v1/optimization/overstays?facilityId=${facilityHighDemand._id}`,
      'GET',
      tokenA
    );

    assert.equal(res.status, 200);
    const data = res.body;

    assert.ok(Array.isArray(data.overstays));
    assert.ok(data.pagination.total >= 4);

    const activeOS = data.overstays.find((o) => o.spotNumber === 'OS-ACTIVE');
    assert.ok(activeOS);
    assert.equal(activeOS.overstayStatus, 'ACTIVE_OVERSTAY');
    assert.ok(activeOS.estimatedOverstayMinutes >= 110);
    assert.ok(activeOS.confidence >= 0.9);

    const resolvedOS = data.overstays.find((o) => o.spotNumber === 'OS-RESOLVED');
    assert.ok(resolvedOS);
    assert.equal(resolvedOS.overstayStatus, 'RESOLVED_OVERSTAY');
    assert.equal(resolvedOS.estimatedOverstayMinutes, 45);

    const onTime = data.overstays.find((o) => o.spotNumber === 'OS-ONTIME');
    assert.ok(onTime);
    assert.equal(onTime.overstayStatus, 'NO_OVERSTAY');
    assert.equal(onTime.estimatedOverstayMinutes, 0);

    const missingOS = data.overstays.find((o) => o.spotNumber === 'OS-MISSING');
    assert.ok(missingOS);
    assert.equal(missingOS.overstayStatus, 'MISSING_DEPARTURE_EVENT');
    assert.equal(missingOS.confidence, 0.4);
  });

  await t.test('15. Cross-tenant overstay querying is isolated', async () => {
    const resB = await makeRequest(
      server,
      '/api/v1/optimization/overstays',
      'GET',
      tokenB
    );

    assert.equal(resB.status, 200);
    assert.equal(resB.body.overstays.length, 0, 'Org B has no candidate overstays');
  });
});
