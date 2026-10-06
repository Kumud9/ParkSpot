const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/db');
const { User, ParkingLot, ParkingSlot, Booking, Organization, OptimizationRecommendation } = require('../src/models');
const { createBooking } = require('../src/services/booking.service');
const { getPublicFacilityById } = require('../src/services/facility.service');
const { processCopilotChat } = require('../src/services/copilot.service');

test('Cross-User Spot Availability & Double Booking Protection', async (t) => {
  await connectDatabase();

  const org = await Organization.create({
    name: 'Metropolitan Parking Authority',
    slug: `metro-${Date.now()}`,
    email: `org-${Date.now()}@metro.com`
  });

  const lot = await ParkingLot.create({
    organizationId: org._id,
    name: 'Downtown Central Garage',
    address: '500 Market Street',
    city: 'Ahmedabad',
    hourlyRate: 60,
    dailyRate: 400,
    active: true
  });

  const slotG03 = await ParkingSlot.create({
    organizationId: org._id,
    lotId: lot._id,
    number: 'G-03',
    floor: 'Floor 1',
    type: 'STANDARD',
    status: 'AVAILABLE',
    isActive: true
  });

  const driverA = await User.create({
    name: 'Driver A',
    email: `driverA-${Date.now()}@example.com`,
    passwordHash: 'hash',
    role: 'USER',
    accountType: 'DRIVER'
  });

  const driverB = await User.create({
    name: 'Driver B',
    email: `driverB-${Date.now()}@example.com`,
    passwordHash: 'hash',
    role: 'USER',
    accountType: 'DRIVER'
  });

  const operatorUser = await User.create({
    name: 'Lara Vance',
    email: `lara-${Date.now()}@metro.com`,
    passwordHash: 'hash',
    organizationId: org._id,
    role: 'OPERATOR',
    accountType: 'OPERATOR'
  });

  const now = new Date();
  const startTime = new Date(now.getTime() + 1 * 3600000).toISOString();
  const endTime = new Date(now.getTime() + 3 * 3600000).toISOString();

  await t.test('1. Initial state: G-03 is AVAILABLE in facility query', async () => {
    const facData = await getPublicFacilityById(lot._id, { startTime, endTime });
    const slotList = facData.slots || facData.spots || [];
    const slot = slotList.find((s) => s.number === 'G-03');
    assert.ok(slot, 'G-03 must exist in facility spots');
    assert.equal(slot.status, 'AVAILABLE', 'Initial slot status must be AVAILABLE');
    assert.equal(slot.available, true, 'Initial slot available property must be true');
  });

  await t.test('2. Driver A books G-03 successfully', async () => {
    const booking = await createBooking({
      userId: driverA._id,
      slotId: slotG03._id,
      startTime,
      endTime,
      type: 'HOURLY'
    });

    assert.ok(booking._id, 'Booking document must be created');
    assert.equal(booking.status, 'CONFIRMED', 'Booking must be CONFIRMED');
  });

  await t.test('3. Driver B querying the facility sees G-03 as RESERVED and unavailable', async () => {
    const facDataForDriverB = await getPublicFacilityById(lot._id, { startTime, endTime });
    const slotList = facDataForDriverB.slots || facDataForDriverB.spots || [];
    const slot = slotList.find((s) => s.number === 'G-03');
    assert.ok(slot, 'G-03 must exist in spots for Driver B');
    assert.equal(slot.status, 'RESERVED', 'Slot G-03 must be marked RESERVED for Driver B');
    assert.equal(slot.available, false, 'Slot G-03 available property must be false');
  });

  await t.test('4. Driver B attempting to book G-03 for overlapping window receives 409 SPOT_ALREADY_BOOKED', async () => {
    try {
      await createBooking({
        userId: driverB._id,
        slotId: slotG03._id,
        startTime,
        endTime,
        type: 'HOURLY'
      });
      assert.fail('Expected 409 conflict error when booking an already reserved slot');
    } catch (err) {
      assert.equal(err.status, 409, 'Error status must be 409 Conflict');
      assert.ok(
        err.code === 'SPOT_ALREADY_BOOKED' || err.code === 'SLOT_UNAVAILABLE',
        `Error code must be SPOT_ALREADY_BOOKED or SLOT_UNAVAILABLE, received: ${err.code}`
      );
    }
  });

  await t.test('5. ParkSpot Copilot answers operational questions in a tenant-isolated read-only manner', async () => {
    // Add a recommendation
    const rec = await OptimizationRecommendation.create({
      organizationId: org._id,
      facilityId: lot._id,
      title: 'Increase Peak Pricing by 25%',
      type: 'PRICING_SURGE',
      description: 'Increase peak pricing by 25% to manage demand surge.',
      reason: 'Demand expected to exceed current capacity during evening peak.',
      confidence: 0.85,
      status: 'PENDING'
    });

    const copilotResult = await processCopilotChat({
      organizationId: org._id,
      userId: operatorUser._id,
      messages: [
        { role: 'user', content: 'Which facility needs attention today?' }
      ]
    });

    assert.ok(copilotResult.reply, 'Copilot must provide a reply');
    assert.ok(copilotResult.reply.includes('Downtown Central Garage'), 'Copilot reply must mention the facility');
    assert.ok(copilotResult.recommendation, 'Copilot must attach the active recommendation card');
    assert.equal(copilotResult.recommendation.title, 'Increase Peak Pricing by 25%');

    // Follow-up question maintaining conversation history
    const followUpResult = await processCopilotChat({
      organizationId: org._id,
      userId: operatorUser._id,
      messages: [
        { role: 'user', content: 'Which facility needs attention today?' },
        { role: 'assistant', content: copilotResult.reply },
        { role: 'user', content: 'What is expected during peak hours?' }
      ]
    });

    assert.ok(followUpResult.reply, 'Copilot must answer follow-up question');
    assert.ok(followUpResult.keyMetrics, 'Copilot must provide key metrics');

    await OptimizationRecommendation.deleteOne({ _id: rec._id });
  });

  // Cleanup
  await Booking.deleteMany({ slotId: slotG03._id });
  await ParkingSlot.deleteOne({ _id: slotG03._id });
  await ParkingLot.deleteOne({ _id: lot._id });
  await User.deleteMany({ _id: { $in: [driverA._id, driverB._id, operatorUser._id] } });
  await Organization.deleteOne({ _id: org._id });
});
