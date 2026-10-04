const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const {
  Organization,
  ParkingLot,
  Floor,
  ParkingSlot,
  Vehicle,
  OccupancyEvent,
  AuditLog,
  User
} = require('../src/models');
const floorService = require('../src/services/floor.service');
const spotService = require('../src/services/spot.service');
const vehicleService = require('../src/services/vehicle.service');

test('b2b domain: floors, spots with spatial coordinates, vehicles, and operational status transitions', async () => {
  await connectDatabase();

  const org = await Organization.create({
    name: 'Metropolis Parking',
    slug: `metro-${Date.now()}`,
    email: 'admin@metro.test'
  });

  const facility = await ParkingLot.create({
    name: 'Metropolis Tower Garage',
    address: '500 Skyline Ave',
    city: 'MetroCity',
    hourlyRate: 75,
    dailyRate: 450,
    organizationId: org._id
  });

  const operatorUser = await User.create({
    name: 'Operator Dan',
    email: `dan-${Date.now()}@metro.test`,
    passwordHash: 'hash',
    role: 'OPERATOR',
    organizationId: org._id
  });

  // 1. Create Floor
  const floor = await floorService.createFloor(
    facility._id,
    org._id,
    { name: 'Basement 1', floorNumber: -1, capacity: 50 },
    operatorUser._id
  );
  assert.equal(floor.name, 'Basement 1');
  assert.equal(floor.floorNumber, -1);

  // Verify Audit Log was generated for floor creation
  const floorAudit = await AuditLog.findOne({
    entityId: floor.id,
    action: 'FLOOR_CREATED'
  });
  assert.ok(floorAudit, 'Audit log must record FLOOR_CREATED');

  // 2. Create Spot with Spatial Coordinates
  const spot = await spotService.createSpot(
    facility._id,
    org._id,
    {
      number: 'B1-01',
      floorId: floor.id,
      type: 'EV',
      coordinates: {
        x: 12.5,
        y: 25.0,
        width: 2.8,
        height: 5.5,
        rotation: 90
      }
    },
    operatorUser._id
  );

  assert.equal(spot.number, 'B1-01');
  assert.equal(spot.level, 'Basement 1');
  assert.equal(spot.coordinates.x, 12.5);
  assert.equal(spot.coordinates.rotation, 90);

  // 3. Update Spot Operational Status to BLOCKED (e.g. maintenance/closure)
  const blockedSpot = await spotService.updateSpotStatus(
    spot.id,
    org._id,
    'BLOCKED',
    operatorUser._id
  );
  assert.equal(blockedSpot.status, 'BLOCKED');
  assert.equal(blockedSpot.isActive, false, 'Blocked spot must be deactivated');

  // Verify OccupancyEvent was emitted
  const blockEvent = await OccupancyEvent.findOne({
    spotId: spot.id,
    eventType: 'SPOT_BLOCKED'
  });
  assert.ok(blockEvent, 'OccupancyEvent SPOT_BLOCKED must be recorded');
  assert.equal(blockEvent.source, 'OPERATOR');

  // 4. Register Vehicle
  const vehicle = await vehicleService.createVehicle(operatorUser._id, org._id, {
    registrationNumber: 'DL09XYZ9999',
    vehicleType: 'SUV',
    make: 'Mahindra',
    model: 'XUV700'
  });
  assert.equal(vehicle.registrationNumber, 'DL09XYZ9999');
  assert.equal(vehicle.vehicleType, 'SUV');

  // Cleanup
  await OccupancyEvent.deleteMany({ facilityId: facility._id });
  await AuditLog.deleteMany({ organizationId: org._id });
  await Vehicle.deleteOne({ _id: vehicle.id });
  await ParkingSlot.deleteOne({ _id: spot.id });
  await Floor.deleteOne({ _id: floor.id });
  await ParkingLot.deleteOne({ _id: facility._id });
  await User.deleteOne({ _id: operatorUser._id });
  await Organization.deleteOne({ _id: org._id });
});
