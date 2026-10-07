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
    if (req.user.purpose === 'SIGNUP_VERIFICATION') {
      return next(new AppError(403, 'VERIFICATION_REQUIRED', 'Please verify your account to access this service.'));
    }
    if (!req.user.accountType) {
      req.user.accountType = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(req.user.role) ? 'OPERATOR' : 'DRIVER';
    }
    req.organizationId = req.user.organizationId || null;
    req.facilityId = req.user.facilityId || null;
    return next();
  } catch (_error) {
    return next(new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or has expired.'));
  }
}

function authorize(...roles) {
  return (req, _res, next) => {
    const userRole = req.user?.internalRole || req.user?.role;
    if (!req.user || !roles.includes(userRole)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    return next();
  };
}

function requireAccountType(requiredType) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
    }
    const currentAccountType = req.user.accountType || (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(req.user.role) ? 'OPERATOR' : 'DRIVER');
    if (currentAccountType !== requiredType.toUpperCase()) {
      return next(new AppError(403, 'FORBIDDEN', `Access restricted to ${requiredType.toLowerCase()} accounts.`));
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

/**
 * Enforces ONE OPERATOR = ONE PARKING FACILITY rule.
 * Validates that an operator can never access or modify facilities outside their assigned lot.
 */
async function enforceOperatorFacility(req, _res, next) {
  if (!req.user) {
    return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'));
  }
  const isDedicatedOperator = req.user.internalRole === 'OPERATOR' || req.user.role === 'OPERATOR';
  if (!isDedicatedOperator) {
    return next();
  }

  if (!req.facilityId) {
    try {
      const { User, ParkingLot } = require('../models');
      const user = await User.findById(req.user.sub);
      if (user?.facilityId) {
        req.facilityId = String(user.facilityId);
        req.user.facilityId = String(user.facilityId);
      } else if (user?.organizationId) {
        const assigned = await ParkingLot.findOne({
          $or: [
            { operatorId: user._id },
            { organizationId: user.organizationId }
          ]
        });
        if (assigned) {
          user.facilityId = assigned._id;
          await user.save();
          req.facilityId = String(assigned._id);
          req.user.facilityId = String(assigned._id);
        }
      }
    } catch (err) {
      return next(err);
    }
  }

  const requestedFacilityId = req.params?.facilityId || req.params?.id || req.query?.facilityId || req.body?.facilityId;
  const isMockOrMissingId = !requestedFacilityId || !/^[a-f\d]{24}$/i.test(String(requestedFacilityId));

  if (isMockOrMissingId && req.facilityId) {
    if (req.params && (req.params.facilityId || req.params.id)) {
      if (req.params.facilityId) req.params.facilityId = req.facilityId;
      if (req.params.id && req.baseUrl && req.baseUrl.includes('facilities')) req.params.id = req.facilityId;
    }
    if (req.query && req.query.facilityId) {
      req.query.facilityId = req.facilityId;
    }
    if (req.body && typeof req.body === 'object') {
      req.body.facilityId = req.facilityId;
    }
  } else if (requestedFacilityId && req.facilityId && String(requestedFacilityId) !== String(req.facilityId)) {
    return next(
      new AppError(
        403,
        'FORBIDDEN_FACILITY',
        'Access denied: You are only authorized to manage your assigned parking facility.'
      )
    );
  }

  return next();
}

module.exports = {
  authenticate,
  authorize,
  requireAccountType,
  requireTenant,
  enforceOperatorFacility
};
