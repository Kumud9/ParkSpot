const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { User, ParkingLot, ParkingSlot, Booking } = require('../src/models');
const { createBooking } = require('../src/services/booking.service');

test('concurrency: simultaneous booking attempts for same slot and overlapping window yield exactly one success and one conflict', async () => {
  await connectDatabase();

  // Setup test facility and slot
  const lot = await ParkingLot.create({
    name: 'Concurrency Test Lot',
    address: '100 Test Blvd',
    city: 'TestCity',
    hourlyRate: 50,
    dailyRate: 300
  });

  const slot = await ParkingSlot.create({
    lotId: lot._id,
    number: `CONC-${Date.now()}`,
    type: 'STANDARD',
    status: 'AVAILABLE',
    isActive: true
  });

  const userA = await User.create({
    name: 'User A',
    email: `usera-${Date.now()}@test.com`,
    passwordHash: 'hash',
    role: 'USER'
  });

  const userB = await User.create({
    name: 'User B',
    email: `userb-${Date.now()}@test.com`,
    passwordHash: 'hash',
    role: 'USER'
  });

  const startTime = new Date(Date.now() + 24 * 3600000).toISOString();
  const endTime = new Date(Date.now() + 26 * 3600000).toISOString();

  // Fire both requests simultaneously
  const results = await Promise.allSettled([
    createBooking({
      userId: userA._id,
      slotId: slot._id,
      startTime,
      endTime,
      type: 'HOURLY'
    }),
    createBooking({
      userId: userB._id,
      slotId: slot._id,
      startTime,
      endTime,
      type: 'HOURLY'
    })
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactly one concurrent booking attempt must succeed');
  assert.equal(rejected.length, 1, 'Exactly one concurrent booking attempt must fail with conflict');

  const rejectionError = rejected[0].reason;
  assert.equal(rejectionError.status, 409, 'Conflict error status must be 409');
  assert.ok(
    rejectionError.code === 'SPOT_ALREADY_BOOKED' || rejectionError.code === 'SLOT_UNAVAILABLE',
    'Conflict code must be SPOT_ALREADY_BOOKED or SLOT_UNAVAILABLE'
  );

  // Verify database state: exactly 1 booking exists
  const count = await Booking.countDocuments({ slotId: slot._id, status: 'CONFIRMED' });
  assert.equal(count, 1, 'Exactly one confirmed booking document must be stored in the database');

  // Cleanup
  await Booking.deleteMany({ slotId: slot._id });
  await ParkingSlot.deleteOne({ _id: slot._id });
  await ParkingLot.deleteOne({ _id: lot._id });
  await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
});
