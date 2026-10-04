const mongoose = require('mongoose');
const {
  OptimizationRecommendation,
  ParkingLot,
  Floor,
  ParkingSlot,
  Booking,
  OccupancyEvent,
  PricingRule
} = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('./audit.service');
const analyticsService = require('./analytics.service');
const pricingService = require('./pricing.service');
const forecastingService = require('./forecasting.service');

function toObjectId(id) {
  if (!id) return null;
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

const DEFAULT_THRESHOLDS = {
  highUtilizationThreshold: 70, // >= 70% peak triggers surge recommendation
  lowUtilizationThreshold: 25,  // <= 25% avg utilization triggers discount recommendation
  surgePriceIncreasePct: 25,    // +25% proposed increase
  discountPriceDecreasePct: 20, // -20% proposed discount
  minBookingCountForSignal: 2,  // Minimum volume to trigger recommendation
  overstayToleranceMinutes: 15  // Grace period before marking overstay
};

async function verifyFacility(facilityId, organizationId) {
  const facility = await ParkingLot.findOne({
    _id: toObjectId(facilityId),
    organizationId: toObjectId(organizationId)
  }).lean();

  if (!facility) {
    throw new AppError(404, 'FACILITY_NOT_FOUND', 'Facility not found in your organization.');
  }
  return facility;
}

// 1. Demand Analysis & Pricing / Capacity Recommendations Generation
async function generateDemandRecommendations({
  organizationId,
  facilityId,
  startDate,
  endDate,
  thresholds = {},
  userId = null,
  ipAddress = null
}) {
  const orgId = toObjectId(organizationId);
  const facility = await verifyFacility(facilityId, organizationId);

  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const { start, end } = analyticsService.parseAnalyticsDateRange(startDate, endDate);

  const [peakHoursData, utilizationData, spotsByFloor, forecastData] = await Promise.all([
    analyticsService.getPeakHoursAnalytics({ organizationId: orgId, facilityId, startDate: start, endDate: end }),
    analyticsService.getUtilizationAnalytics({ organizationId: orgId, facilityId, startDate: start, endDate: end }),
    ParkingSlot.aggregate([
      { $match: { organizationId: orgId, lotId: toObjectId(facilityId), isActive: true } },
      {
        $group: {
          _id: { floorId: '$floorId', type: '$type' },
          count: { $sum: 1 },
          occupied: { $sum: { $cond: [{ $eq: ['$status', 'OCCUPIED'] }, 1, 0] } }
        }
      }
    ]),
    forecastingService.getFacilityDemandForecast({
      organizationId: orgId,
      facilityId,
      startDate: start,
      horizon: 24,
      granularity: 'hour'
    })
  ]);

  const createdRecommendations = [];
  const busiest = peakHoursData.summary;
  const busiestHourInt = parseInt(busiest.busiestHour.split(':')[0], 10) || 0;
  const avgUtilization = utilizationData.summary.averageUtilizationPercentage;
  const totalVolume = utilizationData.summary.bookingsCount;

  // Signal 1: High Demand / Peak Hours Surge Recommendation (Historical signal or Forecast signal)
  const isHighDemandSignal = (
    totalVolume >= config.minBookingCountForSignal &&
    (busiest.peakBookingVolume >= config.minBookingCountForSignal || avgUtilization >= config.highUtilizationThreshold)
  ) || (forecastData?.summary?.averagePredictedUtilization >= config.highUtilizationThreshold);

  if (isHighDemandSignal) {
    const surgeMultiplier = 1 + config.surgePriceIncreasePct / 100;
    const proposedHourly = Math.round(facility.hourlyRate * surgeMultiplier);
    const proposedDaily = Math.round(facility.dailyRate * surgeMultiplier);

    const startH = `${String(busiestHourInt).padStart(2, '0')}:00`;
    const endH = `${String(Math.min(23, busiestHourInt + 2)).padStart(2, '0')}:00`;

    const recDoc = await OptimizationRecommendation.create({
      organizationId: orgId,
      facilityId: facility._id,
      type: 'PRICING_SURGE',
      title: `Surge Pricing Recommended for Peak Window (${startH} - ${endH})`,
      description: `Demand peaks at ${busiest.busiestHour} with ${busiest.peakBookingVolume} bookings. Recommending a +${config.surgePriceIncreasePct}% peak surge to optimize yield.${forecastData ? ` Forecast model projects a ${forecastData.summary.trend} trajectory.` : ''}`,
      reason: `Peak utilization and high booking volume concentrated between ${startH} and ${endH}. Forecast projects ${forecastData?.summary?.averagePredictedUtilization || 0}% utilization.`,
      metrics: {
        busiestHour: busiest.busiestHour,
        peakVolume: busiest.peakBookingVolume,
        averageUtilization: avgUtilization,
        currentHourlyRate: facility.hourlyRate,
        proposedHourlyRate: proposedHourly,
        forecastEvidence: {
          predictedUtilization: forecastData?.summary?.averagePredictedUtilization,
          trend: forecastData?.summary?.trend,
          peakPredictedTime: forecastData?.summary?.peakPredictedTime
        }
      },
      recommendation: {
        action: 'CREATE_PRICING_RULE',
        ruleType: 'PEAK_SURGE',
        name: `Peak Surge ${startH}-${endH}`,
        spotType: 'ALL',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: startH,
        endTime: endH,
        pricePerHour: proposedHourly,
        pricePerDay: proposedDaily
      },
      expectedImpact: {
        projectedRevenueChangePct: Number((config.surgePriceIncreasePct * 0.75).toFixed(1)),
        projectedDemandChangePct: -5.0
      },
      confidence: Math.min(0.95, 0.65 + totalVolume * 0.05),
      status: 'PENDING',
      createdBy: userId,
      expiresAt: new Date(Date.now() + 7 * 86400000)
    });

    createdRecommendations.push(recDoc);

    await logAction({
      organizationId: orgId,
      userId,
      action: 'RECOMMENDATION_CREATED',
      entityType: 'OptimizationRecommendation',
      entityId: recDoc._id,
      newValue: { type: recDoc.type, title: recDoc.title },
      ipAddress
    });
  }

  // Signal 2: Low Demand / Off-Peak Discount Recommendation
  if (totalVolume >= config.minBookingCountForSignal && avgUtilization <= config.lowUtilizationThreshold) {
    const discountMultiplier = 1 - config.discountPriceDecreasePct / 100;
    const proposedHourly = Math.max(10, Math.round(facility.hourlyRate * discountMultiplier));
    const proposedDaily = Math.max(50, Math.round(facility.dailyRate * discountMultiplier));

    const recDoc = await OptimizationRecommendation.create({
      organizationId: orgId,
      facilityId: facility._id,
      type: 'PRICING_DISCOUNT',
      title: `Off-Peak Discount Recommended to Drive Utilization`,
      description: `Facility utilization is low at ${avgUtilization}%. A -${config.discountPriceDecreasePct}% off-peak rate incentive can increase occupancy.`,
      reason: `Overall facility utilization (${avgUtilization}%) is below the efficiency threshold of ${config.lowUtilizationThreshold}%.`,
      metrics: {
        averageUtilization: avgUtilization,
        currentHourlyRate: facility.hourlyRate,
        proposedHourlyRate: proposedHourly
      },
      recommendation: {
        action: 'CREATE_PRICING_RULE',
        ruleType: 'OFF_PEAK_DISCOUNT',
        name: `Off-Peak Saver Rate`,
        spotType: 'ALL',
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '19:00',
        endTime: '07:00',
        pricePerHour: proposedHourly,
        pricePerDay: proposedDaily
      },
      expectedImpact: {
        projectedRevenueChangePct: +8.0,
        projectedDemandChangePct: +20.0
      },
      confidence: 0.8,
      status: 'PENDING',
      createdBy: userId,
      expiresAt: new Date(Date.now() + 7 * 86400000)
    });

    createdRecommendations.push(recDoc);

    await logAction({
      organizationId: orgId,
      userId,
      action: 'RECOMMENDATION_CREATED',
      entityType: 'OptimizationRecommendation',
      entityId: recDoc._id,
      newValue: { type: recDoc.type, title: recDoc.title },
      ipAddress
    });
  }

  // Signal 3: Spot-Type / Capacity Reallocation
  const evSpots = spotsByFloor.filter((s) => s._id.type === 'EV');
  const evTotal = evSpots.reduce((acc, s) => acc + s.count, 0);
  const evOccupied = evSpots.reduce((acc, s) => acc + s.occupied, 0);
  const evOccPct = evTotal > 0 ? (evOccupied / evTotal) * 100 : 0;

  if (evTotal > 0 && evOccPct >= 75) {
    const recDoc = await OptimizationRecommendation.create({
      organizationId: orgId,
      facilityId: facility._id,
      type: 'CAPACITY_REALLOCATION',
      title: `High EV Spot Demand Detected`,
      description: `EV spots show sustained high occupancy (${Math.round(evOccPct)}%). Consider converting underutilized standard bays to EV charging spots.`,
      reason: `EV bay demand is consistently higher than conventional parking slot turnover.`,
      metrics: { evTotalSpots: evTotal, evOccupiedSpots: evOccupied, evOccupancyPercentage: Math.round(evOccPct) },
      recommendation: {
        action: 'REALLOCATE_BAYS',
        targetType: 'EV',
        suggestedAdditionalBays: 2
      },
      expectedImpact: {
        projectedUtilizationIncreasePct: +12.0
      },
      confidence: 0.85,
      status: 'PENDING',
      createdBy: userId,
      expiresAt: new Date(Date.now() + 14 * 86400000)
    });

    createdRecommendations.push(recDoc);

    await logAction({
      organizationId: orgId,
      userId,
      action: 'RECOMMENDATION_CREATED',
      entityType: 'OptimizationRecommendation',
      entityId: recDoc._id,
      newValue: { type: recDoc.type, title: recDoc.title },
      ipAddress
    });
  }

  return {
    facility: { id: String(facility._id), name: facility.name },
    period: { startDate: start, endDate: end },
    detectedConditions: {
      averageUtilization: avgUtilization,
      busiestHour: busiest.busiestHour,
      peakBookingVolume: busiest.peakBookingVolume,
      totalBookings: totalVolume
    },
    recommendationsCount: createdRecommendations.length,
    recommendations: createdRecommendations.map((r) => ({
      id: String(r._id),
      type: r.type,
      title: r.title,
      description: r.description,
      reason: r.reason,
      metrics: r.metrics,
      recommendation: r.recommendation,
      expectedImpact: r.expectedImpact,
      confidence: r.confidence,
      status: r.status,
      expiresAt: r.expiresAt
    }))
  };
}

// 2. Pricing Simulation (What-If Analysis)
async function simulatePricingChange({
  organizationId,
  facilityId,
  floorId = null,
  proposedPriceChangePct,
  proposedHourlyRate,
  startDate,
  endDate,
  priceElasticity = -0.5
}) {
  const orgId = toObjectId(organizationId);
  const facility = await verifyFacility(facilityId, organizationId);
  const { start, end, durationHours } = analyticsService.parseAnalyticsDateRange(startDate, endDate);

  const currentRate = facility.hourlyRate;
  let pctChange = 0;
  let targetRate = currentRate;

  if (proposedPriceChangePct !== undefined && proposedPriceChangePct !== null) {
    pctChange = Number(proposedPriceChangePct);
    targetRate = Math.max(1, Math.round(currentRate * (1 + pctChange / 100)));
  } else if (proposedHourlyRate !== undefined && proposedHourlyRate !== null) {
    targetRate = Number(proposedHourlyRate);
    pctChange = Number((((targetRate - currentRate) / currentRate) * 100).toFixed(1));
  } else {
    throw new AppError(400, 'MISSING_PROPOSED_PRICE', 'Either proposedPriceChangePct or proposedHourlyRate must be provided.');
  }

  const bookingMatch = {
    organizationId: orgId,
    lotId: facility._id,
    status: { $in: ['CONFIRMED', 'COMPLETED'] },
    startTime: { $gte: start, $lte: end }
  };
  if (floorId) bookingMatch.floorId = toObjectId(floorId);

  const [bookingHistory, totalSpots] = await Promise.all([
    Booking.aggregate([
      { $match: bookingMatch },
      {
        $group: {
          _id: null,
          bookingCount: { $sum: 1 },
          historicalRevenue: { $sum: '$totalAmount' },
          totalDurationHours: {
            $sum: { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 3600000] }
          }
        }
      }
    ]),
    ParkingSlot.countDocuments({
      organizationId: orgId,
      lotId: facility._id,
      isActive: true,
      ...(floorId ? { floorId: toObjectId(floorId) } : {})
    })
  ]);

  const hist = bookingHistory[0] || { bookingCount: 0, historicalRevenue: 0, totalDurationHours: 0 };
  const currentVolume = hist.bookingCount;
  const currentRevenue = hist.historicalRevenue;
  const currentDuration = hist.totalDurationHours;

  const totalCapacityHours = totalSpots * durationHours;
  const currentUtilization = totalCapacityHours > 0
    ? Number(((currentDuration / totalCapacityHours) * 100).toFixed(1))
    : 0;

  // Economic demand elasticity calculation
  // Elasticity E = % change in demand / % change in price
  // deltaDemandPct = E * pctChange
  const elasticity = typeof priceElasticity === 'number' ? priceElasticity : -0.5;
  const deltaDemandPct = Number((elasticity * pctChange).toFixed(2));

  // Projected bookings volume (clamped >= 0)
  const volumeMultiplier = Math.max(0, 1 + deltaDemandPct / 100);
  const simulatedVolume = Math.round(currentVolume * volumeMultiplier);

  // Projected duration hours
  const simulatedDuration = Number((currentDuration * volumeMultiplier).toFixed(1));

  // Projected revenue = simulatedVolume * (historicalRevenue / currentVolume) * (1 + pctChange / 100)
  const avgTicket = currentVolume > 0 ? currentRevenue / currentVolume : currentRate * 2;
  const simulatedAvgTicket = avgTicket * (1 + pctChange / 100);
  const simulatedRevenue = Math.round(simulatedVolume * simulatedAvgTicket);

  const revenueDelta = simulatedRevenue - currentRevenue;
  const revenueDeltaPct = currentRevenue > 0
    ? Number(((revenueDelta / currentRevenue) * 100).toFixed(1))
    : 0;

  const simulatedUtilization = totalCapacityHours > 0
    ? Number(Math.min(100, (simulatedDuration / totalCapacityHours) * 100).toFixed(1))
    : 0;

  return {
    facility: {
      id: String(facility._id),
      name: facility.name,
      currentHourlyRate: currentRate,
      currentDailyRate: facility.dailyRate
    },
    simulationInput: {
      proposedHourlyRate: targetRate,
      priceChangePercentage: pctChange,
      assumedPriceElasticity: elasticity,
      period: { startDate: start, endDate: end }
    },
    baselineMetrics: {
      bookingCount: currentVolume,
      revenue: currentRevenue,
      bookedHours: Number(currentDuration.toFixed(1)),
      utilizationPercentage: currentUtilization
    },
    simulatedMetrics: {
      projectedBookingCount: simulatedVolume,
      projectedRevenue: simulatedRevenue,
      projectedBookedHours: simulatedDuration,
      projectedUtilizationPercentage: simulatedUtilization
    },
    deltas: {
      revenueDelta,
      revenueDeltaPercentage: revenueDeltaPct,
      volumeDelta: simulatedVolume - currentVolume,
      volumeDeltaPercentage: deltaDemandPct,
      utilizationDeltaPercentage: Number((simulatedUtilization - currentUtilization).toFixed(1))
    },
    disclaimer: {
      isSimulation: true,
      model: 'Constant Elasticity Demand Model',
      assumptions: 'Assumes price elasticity of demand is constant and competitor/market conditions remain unchanged. Results are mathematical estimates, not guaranteed outcomes.'
    }
  };
}

