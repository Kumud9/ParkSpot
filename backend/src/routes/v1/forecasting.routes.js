const express = require('express');
const forecastingController = require('../../controllers/forecasting.controller');
const { authenticate, authorize, requireTenant } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/demand', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), forecastingController.getDemandForecast);

module.exports = router;
