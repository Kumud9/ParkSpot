const express = require('express');
const authRoutes = require('./auth.routes');
const facilityRoutes = require('./facility.routes');
const bookingRoutes = require('./booking.routes');
const vehicleRoutes = require('./vehicle.routes');
const adminRoutes = require('./admin.routes');

const paymentRoutes = require('./payment.routes');
const analyticsRoutes = require('./analytics.routes');
const optimizationRoutes = require('./optimization.routes');
const forecastingRoutes = require('./forecasting.routes');
const aiRoutes = require('./ai.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/facilities', facilityRoutes);
router.use('/bookings', bookingRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/optimization', optimizationRoutes);
router.use('/forecasting', forecastingRoutes);
router.use('/ai', aiRoutes);
router.use('/copilot', aiRoutes);

module.exports = router;
