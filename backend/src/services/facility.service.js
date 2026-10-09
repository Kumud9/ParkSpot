const mongoose = require('mongoose');
const { ParkingLot, ParkingSlot, Booking, PricingRule } = require('../models');
const { AppError } = require('../errors');
const { escapeRegex } = require('../utils/sanitize');
const { logAction } = require('./audit.service');

async function enrichLots(lots, window) {
  const lotIds = lots.map((lot) => lot._id);
  const slots = await ParkingSlot.find({ lotId: { $in: lotIds }, isActive: true }).lean();

  const now = new Date();
  const effectiveWindow = window || { start: now, end: new Date(now.getTime() + 2 * 3600000) };
  const holdThreshold = new Date(Date.now() - 15 * 60 * 1000);

  const conflicts = await Booking.find({
    slotId: { $in: slots.map((s) => s._id) },
    $or: [
      { status: 'CONFIRMED' },
      { status: 'PENDING_PAYMENT', createdAt: { $gt: holdThreshold } }
    ],
    startTime: { $lt: effectiveWindow.end },
    endTime: { $gt: effectiveWindow.start }
  })
    .select('slotId')
    .lean();

  const unavailable = new Set(conflicts.map((b) => String(b.slotId)));

  return lots.map((lot) => {
    const lotSlots = slots.filter((slot) => String(slot.lotId) === String(lot._id));
    return {
      ...lot,
      id: String(lot._id),
      totalSlots: lotSlots.length,
      availableSlots: lotSlots.filter((slot) => slot.status === 'AVAILABLE' && !unavailable.has(String(slot._id))).length,
      slots: undefined
    };
  });
}

// Public lot discovery (consumer facing)
async function listPublicFacilities({ city, window }) {
  const filter = { active: true };
  if (city) {
    const safeCity = escapeRegex(city.trim());
    filter.city = new RegExp(`^${safeCity}$`, 'i');
  }

  const lots = await ParkingLot.find(filter).sort({ name: 1 }).lean();
  return await enrichLots(lots, window);
}

async function getPublicFacilityById(id, window) {
  const lot = await ParkingLot.findOne({ _id: id, active: true }).lean();
  if (!lot) {
    throw new AppError(404, 'LOT_NOT_FOUND', 'Parking lot not found.');
  }

  const slots = await ParkingSlot.find({ lotId: lot._id, isActive: true }).sort({ number: 1 }).lean();

  const now = new Date();
  const effectiveWindow = window || { start: now, end: new Date(now.getTime() + 2 * 3600000) };
  const holdThreshold = new Date(Date.now() - 15 * 60 * 1000);

  const activeBookings = await Booking.find({
    slotId: { $in: slots.map((slot) => slot._id) },
    $or: [
      { status: 'CONFIRMED' },
      { status: 'PENDING_PAYMENT', createdAt: { $gt: holdThreshold } }
    ],
    startTime: { $lt: effectiveWindow.end },
    endTime: { $gt: effectiveWindow.start }
  })
    .select('slotId userId startTime endTime status')
    .lean();

  const bookedMap = new Map();
  for (const b of activeBookings) {
    bookedMap.set(String(b.slotId), b);
  }

  const enriched = (await enrichLots([lot], window))[0];

  enriched.slots = slots.map((slot) => {
    const activeBooking = bookedMap.get(String(slot._id));
    const isBooked = Boolean(activeBooking);
    let derivedStatus = slot.status;
    if (isBooked && (derivedStatus === 'AVAILABLE' || !derivedStatus)) {
      derivedStatus = 'RESERVED';
    }
    const isAvailable = !isBooked && slot.status === 'AVAILABLE';

    return {
      id: String(slot._id),
      number: slot.number,
      level: slot.level,
      type: slot.type,
      hourlyRate: lot.hourlyRate,
      status: derivedStatus,
      coordinates: slot.coordinates,
      available: isAvailable,
      bookingInfo: activeBooking
        ? {
            userId: String(activeBooking.userId),
            status: activeBooking.status,
            startTime: activeBooking.startTime,
            endTime: activeBooking.endTime
          }
        : null
    };
  });

  return enriched;
}

