const express = require('express');
const vehicleController = require('../../controllers/vehicle.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', vehicleController.listUserVehicles);
router.post('/', vehicleController.createVehicle);

module.exports = router;
