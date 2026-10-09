const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// 1. Organization Model (B2B Parking Operators)
const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, default: null },
  address: { type: String, trim: true, default: null },
  city: { type: String, trim: true, default: null },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true }
}, { timestamps: true });

// 2. User Model (Public Account Type + Internal B2B RBAC)
const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  accountType: {
    type: String,
    enum: ['DRIVER', 'OPERATOR'],
    index: true
  },
  internalRole: {
    type: String,
    enum: ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', null],
    default: null,
    index: true
  },
  role: {
    type: String,
    enum: ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'USER', 'DRIVER'],
    default: 'USER',
    index: true
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  facilityId: {
    type: Schema.Types.ObjectId,
    ref: 'ParkingLot',
    default: null,
    index: true
  },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  isVerified: { type: Boolean, default: false, index: true },
  mfaEnabled: { type: Boolean, default: false, index: true },
  totpSecretEncrypted: { type: String, default: null },
  totpSecretIv: { type: String, default: null },
  totpSecretAuthTag: { type: String, default: null },
  mfaRecoveryCodeHashes: [{ type: String }],
  mfaVerifiedAt: { type: Date, default: null },
  mfaAttempts: { type: Number, default: 0 },
  verificationOtpHash: { type: String, default: null },
  verificationOtpExpiresAt: { type: Date, default: null },
  verificationAttempts: { type: Number, default: 0 },
  verificationLastSentAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.pre('save', function(next) {
  if (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(this.role)) {
    this.accountType = 'OPERATOR';
    this.internalRole = this.internalRole || this.role;
  } else if (this.accountType === 'OPERATOR') {
    if (!this.internalRole) {
      this.internalRole = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(this.role) ? this.role : 'OWNER';
    }
    this.role = this.internalRole;
  } else {
    this.accountType = 'DRIVER';
    this.internalRole = null;
    this.organizationId = null;
    this.facilityId = null;
    this.role = 'USER';
  }
  next();
});

// 3. Facility / ParkingLot Model
const facilitySchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  operatorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true, index: true },
  postalCode: { type: String, trim: true, default: null },
  description: { type: String, default: null },
  hourlyRate: { type: Number, required: true, min: 0 },
  dailyRate: { type: Number, required: true, min: 0 },
  openingTime: { type: String, default: '00:00' },
  closingTime: { type: String, default: '23:59' },
  active: { type: Boolean, default: true, index: true },
  latitude: { type: Number, default: null, index: true },
  longitude: { type: Number, default: null, index: true },
  location: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number]
    }
  }
}, { timestamps: true, collection: 'parkinglots' });

facilitySchema.pre('save', function(next) {
  if (typeof this.latitude === 'number' && typeof this.longitude === 'number') {
    this.location = {
      type: 'Point',
      coordinates: [this.longitude, this.latitude]
    };
  } else {
    this.location = undefined;
  }
  next();
});

facilitySchema.index({ location: '2dsphere' }, { sparse: true });
facilitySchema.index({ latitude: 1, longitude: 1 });

// 4. Floor Model
const floorSchema = new Schema({
  facilityId: {
    type: Schema.Types.ObjectId,
    ref: 'ParkingLot',
    required: true,
    index: true
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
    index: true
  },
  name: { type: String, required: true, trim: true },
  floorNumber: { type: Number, required: true },
  capacity: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['ACTIVE', 'MAINTENANCE', 'CLOSED'], default: 'ACTIVE' }
}, { timestamps: true });
floorSchema.index({ facilityId: 1, name: 1 }, { unique: true });
floorSchema.index({ facilityId: 1, floorNumber: 1 }, { unique: true });

// 5. ParkingSpot / ParkingSlot Model
const slotSchema = new Schema({
  lotId: { type: Schema.Types.ObjectId, ref: 'ParkingLot', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', default: null, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  number: { type: String, required: true, trim: true },
  level: { type: String, default: 'Ground' },
  type: {
    type: String,
    enum: ['STANDARD', 'COMPACT', 'EV', 'ACCESSIBLE'],
    default: 'STANDARD'
  },
  status: {
    type: String,
    enum: ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE', 'BLOCKED'],
    default: 'AVAILABLE',
    index: true
  },
  isActive: { type: Boolean, default: true, index: true },
  coordinates: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 2.5 },
    height: { type: Number, default: 5.0 },
    rotation: { type: Number, default: 0 }
  }
}, { collection: 'parkingslots', timestamps: true });
slotSchema.index({ lotId: 1, number: 1 }, { unique: true });
slotSchema.index({ organizationId: 1, lotId: 1 });
slotSchema.index({ organizationId: 1, status: 1 });

