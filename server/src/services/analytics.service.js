const mongoose = require('mongoose');
const { ParkingLot, Floor, ParkingSlot, Booking, Payment } = require('../models');
const { AppError } = require('../errors');

function toObjectId(id) {
  if (!id) return null;
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

function parseAnalyticsDateRange(startDate, endDate, maxDays = 366) {
  const now = new Date();
  const defaultStart = new Date(Date.now() - 30 * 86400000);

  const start = startDate ? new Date(startDate) : defaultStart;
  const end = endDate ? new Date(endDate) : now;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AppError(400, 'INVALID_DATE_RANGE', 'Provide valid ISO date strings for startDate and endDate.');
  }

  if (end < start) {
    throw new AppError(400, 'INVALID_DATE_RANGE', 'endDate must be greater than or equal to startDate.');
  }

  const durationMs = end.getTime() - start.getTime();
  const maxMs = maxDays * 86400000;
  if (durationMs > maxMs) {
    throw new AppError(400, 'DATE_RANGE_TOO_LARGE', `Date range cannot exceed ${maxDays} days.`);
  }

  const durationHours = Math.max(1, durationMs / 3600000);

  return { start, end, durationHours };
}

async function verifyFacilityAccess(facilityId, organizationId) {
  if (!facilityId) return null;
  const facility = await ParkingLot.findOne({
    _id: toObjectId(facilityId),
    organizationId: toObjectId(organizationId)
  }).lean();

  if (!facility) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }
  return facility;
}

