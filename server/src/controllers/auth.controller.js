const { z } = require('zod');
const authService = require('../services/auth.service');

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72)
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(80),
  organizationName: z.string().trim().min(2).max(100).optional(),
  role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER']).optional()
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
  login,
  getProfile
};
