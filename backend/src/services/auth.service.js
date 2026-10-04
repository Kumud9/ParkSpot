const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Organization } = require('../models');
const { AppError } = require('../errors');

const publicUser = (user) => ({
  id: String(user._id || user.id),
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId ? String(user.organizationId) : null,
  status: user.status,
  createdAt: user.createdAt
});

const tokenFor = (user) =>
  jwt.sign(
    {
      sub: String(user._id || user.id),
      role: user.role,
      email: user.email,
      organizationId: user.organizationId ? String(user.organizationId) : null
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

async function register({ name, email, password, organizationName = null, role = 'USER' }) {
  const normalizedEmail = email.toLowerCase().trim();

  if (await User.exists({ email: normalizedEmail })) {
    throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
  }

  let organizationId = null;
  // If an organization name is supplied or role is B2B OWNER, create an organization
  if (organizationName && (role === 'OWNER' || role === 'ADMIN')) {
    const slug = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    let org = await Organization.findOne({ slug });
    if (!org) {
      org = await Organization.create({
        name: organizationName.trim(),
        slug: slug || `org-${Date.now()}`,
        email: normalizedEmail
      });
    }
    organizationId = org._id;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role,
    organizationId
  });

  return { token: tokenFor(user), user: publicUser(user) };
}

async function login({ email, password }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  if (user.status === 'SUSPENDED') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been suspended. Please contact support.');
  }

  // If user belongs to an organization, check if the organization is suspended
  if (user.organizationId) {
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