// 1. Dashboard Summary
async function getDashboardSummary({ organizationId, startDate, endDate }) {
  const orgId = toObjectId(organizationId);
  const { start, end, durationHours } = parseAnalyticsDateRange(startDate, endDate);

  const [facilitiesCount, slotAgg, bookingAgg, paymentAgg, peakHourAgg, topFacilityAgg] = await Promise.all([
    // Facilities count
    ParkingLot.countDocuments({ organizationId: orgId, active: true }),

    // Slot operational state
    ParkingSlot.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: null,
          totalSpots: { $sum: 1 },
          activeSpots: { $sum: { $cond: ['$isActive', 1, 0] } },
          occupiedSpots: { $sum: { $cond: [{ $eq: ['$status', 'OCCUPIED'] }, 1, 0] } },
          reservedSpots: { $sum: { $cond: [{ $eq: ['$status', 'RESERVED'] }, 1, 0] } },
          availableSpots: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 'AVAILABLE'] }, '$isActive'] }, 1, 0] }
          },
          blockedSpots: { $sum: { $cond: [{ $eq: ['$status', 'BLOCKED'] }, 1, 0] } },
          maintenanceSpots: { $sum: { $cond: [{ $eq: ['$status', 'MAINTENANCE'] }, 1, 0] } }
        }
      }
    ]),

    // Booking totals & utilization in period
    Booking.aggregate([
      {
        $match: {
          organizationId: orgId,
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          completedBookings: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          confirmedBookings: { $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, 1, 0] } },
          cancelledBookings: { $sum: { $cond: [{ $eq: ['$status', 'CANCELED'] }, 1, 0] } },
          bookingValue: {
            $sum: { $cond: [{ $ne: ['$status', 'CANCELED'] }, '$totalAmount', 0] }
          }
        }
      }
    ]),

    // Payment stats (authoritative paid revenue)
    Payment.aggregate([
      {
        $match: {
          organizationId: orgId,
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          collectedRevenue: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$amount', 0] } },
          paidCount: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } }
        }
      }
    ]),

    // Peak booking hour
    Booking.aggregate([
      {
        $match: {
          organizationId: orgId,
          status: { $in: ['CONFIRMED', 'COMPLETED'] },
          startTime: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $hour: '$startTime' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]),

    // Top-performing facility by revenue
    Booking.aggregate([
      {
        $match: {
          organizationId: orgId,
          status: { $in: ['CONFIRMED', 'COMPLETED'] },
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$lotId',
          revenue: { $sum: '$totalAmount' },
          bookings: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: 'parkinglots',
          localField: '_id',
          foreignField: '_id',
          as: 'lotDoc'
        }
      }
    ])
  ]);

  const slots = slotAgg[0] || {
    totalSpots: 0,
    activeSpots: 0,
    occupiedSpots: 0,
    reservedSpots: 0,
    availableSpots: 0,
    blockedSpots: 0,
    maintenanceSpots: 0
  };

  const bookings = bookingAgg[0] || {
    totalBookings: 0,
    completedBookings: 0,
    confirmedBookings: 0,
    cancelledBookings: 0,
    bookingValue: 0
  };

  const payments = paymentAgg[0] || {
    collectedRevenue: 0,
    paidCount: 0,
    failedCount: 0
  };

  const totalSpotHours = (slots.activeSpots || slots.totalSpots) * durationHours;

  // Approximate booked hours in range for average utilization
  const bookedHoursAgg = await Booking.aggregate([
    {
      $match: {
        organizationId: orgId,
        status: { $in: ['CONFIRMED', 'COMPLETED'] },
        startTime: { $lt: end },
        endTime: { $gt: start }
      }
    },
    {
      $project: {
        overlapHours: {
          $divide: [
            {
              $subtract: [
                { $cond: [{ $lt: ['$endTime', end] }, '$endTime', end] },
                { $cond: [{ $gt: ['$startTime', start] }, '$startTime', start] }
              ]
            },
            3600000
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        totalBookedHours: { $sum: '$overlapHours' }
      }
    }
  ]);

  const totalBookedHours = bookedHoursAgg[0]?.totalBookedHours || 0;
  const averageUtilization = totalSpotHours > 0
    ? Number(((totalBookedHours / totalSpotHours) * 100).toFixed(1))
    : 0;

  const currentOccupancyPct = slots.totalSpots > 0
    ? Number(((slots.occupiedSpots / slots.totalSpots) * 100).toFixed(1))
    : 0;

  const totalAttempts = payments.paidCount + payments.failedCount;
  const paymentSuccessRate = totalAttempts > 0
    ? Number(((payments.paidCount / totalAttempts) * 100).toFixed(1))
    : 100;

  const cancellationRate = bookings.totalBookings > 0
    ? Number(((bookings.cancelledBookings / bookings.totalBookings) * 100).toFixed(1))
    : 0;

  const peakHourNum = peakHourAgg[0]?._id;
  const peakHourFormatted = peakHourNum !== undefined ? `${String(peakHourNum).padStart(2, '0')}:00` : 'N/A';

  const topFacilityDoc = topFacilityAgg[0];
  const topFacility = topFacilityDoc
    ? {
        id: String(topFacilityDoc._id),
        name: topFacilityDoc.lotDoc?.[0]?.name || 'Unknown',
        revenue: topFacilityDoc.revenue,
        bookings: topFacilityDoc.bookings
      }
    : null;

  return {
    period: {
      startDate: start,
      endDate: end,
      durationHours: Number(durationHours.toFixed(1))
    },
    facilities: {
      total: facilitiesCount
    },
    spots: {
      total: slots.totalSpots,
      active: slots.activeSpots,
      occupied: slots.occupiedSpots,
      reserved: slots.reservedSpots,
      available: slots.availableSpots,
      blocked: slots.blockedSpots,
      maintenance: slots.maintenanceSpots,
      currentOccupancyPercentage: currentOccupancyPct
    },
    utilization: {
      averagePercentage: averageUtilization,
      totalCapacitySpotHours: Math.round(totalSpotHours),
      occupiedSpotHours: Number(totalBookedHours.toFixed(1))
    },
    bookings: {
      total: bookings.totalBookings,
      completed: bookings.completedBookings,
      confirmed: bookings.confirmedBookings,
      cancelled: bookings.cancelledBookings,
      cancellationRate
    },
    financials: {
      revenue: payments.collectedRevenue,
      bookingValue: bookings.bookingValue,
      paidTransactions: payments.paidCount,
      failedTransactions: payments.failedCount,
      paymentSuccessRate
    },
    insights: {
      peakHour: peakHourFormatted,
      topFacility
    }
  };
}

// 2. Utilization Analytics
async function getUtilizationAnalytics({ organizationId, facilityId = null, floorId = null, startDate, endDate }) {
  const orgId = toObjectId(organizationId);
  const { start, end, durationHours } = parseAnalyticsDateRange(startDate, endDate);

  if (facilityId) {
    await verifyFacilityAccess(facilityId, organizationId);
  }

  const spotMatch = { organizationId: orgId, isActive: true };
  if (facilityId) spotMatch.lotId = toObjectId(facilityId);
  if (floorId) spotMatch.floorId = toObjectId(floorId);

  const bookingMatch = {
    organizationId: orgId,
    status: { $in: ['CONFIRMED', 'COMPLETED'] },
    startTime: { $lt: end },
    endTime: { $gt: start }
  };
  if (facilityId) bookingMatch.lotId = toObjectId(facilityId);
  if (floorId) bookingMatch.floorId = toObjectId(floorId);

  const [spotsCount, bookingAgg, facilityBreakdown, floorBreakdown] = await Promise.all([
    ParkingSlot.countDocuments(spotMatch),

    // Total booked hours
    Booking.aggregate([
      { $match: bookingMatch },
      {
        $project: {
          overlapHours: {
            $divide: [
              {
                $subtract: [
                  { $cond: [{ $lt: ['$endTime', end] }, '$endTime', end] },
                  { $cond: [{ $gt: ['$startTime', start] }, '$startTime', start] }
                ]
              },
              3600000
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          occupiedHours: { $sum: '$overlapHours' },
          bookingsCount: { $sum: 1 }
        }
      }
    ]),

    // Utilization by facility
    Booking.aggregate([
      { $match: bookingMatch },
      {
        $project: {
          lotId: 1,
          overlapHours: {
            $divide: [
              {
                $subtract: [
                  { $cond: [{ $lt: ['$endTime', end] }, '$endTime', end] },
                  { $cond: [{ $gt: ['$startTime', start] }, '$startTime', start] }
                ]
              },
              3600000
            ]
          }
        }
      },
      {
        $group: {
          _id: '$lotId',
          occupiedHours: { $sum: '$overlapHours' },
          bookingsCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'parkinglots',
          localField: '_id',
          foreignField: '_id',
          as: 'facility'
        }
      },
      {
        $lookup: {
          from: 'parkingslots',
          let: { lotId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$lotId', '$$lotId'] }, { $eq: ['$isActive', true] }] } } },
            { $count: 'total' }
          ],
          as: 'spotCount'
        }
      },
      { $sort: { occupiedHours: -1 } }
    ]),

    // Utilization by floor
    Booking.aggregate([
      { $match: { ...bookingMatch, floorId: { $ne: null } } },
      {
        $project: {
          floorId: 1,
          lotId: 1,
          overlapHours: {
            $divide: [
              {
                $subtract: [
                  { $cond: [{ $lt: ['$endTime', end] }, '$endTime', end] },
                  { $cond: [{ $gt: ['$startTime', start] }, '$startTime', start] }
                ]
              },
              3600000
            ]
          }
        }
      },
      {
        $group: {
          _id: '$floorId',
          facilityId: { $first: '$lotId' },
          occupiedHours: { $sum: '$overlapHours' },
          bookingsCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'floors',
          localField: '_id',
          foreignField: '_id',
          as: 'floor'
        }
      },
      {
        $lookup: {
          from: 'parkingslots',
          let: { flId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$floorId', '$$flId'] }, { $eq: ['$isActive', true] }] } } },
            { $count: 'total' }
          ],
          as: 'spotCount'
        }
      },
      { $sort: { occupiedHours: -1 } }
    ])
  ]);

  const totalCapacitySpotHours = spotsCount * durationHours;
  const occupiedHours = bookingAgg[0]?.occupiedHours || 0;
  const avgUtilization = totalCapacitySpotHours > 0
    ? Number(((occupiedHours / totalCapacitySpotHours) * 100).toFixed(1))
    : 0;

  return {
    period: {
      startDate: start,
      endDate: end,
      durationHours: Number(durationHours.toFixed(1))
    },
    scope: {
      facilityId: facilityId ? String(facilityId) : null,
      floorId: floorId ? String(floorId) : null
    },
    summary: {
      totalSpots: spotsCount,
      totalCapacitySpotHours: Math.round(totalCapacitySpotHours),
      occupiedHours: Number(occupiedHours.toFixed(1)),
      averageUtilizationPercentage: avgUtilization,
      bookingsCount: bookingAgg[0]?.bookingsCount || 0
    },
    byFacility: facilityBreakdown.map((item) => {
      const cap = (item.spotCount[0]?.total || 0) * durationHours;
      const pct = cap > 0 ? Number(((item.occupiedHours / cap) * 100).toFixed(1)) : 0;
      return {
        facilityId: String(item._id),
        name: item.facility[0]?.name || 'Unknown',
        totalSpots: item.spotCount[0]?.total || 0,
        occupiedHours: Number(item.occupiedHours.toFixed(1)),
        utilizationPercentage: pct,
        bookingsCount: item.bookingsCount
      };
    }),
    byFloor: floorBreakdown.map((item) => {
      const cap = (item.spotCount[0]?.total || 0) * durationHours;
      const pct = cap > 0 ? Number(((item.occupiedHours / cap) * 100).toFixed(1)) : 0;
      return {
        floorId: String(item._id),
        facilityId: String(item.facilityId),
        name: item.floor[0]?.name || 'Unknown',
        floorNumber: item.floor[0]?.floorNumber ?? 0,
        totalSpots: item.spotCount[0]?.total || 0,
        occupiedHours: Number(item.occupiedHours.toFixed(1)),
        utilizationPercentage: pct,
        bookingsCount: item.bookingsCount
      };
    })
  };
}

// 3. Occupancy Trends (Hourly / Daily time buckets)
async function getOccupancyTrends({ organizationId, facilityId = null, startDate, endDate, bucket = 'hourly' }) {
  const orgId = toObjectId(organizationId);
  const { start, end } = parseAnalyticsDateRange(startDate, endDate);

  if (facilityId) {
    await verifyFacilityAccess(facilityId, organizationId);
  }

  const spotMatch = { organizationId: orgId, isActive: true };
  if (facilityId) spotMatch.lotId = toObjectId(facilityId);
  const totalSpots = await ParkingSlot.countDocuments(spotMatch);

  const bookingMatch = {
    organizationId: orgId,
    status: { $in: ['CONFIRMED', 'COMPLETED'] },
    startTime: { $lt: end },
    endTime: { $gt: start }
  };
  if (facilityId) bookingMatch.lotId = toObjectId(facilityId);

  const isDaily = bucket === 'daily';
  const dateFormat = isDaily ? '%Y-%m-%d' : '%Y-%m-%d %H:00';

  const trendsAgg = await Booking.aggregate([
    { $match: bookingMatch },
    {
      $group: {
        _id: {
          bucket: { $dateToString: { format: dateFormat, date: '$startTime' } }
        },
        bookingsCount: { $sum: 1 },
        revenue: { $sum: '$totalAmount' },
        avgDurationMinutes: {
          $avg: {
            $divide: [{ $subtract: ['$endTime', '$startTime'] }, 60000]
          }
        }
      }
    },
    { $sort: { '_id.bucket': 1 } }
  ]);

  const trends = trendsAgg.map((item) => {
    // Software-derived occupied estimation based on bookings started in this bucket
    const occupied = Math.min(totalSpots, item.bookingsCount);
    const available = Math.max(0, totalSpots - occupied);
    const pct = totalSpots > 0 ? Number(((occupied / totalSpots) * 100).toFixed(1)) : 0;

    return {
      bucket: item._id.bucket,
      bookingsCount: item.bookingsCount,
      occupiedSpots: occupied,
      availableSpots: available,
      totalSpots,
      occupancyPercentage: pct,
      revenue: item.revenue,
      avgDurationMinutes: Math.round(item.avgDurationMinutes || 0)
    };
  });

  return {
    period: { startDate: start, endDate: end },
    bucketType: isDaily ? 'daily' : 'hourly',
    totalSpots,
    data: trends
  };
}

// 4. Peak Hours Analytics
async function getPeakHoursAnalytics({ organizationId, facilityId = null, startDate, endDate }) {
  const orgId = toObjectId(organizationId);
  const { start, end } = parseAnalyticsDateRange(startDate, endDate);

  if (facilityId) {
    await verifyFacilityAccess(facilityId, organizationId);
  }

  const spotMatch = { organizationId: orgId, isActive: true };
  if (facilityId) spotMatch.lotId = toObjectId(facilityId);
  const totalSpots = await ParkingSlot.countDocuments(spotMatch);

  const match = {
    organizationId: orgId,
    status: { $in: ['CONFIRMED', 'COMPLETED'] },
    startTime: { $gte: start, $lte: end }
  };
  if (facilityId) match.lotId = toObjectId(facilityId);

  const hourlyAgg = await Booking.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $hour: '$startTime' },
        bookingVolume: { $sum: 1 },
        totalRevenue: { $sum: '$totalAmount' },
        totalDurationMinutes: {
          $sum: { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 60000] }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const hoursMap = new Map(hourlyAgg.map((h) => [h._id, h]));
  const fullHourlyCurve = [];
  let busiestHour = 0;
  let maxVolume = 0;

  for (let hour = 0; hour < 24; hour++) {
    const data = hoursMap.get(hour);
    const volume = data?.bookingVolume || 0;
    const revenue = data?.totalRevenue || 0;
    const avgDuration = volume > 0 ? Math.round((data.totalDurationMinutes || 0) / volume) : 0;
    const utilPct = totalSpots > 0 ? Number(((Math.min(volume, totalSpots) / totalSpots) * 100).toFixed(1)) : 0;

    if (volume > maxVolume) {
      maxVolume = volume;
      busiestHour = hour;
    }

    fullHourlyCurve.push({
      hour,
      hourFormatted: `${String(hour).padStart(2, '0')}:00`,
      bookingVolume: volume,
      occupancyPercentage: utilPct,
      revenue,
      avgDurationMinutes: avgDuration
    });
  }

  // Sorted by volume descending for busiest hours ranking
  const rankedHours = [...fullHourlyCurve].sort((a, b) => b.bookingVolume - a.bookingVolume);

  return {
    period: { startDate: start, endDate: end },
    summary: {
      busiestHour: `${String(busiestHour).padStart(2, '0')}:00`,
      peakBookingVolume: maxVolume,
      totalSpots
    },
    busiestHoursRanked: rankedHours.slice(0, 5),
    hourlyDistribution: fullHourlyCurve
  };
}

// 5. Revenue Analytics
async function getRevenueAnalytics({ organizationId, facilityId = null, startDate, endDate }) {
  const orgId = toObjectId(organizationId);
  const { start, end } = parseAnalyticsDateRange(startDate, endDate);

  if (facilityId) {
    await verifyFacilityAccess(facilityId, organizationId);
  }

  const paymentMatch = {
    organizationId: orgId,
    createdAt: { $gte: start, $lte: end }
  };

  const bookingMatch = {
    organizationId: orgId,
    status: { $in: ['CONFIRMED', 'COMPLETED'] },
    createdAt: { $gte: start, $lte: end }
  };
  if (facilityId) bookingMatch.lotId = toObjectId(facilityId);

  const [paymentTotals, dailyRevenueAgg, facilityRevenueAgg, spotTypeRevenueAgg, bookingValueAgg] = await Promise.all([
    // Payment status totals
    Payment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, '$amount', 0] } },
          refundedRevenue: { $sum: { $cond: [{ $eq: ['$status', 'REFUNDED'] }, '$amount', 0] } },
          paidCount: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
          cancelledCount: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } }
        }
      }
    ]),

    // Revenue by day (PAID only)
    Payment.aggregate([
      { $match: { ...paymentMatch, status: 'PAID' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),

    // Revenue by facility
    Payment.aggregate([
      { $match: { ...paymentMatch, status: 'PAID' } },
      {
        $lookup: {
          from: 'bookings',
          localField: 'bookingId',
          foreignField: '_id',
          as: 'booking'
        }
      },
      { $unwind: '$booking' },
      ...(facilityId ? [{ $match: { 'booking.lotId': toObjectId(facilityId) } }] : []),
      {
        $group: {
          _id: '$booking.lotId',
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'parkinglots',
          localField: '_id',
          foreignField: '_id',
          as: 'lotDoc'
        }
      },
      { $sort: { revenue: -1 } }
    ]),

    // Revenue by spot type
    Payment.aggregate([
      { $match: { ...paymentMatch, status: 'PAID' } },
      {
        $lookup: {
          from: 'bookings',
          localField: 'bookingId',
          foreignField: '_id',
          as: 'booking'
        }
      },
      { $unwind: '$booking' },
      {
        $lookup: {
          from: 'parkingslots',
          localField: 'booking.slotId',
          foreignField: '_id',
          as: 'slotDoc'
        }
      },
      { $unwind: { path: '$slotDoc', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$slotDoc.type', 'STANDARD'] },
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } }
    ]),

    // Total booking value (for distinguishing booked vs collected)
    Booking.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: null,
          totalBookingValue: { $sum: '$totalAmount' },
          bookingCount: { $sum: 1 }
        }
      }
    ])
  ]);

  const pStats = paymentTotals[0] || {
    totalRevenue: 0,
    refundedRevenue: 0,
    paidCount: 0,
    failedCount: 0,
    cancelledCount: 0
  };

  const bStats = bookingValueAgg[0] || { totalBookingValue: 0, bookingCount: 0 };
  const avgTxValue = pStats.paidCount > 0 ? Number((pStats.totalRevenue / pStats.paidCount).toFixed(2)) : 0;

  return {
    period: { startDate: start, endDate: end },
    summary: {
      collectedRevenue: pStats.totalRevenue,
      bookingValue: bStats.totalBookingValue,
      paidTransactions: pStats.paidCount,
      failedTransactions: pStats.failedCount,
      cancelledTransactions: pStats.cancelledCount,
      refundedRevenue: pStats.refundedRevenue,
      averageTransactionValue: avgTxValue
    },
    byDay: dailyRevenueAgg.map((d) => ({
      date: d._id,
      revenue: d.revenue,
      transactions: d.transactions
    })),
    byFacility: facilityRevenueAgg.map((f) => ({
      facilityId: String(f._id),
      name: f.lotDoc[0]?.name || 'Unknown',
      revenue: f.revenue,
      transactions: f.transactions
    })),
    bySpotType: spotTypeRevenueAgg.map((s) => ({
      spotType: s._id,
      revenue: s.revenue,
      transactions: s.transactions
    }))
  };
}