// 6. Vehicle Model
const vehicleSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  registrationNumber: { type: String, required: true, uppercase: true, trim: true, index: true },
  nickname: { type: String, trim: true, default: null },
  vehicleType: {
    type: String,
    enum: ['CAR', 'BIKE', 'SUV', 'TRUCK', 'OTHER'],
    default: 'CAR'
  },
  make: { type: String, trim: true, default: null },
  model: { type: String, trim: true, default: null },
  color: { type: String, trim: true, default: null },
  isDefault: { type: Boolean, default: false, index: true }
}, { timestamps: true });
vehicleSchema.index({ userId: 1, registrationNumber: 1 }, { unique: true });

// 7. PricingRule / ParkingRate Model
const pricingRuleSchema = new Schema({
  facilityId: { type: Schema.Types.ObjectId, ref: 'ParkingLot', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  name: { type: String, required: true, trim: true },
  spotType: {
    type: String,
    enum: ['ALL', 'STANDARD', 'COMPACT', 'EV', 'ACCESSIBLE'],
    default: 'ALL'
  },
  daysOfWeek: {
    type: [Number],
    default: [0, 1, 2, 3, 4, 5, 6] // 0=Sunday, 6=Saturday
  },
  startTime: { type: String, default: '00:00' },
  endTime: { type: String, default: '23:59' },
  pricePerHour: { type: Number, required: true, min: 0 },
  pricePerDay: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

// 8. Booking Model
const bookingSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  lotId: { type: Schema.Types.ObjectId, ref: 'ParkingLot', required: true, index: true },
  slotId: { type: Schema.Types.ObjectId, ref: 'ParkingSlot', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', default: null, index: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', default: null, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  type: { type: String, enum: ['HOURLY', 'DAILY'], required: true },
  status: {
    type: String,
    enum: ['PENDING_PAYMENT', 'CONFIRMED', 'CANCELED', 'COMPLETED'],
    default: 'CONFIRMED',
    index: true
  },
  totalAmount: { type: Number, required: true, min: 0 }
}, { timestamps: true });
bookingSchema.index({ slotId: 1, status: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ lotId: 1, status: 1 });
bookingSchema.index({ organizationId: 1, status: 1 });
bookingSchema.index({ organizationId: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ organizationId: 1, createdAt: -1 });
bookingSchema.index({ lotId: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ slotId: 1, startTime: 1, endTime: 1 });

// 9. OccupancyEvent Model
const occupancyEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  facilityId: { type: Schema.Types.ObjectId, ref: 'ParkingLot', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', default: null, index: true },
  spotId: { type: Schema.Types.ObjectId, ref: 'ParkingSlot', required: true, index: true },
  eventType: {
    type: String,
    enum: [
      'SPOT_OCCUPIED',
      'SPOT_VACATED',
      'SPOT_RESERVED',
      'SPOT_BLOCKED',
      'SPOT_UNBLOCKED',
      'BOOKING_CREATED',
      'BOOKING_COMPLETED',
      'BOOKING_CANCELED'
    ],
    required: true,
    index: true
  },
  source: {
    type: String,
    enum: ['BOOKING', 'OPERATOR', 'SYSTEM', 'SENSOR', 'CAMERA'],
    default: 'BOOKING'
  },
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now, index: true }
});
occupancyEventSchema.index({ facilityId: 1, timestamp: -1 });
occupancyEventSchema.index({ spotId: 1, timestamp: -1 });
occupancyEventSchema.index({ organizationId: 1, timestamp: -1 });
occupancyEventSchema.index({ organizationId: 1, facilityId: 1, timestamp: -1 });

