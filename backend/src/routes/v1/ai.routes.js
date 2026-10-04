const express = require('express');
const aiController = require('../../controllers/ai.controller');
const { authenticate, authorize, requireTenant } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireTenant);

router.post('/insights', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), aiController.getInsights);
router.post('/explain-recommendation/:id', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), aiController.explainRecommendation);

module.exports = router;