// Tenant-scoped B2B operations
async function listTenantFacilities(organizationId) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const orgId = typeof organizationId === 'string' ? new mongoose.Types.ObjectId(organizationId) : organizationId;
  const lots = await ParkingLot.aggregate([
    { $match: { organizationId: orgId } },
    { $lookup: { from: 'parkingslots', localField: '_id', foreignField: 'lotId', as: 'slots' } },
    { $lookup: { from: 'bookings', localField: '_id', foreignField: 'lotId', as: 'bookings' } },
    { $sort: { createdAt: -1 } }
  ]);

  return lots.map((lot) => ({
    ...lot,
    id: String(lot._id),
    _count: { slots: lot.slots.length, bookings: lot.bookings.length }
  }));
}

async function getTenantFacilityById(id, organizationId) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const lot = await ParkingLot.findOne({ _id: id, organizationId }).lean();
  if (!lot) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  const { Floor, ParkingSlot } = require('../models');
  const [floors, slots] = await Promise.all([
    Floor.find({ facilityId: lot._id, organizationId }).sort({ floorNumber: 1 }).lean(),
    ParkingSlot.find({ lotId: lot._id, organizationId, isActive: true }).sort({ level: 1, number: 1 }).lean()
  ]);

  const totalSlots = slots.length;
  const availableSlots = slots.filter((s) => s.status === 'AVAILABLE').length;
  const occupiedSpots = slots.filter((s) => s.status === 'OCCUPIED').length;
  const reservedSpots = slots.filter((s) => s.status === 'RESERVED').length;
  const maintenanceSpots = slots.filter((s) => s.status === 'MAINTENANCE' || s.status === 'BLOCKED').length;

  return {
    ...lot,
    id: String(lot._id),
    totalSlots,
    totalSpots: totalSlots,
    availableSlots,
    occupiedSpots,
    reservedSpots,
    maintenanceSpots,
    floors: floors.map((f) => f.name),
    floorDetails: floors.map((f) => ({ ...f, id: String(f._id) })),
    slots: slots.map((s) => ({
      ...s,
      id: String(s._id),
      _id: String(s._id),
      level: s.level,
      floor: s.level,
      status: s.status,
      type: s.type,
      number: s.number,
      coordinates: s.coordinates,
      isActive: s.isActive
    }))
  };
}

async function initializeDefaultPricingRules(facilityId, organizationId, hourlyRate, dailyRate, session = null) {
  const baseHourly = Math.max(1, Number(hourlyRate) > 0 ? Number(hourlyRate) : 50);
  const baseDaily = Math.max(1, Number(dailyRate) > 0 ? Number(dailyRate) : Math.round(baseHourly * 6));

  const rulesData = [
    {
      facilityId,
      organizationId: organizationId || null,
      name: 'Base Facility Rate',
      spotType: 'ALL',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
      pricePerHour: baseHourly,
      pricePerDay: baseDaily,
      isActive: true
    },
    {
      facilityId,
      organizationId: organizationId || null,
      name: 'EV Supercharger Special',
      spotType: 'EV',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: '00:00',
      endTime: '23:59',
      pricePerHour: baseHourly + 25,
      pricePerDay: baseDaily + 150,
      isActive: true
    }
  ];

  const opts = session ? { session } : {};
  for (const rule of rulesData) {
    await PricingRule.findOneAndUpdate(
      { facilityId, name: rule.name },
      rule,
      { upsert: true, new: true, setDefaultsOnInsert: true, ...opts }
    );
  }
}