// 10. AuditLog Model
const auditLogSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  action: {
    type: String,
    enum: [
      'FACILITY_CREATED',
      'FACILITY_UPDATED',
      'FLOOR_CREATED',
      'FLOOR_UPDATED',
      'SPOT_CREATED',
      'SPOT_UPDATED',
      'SPOT_BLOCKED',
      'SPOT_UNBLOCKED',
      'PRICE_UPDATED',
      'BOOKING_CREATED',
      'BOOKING_CANCELLED',
      'BOOKING_COMPLETED',
      'USER_CREATED',
      'USER_UPDATED',
      'PAYMENT_ORDER_CREATED',
      'PAYMENT_VERIFIED',
      'PAYMENT_FAILED',
      'EVENT_INGESTED',
      'RECOMMENDATION_CREATED',
      'RECOMMENDATION_ACCEPTED',
      'RECOMMENDATION_REJECTED',
      'PRICING_RULE_APPLIED',
      'FORECAST_GENERATED',
      'AI_INSIGHT_REQUESTED',
      'AI_RECOMMENDATION_EXPLAINED',
      'COPILOT_CHAT_QUERY'
    ],
    required: true,
    index: true
  },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  oldValue: { type: Schema.Types.Mixed, default: null },
  newValue: { type: Schema.Types.Mixed, default: null },
  ipAddress: { type: String, default: null },
  timestamp: { type: Date, default: Date.now, index: true }
});
auditLogSchema.index({ organizationId: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });

// 11. Payment Model (Razorpay / Mock Gateway)
const paymentSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  provider: {
    type: String,
    enum: ['RAZORPAY', 'MOCK'],
    default: 'RAZORPAY'
  },
  providerOrderId: { type: String, required: true, unique: true, index: true },
  providerPaymentId: { type: String, default: null, index: true },
  providerSignature: { type: String, default: null },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR', uppercase: true },
  status: {
    type: String,
    enum: ['CREATED', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELLED'],
    default: 'CREATED',
    index: true
  },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, { timestamps: true });
paymentSchema.index({ organizationId: 1, status: 1 });
paymentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

// 12. OptimizationRecommendation Model
const optimizationRecommendationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  facilityId: { type: Schema.Types.ObjectId, ref: 'ParkingLot', required: true, index: true },
  floorId: { type: Schema.Types.ObjectId, ref: 'Floor', default: null, index: true },
  type: {
    type: String,
    enum: [
      'PRICING_SURGE',
      'PRICING_DISCOUNT',
      'CAPACITY_REALLOCATION',
      'OVERSTAY_ALERT',
      'GENERAL'
    ],
    required: true,
    index: true
  },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  reason: { type: String, required: true, trim: true },
  metrics: { type: Schema.Types.Mixed, default: {} },
  recommendation: { type: Schema.Types.Mixed, default: {} },
  expectedImpact: { type: Schema.Types.Mixed, default: {} },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
    default: 'PENDING',
    index: true
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null }
}, { timestamps: true });

optimizationRecommendationSchema.index({ organizationId: 1, status: 1 });
optimizationRecommendationSchema.index({ organizationId: 1, facilityId: 1 });
optimizationRecommendationSchema.index({ organizationId: 1, createdAt: -1 });

const User = model('User', userSchema);
const Organization = model('Organization', organizationSchema);
const ParkingLot = model('ParkingLot', facilitySchema);
const Floor = model('Floor', floorSchema);
const ParkingSlot = model('ParkingSlot', slotSchema);
const Vehicle = model('Vehicle', vehicleSchema);
const PricingRule = model('PricingRule', pricingRuleSchema);
const Booking = model('Booking', bookingSchema);
const OccupancyEvent = model('OccupancyEvent', occupancyEventSchema);
const AuditLog = model('AuditLog', auditLogSchema);
const Payment = model('Payment', paymentSchema);
const OptimizationRecommendation = model('OptimizationRecommendation', optimizationRecommendationSchema);

module.exports = {
  User,
  Organization,
  ParkingLot,
  Facility: ParkingLot, // Alias for B2B domain
  Floor,
  ParkingSlot,
  ParkingSpot: ParkingSlot, // Alias for B2B domain
  Vehicle,
  PricingRule,
  ParkingRate: PricingRule, // Alias
  Booking,
  OccupancyEvent,
  AuditLog,
  Payment,
  OptimizationRecommendation
};
