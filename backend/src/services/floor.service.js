const { Floor, ParkingLot } = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('./audit.service');

async function verifyFacilityOwnership(facilityId, organizationId) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const exists = await ParkingLot.exists({ _id: facilityId, organizationId });
  if (!exists) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }
}

async function listFloors(facilityId, organizationId) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  await verifyFacilityOwnership(facilityId, organizationId);
  const floors = await Floor.find({ facilityId, organizationId }).sort({ floorNumber: 1 }).lean();
  return floors.map((f) => ({ ...f, id: String(f._id) }));
}

async function getFloorById(floorId, organizationId) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const floor = await Floor.findOne({ _id: floorId, organizationId }).lean();
  if (!floor) {
    throw new AppError(404, 'FLOOR_NOT_FOUND', 'Floor not found in your organization.');
  }
  return { ...floor, id: String(floor._id) };
}

async function createFloor(facilityId, organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  await verifyFacilityOwnership(facilityId, organizationId);

  const floor = await Floor.create({
    ...data,
    facilityId,
    organizationId
  });

  await logAction({
    organizationId,
    userId,
    action: 'FLOOR_CREATED',
    entityType: 'Floor',
    entityId: floor._id,
    newValue: floor.toObject(),
    ipAddress
  });

  return { ...floor.toObject(), id: String(floor._id) };
}

async function updateFloor(floorId, organizationId, data, userId = null, ipAddress = null) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }
  const query = { _id: floorId, organizationId };
  const existing = await Floor.findOne(query);
  if (!existing) {
    throw new AppError(404, 'FLOOR_NOT_FOUND', 'Floor not found in your organization.');
  }

  const updated = await Floor.findOneAndUpdate(query, data, { new: true });

  await logAction({
    organizationId,
    userId,
    action: 'FLOOR_UPDATED',
    entityType: 'Floor',
    entityId: floorId,
    oldValue: existing.toObject(),
    newValue: updated.toObject(),
    ipAddress
  });

  return { ...updated.toObject(), id: String(updated._id) };
}

module.exports = {
  verifyFacilityOwnership,
  listFloors,
  getFloorById,
  createFloor,
  updateFloor
};
