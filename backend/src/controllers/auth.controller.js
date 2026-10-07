const { z } = require('zod');
const authService = require('../services/auth.service');

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
  accountType: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : undefined),
    z.enum(['DRIVER', 'OPERATOR']).optional()
  )
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(80),
  accountType: z.enum(['DRIVER', 'OPERATOR', 'driver', 'operator']).optional(),
  organizationName: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'DRIVER', 'driver', 'operator']).optional()
});

const verifySchema = z.object({
  email: z.string().email().optional(),
  otp: z.string().trim().length(6, { message: 'OTP must be exactly 6 digits.' }),
  token: z.string().optional()
}).refine((data) => data.email || data.token, {
  message: 'Either email or verification token is required.'
});

const resendSchema = z.object({
  email: z.string().email().optional(),
  token: z.string().optional()
}).refine((data) => data.email || data.token, {
  message: 'Either email or verification token is required.'
});

async function register(req, res, next) {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function verifySignup(req, res, next) {
  try {
    const data = verifySchema.parse(req.body);
    const result = await authService.verifySignupOtp(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function resendSignupOtp(req, res, next) {
  try {
    const data = resendSchema.parse(req.body);
    const result = await authService.resendSignupOtp(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const data = credentialsSchema.parse(req.body);
    const result = await authService.login(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    const result = await authService.getProfile(req.user.sub);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  verifySignup,
  resendSignupOtp,
  login,
  getProfile
};
