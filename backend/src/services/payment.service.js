const crypto = require('crypto');
const https = require('https');
const { Payment, Booking, ParkingLot, ParkingSlot, PricingRule } = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('./audit.service');
const { recordEvent } = require('./occupancy.service');
const { rupeesToPaise, calculatePrice } = require('../utils/booking');

function isMockEnabled() {
  const hasKey = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  return !hasKey || process.env.NODE_ENV === 'test' || process.env.MOCK_PAYMENT === 'true';
}

function callRazorpayOrdersApi({ keyId, keySecret, amount, currency, receipt }) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      amount,
      currency,
      receipt
    });
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const req = https.request('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new AppError(502, 'RAZORPAY_ERROR', json.error?.description || 'Razorpay order creation failed'));
          }
        } catch (_e) {
          reject(new AppError(502, 'RAZORPAY_ERROR', 'Invalid response from Razorpay'));
        }
      });
    });
    req.on('error', (err) => reject(new AppError(502, 'RAZORPAY_NETWORK_ERROR', err.message)));
    req.write(postData);
    req.end();
  });
}

async function createPaymentOrder({ bookingId, userId, organizationId = null, ipAddress = null }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
  }

  // Tenant / user ownership validation
  if (organizationId && booking.organizationId && String(booking.organizationId) !== String(organizationId)) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied to this booking.');
  }
  if (!organizationId && String(booking.userId) !== String(userId)) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied to this booking.');
  }

  if (booking.status === 'CANCELED' || booking.status === 'COMPLETED') {
    throw new AppError(409, 'BOOKING_INACTIVE', 'Cannot create payment order for cancelled or completed booking.');
  }

  // Check if booking is already paid
  const existingPaid = await Payment.findOne({ bookingId: booking._id, status: 'PAID' });
  if (existingPaid) {
    throw new AppError(409, 'BOOKING_ALREADY_PAID', 'This booking has already been paid for.');
  }

  // Idempotency: return existing active order if already created and not failed
  const existingActive = await Payment.findOne({
    bookingId: booking._id,
    status: { $in: ['CREATED', 'PENDING'] }
  });
  if (existingActive) {
    const existingPaise = rupeesToPaise(existingActive.amount);
    return {
      payment: existingActive,
      order: {
        id: existingActive.providerOrderId,
        amount: existingActive.amount,
        amountPaise: existingPaise,
        currency: existingActive.currency || 'INR',
        keyId: isMockEnabled() ? 'rzp_test_mock_key' : process.env.RAZORPAY_KEY_ID
      }
    };
  }

  // Authoritatively validate or calculate payable amount in rupees
  const lot = await ParkingLot.findById(booking.lotId).lean();
  if (!lot) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'The facility for this booking does not exist.');
  }

  const slot = await ParkingSlot.findById(booking.slotId).lean();
  if (!slot) {
    throw new AppError(404, 'SPOT_NOT_FOUND', 'The parking spot for this booking does not exist.');
  }

  if (String(slot.lotId) !== String(lot._id)) {
    throw new AppError(400, 'INVALID_SPOT_FACILITY_RELATION', 'Selected spot does not belong to the selected facility.');
  }

  let payableRupees = Number(booking.totalAmount);
  let pricingSource = 'PERSISTED_BOOKING';

  if (!Number.isFinite(payableRupees) || payableRupees <= 0) {
    pricingSource = 'FACILITY_PRICING_RULES';
    const rules = await PricingRule.find({ facilityId: lot._id, isActive: true }).lean();
    const calculated = calculatePrice({
      start: booking.startTime,
      end: booking.endTime,
      type: booking.type,
      hourlyRate: lot.hourlyRate > 0 ? lot.hourlyRate : 50,
      dailyRate: lot.dailyRate > 0 ? lot.dailyRate : 300,
      spotType: slot.type || 'STANDARD',
      rules
    });
    if (calculated?.amount > 0) {
      payableRupees = calculated.amount;
      booking.totalAmount = payableRupees;
      await booking.save();
    } else {
      throw new AppError(400, 'INVALID_PAYMENT_AMOUNT', 'Payable amount must be a valid positive number.');
    }
  }

  // Convert rupees to integer paise exactly once with minimum amount validation
  const amountPaise = rupeesToPaise(payableRupees);
  const receipt = `bkg_${String(booking._id).slice(-10)}`;
  const useMock = isMockEnabled();

  console.info('[PaymentService] Initiating order creation:', {
    bookingId: String(booking._id),
    facilityId: String(booking.lotId),
    pricingSource,
    validatedRupeeAmount: payableRupees,
    paiseAmount: amountPaise,
    currency: 'INR',
    stage: 'ORDER_CREATING',
    useMock
  });

  let razorpayOrder;
  if (useMock) {
    razorpayOrder = {
      id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
      amount: amountPaise,
      currency: 'INR',
      receipt,
      status: 'created'
    };
  } else {
    try {
      razorpayOrder = await callRazorpayOrdersApi({
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
        amount: amountPaise,
        currency: 'INR',
        receipt
      });
    } catch (orderErr) {
      console.error('[PaymentService] Razorpay order API error:', {
        bookingId: String(booking._id),
        amountPaise,
        error: orderErr.message,
        stage: 'ORDER_CREATION_FAILED'
      });
      throw orderErr;
    }
  }

  const payment = await Payment.create({
    organizationId: booking.organizationId || organizationId || null,
    userId: booking.userId,
    bookingId: booking._id,
    provider: useMock ? 'MOCK' : 'RAZORPAY',
    providerOrderId: razorpayOrder.id,
    amount: payableRupees,
    currency: 'INR',
    status: 'CREATED',
    metadata: {
      receipt,
      paise: amountPaise,
      createdAt: new Date()
    }
  });

  await logAction({
    organizationId: payment.organizationId,
    userId,
    action: 'PAYMENT_ORDER_CREATED',
    entityType: 'Payment',
    entityId: payment._id,
    newValue: {
      providerOrderId: payment.providerOrderId,
      amount: payment.amount,
      amountPaise,
      bookingId: payment.bookingId
    },
    ipAddress
  });

  console.info('[PaymentService] Payment order successfully registered:', {
    bookingId: String(booking._id),
    paymentId: String(payment._id),
    providerOrderId: payment.providerOrderId,
    amountPaise,
    stage: 'ORDER_CREATED'
  });

  return {
    payment,
    order: {
      id: payment.providerOrderId,
      amount: payment.amount,
      amountPaise: amountPaise,
      currency: payment.currency,
      keyId: useMock ? 'rzp_test_mock_key' : process.env.RAZORPAY_KEY_ID
    }
  };
}

