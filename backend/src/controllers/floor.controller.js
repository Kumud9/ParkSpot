const { z } = require('zod');
const floorService = require('../services/floor.service');

const floorSchema = z.object({
  name: z.string().trim().min(1).max(50),
  floorNumber: z.coerce.number().int(),
  capacity: z.coerce.number().int().min(0).default(0),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'CLOSED']).default('ACTIVE')
});

async function listFloors(req, res, next) {
  try {
    const floors = await floorService.listFloors(req.params.facilityId, req.user.organizationId);
    res.json({ floors });
  } catch (error) {
    next(error);
  }
}

async function createFloor(req, res, next) {
  try {
    const data = floorSchema.parse(req.body);
    const floor = await floorService.createFloor(
      req.params.facilityId,
      req.user.organizationId,
      data,
      req.user.sub,
      req.ip
    );
    res.status(201).json({ floor });
  } catch (error) {
    next(error);
  }
}

async function updateFloor(req, res, next) {
  try {
    const data = floorSchema.partial().parse(req.body);
    const floor = await floorService.updateFloor(
      req.params.id,
      req.user.organizationId,
      data,
      req.user.sub,
      req.ip
    );
    res.json({ floor });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listFloors,
  createFloor,
  updateFloor
};
