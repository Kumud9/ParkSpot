const { z } = require('zod');
const bookingService = require('../services/booking.service');

const createSchema = z.object({
  slotId: z.string().regex(/^[a-f\d]{24}$/i),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  type: z.enum(['HOURLY', 'DAILY']),
  vehicleId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable()
});

async function listUserBookings(req, res, next) {
  try {
    const bookings = await bookingService.listUserBookings(req.user.sub);
    res.json({ bookings });
  } catch (error) {
    next(error);
  }
}

async function createBooking(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    const booking = await bookingService.createBooking({
      userId: req.user.sub,
      slotId: data.slotId,
      startTime: data.startTime,
      endTime: data.endTime,
      type: data.type,
      vehicleId: data.vehicleId || null,
      organizationId: req.user.organizationId || null
    });
    res.status(201).json({ booking });
  } catch (error) {
    next(error);
  }
}

async function getBookingById(req, res, next) {
  try {
    const booking = await bookingService.getBookingById(req.params.id, req.user.sub);
    res.json({ booking });
  } catch (error) {
    next(error);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const booking = await bookingService.cancelBooking({
      bookingId: req.params.id,
      userId: req.user.sub,
      organizationId: req.user.organizationId || null,
      ipAddress: req.ip
    });
    res.json({ booking });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUserBookings,
  getBookingById,
  createBooking,
  cancelBooking
};
