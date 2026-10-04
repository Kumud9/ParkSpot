const mongoose = require('mongoose');
const { ParkingLot, ParkingSlot, Booking } = require('../models');
const { AppError } = require('../errors');
const { escapeRegex } = require('../utils/sanitize');
const { logAction } = require('./audit.service');

async function enrichLots(lots, window) {
  const lotIds = lots.map((lot) => lot._id);
  const slots = await ParkingSlot.find({ lotId: { $in: lotIds }, isActive: true }).lean();

  const conflicts = window
    ? await Booking.find({
        slotId: { $in: slots.map((s) => s._id) },
        status: 'CONFIRMED',
        startTime: { $lt: window.end },
        endTime: { $gt: window.start }
      })
        .select('slotId')
        .lean()
    : [];

  const unavailable = new Set(conflicts.map((b) => String(b.slotId)));

  return lots.map((lot) => {
    const lotSlots = slots.filter((slot) => String(slot.lotId) === String(lot._id));
    return {
      ...lot,
      id: String(lot._id),
      totalSlots: lotSlots.length,
      availableSlots: lotSlots.filter((slot) => !unavailable.has(String(slot._id))).length,
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

  const conflicts = window
    ? await Booking.find({
        slotId: { $in: slots.map((slot) => slot._id) },
        status: 'CONFIRMED',
        startTime: { $lt: window.end },
        endTime: { $gt: window.start }
      })
        .select('slotId')
        .lean()
    : [];

  const unavailable = new Set(conflicts.map((booking) => String(booking.slotId)));
  const enriched = (await enrichLots([lot], window))[0];

  enriched.slots = slots.map((slot) => ({
    id: String(slot._id),
    number: slot.number,
    level: slot.level,
    type: slot.type,
    status: slot.status,
    coordinates: slot.coordinates,
    available: !unavailable.has(String(slot._id)) && slot.status !== 'MAINTENANCE' && slot.status !== 'BLOCKED'
  }));

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
  return { ...lot, id: String(lot._id) };
}

async function createTenantFacility(organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const facility = await ParkingLot.create({
    ...data,
    organizationId
  });

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
  updateTenantFacility
};