// 3. List Recommendations with Filtering and Pagination
async function listRecommendations({
  organizationId,
  facilityId = null,
  type = null,
  status = null,
  startDate = null,
  endDate = null,
  page = 1,
  limit = 20
}) {
  const orgId = toObjectId(organizationId);
  const query = { organizationId: orgId };

  if (facilityId) query.facilityId = toObjectId(facilityId);
  if (type) query.type = type;
  if (status) query.status = status;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [total, recommendations] = await Promise.all([
    OptimizationRecommendation.countDocuments(query),
    OptimizationRecommendation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('facilityId', 'name city address')
      .populate('reviewedBy', 'name email role')
      .lean()
  ]);

  return {
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1
    },
    recommendations: recommendations.map((r) => ({
      ...r,
      id: String(r._id),
      facility: r.facilityId ? { id: String(r.facilityId._id), name: r.facilityId.name } : null
    }))
  };
}

// 4. Accept Recommendation (Explicit operator approval)
async function acceptRecommendation({ organizationId, recommendationId, userId, ipAddress = null }) {
  const orgId = toObjectId(organizationId);
  const rec = await OptimizationRecommendation.findOne({
    _id: toObjectId(recommendationId),
    organizationId: orgId
  });

  if (!rec) {
    throw new AppError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found in your organization.');
  }

  if (rec.status !== 'PENDING') {
    throw new AppError(409, 'INVALID_RECOMMENDATION_STATE', `Recommendation is already ${rec.status} and cannot be accepted.`);
  }

  let appliedPricingRule = null;

  // If this recommendation contains pricing actions, create the PricingRule
  if (rec.type === 'PRICING_SURGE' || rec.type === 'PRICING_DISCOUNT') {
    const ruleAction = rec.recommendation;
    if (ruleAction && ruleAction.action === 'CREATE_PRICING_RULE') {
      appliedPricingRule = await pricingService.createPricingRule(
        rec.facilityId,
        orgId,
        {
          name: ruleAction.name || `${rec.type} Rule`,
          spotType: ruleAction.spotType || 'ALL',
          daysOfWeek: ruleAction.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
          startTime: ruleAction.startTime || '00:00',
          endTime: ruleAction.endTime || '23:59',
          pricePerHour: ruleAction.pricePerHour,
          pricePerDay: ruleAction.pricePerDay || ruleAction.pricePerHour * 6,
          isActive: true
        },
        userId,
        ipAddress
      );

      await logAction({
        organizationId: orgId,
        userId,
        action: 'PRICING_RULE_APPLIED',
        entityType: 'PricingRule',
        entityId: appliedPricingRule.id,
        newValue: appliedPricingRule,
        ipAddress
      });
    }
  }

  rec.status = 'ACCEPTED';
  rec.reviewedBy = toObjectId(userId);
  rec.reviewedAt = new Date();
  await rec.save();

  await logAction({
    organizationId: orgId,
    userId,
    action: 'RECOMMENDATION_ACCEPTED',
    entityType: 'OptimizationRecommendation',
    entityId: rec._id,
    newValue: { status: 'ACCEPTED', appliedPricingRuleId: appliedPricingRule?.id || null },
    ipAddress
  });

  return {
    success: true,
    recommendation: {
      id: String(rec._id),
      status: rec.status,
      reviewedBy: String(userId),
      reviewedAt: rec.reviewedAt
    },
    appliedPricingRule
  };
}

