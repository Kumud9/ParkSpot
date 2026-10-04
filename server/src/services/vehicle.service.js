const { Vehicle } = require('../models');
const { AppError } = require('../errors');

async function listUserVehicles(userId) {
  const vehicles = await Vehicle.find({ userId }).sort({ createdAt: -1 }).lean();
  return vehicles.map((v) => ({ ...v, id: String(v._id) }));
}

async function createVehicle(userId, organizationId, data) {
  const reg = data.registrationNumber.toUpperCase().trim();
  const existing = await Vehicle.findOne({ userId, registrationNumber: reg });
  if (existing) {
    throw new AppError(409, 'VEHICLE_EXISTS', 'This vehicle is already registered to your account.');
  }

  const vehicle = await Vehicle.create({
    ...data,
    userId,
    organizationId: organizationId || null,
    registrationNumber: reg
  });

  return { ...vehicle.toObject(), id: String(vehicle._id) };
}

async function getVehicleById(vehicleId, userId) {
  const vehicle = await Vehicle.findOne({ _id: vehicleId, userId }).lean();
  if (!vehicle) {
    throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found.');
  }
  return { ...vehicle, id: String(vehicle._id) };
}

module.exports = {
  listUserVehicles,
  createVehicle,
  getVehicleById
};
