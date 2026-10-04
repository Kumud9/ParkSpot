const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { User, ParkingLot, ParkingSlot, Booking } = require('../src/models');
const { completeExpiredBookings } = require('../src/services/booking.service');

test('lifecycle: completeExpiredBookings transitions past confirmed bookings to COMPLETED idempotently', async () => {
  await connectDatabase();

  const lot = await ParkingLot.create({
    name: 'Lifecycle Test Lot',
    address: '200 Lifecycle Ave',
    city: 'TestCity',
    hourlyRate: 50,
    dailyRate: 300
  });

  const slot = await ParkingSlot.create({
    lotId: lot._id,
    number: `LIFE-${Date.now()}`,
    type: 'STANDARD',
    status: 'AVAILABLE',
    isActive: true
  });

  const user = await User.create({
    name: 'Lifecycle User',
    email: `life-${Date.now()}@test.com`,
    passwordHash: 'hash',
    role: 'USER'
  });

  const pastStart = new Date(Date.now() - 4 * 3600000);
  const pastEnd = new Date(Date.now() - 2 * 3600000);

  // 1. Expired confirmed booking (should be completed)
  const expiredBooking = await Booking.create({
    userId: user._id,
    lotId: lot._id,
    slotId: slot._id,
    startTime: pastStart,
    endTime: pastEnd,
    type: 'HOURLY',
    status: 'CONFIRMED',
    totalAmount: 100
  });

  // 2. Expired canceled booking (must NOT be modified)
  const canceledBooking = await Booking.create({
    userId: user._id,
    lotId: lot._id,
    slotId: slot._id,
    startTime: pastStart,
    endTime: pastEnd,
    type: 'HOURLY',
    status: 'CANCELED',
    totalAmount: 100
  });

  // 3. Active future booking (must NOT be modified)
  const futureStart = new Date(Date.now() + 2 * 3600000);
  const futureEnd = new Date(Date.now() + 4 * 3600000);
  const futureBooking = await Booking.create({
    userId: user._id,
    lotId: lot._id,
    slotId: slot._id,
    startTime: futureStart,
    endTime: futureEnd,
    type: 'HOURLY',
    status: 'CONFIRMED',
    totalAmount: 100
  });

  // Execute lifecycle transition
  const modifiedCount = await completeExpiredBookings();
  assert.ok(modifiedCount >= 1, 'At least 1 booking should be transitioned to COMPLETED');

  // Verify expired booking is now COMPLETED
  const updatedExpired = await Booking.findById(expiredBooking._id);
  assert.equal(updatedExpired.status, 'COMPLETED', 'Expired confirmed booking must transition to COMPLETED');

  // Verify canceled booking is STILL CANCELED
  const updatedCanceled = await Booking.findById(canceledBooking._id);
  assert.equal(updatedCanceled.status, 'CANCELED', 'Canceled booking must remain CANCELED');

  // Verify future booking is STILL CONFIRMED
  const updatedFuture = await Booking.findById(futureBooking._id);
  assert.equal(updatedFuture.status, 'CONFIRMED', 'Future confirmed booking must remain CONFIRMED');

  // Idempotency check: Running again transitions 0 more
  const secondPassCount = await completeExpiredBookings();
  assert.equal(secondPassCount, 0, 'Subsequent execution should transition 0 bookings (idempotent)');

  // Cleanup
  await Booking.deleteMany({ _id: { $in: [expiredBooking._id, canceledBooking._id, futureBooking._id] } });
  await ParkingSlot.deleteOne({ _id: slot._id });
  await ParkingLot.deleteOne({ _id: lot._id });
  await User.deleteOne({ _id: user._id });
});
