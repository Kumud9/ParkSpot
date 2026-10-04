const express = require('express');
const analyticsController = require('../../controllers/analytics.controller');
const { authenticate, authorize, requireTenant } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireTenant);

// Operational analytics
router.get('/summary', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), analyticsController.getSummary);
router.get('/utilization', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), analyticsController.getUtilization);
router.get('/occupancy', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), analyticsController.getOccupancy);
router.get('/peak-hours', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), analyticsController.getPeakHours);
router.get('/facilities', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), analyticsController.getFacilities);
router.get('/spots', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), analyticsController.getSpots);

// Financial analytics (Restricted to OWNER, ADMIN, MANAGER)
router.get('/revenue', authorize('OWNER', 'ADMIN', 'MANAGER'), analyticsController.getRevenue);

module.exports = router;
