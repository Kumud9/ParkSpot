const mongoose = require('mongoose');
const { Booking, ParkingSlot, ParkingLot, Floor, Vehicle, PricingRule } = require('../models');
const { AppError } = require('../errors');
const { parseBookingWindow, calculatePrice } = require('../utils/booking');
const { slotMutex } = require('../utils/slotLock');
const { recordEvent } = require('./occupancy.service');
const { logAction } = require('./audit.service');

function serialize(booking) {
  return {
    ...booking,
    id: String(booking._id || booking.id),
    lot: booking.lot
      ? { ...booking.lot, id: String(booking.lot._id || booking.lot.id) }
      : null,
    slot: booking.slot
      ? { ...booking.slot, id: String(booking.slot._id || booking.slot.id) }
      : null,
    floor: booking.floor
      ? { ...booking.floor, id: String(booking.floor._id || booking.floor.id) }
      : null,
    vehicle: booking.vehicle
      ? { ...booking.vehicle, id: String(booking.vehicle._id || booking.vehicle.id) }
      : null
  };
}

async function loadBooking(booking) {
  const [lot, slot, floor, vehicle] = await Promise.all([
    ParkingLot.findById(booking.lotId).lean(),
    ParkingSlot.findById(booking.slotId).lean(),
    booking.floorId ? Floor.findById(booking.floorId).lean() : null,
    booking.vehicleId ? Vehicle.findById(booking.vehicleId).lean() : null
  ]);
  const resolvedFloor = floor || (slot?.floorId ? await Floor.findById(slot.floorId).lean() : null);
  const plain = typeof booking.toObject === 'function' ? booking.toObject() : booking;
  return serialize({ ...plain, lot, slot, floor: resolvedFloor, vehicle });
}

async function listUserBookings(userId) {
  const bookings = await Booking.find({ userId }).sort({ startTime: -1 });
  return await Promise.all(bookings.map(loadBooking));
}

async function getBookingById(bookingId, userId) {
  const query = { _id: bookingId };
  if (userId) query.userId = userId;
  const booking = await Booking.findOne(query);
  if (!booking) {
    throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  }
  return await loadBooking(booking);
}

let transactionsSupported = null;
async function isTransactionSupported() {
  if (transactionsSupported !== null) return transactionsSupported;
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return false;
    const admin = mongoose.connection.db.admin();
    const status = await admin.serverStatus();
    transactionsSupported = Boolean(status.repl || status.sharding);
  } catch (_e) {
    transactionsSupported = false;
  }
  return transactionsSupported;
}

async function createBooking({
  userId,
  slotId,
  startTime,
  endTime,
  type,
  vehicleId = null,
  organizationId = null,
  status = 'CONFIRMED'
}) {
  const { start, end } = parseBookingWindow(startTime, endTime);

  // In-process lock per slotId ensures that concurrent requests inside the process serialize around check & create
  return await slotMutex.withLock(String(slotId), async () => {
    let session = null;
    let useTransaction = false;
    const canUseTx = await isTransactionSupported();

    if (canUseTx) {
      try {
        session = await mongoose.startSession();
        session.startTransaction({
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' }
        });
        useTransaction = true;
      } catch (_e) {
        useTransaction = false;
        session = null;
      }
    }

    try {
      const slotQuery = ParkingSlot.findOne({ _id: slotId, isActive: true });
      if (session) slotQuery.session(session);
      const slot = await slotQuery;

      if (!slot) {
        throw new AppError(404, 'SLOT_NOT_FOUND', 'An active parking slot was not found.');
      }

      if (slot.status === 'MAINTENANCE' || slot.status === 'BLOCKED') {
        throw new AppError(409, 'SLOT_UNAVAILABLE', 'This parking slot is currently not in service.');
      }

      const lotQuery = ParkingLot.findOne({ _id: slot.lotId, active: true });
      if (session) lotQuery.session(session);
      const lot = await lotQuery;

      if (!lot) {
        throw new AppError(404, 'SLOT_NOT_FOUND', 'An active parking slot was not found.');
      }

      // Check for overlapping confirmed booking or active payment hold
      const holdThreshold = new Date(Date.now() - 15 * 60 * 1000);
      const conflictQuery = Booking.exists({
        slotId: slot._id,
        $or: [
          { status: 'CONFIRMED' },
          { status: 'PENDING_PAYMENT', createdAt: { $gt: holdThreshold } }
        ],
        startTime: { $lt: end },
        endTime: { $gt: start }
      });
      if (session) conflictQuery.session(session);
      const conflict = await conflictQuery;

      if (conflict) {
        throw new AppError(409, 'SPOT_ALREADY_BOOKED', 'This parking spot was just booked by another driver.');
      }

      // Fetch pricing rules for facility
      const rules = await PricingRule.find({ facilityId: lot._id, isActive: true }).lean();
      const price = calculatePrice({
        start,
        end,
        type,
        hourlyRate: lot.hourlyRate,
        dailyRate: lot.dailyRate,
        spotType: slot.type,
        rules
      });

      const bookingDocs = await Booking.create(
        [
          {
            userId,
            lotId: lot._id,
            slotId: slot._id,
            floorId: slot.floorId || null,
            vehicleId: vehicleId || null,
            organizationId: lot.organizationId || organizationId || null,
            startTime: start,
            endTime: end,
            type,
            status: status || 'CONFIRMED',
            totalAmount: price.amount
          }
        ],
        session ? { session } : {}
      );

      const booking = bookingDocs[0];

      // Update spot status in ParkingSlot
      const slotUpdate = ParkingSlot.findByIdAndUpdate(slot._id, { status: 'RESERVED' });
      if (session) slotUpdate.session(session);
      await slotUpdate;

      if (useTransaction && session) {
        await session.commitTransaction();
      }

      // Record OccupancyEvent and AuditLog
      await recordEvent({
        organizationId: booking.organizationId,
        facilityId: booking.lotId,
        floorId: booking.floorId,
        spotId: booking.slotId,
        eventType: 'BOOKING_CREATED',
        source: 'BOOKING',
        bookingId: booking._id,
        metadata: { userId, startTime: start, endTime: end, totalAmount: price.amount }
      });

      await logAction({
        organizationId: booking.organizationId,
        userId,
        action: 'BOOKING_CREATED',
        entityType: 'Booking',
        entityId: booking._id,
        newValue: booking.toObject()
      });

      return await loadBooking(booking);
    } catch (err) {
      if (useTransaction && session) {
        try {
          await session.abortTransaction();
        } catch (_abortErr) {}
      }
      throw err;
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch (_endErr) {}
      }
    }
  });
}

