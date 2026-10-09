const express = require('express');
const authController = require('../../controllers/auth.controller');
const { authenticate } = require('../../middleware/auth');
const { authLimiter, mfaLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

// Signup & Registration
router.post('/signup', authLimiter, authController.register);
router.post('/register', authLimiter, authController.register);

// MFA Setup Verification (TOTP Authenticator)
router.post('/mfa/verify-setup', mfaLimiter, authController.verifyMfaSetup);
router.post('/verify-signup', mfaLimiter, authController.verifySignup);
router.post('/resend-signup-otp', authLimiter, authController.resendSignupOtp);

// Login & MFA Verification
router.post('/login', authLimiter, authController.login);
router.post('/mfa/verify-login', mfaLimiter, authController.verifyMfaLogin);
router.post('/mfa/verify-recovery', mfaLimiter, authController.verifyMfaRecovery);

// Authenticated Profile
router.get('/me', authenticate, authController.getProfile);

module.exports = router;