async function createTenantFacility(organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }

  // Enforce ONE OPERATOR = ONE PARKING FACILITY
  const existing = await ParkingLot.findOne({
    $or: [
      ...(userId ? [{ operatorId: userId }] : []),
      { organizationId }
    ]
  });
  if (existing) {
    throw new AppError(409, 'FACILITY_ALREADY_EXISTS', 'An operator account can only register one parking facility.');
  }

  const baseHourly = Math.max(1, Number(data.hourlyRate) > 0 ? Number(data.hourlyRate) : 50);
  const baseDaily = Math.max(1, Number(data.dailyRate) > 0 ? Number(data.dailyRate) : Math.round(baseHourly * 6));

  const facility = await ParkingLot.create({
    ...data,
    hourlyRate: baseHourly,
    dailyRate: baseDaily,
    organizationId,
    operatorId: userId
  });

  await initializeDefaultPricingRules(facility._id, organizationId, baseHourly, baseDaily);

  if (userId) {
    const { User } = require('../models');
    await User.findByIdAndUpdate(userId, { facilityId: facility._id });
  }

  await logAction({
    organizationId,
    userId,
    action: 'FACILITY_CREATED',
    entityType: 'ParkingLot',
    entityId: facility._id,
    newValue: facility.toObject(),
    ipAddress
  });

  return { ...facility.toObject(), id: String(facility._id) };
}

