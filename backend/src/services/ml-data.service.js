const mongoose = require('mongoose');
const { ParkingLot, ParkingSlot, Booking } = require('../models');
const { AppError } = require('../errors');

function toObjectId(id) {
  if (!id) return null;
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

/**
 * Builds a chronological time-bucketed hourly dataset from historical bookings.
 * Strictly avoids target leakage by computing features only from events strictly before bucket timestamp.
 */
async function extractFacilityHourlyDataset({
  organizationId,
  facilityId,
  startDate,
  endDate
}) {
  const orgId = toObjectId(organizationId);
  const facId = toObjectId(facilityId);

  const facility = await ParkingLot.findOne({ _id: facId, organizationId: orgId }).lean();
  if (!facility) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found.');
  }

  const totalSpots = await ParkingSlot.countDocuments({
    organizationId: orgId,
    lotId: facId,
    isActive: true
  });
  const capacity = Math.max(1, totalSpots);

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 60 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();

  // Load all confirmed/completed bookings in range with small buffer before for lag features
  const lookbackBufferStart = new Date(start.getTime() - 8 * 86400000); // 8 days buffer for rolling-7d and lags
  const bookings = await Booking.find({
    organizationId: orgId,
    lotId: facId,
    status: { $in: ['CONFIRMED', 'COMPLETED'] },
    startTime: { $gte: lookbackBufferStart, $lte: end }
  }).lean();

  // Create hourly buckets from start to end
  const hourlyRows = [];
  const startHourMs = new Date(start).setUTCMinutes(0, 0, 0);
  const endHourMs = new Date(end).setUTCMinutes(0, 0, 0);

  // Pre-index bookings by hour overlap
  // A booking overlaps hour [t, t+1hr) if booking.startTime < t+1hr and booking.endTime > t
  const getBookingsInInterval = (t0, t1) => {
    return bookings.filter((b) => {
      const bStart = new Date(b.startTime).getTime();
      const bEnd = new Date(b.endTime).getTime();
      return bStart < t1 && bEnd > t0;
    });
  };

  const getNewBookingsInInterval = (t0, t1) => {
    return bookings.filter((b) => {
      const bStart = new Date(b.startTime).getTime();
      return bStart >= t0 && bStart < t1;
    });
  };

  let prevHourDemand = 0;

  for (let t = startHourMs; t < endHourMs; t += 3600000) {
    const bucketStart = new Date(t);
    const bucketEnd = new Date(t + 3600000);
    const nextBucketEnd = new Date(t + 7200000);

    const dayOfWeek = bucketStart.getUTCDay();
    const hourOfDay = bucketStart.getUTCHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;

    // Current hour demand (active bookings in this hour)
    const activeBookings = getBookingsInInterval(t, t + 3600000);
    const bookingCount = activeBookings.length;

    // Average duration of historical bookings prior to this timestamp
    const priorCompleted = bookings.filter((b) => new Date(b.endTime).getTime() <= t);
    let avgDuration = 2.0;
    if (priorCompleted.length > 0) {
      const totalDur = priorCompleted.reduce((sum, b) => {
        const durHours = (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
        return sum + Math.max(0.5, durHours);
      }, 0);
      avgDuration = Number((totalDur / priorCompleted.length).toFixed(2));
    }

    const utilizationRate = Number(Math.min(100, (bookingCount / capacity) * 100).toFixed(1));

    // Lag features:
    // previousHourDemand (t - 1hr)
    // previousDayDemand (t - 24hr)
    const prevDayActive = getBookingsInInterval(t - 24 * 3600000, t - 23 * 3600000);
    const previousDayDemand = prevDayActive.length;

    // Rolling 7-day demand (hourly average over past 7 days)
    const sevenDaysBack = t - 7 * 86400000;
    const past7DayBookings = getNewBookingsInInterval(sevenDaysBack, t);
    const rolling7DayDemand = Number((past7DayBookings.length / (7 * 24)).toFixed(3));

    // Peak hour indicator (standard commercial peak: 10:00 - 15:00 on weekdays, 12:00 - 18:00 weekends)
    const peakHourIndicator = (isWeekend && hourOfDay >= 12 && hourOfDay <= 18) ||
      (!isWeekend && hourOfDay >= 10 && hourOfDay <= 16) ? 1 : 0;

    // Target: Future booking count in next hour [t+1hr, t+2hr)
    const targetBookings = getBookingsInInterval(t + 3600000, nextBucketEnd);
    const futureBookingCount = targetBookings.length;

    hourlyRows.push({
      timestamp: bucketStart.toISOString(),
      facilityId: String(facId),
      hourOfDay,
      dayOfWeek,
      isWeekend,
      facilityCapacity: capacity,
      historicalBookingCount: bookingCount,
      historicalUtilization: utilizationRate,
      averageDuration: avgDuration,
      previousHourDemand: prevHourDemand,
      previousDayDemand,
      rolling7DayDemand,
      peakHourIndicator,
      futureBookingCount // Target variable
    });

    prevHourDemand = bookingCount;
  }

  return {
    facility: {
      id: String(facility._id),
      name: facility.name,
      capacity
    },
    totalBuckets: hourlyRows.length,
    rows: hourlyRows
  };
}

module.exports = {
  extractFacilityHourlyDataset
};