// 6. Facility Performance
async function getFacilityPerformance({ organizationId, startDate, endDate }) {
  const orgId = toObjectId(organizationId);
  const { start, end, durationHours } = parseAnalyticsDateRange(startDate, endDate);

  const facilities = await ParkingLot.find({ organizationId: orgId }).lean();

  const [slotStatsAgg, bookingStatsAgg, paymentStatsAgg] = await Promise.all([
    // Active & occupied spots per facility
    ParkingSlot.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: '$lotId',
          totalSpots: { $sum: 1 },
          activeSpots: { $sum: { $cond: ['$isActive', 1, 0] } },
          occupiedSpots: { $sum: { $cond: [{ $eq: ['$status', 'OCCUPIED'] }, 1, 0] } },
          reservedSpots: { $sum: { $cond: [{ $eq: ['$status', 'RESERVED'] }, 1, 0] } }
        }
      }
    ]),

    // Booking KPIs per facility
    Booking.aggregate([
      {
        $match: {
          organizationId: orgId,
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$lotId',
          bookingCount: { $sum: 1 },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          cancellationCount: { $sum: { $cond: [{ $eq: ['$status', 'CANCELED'] }, 1, 0] } },
          bookingRevenue: {
            $sum: { $cond: [{ $ne: ['$status', 'CANCELED'] }, '$totalAmount', 0] }
          },
          totalDurationMinutes: {
            $sum: {
              $cond: [
                { $ne: ['$status', 'CANCELED'] },
                { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 60000] },
                0
              ]
            }
          }
        }
      }
    ]),

    // Paid payment revenue per facility
    Payment.aggregate([
      {
        $match: {
          organizationId: orgId,
          status: 'PAID',
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $lookup: {
          from: 'bookings',
          localField: 'bookingId',
          foreignField: '_id',
          as: 'booking'
        }
      },
      { $unwind: '$booking' },
      {
        $group: {
          _id: '$booking.lotId',
          paidRevenue: { $sum: '$amount' },
          paidCount: { $sum: 1 }
        }
      }
    ])
  ]);

  const slotMap = new Map(slotStatsAgg.map((s) => [String(s._id), s]));
  const bookingMap = new Map(bookingStatsAgg.map((b) => [String(b._id), b]));
  const paymentMap = new Map(paymentStatsAgg.map((p) => [String(p._id), p]));

  const performance = facilities.map((fac) => {
    const facId = String(fac._id);
    const slots = slotMap.get(facId) || { totalSpots: 0, activeSpots: 0, occupiedSpots: 0, reservedSpots: 0 };
    const bData = bookingMap.get(facId) || {
      bookingCount: 0,
      completedCount: 0,
      cancellationCount: 0,
      bookingRevenue: 0,
      totalDurationMinutes: 0
    };
    const pData = paymentMap.get(facId) || { paidRevenue: 0, paidCount: 0 };

    const capacitySpotHours = slots.activeSpots * durationHours;
    const bookedHours = bData.totalDurationMinutes / 60;
    const utilizationPct = capacitySpotHours > 0
      ? Number(((bookedHours / capacitySpotHours) * 100).toFixed(1))
      : 0;

    const occupancyPct = slots.totalSpots > 0
      ? Number(((slots.occupiedSpots / slots.totalSpots) * 100).toFixed(1))
      : 0;

    const avgDurationHours = bData.bookingCount > 0
      ? Number((bData.totalDurationMinutes / bData.bookingCount / 60).toFixed(1))
      : 0;

    return {
      facilityId: facId,
      name: fac.name,
      city: fac.city,
      address: fac.address,
      rates: { hourly: fac.hourlyRate, daily: fac.dailyRate },
      totalSpots: slots.totalSpots,
      activeSpots: slots.activeSpots,
      currentOccupied: slots.occupiedSpots,
      currentReserved: slots.reservedSpots,
      occupancyPercentage: occupancyPct,
      utilizationPercentage: utilizationPct,
      bookingCount: bData.bookingCount,
      completedCount: bData.completedCount,
      cancellationCount: bData.cancellationCount,
      revenue: pData.paidRevenue || bData.bookingRevenue,
      averageBookingDurationHours: avgDurationHours
    };
  });

  return {
    period: { startDate: start, endDate: end },
    totalFacilities: facilities.length,
    facilities: performance
  };
}

