const { z } = require('zod');
const authService = require('../services/auth.service');

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
  accountType: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : undefined),
    z.enum(['DRIVER', 'OPERATOR']).optional()
  ),
  code: z.string().optional(),
  recoveryCode: z.string().optional()
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(80),
  accountType: z.enum(['DRIVER', 'OPERATOR', 'driver', 'operator']).optional(),
  organizationName: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'DRIVER', 'driver', 'operator']).optional()
});

const verifyMfaSetupSchema = z.object({
  email: z.string().email().optional(),
  otp: z.string().trim().length(6, { message: 'Code must be exactly 6 digits.' }).optional(),
  code: z.string().trim().length(6, { message: 'Code must be exactly 6 digits.' }).optional(),
  token: z.string().optional(),
  setupToken: z.string().optional()
}).refine((data) => data.code || data.otp, {
  message: 'A 6-digit verification code is required.'
}).refine((data) => data.email || data.token || data.setupToken, {
  message: 'Either email or verification token is required.'
});

const verifyMfaLoginSchema = z.object({
  email: z.string().email().optional(),
  otp: z.string().trim().length(6, { message: 'Code must be exactly 6 digits.' }).optional(),
  code: z.string().trim().length(6, { message: 'Code must be exactly 6 digits.' }).optional(),
  token: z.string().optional(),
  mfaToken: z.string().optional()
}).refine((data) => data.code || data.otp, {
  message: 'A 6-digit verification code is required.'
}).refine((data) => data.email || data.mfaToken || data.token, {
  message: 'Either email or MFA session token is required.'
});

const verifyRecoverySchema = z.object({
  email: z.string().email().optional(),
  token: z.string().optional(),
  mfaToken: z.string().optional(),
  recoveryCode: z.string().trim().min(8, { message: 'Backup recovery code is required.' })
}).refine((data) => data.email || data.mfaToken || data.token, {
  message: 'Either email or MFA session token is required.'
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
    const data = verifyMfaSetupSchema.parse(req.body);
    const result = await authService.verifyMfaSetup(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function verifyMfaSetup(req, res, next) {
  try {
    const data = verifyMfaSetupSchema.parse(req.body);
    const result = await authService.verifyMfaSetup(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function verifyMfaLogin(req, res, next) {
  try {
    const data = verifyMfaLoginSchema.parse(req.body);
    const result = await authService.verifyMfaLogin(data);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function verifyMfaRecovery(req, res, next) {
  try {
    const data = verifyRecoverySchema.parse(req.body);
    const result = await authService.verifyMfaRecovery(data);
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
  verifyMfaSetup,
  verifyMfaLogin,
  verifyMfaRecovery,
  resendSignupOtp,
  login,
  getProfile
};

