const express = require('express');
const optimizationController = require('../../controllers/optimization.controller');
const { authenticate, authorize, requireTenant, enforceOperatorFacility } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireTenant, enforceOperatorFacility);

// Recommendations
router.get('/recommendations', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), optimizationController.listRecommendations);
router.post('/recommendations/generate', authorize('OWNER', 'ADMIN', 'MANAGER'), optimizationController.generateRecommendations);
router.post('/recommendations/:id/accept', authorize('OWNER', 'ADMIN', 'MANAGER'), optimizationController.acceptRecommendation);
router.post('/recommendations/:id/reject', authorize('OWNER', 'ADMIN', 'MANAGER'), optimizationController.rejectRecommendation);

// Pricing Simulation (What-If API)
router.post('/simulate-pricing', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), optimizationController.simulatePricing);

// Overstay Detection
router.get('/overstays', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), optimizationController.getOverstays);

module.exports = router;