async function cancelBooking({ bookingId, userId, organizationId = null, ipAddress = null }) {
  const query = { _id: bookingId };
  if (userId) query.userId = userId;
  if (organizationId) query.organizationId = organizationId;

  const booking = await Booking.findOne(query);
  if (!booking) {
    throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  }

  if (booking.status !== 'CONFIRMED') {
    throw new AppError(409, 'BOOKING_NOT_ACTIVE', 'Only confirmed bookings can be cancelled.');
  }

  if (booking.startTime <= new Date()) {
    throw new AppError(409, 'CANCELLATION_CLOSED', 'Bookings cannot be cancelled after they begin.');
  }

  const previousStatus = booking.status;
  booking.status = 'CANCELED';
  await booking.save();

  // Restore slot status to AVAILABLE if no other active booking/hold exists
  const hasOther = await Booking.exists({
    slotId: booking.slotId,
    _id: { $ne: booking._id },
    status: { $in: ['CONFIRMED', 'PENDING_PAYMENT'] },
    startTime: { $lt: new Date(Date.now() + 24 * 3600000) },
    endTime: { $gt: new Date() }
  });
  if (!hasOther) {
    await ParkingSlot.findByIdAndUpdate(booking.slotId, { status: 'AVAILABLE' });
  }

  await recordEvent({
    organizationId: booking.organizationId,
    facilityId: booking.lotId,
    floorId: booking.floorId,
    spotId: booking.slotId,
    eventType: 'BOOKING_CANCELED',
    source: 'BOOKING',
    bookingId: booking._id,
    metadata: { cancelledBy: userId }
  });

  await logAction({
    organizationId: booking.organizationId,
    userId,
    action: 'BOOKING_CANCELLED',
    entityType: 'Booking',
    entityId: booking._id,
    oldValue: { status: previousStatus },
    newValue: { status: 'CANCELED' },
    ipAddress
  });

  return await loadBooking(booking);
}

// Booking Lifecycle: Complete expired bookings idempotently
async function completeExpiredBookings() {
  const now = new Date();
  const expiredBookings = await Booking.find({
    status: 'CONFIRMED',
    endTime: { $lte: now }
  }).lean();

  if (expiredBookings.length > 0) {
    await Booking.updateMany(
      { status: 'CONFIRMED', endTime: { $lte: now } },
      { $set: { status: 'COMPLETED' } }
    );

    for (const b of expiredBookings) {
      // Check if slot has any other ongoing bookings
      const hasOther = await Booking.exists({
        slotId: b.slotId,
        status: { $in: ['CONFIRMED', 'PENDING_PAYMENT'] },
        startTime: { $lte: now },
        endTime: { $gt: now }
      });
      if (!hasOther) {
        await ParkingSlot.findByIdAndUpdate(b.slotId, { status: 'AVAILABLE' });
      }

      await recordEvent({
        organizationId: b.organizationId,
        facilityId: b.lotId,
        floorId: b.floorId,
        spotId: b.slotId,
        eventType: 'BOOKING_COMPLETED',
        source: 'SYSTEM',
        bookingId: b._id,
        metadata: { completedAt: now }
      });
    }
  }

  // Also cancel stale PENDING_PAYMENT bookings older than 15 minutes or past start time
  const staleThreshold = new Date(now.getTime() - 15 * 60 * 1000);
  const staleHolds = await Booking.find({
    status: 'PENDING_PAYMENT',
    $or: [
      { createdAt: { $lte: staleThreshold } },
      { startTime: { $lte: now } }
    ]
  }).lean();

  if (staleHolds.length > 0) {
    await Booking.updateMany(
      { _id: { $in: staleHolds.map((h) => h._id) } },
      { $set: { status: 'CANCELED' } }
    );

    for (const h of staleHolds) {
      const hasOther = await Booking.exists({
        slotId: h.slotId,
        status: { $in: ['CONFIRMED', 'PENDING_PAYMENT'] },
        endTime: { $gt: now }
      });
      if (!hasOther) {
        await ParkingSlot.findByIdAndUpdate(h.slotId, { status: 'AVAILABLE' });
      }
    }
  }

  return expiredBookings.length;
}

