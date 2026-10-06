const express = require('express');
const vehicleController = require('../../controllers/vehicle.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', vehicleController.listUserVehicles);
router.post('/', vehicleController.createVehicle);
router.patch('/:id/default', vehicleController.setDefaultVehicle);
router.patch('/:id', vehicleController.updateVehicle);
router.put('/:id', vehicleController.updateVehicle);
router.delete('/:id', vehicleController.deleteVehicle);

module.exports = router;
