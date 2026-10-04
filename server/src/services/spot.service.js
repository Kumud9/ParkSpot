const { ParkingSlot, ParkingLot, Floor } = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('./audit.service');
const { recordEvent } = require('./occupancy.service');

async function listSpots(facilityId, organizationId, { floorId = null, level = null } = {}) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const lotExists = await ParkingLot.exists({ _id: facilityId, organizationId });
  if (!lotExists) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  const query = { lotId: facilityId, organizationId };
  if (floorId) query.floorId = floorId;
  if (level) query.level = level;

  const slots = await ParkingSlot.find(query).sort({ level: 1, number: 1 }).lean();
  return slots.map((s) => ({ ...s, id: String(s._id) }));
}

async function getSpotById(spotId, organizationId) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const slot = await ParkingSlot.findOne({ _id: spotId, organizationId }).lean();
  if (!slot) {
    throw new AppError(404, 'SLOT_NOT_FOUND', 'Parking slot not found in your organization.');
  }
  return { ...slot, id: String(slot._id) };
}

async function createSpot(facilityId, organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const lot = await ParkingLot.findOne({ _id: facilityId, organizationId });
  if (!lot) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  let level = data.level || 'Ground';
  if (data.floorId) {
    const floor = await Floor.findOne({ _id: data.floorId, facilityId, organizationId });
    if (!floor) {
      throw new AppError(404, 'FLOOR_NOT_FOUND', 'Floor not found in your organization.');
    }
    level = floor.name;
  }

  const slot = await ParkingSlot.create({
    ...data,
    lotId: facilityId,
    organizationId,
    level
  });

  await logAction({
    organizationId,
    userId,
    action: 'SPOT_CREATED',
    entityType: 'ParkingSlot',
    entityId: slot._id,
    newValue: slot.toObject(),
    ipAddress
  });

  return { ...slot.toObject(), id: String(slot._id) };
}

async function updateSpot(spotId, organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const slot = await ParkingSlot.findOne({ _id: spotId, organizationId });
  if (!slot) {
    throw new AppError(404, 'SLOT_NOT_FOUND', 'Parking slot not found in your organization.');
  }

  if (data.floorId) {
    const floor = await Floor.findOne({ _id: data.floorId, facilityId: slot.lotId, organizationId });
    if (!floor) {
      throw new AppError(404, 'FLOOR_NOT_FOUND', 'Floor not found in your organization.');
    }
    data.level = floor.name;
  }

  const oldObject = slot.toObject();
  const updated = await ParkingSlot.findOneAndUpdate({ _id: spotId, organizationId }, data, { new: true });

  await logAction({
    organizationId,
    userId,
    action: 'SPOT_UPDATED',
    entityType: 'ParkingSlot',
    entityId: spotId,
    oldValue: oldObject,
    newValue: updated.toObject(),
    ipAddress
  });

  return { ...updated.toObject(), id: String(updated._id) };
}

async function updateSpotStatus(spotId, organizationId, status, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const slot = await ParkingSlot.findOne({ _id: spotId, organizationId });
  if (!slot) {
    throw new AppError(404, 'SLOT_NOT_FOUND', 'Parking slot not found in your organization.');
  }

  const previousStatus = slot.status;
  slot.status = status;
  if (status === 'MAINTENANCE' || status === 'BLOCKED') {
    slot.isActive = false;
  } else if (status === 'AVAILABLE') {
    slot.isActive = true;
  }
  await slot.save();

  const eventType = status === 'BLOCKED' ? 'SPOT_BLOCKED' : status === 'AVAILABLE' ? 'SPOT_UNBLOCKED' : 'SPOT_OCCUPIED';

  await recordEvent({
    organizationId,
    facilityId: slot.lotId,
    floorId: slot.floorId,
    spotId: slot._id,
    eventType,
    source: 'OPERATOR',
    metadata: { previousStatus, newStatus: status, updatedBy: userId }
  });

  await logAction({
    organizationId,
    userId,
    action: status === 'BLOCKED' ? 'SPOT_BLOCKED' : 'SPOT_UPDATED',
    entityType: 'ParkingSlot',
    entityId: slot._id,
    oldValue: { status: previousStatus },
    newValue: { status },
    ipAddress
  });

  return { ...slot.toObject(), id: String(slot._id) };
}

module.exports = {
  listSpots,
  getSpotById,
  createSpot,
  updateSpot,
  updateSpotStatus
};