// 7. Spot Performance Drill-down
async function getSpotPerformance({ organizationId, facilityId = null, floorId = null, startDate, endDate, page = 1, limit = 20 }) {
  const orgId = toObjectId(organizationId);
  const { start, end, durationHours } = parseAnalyticsDateRange(startDate, endDate);

  if (facilityId) {
    await verifyFacilityAccess(facilityId, organizationId);
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const spotMatch = { organizationId: orgId };
  if (facilityId) spotMatch.lotId = toObjectId(facilityId);
  if (floorId) spotMatch.floorId = toObjectId(floorId);

  const [totalSpots, spotPerformanceAgg] = await Promise.all([
    ParkingSlot.countDocuments(spotMatch),

    ParkingSlot.aggregate([
      { $match: spotMatch },
      { $sort: { number: 1 } },
      { $skip: skip },
      { $limit: safeLimit },
      {
        $lookup: {
          from: 'bookings',
          let: { slotId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$slotId', '$$slotId'] },
                    { $gte: ['$createdAt', start] },
                    { $lte: ['$createdAt', end] }
                  ]
                }
              }
            }
          ],
          as: 'bookings'
        }
      },
      {
        $lookup: {
          from: 'floors',
          localField: 'floorId',
          foreignField: '_id',
          as: 'floorDoc'
        }
      },
      {
        $lookup: {
          from: 'parkinglots',
          localField: 'lotId',
          foreignField: '_id',
          as: 'facilityDoc'
        }
      },
      {
        $project: {
          _id: 1,
          number: 1,
          level: 1,
          type: 1,
          status: 1,
          isActive: 1,
          floorId: 1,
          lotId: 1,
          floorName: { $arrayElemAt: ['$floorDoc.name', 0] },
          facilityName: { $arrayElemAt: ['$facilityDoc.name', 0] },
          bookingsCount: { $size: '$bookings' },
          completedCount: {
            $size: {
              $filter: {
                input: '$bookings',
                as: 'b',
                cond: { $eq: ['$$b.status', 'COMPLETED'] }
              }
            }
          },
          cancellationCount: {
            $size: {
              $filter: {
                input: '$bookings',
                as: 'b',
                cond: { $eq: ['$$b.status', 'CANCELED'] }
              }
            }
          },
          revenue: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$bookings',
                    as: 'b',
                    cond: { $ne: ['$$b.status', 'CANCELED'] }
                  }
                },
                as: 'validB',
                in: '$$validB.totalAmount'
              }
            }
          },
          totalDurationHours: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$bookings',
                    as: 'b',
                    cond: { $ne: ['$$b.status', 'CANCELED'] }
                  }
                },
                as: 'validB',
                in: { $divide: [{ $subtract: ['$$validB.endTime', '$$validB.startTime'] }, 3600000] }
              }
            }
          }
        }
      }
    ])
  ]);

  const spots = spotPerformanceAgg.map((s) => {
    const bookedHrs = Number(s.totalDurationHours.toFixed(1));
    const utilPct = durationHours > 0 ? Number(((bookedHrs / durationHours) * 100).toFixed(1)) : 0;
    const avgDuration = s.bookingsCount > 0 ? Number((bookedHrs / s.bookingsCount).toFixed(1)) : 0;

    return {
      spotId: String(s._id),
      number: s.number,
      level: s.level,
      type: s.type,
      currentStatus: s.status,
      isActive: s.isActive,
      floorId: s.floorId ? String(s.floorId) : null,
      floorName: s.floorName || null,
      facilityId: String(s.lotId),
      facilityName: s.facilityName || null,
      bookingsCount: s.bookingsCount,
      completedCount: s.completedCount,
      cancellationCount: s.cancellationCount,
      revenue: s.revenue,
      totalHoursBooked: bookedHrs,
      utilizationPercentage: utilPct,
      averageDurationHours: avgDuration
    };
  });

  return {
    period: { startDate: start, endDate: end },
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: totalSpots,
      totalPages: Math.ceil(totalSpots / safeLimit) || 1
    },
    spots
  };
}

module.exports = {
  parseAnalyticsDateRange,
  getDashboardSummary,
  getUtilizationAnalytics,
  getOccupancyTrends,
  getPeakHoursAnalytics,
  getRevenueAnalytics,
  getFacilityPerformance,
  getSpotPerformance
};
