const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
const isRateLimitDisabled = process.env.DISABLE_RATE_LIMIT === 'true' || isDev || isTest;

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || (isDev ? '100000' : '1000'), 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isRateLimitDisabled || req.path === '/health' || req.path === '/health/ready' || req.path.startsWith('/health')
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || (isDev ? '10000' : '30'), 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isRateLimitDisabled,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please try again later.'
    }
  }
});

const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MFA_MAX || (isDev ? '10000' : '20'), 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isRateLimitDisabled,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many verification attempts from this IP. Please try again later.'
    }
  }
});

module.exports = { globalLimiter, authLimiter, mfaLimiter };
