const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User, Organization, ParkingLot, Floor, ParkingSlot } = require('../models');
const { AppError } = require('../errors');
const {
  OTP_EXPIRY_MS,
  RESEND_COOLDOWN_MS,
  MAX_VERIFICATION_ATTEMPTS,
  generateOtp,
  hashOtp,
  verifyOtpHash,
  sendOtpNotification
} = require('./otp.service');

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
    facilityId: user.facilityId ? String(user.facilityId) : null,
    status: user.status,
    isVerified: Boolean(user.isVerified),
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
      organizationId: user.organizationId ? String(user.organizationId) : null,
      facilityId: user.facilityId ? String(user.facilityId) : null
    },
    secret,
    { expiresIn: '7d' }
  );
};

const tokenForVerification = (user) => {
  const secret = process.env.JWT_SECRET || 'parkspot-local-development-secret-change-before-deployment';
  return jwt.sign(
    {
      sub: String(user._id || user.id),
      email: user.email,
      purpose: 'SIGNUP_VERIFICATION'
    },
    secret,
    { expiresIn: '15m' }
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
  let facilityId = null;

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

    // Create or find assigned facility: ONE OPERATOR = ONE PARKING FACILITY
    let facility = await ParkingLot.findOne({ organizationId: org._id });
    if (!facility) {
      facility = await ParkingLot.create({
        name: organizationName ? `${organizationName.trim()} Parking` : `${name.trim()} Parking Facility`,
        address: '14 Mobility Boulevard, Central Area',
        city: 'Vadodara',
        hourlyRate: 40,
        dailyRate: 280,
        openingTime: '00:00',
        closingTime: '23:59',
        active: true,
        latitude: 22.2895,
        longitude: 73.3648,
        organizationId: org._id
      });

      const defaultFloors = [
        { name: 'Floor 1', floorNumber: 1, capacity: 16 },
        { name: 'Floor 2', floorNumber: 2, capacity: 16 },
        { name: 'Floor 3', floorNumber: 3, capacity: 16 }
      ];
      for (const fl of defaultFloors) {
        const floorDoc = await Floor.create({
          facilityId: facility._id,
          organizationId: org._id,
          name: fl.name,
          floorNumber: fl.floorNumber,
          capacity: fl.capacity
        });
        const prefix = fl.floorNumber === 1 ? 'A' : fl.floorNumber === 2 ? 'B' : 'C';
        for (let i = 1; i <= 16; i++) {
          await ParkingSlot.create({
            lotId: facility._id,
            floorId: floorDoc._id,
            organizationId: org._id,
            number: `${prefix}${i}`,
            level: fl.name,
            type: i <= 2 ? 'EV' : i === 3 ? 'ACCESSIBLE' : 'STANDARD',
            status: 'AVAILABLE'
          });
        }
      }
    }
    facilityId = facility._id;
  } else {
    resolvedAccountType = 'DRIVER';
    resolvedInternalRole = null;
    resolvedRole = 'USER';
    organizationId = null;
    facilityId = null;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const otp = generateOtp();
  const userId = new mongoose.Types.ObjectId();
  const otpHash = hashOtp(otp, userId);

  const user = await User.create({
    _id: userId,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    accountType: resolvedAccountType,
    internalRole: resolvedInternalRole,
    role: resolvedRole,
    organizationId,
    facilityId,
    status: 'ACTIVE',
    isVerified: false,
    verificationOtpHash: otpHash,
    verificationOtpExpiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    verificationAttempts: 0,
    verificationLastSentAt: new Date()
  });

  if (facilityId) {
    await ParkingLot.findByIdAndUpdate(facilityId, { operatorId: user._id });
  }

  await sendOtpNotification({ email: normalizedEmail, name: user.name, otp });

  const verificationToken = tokenForVerification(user);

  return {
    status: 'PENDING_VERIFICATION',
    requiresVerification: true,
    message: 'Account created. Please enter the 6-digit verification code sent to your email.',
    token: verificationToken,
    verificationToken,
    email: normalizedEmail,
    accountType: resolvedAccountType,
    user: publicUser(user),
    ...(process.env.NODE_ENV === 'test' || process.env.ALLOW_DEV_OTP === 'true' ? { devOtp: otp } : {})
  };
}

async function login({ email, password, accountType = null }) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  if (user.isVerified === false) {
    throw new AppError(403, 'VERIFICATION_REQUIRED', 'Please verify your account before logging in.');
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

  // Ensure operator has assigned facility: ONE OPERATOR = ONE PARKING FACILITY
  if (userAccountType === 'OPERATOR' && !user.facilityId) {
    let assignedLot = await ParkingLot.findOne({
      $or: [
        { operatorId: user._id },
        { organizationId: user.organizationId }
      ]
    });
    if (!assignedLot && user.organizationId) {
      assignedLot = await ParkingLot.findOne({ organizationId: user.organizationId });
    }
    if (assignedLot) {
      user.facilityId = assignedLot._id;
      if (!assignedLot.operatorId) {
        assignedLot.operatorId = user._id;
        await assignedLot.save();
      }
      await user.save();
    }
  }

  const serialized = publicUser(user);
  if (user.accountType === 'OPERATOR' && user.facilityId) {
    serialized.facility = await buildOperatorFacilityPayload(user.facilityId, user.organizationId);
  }

  return { token: tokenFor(user), user: serialized };
}

async function buildOperatorFacilityPayload(facilityId, organizationId) {
  if (!facilityId) return null;
  const facility = await ParkingLot.findById(facilityId).lean();
  if (!facility) return null;

  const [floors, slots] = await Promise.all([
    Floor.find({ facilityId: facility._id }).sort({ floorNumber: 1 }).lean(),
    ParkingSlot.find({ lotId: facility._id, isActive: true }).sort({ level: 1, number: 1 }).lean()
  ]);

  const totalSlots = slots.length;
  const availableSlots = slots.filter((s) => s.status === 'AVAILABLE').length;
  const occupiedSpots = slots.filter((s) => s.status === 'OCCUPIED').length;
  const reservedSpots = slots.filter((s) => s.status === 'RESERVED').length;
  const maintenanceSpots = slots.filter((s) => s.status === 'MAINTENANCE' || s.status === 'BLOCKED').length;

  return {
    ...facility,
    id: String(facility._id),
    _id: String(facility._id),
    floors: floors.map((f) => f.name),
    floorDetails: floors.map((f) => ({ ...f, id: String(f._id) })),
    totalSlots,
    totalSpots: totalSlots,
    availableSlots,
    occupiedSpots,
    reservedSpots,
    maintenanceSpots,
    slots: slots.map((s) => ({
      ...s,
      id: String(s._id),
      _id: String(s._id),
      level: s.level,
      floor: s.level,
      status: s.status,
      type: s.type,
      number: s.number,
      coordinates: s.coordinates,
      isActive: s.isActive
    }))
  };
}

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
  }

  let assignedFacilityId = user.facilityId;
  if (user.accountType === 'OPERATOR' && !assignedFacilityId && user.organizationId) {
    const assignedFacility = await ParkingLot.findOne({
      $or: [
        { operatorId: user._id },
        { organizationId: user.organizationId }
      ]
    }).lean();
    if (assignedFacility) {
      user.facilityId = assignedFacility._id;
      assignedFacilityId = assignedFacility._id;
      await user.save();
    }
  }

  const serialized = publicUser(user);
  if (user.accountType === 'OPERATOR' && assignedFacilityId) {
    serialized.facility = await buildOperatorFacilityPayload(assignedFacilityId, user.organizationId);
  }

  return { user: serialized };
}

