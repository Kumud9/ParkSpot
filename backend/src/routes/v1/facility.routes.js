const express = require('express');
const facilityController = require('../../controllers/facility.controller');
const floorController = require('../../controllers/floor.controller');
const spotController = require('../../controllers/spot.controller');
const pricingController = require('../../controllers/pricing.controller');
const { authenticate, authorize, requireTenant } = require('../../middleware/auth');

const router = express.Router();

// Public facility discovery
router.get('/nearby', facilityController.getNearby);
router.get('/search', facilityController.listPublic);
router.get('/:id/public', facilityController.getPublicById);

// Tenant-scoped B2B Facility management
router.get('/', authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), facilityController.listTenant);
router.post('/', authenticate, requireTenant, authorize('OWNER', 'ADMIN'), facilityController.createTenant);
router.get('/:id', facilityController.getPublicById);
router.patch('/:id', authenticate, requireTenant, authorize('OWNER', 'ADMIN'), facilityController.updateTenant);

// Nested Floor routes
router.get('/:facilityId/floors', authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), floorController.listFloors);
router.post('/:facilityId/floors', authenticate, requireTenant, authorize('OWNER', 'ADMIN'), floorController.createFloor);
router.patch('/:facilityId/floors/:id', authenticate, requireTenant, authorize('OWNER', 'ADMIN'), floorController.updateFloor);

// Nested Spot routes
router.get('/:facilityId/spots', authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), spotController.listSpots);
router.post('/:facilityId/spots', authenticate, requireTenant, authorize('OWNER', 'ADMIN'), spotController.createSpot);
router.patch('/:facilityId/spots/:id', authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'OPERATOR'), spotController.updateSpot);
router.patch('/:facilityId/spots/:id/status', authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'OPERATOR'), spotController.updateSpotStatus);

// Nested Pricing routes
router.get('/:facilityId/pricing', authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'MANAGER'), pricingController.listRules);
router.post('/:facilityId/pricing', authenticate, requireTenant, authorize('OWNER', 'ADMIN'), pricingController.createRule);
router.patch('/:facilityId/pricing/:id', authenticate, requireTenant, authorize('OWNER', 'ADMIN'), pricingController.updateRule);

// Occupancy & Event Ingestion routes
router.get('/:facilityId/occupancy', authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), facilityController.getOccupancy);
router.post('/:facilityId/events', authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), facilityController.ingestEvent);

module.exports = router;