// 5. Reject Recommendation
async function rejectRecommendation({ organizationId, recommendationId, userId, reason = null, ipAddress = null }) {
  const orgId = toObjectId(organizationId);
  const rec = await OptimizationRecommendation.findOne({
    _id: toObjectId(recommendationId),
    organizationId: orgId
  });

  if (!rec) {
    throw new AppError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found in your organization.');
  }

  if (rec.status !== 'PENDING') {
    throw new AppError(409, 'INVALID_RECOMMENDATION_STATE', `Recommendation is already ${rec.status} and cannot be rejected.`);
  }

  rec.status = 'REJECTED';
  rec.reviewedBy = toObjectId(userId);
  rec.reviewedAt = new Date();
  if (reason) {
    rec.reason = `${rec.reason} [Operator rejection reason: ${reason}]`;
  }
  await rec.save();

  await logAction({
    organizationId: orgId,
    userId,
    action: 'RECOMMENDATION_REJECTED',
    entityType: 'OptimizationRecommendation',
    entityId: rec._id,
    newValue: { status: 'REJECTED', rejectionReason: reason },
    ipAddress
  });

  return {
    success: true,
    recommendation: {
      id: String(rec._id),
      status: rec.status,
      reviewedBy: String(userId),
      reviewedAt: rec.reviewedAt
    }
  };
}