async function verifySignupOtp({ email, otp, token }) {
  if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
    throw new AppError(400, 'INVALID_OTP', 'A 6-digit verification code is required.');
  }

  let user = null;
  if (token) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'parkspot-local-development-secret-change-before-deployment'
      );
      if (decoded.sub) {
        user = await User.findById(decoded.sub);
      }
    } catch (_err) {
      // If token invalid, fall back to email
    }
  }

  if (!user && email) {
    const normalizedEmail = email.toLowerCase().trim();
    user = await User.findOne({ email: normalizedEmail });
  }

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Account not found.');
  }

  if (user.isVerified) {
    throw new AppError(400, 'ACCOUNT_ALREADY_VERIFIED', 'This account has already been verified. Please sign in.');
  }

  if (!user.verificationOtpHash || !user.verificationOtpExpiresAt) {
    throw new AppError(400, 'INVALID_OTP', 'No pending verification request. Please request a new code.');
  }

  if (new Date() > user.verificationOtpExpiresAt) {
    throw new AppError(400, 'OTP_EXPIRED', 'Verification code has expired. Please request a new code.');
  }

  if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    throw new AppError(400, 'OTP_ATTEMPTS_EXCEEDED', 'Maximum verification attempts exceeded. Please request a new code.');
  }

  user.verificationAttempts += 1;

  const isValid = verifyOtpHash(otp, user._id, user.verificationOtpHash);
  if (!isValid) {
    await user.save();
    const remaining = Math.max(0, MAX_VERIFICATION_ATTEMPTS - user.verificationAttempts);
    if (remaining === 0) {
      throw new AppError(400, 'OTP_ATTEMPTS_EXCEEDED', 'Maximum verification attempts exceeded. Please request a new code.');
    }
    throw new AppError(400, 'INVALID_OTP', `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
  }

  user.isVerified = true;
  user.status = 'ACTIVE';
  user.verificationOtpHash = null;
  user.verificationOtpExpiresAt = null;
  user.verificationAttempts = 0;
  user.verificationLastSentAt = null;
  await user.save();

  const sessionToken = tokenFor(user);
  return {
    success: true,
    status: 'VERIFIED',
    message: 'Account verified successfully.',
    token: sessionToken,
    user: publicUser(user)
  };
}

async function resendSignupOtp({ email, token }) {
  let user = null;
  if (token) {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'parkspot-local-development-secret-change-before-deployment'
      );
      if (decoded.sub) {
        user = await User.findById(decoded.sub);
      }
    } catch (_err) {
      // Fall back to email
    }
  }

  if (!user && email) {
    const normalizedEmail = email.toLowerCase().trim();
    user = await User.findOne({ email: normalizedEmail });
  }

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Account not found.');
  }

  if (user.isVerified) {
    throw new AppError(400, 'ACCOUNT_ALREADY_VERIFIED', 'This account has already been verified. Please sign in.');
  }

  if (user.verificationLastSentAt) {
    const elapsed = Date.now() - new Date(user.verificationLastSentAt).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const remainingSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new AppError(429, 'OTP_RESEND_COOLDOWN', `Please wait ${remainingSec}s before requesting a new code.`);
    }
  }

  const newOtp = generateOtp();
  user.verificationOtpHash = hashOtp(newOtp, user._id);
  user.verificationOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  user.verificationAttempts = 0;
  user.verificationLastSentAt = new Date();
  await user.save();

  await sendOtpNotification({ email: user.email, name: user.name, otp: newOtp });

  return {
    success: true,
    message: 'A new 6-digit verification code has been sent.',
    cooldownSeconds: 60,
    verificationToken: tokenForVerification(user),
    ...(process.env.NODE_ENV === 'test' || process.env.ALLOW_DEV_OTP === 'true' ? { devOtp: newOtp } : {})
  };
}

module.exports = {
  publicUser,
  tokenFor,
  tokenForVerification,
  register,
  login,
  getProfile,
  verifySignupOtp,
  resendSignupOtp
};
