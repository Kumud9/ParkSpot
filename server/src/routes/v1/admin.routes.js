const express = require('express');
const adminController = require('../../controllers/admin.controller');
const { authenticate, authorize, requireTenant } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireTenant, authorize('OWNER', 'ADMIN', 'MANAGER'));

router.get('/overview', adminController.getOverview);
router.get('/users', adminController.getUsers);
router.get('/reports', adminController.getReports);
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