// 6. Overstay Detection
async function detectOverstays({
  organizationId,
  facilityId = null,
  startDate = null,
  endDate = null,
  statusFilter = null,
  page = 1,
  limit = 20
}) {
  const orgId = toObjectId(organizationId);
  if (facilityId) {
    await verifyFacility(facilityId, organizationId);
  }

  const now = new Date();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const bookingQuery = {
    organizationId: orgId,
    status: { $in: ['CONFIRMED', 'COMPLETED'] },
    endTime: { $lt: now }
  };
  if (facilityId) bookingQuery.lotId = toObjectId(facilityId);

  if (startDate || endDate) {
    bookingQuery.endTime = { $lt: now };
    if (startDate) bookingQuery.endTime.$gte = new Date(startDate);
    if (endDate) bookingQuery.endTime.$lte = new Date(endDate);
  }

  const [totalCandidateBookings, candidateBookings] = await Promise.all([
    Booking.countDocuments(bookingQuery),
    Booking.find(bookingQuery)
      .sort({ endTime: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('lotId', 'name city')
      .populate('slotId', 'number status level')
      .lean()
  ]);

  const overstayReports = [];

  for (const b of candidateBookings) {
    const spot = b.slotId;
    const lot = b.lotId;
    if (!spot || !lot) continue;

    // Check for departure OccupancyEvent around or after booking endTime
    const vacationEvent = await OccupancyEvent.findOne({
      spotId: spot._id,
      eventType: { $in: ['SPOT_VACATED', 'VACATED'] },
      timestamp: { $gte: b.startTime }
    }).sort({ timestamp: -1 }).lean();

    const expectedEnd = new Date(b.endTime);
    const toleranceMs = DEFAULT_THRESHOLDS.overstayToleranceMinutes * 60000;

    let overstayStatus = null;
    let overstayMinutes = 0;
    let confidence = 0.5;
    let reason = '';

    if (spot.status === 'OCCUPIED' && (!vacationEvent || vacationEvent.timestamp < expectedEnd)) {
      // Spot still marked OCCUPIED past booking end
      overstayStatus = 'ACTIVE_OVERSTAY';
      overstayMinutes = Math.max(1, Math.round((now.getTime() - expectedEnd.getTime()) / 60000));
      confidence = 0.95;
      reason = 'Booking window elapsed, but slot parking state remains OCCUPIED.';
    } else if (vacationEvent && vacationEvent.timestamp.getTime() > expectedEnd.getTime() + toleranceMs) {
      // Departure occurred significantly after scheduled booking end
      overstayStatus = 'RESOLVED_OVERSTAY';
      overstayMinutes = Math.round((vacationEvent.timestamp.getTime() - expectedEnd.getTime()) / 60000);
      confidence = 0.9;
      reason = `Departure event recorded at ${vacationEvent.timestamp.toISOString()}, exceeding booking end by ${overstayMinutes} minutes.`;
    } else if (!vacationEvent && spot.status === 'AVAILABLE') {
      // Departure event missing but spot is currently free
      overstayStatus = 'MISSING_DEPARTURE_EVENT';
      overstayMinutes = 0;
      confidence = 0.4;
      reason = 'Spot is currently AVAILABLE, but no departure event was recorded in operational activity.';
    } else {
      overstayStatus = 'NO_OVERSTAY';
      overstayMinutes = 0;
      confidence = 1.0;
      reason = 'Vehicle departed on schedule within grace tolerance.';
    }

    if (statusFilter && overstayStatus !== statusFilter) {
      continue;
    }

    overstayReports.push({
      bookingId: String(b._id),
      facilityId: String(lot._id),
      facilityName: lot.name,
      spotId: String(spot._id),
      spotNumber: spot.number,
      startTime: b.startTime,
      expectedEndTime: b.endTime,
      detectedDepartureTime: vacationEvent ? vacationEvent.timestamp : null,
      currentSpotStatus: spot.status,
      overstayStatus,
      estimatedOverstayMinutes: overstayMinutes,
      confidence,
      reason
    });
  }

  return {
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: totalCandidateBookings,
      totalPages: Math.ceil(totalCandidateBookings / safeLimit) || 1
    },
    overstays: overstayReports
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  generateDemandRecommendations,
  simulatePricingChange,
  listRecommendations,
  acceptRecommendation,
  rejectRecommendation,
  detectOverstays
};
