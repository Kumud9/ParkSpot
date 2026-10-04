const express = require('express');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.get('/me', authenticate, authController.getProfile);

module.exports = router;
