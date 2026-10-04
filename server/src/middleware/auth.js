const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { AppError } = require('../errors');

function authenticate(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return next(new AppError(401, 'AUTH_REQUIRED', 'A bearer token is required.'));
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    req.organizationId = req.user.organizationId || null;
    return next();
  } catch (_error) {
    return next(new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or has expired.'));
  }
}

function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    return next();
  };
}

function requireTenant(req, _res, next) {
  if (!req.user) {
    return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
  }
  const orgId = req.user.organizationId;
  if (!orgId) {
    return next(new AppError(403, 'TENANT_REQUIRED', 'An active organization context is required for this action.'));
  }
  const orgIdStr = String(orgId);
  if (!mongoose.Types.ObjectId.isValid(orgIdStr) || !/^[a-f\d]{24}$/i.test(orgIdStr)) {
    return next(new AppError(403, 'INVALID_TENANT', 'The organization context is invalid.'));
  }
  req.organizationId = orgIdStr;
  return next();
}

module.exports = { authenticate, authorize, requireTenant };
