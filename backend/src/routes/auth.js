const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { authLimiter, mfaLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/signup', authLimiter, authController.register);
router.post('/register', authLimiter, authController.register);
router.post('/mfa/verify-setup', mfaLimiter, authController.verifyMfaSetup);
router.post('/verify-signup', mfaLimiter, authController.verifySignup);
router.post('/resend-signup-otp', authLimiter, authController.resendSignupOtp);
router.post('/login', authLimiter, authController.login);
router.post('/mfa/verify-login', mfaLimiter, authController.verifyMfaLogin);
router.post('/mfa/verify-recovery', mfaLimiter, authController.verifyMfaRecovery);
router.get('/me', authenticate, authController.getProfile);

module.exports = router;

