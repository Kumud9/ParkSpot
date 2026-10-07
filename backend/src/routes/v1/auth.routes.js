const express = require('express');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

// Two-step signup & authentication
router.post('/signup', authLimiter, authController.register);
router.post('/register', authLimiter, authController.register);
router.post('/verify-signup', authLimiter, authController.verifySignup);
router.post('/resend-signup-otp', authLimiter, authController.resendSignupOtp);
router.post('/login', authLimiter, authController.login);
router.get('/me', authenticate, authController.getProfile);

module.exports = router;
