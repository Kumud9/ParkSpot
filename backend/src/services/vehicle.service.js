const { Vehicle } = require('../models');
const { AppError } = require('../errors');

async function listUserVehicles(userId) {
  const vehicles = await Vehicle.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
  return vehicles.map((v) => ({ ...v, id: String(v._id) }));
}

async function createVehicle(userId, organizationId, data) {
  const reg = data.registrationNumber.toUpperCase().trim();
  const existing = await Vehicle.findOne({ userId, registrationNumber: reg });
  if (existing) {
    throw new AppError(409, 'VEHICLE_EXISTS', 'This vehicle is already registered to your account.');
  }

  // Count existing vehicles for this user
  const count = await Vehicle.countDocuments({ userId });
  const shouldBeDefault = count === 0 || Boolean(data.isDefault);

  if (shouldBeDefault) {
    await Vehicle.updateMany({ userId }, { $set: { isDefault: false } });
  }

  const vehicle = await Vehicle.create({
    ...data,
    userId,
    organizationId: organizationId || null,
    registrationNumber: reg,
    isDefault: shouldBeDefault
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

async function updateVehicle(vehicleId, userId, data) {
  const vehicle = await Vehicle.findOne({ _id: vehicleId, userId });
  if (!vehicle) {
    throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found.');
  }

  if (data.registrationNumber) {
    const reg = data.registrationNumber.toUpperCase().trim();
    if (reg !== vehicle.registrationNumber) {
      const duplicate = await Vehicle.findOne({ userId, registrationNumber: reg, _id: { $ne: vehicleId } });
      if (duplicate) {
        throw new AppError(409, 'VEHICLE_EXISTS', 'Another vehicle with this registration number already exists.');
      }
      vehicle.registrationNumber = reg;
    }
  }

  if (data.nickname !== undefined) vehicle.nickname = data.nickname?.trim() || null;
  if (data.make !== undefined) vehicle.make = data.make?.trim() || null;
  if (data.model !== undefined) vehicle.model = data.model?.trim() || null;
  if (data.color !== undefined) vehicle.color = data.color?.trim() || null;
  if (data.vehicleType !== undefined) vehicle.vehicleType = data.vehicleType;

  if (data.isDefault === true) {
    await Vehicle.updateMany({ userId, _id: { $ne: vehicleId } }, { $set: { isDefault: false } });
    vehicle.isDefault = true;
  }

  await vehicle.save();
  return { ...vehicle.toObject(), id: String(vehicle._id) };
}

async function deleteVehicle(vehicleId, userId) {
  const vehicle = await Vehicle.findOne({ _id: vehicleId, userId });
  if (!vehicle) {
    throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found.');
  }

  const wasDefault = vehicle.isDefault;
  await Vehicle.deleteOne({ _id: vehicleId, userId });

  // If deleted vehicle was default, make the newest remaining vehicle default
  if (wasDefault) {
    const nextVehicle = await Vehicle.findOne({ userId }).sort({ createdAt: -1 });
    if (nextVehicle) {
      nextVehicle.isDefault = true;
      await nextVehicle.save();
    }
  }

  return { success: true, id: vehicleId };
}

async function setDefaultVehicle(vehicleId, userId) {
  const vehicle = await Vehicle.findOne({ _id: vehicleId, userId });
  if (!vehicle) {
    throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found.');
  }

  await Vehicle.updateMany({ userId, _id: { $ne: vehicleId } }, { $set: { isDefault: false } });
  vehicle.isDefault = true;
  await vehicle.save();

  return { ...vehicle.toObject(), id: String(vehicle._id) };
}

module.exports = {
  listUserVehicles,
  createVehicle,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  setDefaultVehicle
};