function verifySignatureHelper({ orderId, paymentId, signature, secret, isMock }) {
  if (isMock) {
    if (signature === 'mock_valid_signature' || signature === 'mock_valid_sig') {
      return true;
    }
    const mockExpected = crypto.createHmac('sha256', secret || 'mock_secret').update(`${orderId}|${paymentId}`).digest('hex');
    return signature === mockExpected;
  }

  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  const sigBuf = Buffer.from(signature || '', 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

async function verifyPayment({
  orderId,
  paymentId,
  signature,
  userId = null,
  organizationId = null,
  ipAddress = null
}) {
  console.info('[PaymentService] Verifying payment:', {
    providerOrderId: orderId,
    providerPaymentId: paymentId,
    stage: 'SIGNATURE_VERIFYING'
  });

  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment) {
    throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment order not found.');
  }

  // Tenant / user ownership check if provided
  if (organizationId && payment.organizationId && String(payment.organizationId) !== String(organizationId)) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied to this payment.');
  }
  if (!organizationId && userId && String(payment.userId) !== String(userId)) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied to this payment.');
  }

  // Idempotency: duplicate verification when already PAID
  if (payment.status === 'PAID') {
    const booking = await Booking.findById(payment.bookingId);
    console.info('[PaymentService] Duplicate verification handled idempotently:', {
      paymentId: String(payment._id),
      providerOrderId: orderId,
      providerPaymentId: paymentId
    });
    return {
      success: true,
      idempotent: true,
      payment,
      booking
    };
  }

  // Invalid state transitions
  if (['REFUNDED', 'CANCELLED'].includes(payment.status)) {
    throw new AppError(409, 'INVALID_PAYMENT_STATE', `Cannot verify payment in ${payment.status} state.`);
  }

  const isMock = payment.provider === 'MOCK' || isMockEnabled();
  const secret = process.env.RAZORPAY_KEY_SECRET || 'mock_secret';
  const isValid = verifySignatureHelper({ orderId, paymentId, signature, secret, isMock });

  if (!isValid) {
    payment.status = 'FAILED';
    payment.providerPaymentId = paymentId || null;
    payment.metadata = { ...payment.metadata, failureReason: 'INVALID_SIGNATURE', failedAt: new Date() };
    await payment.save();

    await logAction({
      organizationId: payment.organizationId,
      userId,
      action: 'PAYMENT_FAILED',
      entityType: 'Payment',
      entityId: payment._id,
      newValue: { status: 'FAILED', reason: 'INVALID_SIGNATURE' },
      ipAddress
    });

    console.warn('[PaymentService] Payment signature verification failed:', {
      paymentId: String(payment._id),
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      stage: 'PAYMENT_FAILED'
    });

    throw new AppError(400, 'INVALID_PAYMENT_SIGNATURE', 'Payment signature verification failed.');
  }

  // Successful verification
  payment.status = 'PAID';
  payment.providerPaymentId = paymentId;
  payment.providerSignature = signature;
  payment.metadata = { ...payment.metadata, verifiedAt: new Date() };
  await payment.save();

  const booking = await Booking.findById(payment.bookingId);
  if (booking) {
    booking.status = 'CONFIRMED';
    await booking.save();

    await recordEvent({
      organizationId: booking.organizationId,
      facilityId: booking.lotId,
      floorId: booking.floorId,
      spotId: booking.slotId,
      eventType: 'BOOKING_CREATED',
      source: 'SYSTEM',
      bookingId: booking._id,
      metadata: { paymentId: payment._id, providerPaymentId: paymentId }
    });
  }

  await logAction({
    organizationId: payment.organizationId,
    userId,
    action: 'PAYMENT_VERIFIED',
    entityType: 'Payment',
    entityId: payment._id,
    newValue: { status: 'PAID', providerPaymentId: paymentId },
    ipAddress
  });

  console.info('[PaymentService] Payment successfully verified and booking confirmed:', {
    paymentId: String(payment._id),
    bookingId: booking ? String(booking._id) : null,
    providerOrderId: orderId,
    providerPaymentId: paymentId,
    stage: 'PAYMENT_VERIFIED'
  });

  return {
    success: true,
    payment,
    booking
  };
}

