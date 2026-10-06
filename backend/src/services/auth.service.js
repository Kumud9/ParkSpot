const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User, Organization } = require('../models');
const { AppError } = require('../errors');

const publicUser = (user) => {
  const accountType = user.accountType || (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(user.role) ? 'OPERATOR' : 'DRIVER');
  const internalRole = accountType === 'OPERATOR' ? (user.internalRole || user.role || 'OWNER') : null;
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    accountType,
    internalRole,
    role: user.role || (accountType === 'DRIVER' ? 'USER' : internalRole),
    organizationId: user.organizationId ? String(user.organizationId) : null,
    status: user.status,
    createdAt: user.createdAt
  };
};

const tokenFor = (user) => {
  const accountType = user.accountType || (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(user.role) ? 'OPERATOR' : 'DRIVER');
  const internalRole = accountType === 'OPERATOR' ? (user.internalRole || user.role || 'OWNER') : null;
  const secret = process.env.JWT_SECRET || 'parkspot-local-development-secret-change-before-deployment';
  return jwt.sign(
    {
      sub: String(user._id || user.id),
      accountType,
      internalRole,
      role: user.role || (accountType === 'DRIVER' ? 'USER' : internalRole),
      email: user.email,
      organizationId: user.organizationId ? String(user.organizationId) : null
    },
    secret,
    { expiresIn: '7d' }
  );
};

async function register({ name, email, password, accountType = null, organizationName = null, role = null }) {
  const normalizedEmail = email.toLowerCase().trim();

  if (await User.exists({ email: normalizedEmail })) {
    throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
  }

  // Authoritatively determine accountType: exactly DRIVER or OPERATOR
  let resolvedAccountType = accountType ? String(accountType).toUpperCase() : null;
  if (!resolvedAccountType) {
    if (role && ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(String(role).toUpperCase())) {
      resolvedAccountType = 'OPERATOR';
    } else {
      resolvedAccountType = 'DRIVER';
    }
  }

  let resolvedInternalRole = null;
  let resolvedRole = 'USER';
  let organizationId = null;

  if (resolvedAccountType === 'OPERATOR') {
    resolvedInternalRole = role && ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(String(role).toUpperCase())
      ? String(role).toUpperCase()
      : 'OWNER';
    resolvedRole = resolvedInternalRole;

    const orgName = (organizationName || `${name.trim()}'s Operations`).trim();
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let org = await Organization.findOne({ slug });
    if (!org) {
      org = await Organization.create({
        name: orgName,
        slug: slug || `org-${Date.now()}`,
        email: normalizedEmail
      });
    }
    organizationId = org._id;
  } else {
    resolvedAccountType = 'DRIVER';
    resolvedInternalRole = null;
    resolvedRole = 'USER';
    organizationId = null;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    accountType: resolvedAccountType,
    internalRole: resolvedInternalRole,
    role: resolvedRole,
    organizationId
  });

  return { token: tokenFor(user), user: publicUser(user) };
}

async function login({ email, password, accountType = null }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  if (user.status === 'SUSPENDED') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact support.');
  }

  const userAccountType = user.accountType || (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(user.role) ? 'OPERATOR' : 'DRIVER');

  if (accountType) {
    const requestedAccountType = String(accountType).toUpperCase();
    if (userAccountType !== requestedAccountType) {
      throw new AppError(
        403,
        'INVALID_ACCOUNT_TYPE',
        `This account is registered as a ${userAccountType.toLowerCase()}. Please sign in through the ${userAccountType.toLowerCase()} portal.`
      );
    }
  }

  // If user belongs to an organization, check if the organization is suspended
  if (user.organizationId && mongoose.Types.ObjectId.isValid(String(user.organizationId))) {
    const org = await Organization.findById(user.organizationId);
    if (org && org.status === 'SUSPENDED') {
      throw new AppError(403, 'ORGANIZATION_SUSPENDED', 'Your organization account is suspended.');
    }
  }

  return { token: tokenFor(user), user: publicUser(user) };
}

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
  }
  return { user: publicUser(user) };
}

module.exports = {
  publicUser,
  tokenFor,
  register,
  login,
  getProfile
};