async function onboardFacility({
  organizationId,
  userId,
  facilityData,
  floorsData,
  ipAddress = null
}) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }

  const { User, Floor, ParkingSlot } = require('../models');

  // Enforce ONE OPERATOR = ONE PARKING FACILITY
  const existing = await ParkingLot.findOne({
    $or: [
      ...(userId ? [{ operatorId: userId }] : []),
      { organizationId }
    ]
  });
  if (existing) {
    throw new AppError(409, 'FACILITY_ALREADY_EXISTS', 'An operator account can only register one parking facility.');
  }

  if (userId) {
    const userDoc = await User.findById(userId);
    if (userDoc?.facilityId) {
      throw new AppError(409, 'FACILITY_ALREADY_EXISTS', 'An operator account can only register one parking facility.');
    }
  }

  // Validate floor and spot uniqueness
  const floorNames = new Set();
  const floorNumbers = new Set();
  const allSpotNumbers = new Set();

  for (const floor of floorsData) {
    const fNameLower = floor.name.trim().toLowerCase();
    if (floorNames.has(fNameLower)) {
      throw new AppError(400, 'DUPLICATE_FLOOR', `Duplicate floor name "${floor.name}". Floor names must be unique within the facility.`);
    }
    floorNames.add(fNameLower);

    const fNum = Number(floor.floorNumber);
    if (floorNumbers.has(fNum)) {
      throw new AppError(400, 'DUPLICATE_FLOOR', `Duplicate floor number "${floor.floorNumber}". Floor numbers must be unique within the facility.`);
    }
    floorNumbers.add(fNum);

    if (!Array.isArray(floor.spots) || floor.spots.length === 0) {
      throw new AppError(400, 'INVALID_FLOOR_SPOTS', `Floor "${floor.name}" must contain at least 1 parking spot.`);
    }

    for (const spot of floor.spots) {
      const sNum = String(spot.number).trim().toUpperCase();
      if (!sNum) {
        throw new AppError(400, 'INVALID_SPOT_NUMBER', 'Spot identifier cannot be empty.');
      }
      if (allSpotNumbers.has(sNum)) {
        throw new AppError(400, 'DUPLICATE_SPOT_IDENTIFIER', `Duplicate spot identifier "${sNum}". Spot identifiers must be unique across the facility.`);
      }
      allSpotNumbers.add(sNum);
    }
  }

  // Use MongoDB transaction if supported; otherwise safe rollback cleanup
  let session = null;
  let useTransaction = false;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    useTransaction = true;
  } catch (_err) {
    session = null;
    useTransaction = false;
  }

  let createdFacility = null;
  try {
    const opts = useTransaction ? { session } : {};
    const baseHourly = Math.max(1, Number(facilityData.hourlyRate) > 0 ? Number(facilityData.hourlyRate) : 50);
    const baseDaily = Math.max(1, Number(facilityData.dailyRate) > 0 ? Number(facilityData.dailyRate) : Math.round(baseHourly * 6));

    const facilityPayload = {
      ...facilityData,
      hourlyRate: baseHourly,
      dailyRate: baseDaily,
      organizationId,
      operatorId: userId,
      active: true
    };
    if (facilityData.latitude !== undefined && facilityData.longitude !== undefined) {
      facilityPayload.latitude = Number(facilityData.latitude);
      facilityPayload.longitude = Number(facilityData.longitude);
      facilityPayload.location = {
        type: 'Point',
        coordinates: [Number(facilityData.longitude), Number(facilityData.latitude)]
      };
    }

    const [facility] = await ParkingLot.create([facilityPayload], opts);
    createdFacility = facility;

    await initializeDefaultPricingRules(facility._id, organizationId, baseHourly, baseDaily, session);

    for (const fl of floorsData) {
      const [floorDoc] = await Floor.create([{
        facilityId: facility._id,
        organizationId,
        name: fl.name.trim(),
        floorNumber: Number(fl.floorNumber),
        capacity: fl.spots.length,
        status: 'ACTIVE'
      }], opts);

      const spotDocs = fl.spots.map((spot, idx) => ({
        lotId: facility._id,
        floorId: floorDoc._id,
        organizationId,
        number: String(spot.number).trim().toUpperCase(),
        level: floorDoc.name,
        type: ['STANDARD', 'COMPACT', 'EV', 'ACCESSIBLE'].includes(String(spot.type || '').toUpperCase())
          ? String(spot.type).toUpperCase()
          : 'STANDARD',
        status: 'AVAILABLE',
        isActive: true,
        coordinates: spot.coordinates || {
          x: (idx % 8) * 3,
          y: Math.floor(idx / 8) * 6,
          width: 2.5,
          height: 5.0,
          rotation: 0
        }
      }));

      await ParkingSlot.insertMany(spotDocs, opts);
    }

    if (userId) {
      await User.findByIdAndUpdate(userId, { facilityId: facility._id }, opts);
    }

    if (useTransaction) {
      await session.commitTransaction();
    }

    await logAction({
      organizationId,
      userId,
      action: 'FACILITY_CREATED',
      entityType: 'ParkingLot',
      entityId: facility._id,
      newValue: {
        name: facility.name,
        address: facility.address,
        city: facility.city,
        totalSpots: allSpotNumbers.size,
        floorsCount: floorsData.length
      },
      ipAddress
    });

    const fullFacility = await getTenantFacilityById(facility._id, organizationId);
    let updatedUser = null;
    let token = null;
    if (userId) {
      const uDoc = await User.findById(userId);
      const authService = require('./auth.service');
      token = authService.tokenFor(uDoc);
      const userPayload = authService.publicUser(uDoc);
      userPayload.facility = fullFacility;
      updatedUser = userPayload;
    }

    return {
      facility: fullFacility,
      user: updatedUser,
      token
    };
  } catch (error) {
    if (useTransaction && session) {
      await session.abortTransaction().catch(() => {});
    } else if (createdFacility) {
      // Safe cleanup rollback for standalone instances
      await ParkingSlot.deleteMany({ lotId: createdFacility._id }).catch(() => {});
      await Floor.deleteMany({ facilityId: createdFacility._id }).catch(() => {});
      await ParkingLot.deleteOne({ _id: createdFacility._id }).catch(() => {});
      if (userId) {
        await User.findByIdAndUpdate(userId, { facilityId: null }).catch(() => {});
      }
    }
    throw error;
  } finally {
    if (session) {
      session.endSession().catch(() => {});
    }
  }
}

async function updateTenantFacility(id, organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const query = { _id: id, organizationId };
  const existing = await ParkingLot.findOne(query);
  if (!existing) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  const updated = await ParkingLot.findOneAndUpdate(query, data, { new: true });

  await logAction({
    organizationId,
    userId,
    action: 'FACILITY_UPDATED',
    entityType: 'ParkingLot',
    entityId: id,
    oldValue: existing.toObject(),
    newValue: updated.toObject(),
    ipAddress
  });

  return { ...updated.toObject(), id: String(updated._id) };
}

module.exports = {
  enrichLots,
  listPublicFacilities,
  getPublicFacilityById,
  listTenantFacilities,
  getTenantFacilityById,
  createTenantFacility,
  onboardFacility,
  updateTenantFacility
};
