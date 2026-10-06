const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { app } = require('../src/index');
const { ParkingLot, Floor, ParkingSlot, Organization } = require('../src/models');
const locationService = require('../src/services/location.service');

test('PHASE 4.4: Location-Based Parking Discovery Test Suite', async (t) => {
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const requestJson = (path) =>
    new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
        res.on('error', reject);
      });
    });

  // Setup isolated test organization and facilities
  const testOrg = await Organization.findOneAndUpdate(
    { slug: 'discovery-test-org' },
    { name: 'Discovery Test Org', slug: 'discovery-test-org', city: 'TestCity' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Create 3 facilities at known coordinates
  // Benchmark point: 22.3100, 73.1800 (Central Vadodara)
  const lotNear = await ParkingLot.create({
    name: 'Discovery Lot Alpha (Near)',
    address: '100m from Central Point',
    city: 'Vadodara',
    hourlyRate: 40,
    dailyRate: 250,
    openingTime: '00:00',
    closingTime: '23:59',
    active: true,
    latitude: 22.3105,
    longitude: 73.1805,
    organizationId: testOrg._id
  });

  const lotMid = await ParkingLot.create({
    name: 'Discovery Lot Beta (Mid)',
    address: '1.2km from Central Point',
    city: 'Vadodara',
    hourlyRate: 30,
    dailyRate: 180,
    openingTime: '06:00',
    closingTime: '22:00',
    active: true,
    latitude: 22.3180,
    longitude: 73.1880,
    organizationId: testOrg._id
  });

  const lotFar = await ParkingLot.create({
    name: 'Discovery Lot Gamma (Far)',
    address: '6.5km from Central Point',
    city: 'Vadodara',
    hourlyRate: 60,
    dailyRate: 400,
    openingTime: '00:00',
    closingTime: '23:59',
    active: true,
    latitude: 22.3600,
    longitude: 73.2100,
    organizationId: testOrg._id
  });

  const lotNoCoords = await ParkingLot.create({
    name: 'Discovery Lot No Coords',
    address: 'No GPS Registered',
    city: 'Vadodara',
    hourlyRate: 20,
    dailyRate: 100,
    active: true,
    latitude: null,
    longitude: null,
    organizationId: testOrg._id
  });

  // Add slots with types to Alpha
  const floorAlpha = await Floor.create({
    facilityId: lotNear._id,
    floorNumber: 0,
    name: 'Ground',
    capacity: 4,
    organizationId: testOrg._id
  });
  await ParkingSlot.create([
    { lotId: lotNear._id, floorId: floorAlpha._id, organizationId: testOrg._id, number: 'D-01', type: 'EV', status: 'AVAILABLE' },
    { lotId: lotNear._id, floorId: floorAlpha._id, organizationId: testOrg._id, number: 'D-02', type: 'STANDARD', status: 'AVAILABLE' },
    { lotId: lotNear._id, floorId: floorAlpha._id, organizationId: testOrg._id, number: 'D-03', type: 'ACCESSIBLE', status: 'AVAILABLE' },
    { lotId: lotNear._id, floorId: floorAlpha._id, organizationId: testOrg._id, number: 'D-04', type: 'STANDARD', status: 'OCCUPIED' }
  ]);

  await t.test('1. Distance calculation and formatting accuracy', () => {
    // Distance between (22.3100, 73.1800) and (22.3105, 73.1805)
    const distKm = locationService.calculateHaversineDistance(22.3100, 73.1800, 22.3105, 73.1805);
    assert.ok(distKm > 0.05 && distKm < 0.15, `Expected ~0.07km, got ${distKm}`);

    assert.equal(locationService.formatDistance(0.08), '80 m');
    assert.equal(locationService.formatDistance(0.45), '450 m');
    assert.equal(locationService.formatDistance(1.234), '1.2 km');
    assert.equal(locationService.formatDistance(5.678), '5.7 km');
  });

  await t.test('2. Radius filtering: 2 km radius finds near and mid, excludes far', async () => {
    const res = await requestJson('/api/lots/nearby?lat=22.3100&lng=73.1800&radius=2');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.facilities));
    const ids = res.body.facilities.map((f) => f.id);
    assert.ok(ids.includes(lotNear._id.toString()), 'Should include lotNear within 2km');
    assert.ok(ids.includes(lotMid._id.toString()), 'Should include lotMid within 2km');
    assert.ok(!ids.includes(lotFar._id.toString()), 'Should NOT include lotFar beyond 2km');
    assert.ok(!ids.includes(lotNoCoords._id.toString()), 'Should omit lot with no coordinates');
  });

  await t.test('3. Radius filtering: 0.5 km radius finds only near lot', async () => {
    const res = await requestJson('/api/lots/nearby?lat=22.3100&lng=73.1800&radius=0.5');
    assert.equal(res.status, 200);
    const ids = res.body.facilities.map((f) => f.id);
    assert.ok(ids.includes(lotNear._id.toString()), 'Should include lotNear');
    assert.ok(!ids.includes(lotMid._id.toString()), 'Should exclude lotMid beyond 0.5km');
    assert.ok(!ids.includes(lotFar._id.toString()), 'Should exclude lotFar');
  });

  await t.test('4. Sorting: nearest orders ascending by distance', async () => {
    const res = await requestJson('/api/lots/nearby?lat=22.3100&lng=73.1800&radius=10&sortBy=nearest');
    assert.equal(res.status, 200);
    const ourLots = res.body.facilities.filter((f) =>
      [lotNear._id.toString(), lotMid._id.toString(), lotFar._id.toString()].includes(f.id)
    );
    assert.equal(ourLots[0].id, lotNear._id.toString(), 'Nearest should be Alpha');
    assert.equal(ourLots[1].id, lotMid._id.toString(), 'Second should be Beta');
    assert.equal(ourLots[2].id, lotFar._id.toString(), 'Third should be Gamma');
  });

  await t.test('5. Sorting: price orders ascending by starting price', async () => {
    const res = await requestJson('/api/lots/nearby?lat=22.3100&lng=73.1800&radius=10&sortBy=price');
    assert.equal(res.status, 200);
    const ourLots = res.body.facilities.filter((f) =>
      [lotNear._id.toString(), lotMid._id.toString(), lotFar._id.toString()].includes(f.id)
    );
    // Beta is 30, Alpha is 40, Gamma is 60
    assert.equal(ourLots[0].id, lotMid._id.toString(), 'Lowest price should be Beta (30)');
    assert.equal(ourLots[1].id, lotNear._id.toString(), 'Second lowest should be Alpha (40)');
    assert.equal(ourLots[2].id, lotFar._id.toString(), 'Highest price should be Gamma (60)');
  });

  await t.test('6. Filter by parkingType: EV filters to facilities offering EV charging', async () => {
    const res = await requestJson('/api/lots/nearby?lat=22.3100&lng=73.1800&radius=2&parkingType=EV');
    assert.equal(res.status, 200);
    const ourLots = res.body.facilities.filter((f) =>
      [lotNear._id.toString(), lotMid._id.toString()].includes(f.id)
    );
    assert.ok(ourLots.some((f) => f.id === lotNear._id.toString()), 'Alpha has EV slots');
  });

  await t.test('7. Empty state: search in remote location returns empty facilities array', async () => {
    const res = await requestJson('/api/lots/nearby?lat=0.0000&lng=70.0000&radius=5');
    assert.equal(res.status, 200);
    assert.equal(res.body.facilities.length, 0);
    assert.equal(res.body.search.totalFound, 0);
  });

  await t.test('8. Input validation: invalid coordinates return 400 error', async () => {
    const resLat = await requestJson('/api/lots/nearby?lat=95&lng=73.1800');
    assert.equal(resLat.status, 400, 'Latitude > 90 must fail validation');

    const resLng = await requestJson('/api/lots/nearby?lat=22.3100&lng=190');
    assert.equal(resLng.status, 400, 'Longitude > 180 must fail validation');

    const resMissing = await requestJson('/api/lots/nearby?lat=22.3100');
    assert.equal(resMissing.status, 400, 'Missing longitude must fail validation');
  });

  await t.test('9. Public route alias /api/v1/facilities/nearby matches /api/lots/nearby', async () => {
    const res = await requestJson('/api/v1/facilities/nearby?lat=22.3100&lng=73.1800&radius=2');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.facilities));
  });

  await t.test('10. Clean up test data and shutdown server', async () => {
    await ParkingSlot.deleteMany({ lotId: lotNear._id });
    await Floor.deleteMany({ facilityId: lotNear._id });
    await ParkingLot.deleteMany({
      _id: { $in: [lotNear._id, lotMid._id, lotFar._id, lotNoCoords._id] }
    });
    await Organization.deleteOne({ _id: testOrg._id });
    server.close();
  });
});
