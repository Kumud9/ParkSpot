const crypto = require('crypto');
const https = require('https');
const { Payment, Booking } = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('./audit.service');
const { recordEvent } = require('./occupancy.service');

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
    return {
      payment: existingActive,
      order: {
        id: existingActive.providerOrderId,
        amount: existingActive.amount,
        amountPaise: Math.round(existingActive.amount * 100),
        currency: existingActive.currency,
        keyId: isMockEnabled() ? 'rzp_test_mock_key' : process.env.RAZORPAY_KEY_ID
      }
    };
  }

  const amountPaise = Math.round(booking.totalAmount * 100);
  const receipt = `bkg_${String(booking._id).slice(-10)}`;
  const useMock = isMockEnabled();

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
    razorpayOrder = await callRazorpayOrdersApi({
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      amount: amountPaise,
      currency: 'INR',
      receipt
    });
  }

  const payment = await Payment.create({
    organizationId: booking.organizationId || organizationId || null,
    userId: booking.userId,
    bookingId: booking._id,
    provider: useMock ? 'MOCK' : 'RAZORPAY',
    providerOrderId: razorpayOrder.id,
    amount: booking.totalAmount,
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
      bookingId: payment.bookingId
    },
    ipAddress
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
