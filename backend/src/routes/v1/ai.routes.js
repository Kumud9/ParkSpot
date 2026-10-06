const express = require('express');
const aiController = require('../../controllers/ai.controller');
const { authenticate, authorize, requireTenant } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireTenant);

router.post('/insights', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), aiController.getInsights);
router.post('/explain-recommendation/:id', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), aiController.explainRecommendation);
router.post('/copilot/chat', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), aiController.chatCopilot);
router.post('/chat', authorize('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'), aiController.chatCopilot);

module.exports = router;
