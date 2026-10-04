const express = require('express');
const adminController = require('../controllers/admin.controller');
const facilityController = require('../controllers/facility.controller');
const spotController = require('../controllers/spot.controller');
const { authenticate, authorize, requireTenant } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'MANAGER'));

router.get('/overview', adminController.getOverview);
router.get('/users', adminController.getUsers);
router.get('/lots', facilityController.listTenant);
router.post('/lots', authorize('OWNER', 'ADMIN'), facilityController.createTenant);
router.patch('/lots/:id', authorize('OWNER', 'ADMIN'), facilityController.updateTenant);
router.get('/lots/:lotId/slots', spotController.listSpots);
router.post('/lots/:lotId/slots', authorize('OWNER', 'ADMIN'), spotController.createSpot);
router.patch('/slots/:id', authorize('OWNER', 'ADMIN'), spotController.updateSpot);
router.get('/reports', adminController.getReports);

module.exports = router;
