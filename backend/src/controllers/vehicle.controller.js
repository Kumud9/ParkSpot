const { z } = require('zod');
const vehicleService = require('../services/vehicle.service');

const vehicleSchema = z.object({
  registrationNumber: z.string().trim().min(3).max(20),
  vehicleType: z.enum(['CAR', 'BIKE', 'SUV', 'TRUCK', 'OTHER']).default('CAR'),
  make: z.string().trim().max(50).optional().nullable(),
  model: z.string().trim().max(50).optional().nullable(),
  nickname: z.string().trim().max(50).optional().nullable(),
  color: z.string().trim().max(30).optional().nullable(),
  isDefault: z.boolean().optional()
});

const updateVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(3).max(20).optional(),
  vehicleType: z.enum(['CAR', 'BIKE', 'SUV', 'TRUCK', 'OTHER']).optional(),
  make: z.string().trim().max(50).optional().nullable(),
  model: z.string().trim().max(50).optional().nullable(),
  nickname: z.string().trim().max(50).optional().nullable(),
  color: z.string().trim().max(30).optional().nullable(),
  isDefault: z.boolean().optional()
});

async function listUserVehicles(req, res, next) {
  try {
    const vehicles = await vehicleService.listUserVehicles(req.user.sub);
    res.json({ vehicles });
  } catch (error) {
    next(error);
  }
}

async function createVehicle(req, res, next) {
  try {
    const data = vehicleSchema.parse(req.body);
    const vehicle = await vehicleService.createVehicle(
      req.user.sub,
      req.user.organizationId,
      data
    );
    res.status(201).json({ vehicle });
  } catch (error) {
    next(error);
  }
}

async function updateVehicle(req, res, next) {
  try {
    const data = updateVehicleSchema.parse(req.body);
    const vehicle = await vehicleService.updateVehicle(
      req.params.id,
      req.user.sub,
      data
    );
    res.json({ vehicle });
  } catch (error) {
    next(error);
  }
}

async function deleteVehicle(req, res, next) {
  try {
    const result = await vehicleService.deleteVehicle(req.params.id, req.user.sub);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function setDefaultVehicle(req, res, next) {
  try {
    const vehicle = await vehicleService.setDefaultVehicle(req.params.id, req.user.sub);
    res.json({ vehicle });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUserVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  setDefaultVehicle
};
