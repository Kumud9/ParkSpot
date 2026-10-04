const express = require('express');
const paymentController = require('../../controllers/payment.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.post('/order', authenticate, paymentController.createOrder);
router.post('/verify', authenticate, paymentController.verifyPayment);
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;