let lifecycleInterval = null;
function startLifecycleWorker(intervalMs = 60000) {
  if (lifecycleInterval) return;
  lifecycleInterval = setInterval(async () => {
    try {
      await completeExpiredBookings();
    } catch (err) {
      console.error('Lifecycle worker error:', err.message);
    }
  }, intervalMs);
  if (lifecycleInterval.unref) lifecycleInterval.unref();
}

function stopLifecycleWorker() {
  if (lifecycleInterval) {
    clearInterval(lifecycleInterval);
    lifecycleInterval = null;
  }
}

async function listFacilityBookings({ facilityId, organizationId = null, status = null, search = null }) {
  const query = { lotId: facilityId };
  if (organizationId) {
    query.organizationId = organizationId;
  }
  if (status && status !== 'ALL') {
    if (status === 'CANCELLED' || status === 'CANCELED') {
      query.status = 'CANCELED';
    } else {
      query.status = status;
    }
  }

  const bookings = await Booking.find(query)
    .populate('userId', 'name email phone')
    .populate('slotId', 'number level type status')
    .populate('floorId', 'name floorNumber')
    .populate('vehicleId', 'registrationNumber vehicleType make model color')
    .populate('lotId', 'name address city')
    .sort({ startTime: -1 })
    .lean();

  return bookings.map((b) => {
    const slotNum = b.slotId?.number || 'A1';
    const floorName = b.floorId?.name || b.slotId?.level || 'Floor 1';
    const facName = b.lotId?.name || 'Parking Facility';
    const driverName = b.userId?.name || 'Driver';
    const driverEmail = b.userId?.email || '';
    const plate = b.vehicleId?.registrationNumber || 'DL 01 AB 4920';

    return {
      id: String(b._id),
      _id: String(b._id),
      driver: {
        id: String(b.userId?._id || b.userId || ''),
        name: driverName,
        email: driverEmail,
        phone: b.userId?.phone || null
      },
      driverName,
      driverEmail,
      vehicle: {
        registrationNumber: plate,
        type: b.vehicleId?.vehicleType || 'CAR',
        make: b.vehicleId?.make || null,
        model: b.vehicleId?.model || null,
        color: b.vehicleId?.color || null
      },
      vehiclePlate: plate,
      facility: {
        id: String(b.lotId?._id || b.lotId || facilityId),
        name: facName,
        address: b.lotId?.address || '',
        city: b.lotId?.city || ''
      },
      facilityId: String(b.lotId?._id || b.lotId || facilityId),
      facilityName: facName,
      facilityAddress: b.lotId?.address || '',
      floor: {
        id: String(b.floorId?._id || b.floorId || ''),
        name: floorName,
        floorNumber: b.floorId?.floorNumber || 1
      },
      floorName,
      floorNumber: b.floorId?.floorNumber || 1,
      spot: {
        id: String(b.slotId?._id || b.slotId || ''),
        number: slotNum,
        type: b.slotId?.type || 'STANDARD',
        status: b.slotId?.status || 'RESERVED'
      },
      spotId: String(b.slotId?._id || b.slotId || ''),
      spotNumber: slotNum,
      spotType: b.slotId?.type || 'STANDARD',
      date: new Date(b.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      entryTime: new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      exitTime: new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      startTime: new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      endTime: new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      startDateTime: b.startTime,
      endDateTime: b.endTime,
      duration: `${Math.max(1, Math.round((new Date(b.endTime) - new Date(b.startTime)) / 3600000))} hours`,
      amount: b.totalAmount,
      totalAmount: b.totalAmount,
      status: b.status,
      createdAt: b.createdAt
    };
  });
}

module.exports = {
  serialize,
  loadBooking,
  listUserBookings,
  listFacilityBookings,
  getBookingById,
  createBooking,
  cancelBooking,
  completeExpiredBookings,
  startLifecycleWorker,
  stopLifecycleWorker
};
