const { z } = require('zod');
const paymentService = require('../services/payment.service');

const orderSchema = z.object({
  bookingId: z.string().regex(/^[a-f\d]{24}$/i)
});

const verifySchema = z.object({
  orderId: z.string().optional(),
  paymentId: z.string().optional(),
  signature: z.string().optional(),
  razorpay_order_id: z.string().optional(),
  razorpay_payment_id: z.string().optional(),
  razorpay_signature: z.string().optional()
}).refine(
  (data) => (data.orderId || data.razorpay_order_id) &&
            (data.paymentId || data.razorpay_payment_id) &&
            (data.signature || data.razorpay_signature),
  { message: 'orderId, paymentId, and signature are required.' }
);

async function createOrder(req, res, next) {
  try {
    const data = orderSchema.parse(req.body);
    const result = await paymentService.createPaymentOrder({
      bookingId: data.bookingId,
      userId: req.user.sub,
      organizationId: req.user.organizationId || null,
      ipAddress: req.ip
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const data = verifySchema.parse(req.body);
    const orderId = data.orderId || data.razorpay_order_id;
    const paymentId = data.paymentId || data.razorpay_payment_id;
    const signature = data.signature || data.razorpay_signature;

    const result = await paymentService.verifyPayment({
      orderId,
      paymentId,
      signature,
      userId: req.user.sub,
      organizationId: req.user.organizationId || null,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;
    const result = await paymentService.handleWebhook({
      rawBody,
      signature,
      eventData: req.body,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  handleWebhook
};