async function handleWebhook({ rawBody, signature, eventData, ipAddress = null }) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (webhookSecret && !isMockEnabled()) {
    if (!signature) {
      throw new AppError(400, 'MISSING_WEBHOOK_SIGNATURE', 'Webhook signature header missing.');
    }
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody || '').digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature verification failed.');
    }
  }

  const payload = eventData || (rawBody ? JSON.parse(rawBody) : {});
  const event = payload.event;
  const paymentEntity = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;

  const orderId = paymentEntity?.order_id || orderEntity?.id;
  const paymentId = paymentEntity?.id;

  if (!orderId) {
    return { received: true, ignored: true, reason: 'NO_ORDER_ID' };
  }

  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment) {
    return { received: true, ignored: true, reason: 'PAYMENT_RECORD_NOT_FOUND' };
  }

  if (event === 'payment.captured' || event === 'order.paid') {
    // Idempotent duplicate check
    if (payment.status === 'PAID') {
      return { received: true, idempotent: true, status: 'PAID' };
    }

    if (['REFUNDED', 'CANCELLED'].includes(payment.status)) {
      return { received: true, ignored: true, reason: `Payment in ${payment.status} state` };
    }

    payment.status = 'PAID';
    if (paymentId) payment.providerPaymentId = paymentId;
    payment.metadata = { ...payment.metadata, webhookVerifiedAt: new Date() };
    await payment.save();

    const booking = await Booking.findById(payment.bookingId);
    if (booking) {
      booking.status = 'CONFIRMED';
      await booking.save();
    }

    await logAction({
      organizationId: payment.organizationId,
      action: 'PAYMENT_VERIFIED',
      entityType: 'Payment',
      entityId: payment._id,
      newValue: { status: 'PAID', source: 'WEBHOOK', providerPaymentId: paymentId },
      ipAddress
    });

    return { received: true, status: 'PAID' };
  }

  if (event === 'payment.failed') {
    if (payment.status !== 'PAID') {
      payment.status = 'FAILED';
      if (paymentId) payment.providerPaymentId = paymentId;
      payment.metadata = { ...payment.metadata, webhookFailedAt: new Date() };
      await payment.save();

      await logAction({
        organizationId: payment.organizationId,
        action: 'PAYMENT_FAILED',
        entityType: 'Payment',
        entityId: payment._id,
        newValue: { status: 'FAILED', source: 'WEBHOOK' },
        ipAddress
      });
    }
    return { received: true, status: 'FAILED' };
  }

  return { received: true, event };
}

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
  verifySignatureHelper
};
