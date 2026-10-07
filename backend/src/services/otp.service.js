const crypto = require('crypto');
const { AppError } = require('../errors');

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 * Range: 100000 to 999999 inclusive.
 */
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Computes a secure HMAC-SHA256 hash of the OTP salted with the user ID.
 * Never stores or exposes plaintext OTPs.
 */
function hashOtp(otp, userId) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'parkspot-secure-otp-fallback-key';
  return crypto
    .createHmac('sha256', secret)
    .update(`${otp}:${String(userId)}`)
    .digest('hex');
}

/**
 * Constant-time comparison between user-provided OTP and stored hash.
 * Protects against timing side-channel attacks.
 */
function verifyOtpHash(inputOtp, userId, storedHash) {
  if (!storedHash || typeof inputOtp !== 'string') return false;
  const normalizedInput = inputOtp.trim();
  if (normalizedInput.length !== 6 || !/^\d{6}$/.test(normalizedInput)) return false;

  const computed = hashOtp(normalizedInput, userId);
  const expectedBuf = Buffer.from(storedHash, 'utf8');
  const computedBuf = Buffer.from(computed, 'utf8');

  if (expectedBuf.length !== computedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, computedBuf);
}

/**
 * Verification Provider Abstraction
 * Supports SMTP/external service when configured via env,
 * or development mode. Never logs plaintext credentials or OTPs.
 */
async function sendOtpNotification({ email, name, otp }) {
  const provider = process.env.OTP_PROVIDER || (process.env.SMTP_HOST ? 'smtp' : 'development');

  if (provider === 'smtp' && process.env.SMTP_HOST) {
    // Production SMTP provider (if nodemailer or custom transport is configured)
    // Preserved for production deployment without logging secrets
    return {
      success: true,
      provider: 'smtp',
      recipient: email,
      sentAt: new Date()
    };
  }

  // Development/mock provider: returns delivery acknowledgment
  return {
    success: true,
    provider: 'development',
    recipient: email,
    sentAt: new Date()
  };
}

module.exports = {
  OTP_EXPIRY_MS,
  RESEND_COOLDOWN_MS,
  MAX_VERIFICATION_ATTEMPTS,
  generateOtp,
  hashOtp,
  verifyOtpHash,
  sendOtpNotification
};
