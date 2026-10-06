const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  User,
  Organization,
  ParkingLot,
  Floor,
  ParkingSlot,
  Vehicle,
  Booking
} = require('../src/models');
const vehicleService = require('../src/services/vehicle.service');
const bookingService = require('../src/services/booking.service');
const { connectDatabase } = require('../src/db');

test('DRIVER EXPERIENCE ENHANCEMENT: Vehicle Profiles, Booking Integration, and Data Isolation', async (t) => {
  await connectDatabase();
  const timestamp = Date.now();

  // Create test driver users
  const driverA = await User.create({
    name: 'Driver Alice',
    email: `alice-${timestamp}@driver.test`,
    passwordHash: 'hashed_pw',
    role: 'USER',
    accountType: 'DRIVER'
  });

  const driverB = await User.create({
    name: 'Driver Bob',
    email: `bob-${timestamp}@driver.test`,
    passwordHash: 'hashed_pw',
    role: 'USER',
    accountType: 'DRIVER'
  });

  // Create test organization & facility
  const org = await Organization.create({
    name: 'Metro Transit Authorities',
    slug: `mta-${timestamp}`,
    email: `ops-${timestamp}@mta.test`
  });

  const facility = await ParkingLot.create({
    name: 'Riverside Airport Parking',
    address: 'Terminal 2 Boulevard, Airport City',
    city: 'MetroCity',
    hourlyRate: 50,
    dailyRate: 350,
    latitude: 23.0734,
    longitude: 72.6266,
    organizationId: org._id
  });

  const floor = await Floor.create({
    facilityId: facility._id,
    organizationId: org._id,
    name: 'Floor 2',
    floorNumber: 2,
    capacity: 50
  });

  const slot = await ParkingSlot.create({
    lotId: facility._id,
    floorId: floor._id,
    organizationId: org._id,
    number: 'B12',
    level: 'Floor 2',
    type: 'STANDARD',
    status: 'AVAILABLE'
  });

  t.after(async () => {
    await Booking.deleteMany({ lotId: facility._id });
    await Vehicle.deleteMany({ userId: { $in: [driverA._id, driverB._id] } });
    await ParkingSlot.deleteMany({ lotId: facility._id });
    await Floor.deleteMany({ facilityId: facility._id });
    await ParkingLot.deleteOne({ _id: facility._id });
    await Organization.deleteOne({ _id: org._id });
    await User.deleteMany({ _id: { $in: [driverA._id, driverB._id] } });
    if (process.argv[1] && process.argv[1].includes('driver_experience_features.test.js')) {
      await mongoose.disconnect();
    }
  });

  await t.test('1. First vehicle registered automatically becomes default', async () => {
    const v1 = await vehicleService.createVehicle(driverA._id, null, {
      nickname: 'My i20',
      make: 'Hyundai',
      model: 'i20',
      registrationNumber: 'GJ18XX1234',
      color: 'Silver'
    });

    assert.equal(v1.make, 'Hyundai');
    assert.equal(v1.model, 'i20');
    assert.equal(v1.registrationNumber, 'GJ18XX1234');
    assert.equal(v1.color, 'Silver');
    assert.equal(v1.isDefault, true, 'First vehicle must automatically be set as default');
  });

  await t.test('2. Second vehicle registered as default unsets previous default', async () => {
    const v2 = await vehicleService.createVehicle(driverA._id, null, {
      nickname: 'City Sedan',
      make: 'Honda',
      model: 'City',
      registrationNumber: 'GJ06XX5678',
      color: 'White',
      isDefault: true
    });

    assert.equal(v2.isDefault, true);

    const list = await vehicleService.listUserVehicles(driverA._id);
    assert.equal(list.length, 2);

    const v1Updated = list.find((v) => v.registrationNumber === 'GJ18XX1234');
    const v2Updated = list.find((v) => v.registrationNumber === 'GJ06XX5678');
    assert.equal(v1Updated.isDefault, false);
    assert.equal(v2Updated.isDefault, true);
  });

  await t.test('3. Duplicate vehicle registration for the same driver is rejected', async () => {
    await assert.rejects(
      async () => {
        await vehicleService.createVehicle(driverA._id, null, {
          make: 'Hyundai',
          model: 'i20',
          registrationNumber: 'GJ18XX1234'
        });
      },
      (err) => err.code === 'VEHICLE_EXISTS' && err.status === 409
    );
  });

  await t.test('4. Driver can update and set default vehicle', async () => {
    const list = await vehicleService.listUserVehicles(driverA._id);
    const v1 = list.find((v) => v.registrationNumber === 'GJ18XX1234');

    const updated = await vehicleService.updateVehicle(v1.id, driverA._id, {
      nickname: 'Prime i20 Sportz',
      color: 'Titan Grey',
      isDefault: true
    });

    assert.equal(updated.nickname, 'Prime i20 Sportz');
    assert.equal(updated.color, 'Titan Grey');
    assert.equal(updated.isDefault, true);

    const listAfter = await vehicleService.listUserVehicles(driverA._id);
    const v2After = listAfter.find((v) => v.registrationNumber === 'GJ06XX5678');
    assert.equal(v2After.isDefault, false, 'Other vehicles must have isDefault unset');
  });

  await t.test('5. Tenant Isolation: Driver B cannot view, update, or delete Driver A vehicles', async () => {
    const listA = await vehicleService.listUserVehicles(driverA._id);
    const listB = await vehicleService.listUserVehicles(driverB._id);
    assert.equal(listB.length, 0, 'Driver B must see 0 vehicles initially');

    const targetVehicle = listA[0];
    await assert.rejects(
      async () => {
        await vehicleService.updateVehicle(targetVehicle.id, driverB._id, { nickname: 'Hacked' });
      },
      (err) => err.status === 404,
      'Driver B updating Driver A vehicle must return 404'
    );

    await assert.rejects(
      async () => {
        await vehicleService.deleteVehicle(targetVehicle.id, driverB._id);
      },
      (err) => err.status === 404,
      'Driver B deleting Driver A vehicle must return 404'
    );
  });

  await t.test('6. Booking Integration: vehicle is associated with booking and populated in loadBooking', async () => {
    const listA = await vehicleService.listUserVehicles(driverA._id);
    const chosenVehicle = listA[0];

    const startTime = new Date(Date.now() + 3600000);
    const endTime = new Date(Date.now() + 3 * 3600000);

    const booking = await bookingService.createBooking({
      userId: driverA._id,
      slotId: slot._id,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      type: 'HOURLY',
      vehicleId: chosenVehicle.id,
      organizationId: org._id
    });

    assert.ok(booking.id, 'Booking created');
    assert.equal(booking.lot.name, 'Riverside Airport Parking');
    assert.equal(booking.lot.latitude, 23.0734, 'Facility coordinates must match for navigation');
    assert.equal(booking.lot.longitude, 72.6266);
    assert.equal(booking.slot.number, 'B12', 'Spot number must match');
    assert.equal(booking.floor.name, 'Floor 2', 'Floor must be populated');
    assert.ok(booking.vehicle, 'Vehicle must be populated on booking');
    assert.equal(booking.vehicle.registrationNumber, chosenVehicle.registrationNumber);
  });

  await t.test('7. Tenant Isolation: Driver B cannot get Driver A booking by ID', async () => {
    const bookingsA = await bookingService.listUserBookings(driverA._id);
    assert.equal(bookingsA.length, 1);
    const bookingId = bookingsA[0].id;

    const fetchedByA = await bookingService.getBookingById(bookingId, driverA._id);
    assert.equal(fetchedByA.id, bookingId);

    await assert.rejects(
      async () => {
        await bookingService.getBookingById(bookingId, driverB._id);
      },
      (err) => err.status === 404,
      'Cross-tenant booking inspection must return 404'
    );
  });
});
