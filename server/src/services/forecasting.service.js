const mongoose = require('mongoose');
const { ParkingLot, ParkingSlot, Booking } = require('../models');
const { AppError } = require('../errors');
const { logAction } = require('./audit.service');
const { mlForecastService } = require('./ml-forecast.service');

function toObjectId(id) {
  if (!id) return null;
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

const MAX_HOURLY_HORIZON = 168; // 7 days in hours
const MAX_DAILY_HORIZON = 30;   // 30 days

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

async function getFacilityDemandForecast({
  organizationId,
  facilityId,
  startDate = null,
  endDate = null,
  horizon = 24,
  granularity = 'hour',
  userId = null,
  ipAddress = null
}) {
  const orgId = toObjectId(organizationId);
  const facility = await verifyFacility(facilityId, organizationId);

  const isDaily = granularity === 'day';
  const parsedHorizon = Math.max(1, Number(horizon) || (isDaily ? 7 : 24));
  const maxHorizon = isDaily ? MAX_DAILY_HORIZON : MAX_HOURLY_HORIZON;

  if (parsedHorizon > maxHorizon) {
    throw new AppError(
      400,
      'INVALID_HORIZON',
      `Forecast horizon cannot exceed ${maxHorizon} ${isDaily ? 'days' : 'hours'}.`
    );
  }

  const anchorStart = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(anchorStart.getTime())) {
    throw new AppError(400, 'INVALID_DATE', 'startDate must be a valid ISO date string.');
  }

  // Calculate forecast window end
  const durationMs = isDaily ? parsedHorizon * 86400000 : parsedHorizon * 3600000;
  const forecastEnd = endDate ? new Date(endDate) : new Date(anchorStart.getTime() + durationMs);

  // 1. Get total active spots in facility
  const totalActiveSpots = await ParkingSlot.countDocuments({
    organizationId: orgId,
    lotId: facility._id,
    isActive: true
  });

  // 2. Query historical bookings for this facility over the past 60 days
  const historicalLookbackStart = new Date(anchorStart.getTime() - 60 * 86400000);
  const historicalStats = await Booking.aggregate([
    {
      $match: {
        organizationId: orgId,
        lotId: facility._id,
        status: { $in: ['CONFIRMED', 'COMPLETED'] },
        startTime: { $gte: historicalLookbackStart, $lt: anchorStart }
      }
    },
    {
      $project: {
        dayOfWeek: { $dayOfWeek: '$startTime' }, // 1 (Sun) to 7 (Sat)
        hourOfDay: { $hour: '$startTime' },      // 0 to 23
        durationMinutes: { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 60000] },
        totalAmount: 1,
        startTime: 1
      }
    },
    {
      $group: {
        _id: {
          dayOfWeek: '$dayOfWeek',
          hourOfDay: '$hourOfDay'
        },
        count: { $sum: 1 },
        totalMinutes: { $sum: '$durationMinutes' },
        totalRevenue: { $sum: '$totalAmount' }
      }
    }
  ]);

  // Overall sample size and average booking duration
  const totalHistoricalBookings = historicalStats.reduce((acc, h) => acc + h.count, 0);
  const totalMinutesSum = historicalStats.reduce((acc, h) => acc + h.totalMinutes, 0);
  const avgDurationMinutes = totalHistoricalBookings > 0
    ? Math.round(totalMinutesSum / totalHistoricalBookings)
    : 120;
  const avgDurationHours = Math.max(0.5, avgDurationMinutes / 60);

  // Recent 7-day momentum vs 60-day baseline to compute trend multiplier
  const sevenDaysAgo = new Date(anchorStart.getTime() - 7 * 86400000);
  const recent7DayCount = await Booking.countDocuments({
    organizationId: orgId,
    lotId: facility._id,
    status: { $in: ['CONFIRMED', 'COMPLETED'] },
    startTime: { $gte: sevenDaysAgo, $lt: anchorStart }
  });

  // Normalized weekly rate comparison
  const weeklyBaseline = (totalHistoricalBookings / 60) * 7;
  let trendMultiplier = 1.0;
  let trendLabel = 'STABLE';

  if (weeklyBaseline > 0 && recent7DayCount > 0) {
    const ratio = recent7DayCount / weeklyBaseline;
    trendMultiplier = Number(Math.min(1.8, Math.max(0.5, ratio)).toFixed(2));
    if (ratio > 1.08) trendLabel = 'RISING';
    else if (ratio < 0.92) trendLabel = 'FALLING';
  }

  // Build lookup map for (dayOfWeek, hourOfDay)
  const slotMap = new Map();
  for (const s of historicalStats) {
    const jsDay = s._id.dayOfWeek - 1; // Convert 1..7 to 0..6
    const key = `${jsDay}_${s._id.hourOfDay}`;
    slotMap.set(key, s);
  }

  // Model confidence based on sample depth
  const isSparse = totalHistoricalBookings < 3;
  const baselineConfidence = isSparse
    ? 0.35
    : Number(Math.min(0.92, 0.50 + Math.log10(totalHistoricalBookings + 1) * 0.20).toFixed(2));

  // Contributing factors list
  const contributingFactors = [];
  if (isSparse) {
    contributingFactors.push('Sparse historical bookings dataset (<3 events); prior baseline applied.');
  } else {
    contributingFactors.push(`Trained on ${totalHistoricalBookings} historical reservation events over 60-day window.`);
    contributingFactors.push(`Average booking duration measured at ${avgDurationMinutes} minutes.`);
    if (trendLabel === 'RISING') {
      contributingFactors.push(`Recent 7-day demand shows upward momentum (+${Math.round((trendMultiplier - 1) * 100)}%).`);
    } else if (trendLabel === 'FALLING') {
      contributingFactors.push(`Recent 7-day demand shows tapering volume (-${Math.round((1 - trendMultiplier) * 100)}%).`);
    } else {
      contributingFactors.push('Recent volume aligns consistently with 60-day baseline.');
    }
  }

  // Determine model mode
  const modelMode = (process.env.FORECAST_MODEL_MODE || 'auto').toLowerCase();
  let activeModel = 'baseline';
  let activeModelVersion = 'baseline-moving-average-v1.0';
  let fallbackUsed = false;
  let fallbackReason = null;

  // Build baseline hourly prediction items
  const baselineBuckets = [];
  let baselinePeakDemand = 0;
  let baselinePeakTime = null;
  let baselineTotalUtil = 0;

  for (let i = 0; i < parsedHorizon; i++) {
    const bucketTime = isDaily
      ? new Date(anchorStart.getTime() + i * 86400000)
      : new Date(anchorStart.getTime() + i * 3600000);

    const dayOfWeek = bucketTime.getUTCDay();
    const hourOfDay = isDaily ? 12 : bucketTime.getUTCHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    let basePredictedBookings = 0;

    if (isDaily) {
      let daySum = 0;
      for (let h = 0; h < 24; h++) {
        const slot = slotMap.get(`${dayOfWeek}_${h}`);
        if (slot) {
          daySum += (slot.count / 8);
        }
      }
      basePredictedBookings = Math.round(daySum * trendMultiplier);
    } else {
      const slot = slotMap.get(`${dayOfWeek}_${hourOfDay}`);
      if (slot) {
        const avgPerHour = slot.count / 8;
        basePredictedBookings = Math.round(avgPerHour * trendMultiplier);
      }
    }

    if (isSparse && basePredictedBookings === 0 && (hourOfDay >= 9 && hourOfDay <= 18)) {
      basePredictedBookings = isWeekend ? 1 : 2;
    }

    const predictedOccupied = Math.min(
      totalActiveSpots,
      Math.round(basePredictedBookings * (isDaily ? 1 : avgDurationHours))
    );

    const predictedUtil = totalActiveSpots > 0
      ? Number(Math.min(100, (predictedOccupied / totalActiveSpots) * 100).toFixed(1))
      : 0;

    if (basePredictedBookings > baselinePeakDemand) {
      baselinePeakDemand = basePredictedBookings;
      baselinePeakTime = bucketTime.toISOString();
    }

    baselineTotalUtil += predictedUtil;

    baselineBuckets.push({
      timestamp: bucketTime.toISOString(),
      ...(isDaily ? {} : { hourOfDay }),
      dayOfWeek,
      isWeekend,
      predictedBookings: basePredictedBookings,
      predictedOccupiedSpots: predictedOccupied,
      predictedUtilization: predictedUtil,
      confidence: baselineConfidence
    });
  }

  let finalPredictedDemand = baselineBuckets;
  let finalPeakDemand = baselinePeakDemand;
  let finalPeakTime = baselinePeakTime;
  let finalAvgUtil = parsedHorizon > 0 ? Number((baselineTotalUtil / parsedHorizon).toFixed(1)) : 0;

  // ML Service attempt if mode is 'ml' or 'auto' (and granularity is hourly)
  if (!isDaily && (modelMode === 'ml' || modelMode === 'auto')) {
    if (modelMode === 'auto' && isSparse) {
      fallbackUsed = true;
      fallbackReason = 'INSUFFICIENT_HISTORICAL_DATA';
      contributingFactors.push('Auto mode: historical data is sparse; falling back to Phase 3.1 baseline.');
    } else {
      // Build ML feature vector rows
      let prevDemand = 0;
      const mlFeatures = baselineBuckets.map((b) => {
        const h = b.hourOfDay;
        const d = b.dayOfWeek;
        const isW = b.isWeekend ? 1 : 0;
        const prevDaySlot = slotMap.get(`${d}_${h}`);
        const previousDayDemand = prevDaySlot ? prevDaySlot.count : 0;
        const rollingHourlyAvg = Number((weeklyBaseline / 168).toFixed(3));
        const isPeak = (isW && h >= 12 && h <= 18) || (!isW && h >= 10 && h <= 16) ? 1 : 0;

        const row = {
          timestamp: b.timestamp,
          hourOfDay: h,
          dayOfWeek: d,
          isWeekend: isW,
          facilityCapacity: Math.max(1, totalActiveSpots),
          historicalBookingCount: b.predictedBookings,
          historicalUtilization: b.predictedUtilization,
          averageDuration: avgDurationHours,
          rolling7DayDemand: rollingHourlyAvg,
          previousHourDemand: prevDemand,
          previousDayDemand,
          peakHourIndicator: isPeak
        };
        prevDemand = b.predictedBookings;
        return row;
      });

      const mlRes = await mlForecastService.requestMLPrediction({
        facilityId: String(facility._id),
        horizon: parsedHorizon,
        features: mlFeatures
      });

      if (mlRes.success && Array.isArray(mlRes.predictions) && mlRes.predictions.length > 0) {
        activeModel = 'ml';
        activeModelVersion = mlRes.modelVersion;
        fallbackUsed = false;
        fallbackReason = null;

        let mlPeakDemand = 0;
        let mlPeakTime = null;
        let mlTotalUtil = 0;

        finalPredictedDemand = mlRes.predictions.map((p, idx) => {
          const baseBucket = baselineBuckets[idx] || {};
          const bookings = p.predictedDemand;
          const occupied = Math.min(totalActiveSpots, Math.round(bookings * avgDurationHours));
          const util = totalActiveSpots > 0
            ? Number(Math.min(100, (occupied / totalActiveSpots) * 100).toFixed(1))
            : 0;

          if (bookings > mlPeakDemand) {
            mlPeakDemand = bookings;
            mlPeakTime = p.timestamp || baseBucket.timestamp;
          }
          mlTotalUtil += util;

          return {
            timestamp: p.timestamp || baseBucket.timestamp,
            hourOfDay: p.hourOfDay !== undefined ? p.hourOfDay : baseBucket.hourOfDay,
            dayOfWeek: p.dayOfWeek !== undefined ? p.dayOfWeek : baseBucket.dayOfWeek,
            isWeekend: baseBucket.isWeekend,
            predictedBookings: bookings,
            predictedOccupiedSpots: occupied,
            predictedUtilization: util,
            confidence: p.confidence
          };
        });

        finalPeakDemand = mlPeakDemand;
        finalPeakTime = mlPeakTime;
        finalAvgUtil = parsedHorizon > 0 ? Number((mlTotalUtil / parsedHorizon).toFixed(1)) : 0;

        contributingFactors.push(`Predictions generated by Gradient Boosting ML model (${activeModelVersion}).`);
      } else {
        fallbackUsed = true;
        fallbackReason = mlRes.reason || 'ML_SERVICE_UNAVAILABLE';
        contributingFactors.push(`ML service fallback triggered (${fallbackReason}). Using Phase 3.1 moving-average baseline.`);
      }
    }
  }

  const result = {
    facility: {
      id: String(facility._id),
      name: facility.name,
      totalSpots: totalActiveSpots,
      baseHourlyRate: facility.hourlyRate
    },
    forecastWindow: {
      start: anchorStart.toISOString(),
      end: forecastEnd.toISOString()
    },
    granularity: isDaily ? 'day' : 'hour',
    horizon: parsedHorizon,
    model: activeModel,
    modelVersion: activeModelVersion,
    fallbackUsed,
    fallbackReason,
    summary: {
      averagePredictedUtilization: finalAvgUtil,
      peakPredictedTime: finalPeakTime || anchorStart.toISOString(),
      peakPredictedDemand: finalPeakDemand,
      baselineDemand: Number((totalHistoricalBookings / 60).toFixed(2)),
      trend: trendLabel,
      trendMultiplier
    },
    predictedDemand: finalPredictedDemand,
    contributingFactors
  };

  await logAction({
    organizationId: orgId,
    userId,
    action: 'FORECAST_GENERATED',
    entityType: 'ParkingLot',
    entityId: facility._id,
    newValue: {
      granularity: result.granularity,
      horizon: result.horizon,
      avgUtilization: finalAvgUtil,
      trend: trendLabel,
      model: activeModel,
      fallbackUsed
    },
    ipAddress
  });

  return result;
}

module.exports = {
  getFacilityDemandForecast
};
