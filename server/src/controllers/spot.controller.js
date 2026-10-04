const { z } = require('zod');
const spotService = require('../services/spot.service');

const coordinatesSchema = z.object({
  x: z.coerce.number().default(0),
  y: z.coerce.number().default(0),
  width: z.coerce.number().positive().default(2.5),
  height: z.coerce.number().positive().default(5.0),
  rotation: z.coerce.number().min(0).max(360).default(0)
}).default({});

const spotSchema = z.object({
  number: z.string().trim().min(1).max(20),
  level: z.string().trim().min(1).max(30).default('Ground'),
  floorId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  type: z.enum(['STANDARD', 'COMPACT', 'EV', 'ACCESSIBLE']).default('STANDARD'),
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'BLOCKED']).default('AVAILABLE'),
  isActive: z.boolean().optional(),
  coordinates: coordinatesSchema.optional()
});

async function listSpots(req, res, next) {
  try {
    const facilityId = req.params.facilityId || req.params.lotId;
    const spots = await spotService.listSpots(facilityId, req.user?.organizationId, {
      floorId: req.query.floorId,
      level: req.query.level
    });
    res.json({ slots: spots, spots });
  } catch (error) {
    next(error);
  }
}

async function createSpot(req, res, next) {
  try {
    const facilityId = req.params.facilityId || req.params.lotId;
    const data = spotSchema.parse(req.body);
    const spot = await spotService.createSpot(
      facilityId,
      req.user.organizationId,
      data,
      req.user.sub,
      req.ip
    );
    res.status(201).json({ slot: spot, spot });
  } catch (error) {
    next(error);
  }
}

async function updateSpot(req, res, next) {
  try {
    const data = spotSchema.partial().parse(req.body);
    const spot = await spotService.updateSpot(
      req.params.id,
      req.user.organizationId,
      data,
      req.user.sub,
      req.ip
    );
    res.json({ slot: spot, spot });
  } catch (error) {
    next(error);
  }
}

async function updateSpotStatus(req, res, next) {
  try {
    const { status } = z.object({
      status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'BLOCKED'])
    }).parse(req.body);

    const spot = await spotService.updateSpotStatus(
      req.params.id,
      req.user.organizationId,
      status,
      req.user.sub,
      req.ip
    );
    res.json({ slot: spot, spot });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listSpots,
  createSpot,
  updateSpot,
  updateSpotStatus
};
