const { z } = require('zod');
const facilityService = require('../services/facility.service');
const occupancyService = require('../services/occupancy.service');
const locationService = require('../services/location.service');
const bookingService = require('../services/booking.service');
const { AppError } = require('../errors');

const windowSchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
});

function parseQueryWindow(query) {
  const parsed = windowSchema.parse(query);
  if (!parsed.startTime || !parsed.endTime) return null;
  const start = new Date(parsed.startTime);
  const end = new Date(parsed.endTime);
  if (end <= start) {
    throw new AppError(400, 'INVALID_TIME_RANGE', 'End time must be later than start time.');
  }
  return { start, end };
}

const lotSchema = z.object({
  name: z.string().trim().min(2),
  address: z.string().trim().min(5),
  city: z.string().trim().min(2),
  description: z.string().trim().max(500).optional().nullable(),
  hourlyRate: z.coerce.number().positive(),
  dailyRate: z.coerce.number().positive(),
  openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('00:00'),
  closingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('23:59'),
  active: z.boolean().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional()
});

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(100).default(3),
  sortBy: z.enum(['recommended', 'nearest', 'price', 'availability']).default('recommended'),
  parkingType: z.enum(['STANDARD', 'COMPACT', 'EV', 'ACCESSIBLE', 'ALL']).optional(),
  minAvailable: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().positive().optional()
});

// Nearby facility discovery by coordinates
async function getNearby(req, res, next) {
  try {
    const query = nearbyQuerySchema.parse(req.query);
    const result = await locationService.findNearbyFacilities({
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radius,
      sortBy: query.sortBy,
      parkingType: query.parkingType,
      minAvailable: query.minAvailable,
      maxPrice: query.maxPrice
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// Public endpoints (Used by existing frontend /api/lots and /api/v1/facilities/search)
async function listPublic(req, res, next) {
  try {
    const window = parseQueryWindow(req.query);
    const city = req.query.city?.trim();
    const lots = await facilityService.listPublicFacilities({ city, window });
    res.json({ lots, facilities: lots });
  } catch (error) {
    next(error);
  }
}

async function getPublicById(req, res, next) {
  try {
    const window = parseQueryWindow(req.query);
    const lot = await facilityService.getPublicFacilityById(req.params.id, window);
    res.json({ lot, facility: lot });
  } catch (error) {
    next(error);
  }
}

// Tenant B2B endpoints
async function listTenant(req, res, next) {
  try {
    let lots;
    if (req.user.accountType === 'OPERATOR') {
      const targetFacilityId = req.facilityId || req.user.facilityId;
      if (targetFacilityId) {
        const lot = await facilityService.getTenantFacilityById(targetFacilityId, req.user.organizationId);
        lots = [lot];
      } else {
        lots = await facilityService.listTenantFacilities(req.user.organizationId);
        if (lots.length > 0) {
          lots = [lots[0]];
        }
      }
    } else {
      lots = await facilityService.listTenantFacilities(req.user.organizationId);
    }
    res.json({ lots, facilities: lots });
  } catch (error) {
    next(error);
  }
}

async function getFacilityBookings(req, res, next) {
  try {
    const facilityId = req.params.facilityId || req.params.id || req.facilityId;
    if (req.user.accountType === 'OPERATOR' && req.facilityId && String(facilityId) !== String(req.facilityId)) {
      throw new AppError(403, 'FORBIDDEN_FACILITY', 'Access denied: You are only authorized to view bookings for your assigned parking facility.');
    }
    const bookings = await bookingService.listFacilityBookings({
      facilityId,
      organizationId: req.user.organizationId,
      status: req.query.status || null,
      search: req.query.search || null
    });
    res.json({ bookings });
  } catch (error) {
    next(error);
  }
}

async function createTenant(req, res, next) {
  try {
    const data = lotSchema.parse(req.body);
    const lot = await facilityService.createTenantFacility(
      req.user.organizationId,
      data,
      req.user.sub,
      req.ip
    );
    res.status(201).json({ lot, facility: lot });
  } catch (error) {
    next(error);
  }
}

async function updateTenant(req, res, next) {
  try {
    const data = lotSchema.partial().parse(req.body);
    const lot = await facilityService.updateTenantFacility(
      req.params.id,
      req.user.organizationId,
      data,
      req.user.sub,
      req.ip
    );
    res.json({ lot, facility: lot });
  } catch (error) {
    next(error);
  }
}

const eventIngestSchema = z.object({
  spotId: z.string().regex(/^[a-f\d]{24}$/i),
  floorId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  eventType: z.enum([
    'OCCUPIED',
    'VACATED',
    'RESERVED',
    'BLOCKED',
    'AVAILABLE',
    'MAINTENANCE',
    'SPOT_OCCUPIED',
    'SPOT_VACATED',
    'SPOT_RESERVED',
    'SPOT_BLOCKED'
  ]),
  source: z.enum(['SYSTEM', 'OPERATOR', 'BOOKING', 'SENSOR', 'CAMERA']).default('SYSTEM'),
  metadata: z.record(z.any()).optional().default({})
});

async function getOccupancy(req, res, next) {
  try {
    const facilityId = req.params.facilityId || req.params.id;
    const floorId = req.query.floorId || null;
    const result = await occupancyService.getFacilityOccupancy({
      facilityId,
      organizationId: req.user.organizationId,
      floorId
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function ingestEvent(req, res, next) {
  try {
    const facilityId = req.params.facilityId || req.params.id;
    const data = eventIngestSchema.parse(req.body);
    const result = await occupancyService.ingestOccupancyEvent({
      facilityId,
      organizationId: req.user.organizationId,
      spotId: data.spotId,
      floorId: data.floorId || null,
      eventType: data.eventType,
      source: data.source,
      metadata: data.metadata,
      userId: req.user.sub,
      ipAddress: req.ip
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNearby,
  listPublic,
  getPublicById,
  listTenant,
  getFacilityBookings,
  createTenant,
  updateTenant,
  getOccupancy,
  ingestEvent
};

