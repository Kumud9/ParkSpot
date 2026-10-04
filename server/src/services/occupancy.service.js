const { OccupancyEvent, ParkingLot, Floor, ParkingSlot } = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('./audit.service');

async function recordEvent({
  organizationId = null,
  facilityId,
  floorId = null,
  spotId,
  eventType,
  source = 'BOOKING',
  bookingId = null,
  metadata = {}
}) {
  try {
    return await OccupancyEvent.create({
      organizationId,
      facilityId,
      floorId,
      spotId,
      eventType,
      source,
      bookingId,
      metadata,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('OccupancyEvent Error:', error.message);
    return null;
  }
}

async function getFacilityOccupancy({ facilityId, organizationId, floorId = null }) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }

  const facility = await ParkingLot.findOne({ _id: facilityId, organizationId }).lean();
  if (!facility) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  const spotQuery = { lotId: facilityId, organizationId };
  if (floorId) {
    spotQuery.floorId = floorId;
  }
  const spots = await ParkingSlot.find(spotQuery).sort({ level: 1, number: 1 }).lean();

  const floorQuery = { facilityId, organizationId };
  if (floorId) {
    floorQuery._id = floorId;
  }
  const floors = await Floor.find(floorQuery).sort({ floorNumber: 1 }).lean();

  const totalSpots = spots.length;
  const occupied = spots.filter((s) => s.status === 'OCCUPIED').length;
  const reserved = spots.filter((s) => s.status === 'RESERVED').length;
  const available = spots.filter((s) => s.status === 'AVAILABLE' && s.isActive).length;
  const maintenance = spots.filter((s) => s.status === 'MAINTENANCE').length;
  const blocked = spots.filter((s) => s.status === 'BLOCKED').length;
  const occupancyPercentage = totalSpots > 0 ? Number(((occupied / totalSpots) * 100).toFixed(1)) : 0;

  const floorSummaries = floors.map((fl) => {
    const flSpots = spots.filter((s) => s.floorId && String(s.floorId) === String(fl._id));
    const flTotal = flSpots.length;
    const flOccupied = flSpots.filter((s) => s.status === 'OCCUPIED').length;
    const flReserved = flSpots.filter((s) => s.status === 'RESERVED').length;
    const flAvailable = flSpots.filter((s) => s.status === 'AVAILABLE' && s.isActive).length;
    const flMaintenance = flSpots.filter((s) => s.status === 'MAINTENANCE').length;
    const flBlocked = flSpots.filter((s) => s.status === 'BLOCKED').length;
    const flPct = flTotal > 0 ? Number(((flOccupied / flTotal) * 100).toFixed(1)) : 0;

    return {
      floorId: String(fl._id),
      name: fl.name,
      floorNumber: fl.floorNumber,
      summary: {
        totalSpots: flTotal,
        occupied: flOccupied,
        reserved: flReserved,
        available: flAvailable,
        maintenance: flMaintenance,
        blocked: flBlocked,
        occupancyPercentage: flPct
      }
    };
  });

  return {
    facility: {
      id: String(facility._id),
      name: facility.name,
      city: facility.city
    },
    summary: {
      totalSpots,
      occupied,
      reserved,
      available,
      maintenance,
      blocked,
      occupancyPercentage
    },
    floors: floorSummaries,
    spots: spots.map((s) => ({
      id: String(s._id),
      number: s.number,
      level: s.level,
      floorId: s.floorId ? String(s.floorId) : null,
      type: s.type,
      status: s.status,
      isActive: s.isActive,
      coordinates: s.coordinates
    }))
  };
}

async function ingestOccupancyEvent({
  facilityId,
  organizationId,
  spotId,
  floorId = null,
  eventType,
  source = 'SYSTEM',
  metadata = {},
  userId = null,
  ipAddress = null
}) {
  if (!organizationId) {
    throw new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required.');
  }

  const facility = await ParkingLot.findOne({ _id: facilityId, organizationId });
  if (!facility) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  const spot = await ParkingSlot.findOne({ _id: spotId, lotId: facilityId, organizationId });
  if (!spot) {
    throw new AppError(404, 'SLOT_NOT_FOUND', 'Parking slot not found in this facility.');
  }

  if (floorId && spot.floorId && String(spot.floorId) !== String(floorId)) {
    throw new AppError(400, 'INVALID_FLOOR', 'Referenced floor does not match parking spot floor.');
  }

  const normalizedType = String(eventType).toUpperCase().trim();
  let newStatus;
  let mappedEvent;
  let isActive = true;

  switch (normalizedType) {
    case 'OCCUPIED':
    case 'SPOT_OCCUPIED':
      newStatus = 'OCCUPIED';
      mappedEvent = 'SPOT_OCCUPIED';
      break;
    case 'VACATED':
    case 'AVAILABLE':
    case 'SPOT_VACATED':
    case 'SPOT_UNBLOCKED':
      newStatus = 'AVAILABLE';
      mappedEvent = 'SPOT_VACATED';
      break;
    case 'RESERVED':
    case 'SPOT_RESERVED':
      newStatus = 'RESERVED';
      mappedEvent = 'SPOT_RESERVED';
      break;
    case 'BLOCKED':
    case 'SPOT_BLOCKED':
      newStatus = 'BLOCKED';
      mappedEvent = 'SPOT_BLOCKED';
      isActive = false;
      break;
    case 'MAINTENANCE':
      newStatus = 'MAINTENANCE';
      mappedEvent = 'SPOT_BLOCKED';
      isActive = false;
      break;
    default:
      throw new AppError(400, 'INVALID_EVENT_TYPE', `Unsupported event type: ${eventType}`);
  }

  const previousStatus = spot.status;
  spot.status = newStatus;
  spot.isActive = isActive;
  await spot.save();

  const event = await recordEvent({
    organizationId,
    facilityId: facility._id,
    floorId: spot.floorId,
    spotId: spot._id,
    eventType: mappedEvent,
    source,
    metadata
  });

  if (source === 'OPERATOR') {
    await logAction({
      organizationId,
      userId,
      action: newStatus === 'BLOCKED' ? 'SPOT_BLOCKED' : 'EVENT_INGESTED',
      entityType: 'ParkingSlot',
      entityId: spot._id,
      oldValue: { status: previousStatus },
      newValue: { status: newStatus, source, eventType: normalizedType },
      ipAddress
    });
  }

  return {
    success: true,
    event,
    spot: {
      id: String(spot._id),
      number: spot.number,
      status: spot.status,
      isActive: spot.isActive
    }
  };
}

module.exports = {
  recordEvent,
  getFacilityOccupancy,
  ingestOccupancyEvent
};
