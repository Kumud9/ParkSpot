const mongoose = require('mongoose');
const { ParkingLot, ParkingSlot, OptimizationRecommendation } = require('../models');
const { AppError } = require('../errors');
const analyticsService = require('./analytics.service');
const forecastingService = require('./forecasting.service');
const optimizationService = require('./optimization.service');

function toObjectId(id) {
  if (!id) return null;
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

function sanitizeText(str) {
  if (typeof str !== 'string') return str;
  // Strip control characters or suspicious prompt injection patterns
  return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
}

async function buildFacilityOperationsContext({ organizationId, facilityId, startDate = null, endDate = null }) {
  const orgId = toObjectId(organizationId);
  const facility = await ParkingLot.findOne({
    _id: toObjectId(facilityId),
    organizationId: orgId
  }).lean();

  if (!facility) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }

  const { start, end } = analyticsService.parseAnalyticsDateRange(startDate, endDate);

  // Fetch operational metrics concurrently with bounded aggregation
  const [slotAgg, utilData, peakHoursData, revenueData, forecastData, pendingRecs, overstayData] = await Promise.all([
    ParkingSlot.aggregate([
      { $match: { organizationId: orgId, lotId: facility._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          occupied: { $sum: { $cond: [{ $eq: ['$status', 'OCCUPIED'] }, 1, 0] } },
          reserved: { $sum: { $cond: [{ $eq: ['$status', 'RESERVED'] }, 1, 0] } },
          available: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'AVAILABLE'] }, '$isActive'] }, 1, 0] } }
        }
      }
    ]),

    analyticsService.getUtilizationAnalytics({ organizationId: orgId, facilityId, startDate: start, endDate: end }),
    analyticsService.getPeakHoursAnalytics({ organizationId: orgId, facilityId, startDate: start, endDate: end }),
    analyticsService.getRevenueAnalytics({ organizationId: orgId, facilityId, startDate: start, endDate: end }),
    forecastingService.getFacilityDemandForecast({ organizationId: orgId, facilityId, startDate: start, horizon: 24, granularity: 'hour' }),
    OptimizationRecommendation.find({ organizationId: orgId, facilityId: facility._id, status: 'PENDING' })
      .limit(5)
      .lean(),
    optimizationService.detectOverstays({ organizationId: orgId, facilityId, limit: 5 })
  ]);

  const slots = slotAgg[0] || { total: 0, active: 0, occupied: 0, reserved: 0, available: 0 };
  const currentOccPct = slots.total > 0 ? Number(((slots.occupied / slots.total) * 100).toFixed(1)) : 0;

  // Build clean, bounded, sanitized context
  return {
    facility: {
      id: String(facility._id),
      name: sanitizeText(facility.name),
      city: sanitizeText(facility.city),
      baseHourlyRate: facility.hourlyRate,
      baseDailyRate: facility.dailyRate
    },
    spots: {
      total: slots.total,
      active: slots.active,
      currentlyOccupied: slots.occupied,
      currentlyReserved: slots.reserved,
      currentlyAvailable: slots.available,
      currentOccupancyPercentage: currentOccPct
    },
    utilization: {
      averageUtilizationPercentage: utilData.summary.averageUtilizationPercentage,
      totalCapacitySpotHours: utilData.summary.totalCapacitySpotHours,
      occupiedHours: utilData.summary.occupiedHours,
      bookingsCount: utilData.summary.bookingsCount
    },
    peakHours: {
      busiestHour: peakHoursData.summary.busiestHour,
      peakBookingVolume: peakHoursData.summary.peakBookingVolume
    },
    financials: {
      collectedRevenue: revenueData.summary.collectedRevenue,
      bookingValue: revenueData.summary.bookingValue,
      paidTransactions: revenueData.summary.paidTransactions,
      averageTransactionValue: revenueData.summary.averageTransactionValue
    },
    demandForecast: {
      averagePredictedUtilization: forecastData.summary.averagePredictedUtilization,
      peakPredictedTime: forecastData.summary.peakPredictedTime,
      peakPredictedDemand: forecastData.summary.peakPredictedDemand,
      trend: forecastData.summary.trend,
      contributingFactors: forecastData.contributingFactors
    },
    activeRecommendations: pendingRecs.map((r) => ({
      id: String(r._id),
      type: r.type,
      title: sanitizeText(r.title),
      reason: sanitizeText(r.reason),
      confidence: r.confidence
    })),
    recentOverstaysCount: overstayData.overstays.filter((o) => o.overstayStatus === 'ACTIVE_OVERSTAY').length
  };
}

module.exports = {
  buildFacilityOperationsContext,
  sanitizeText
};
