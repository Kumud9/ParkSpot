const { AppError } = require('../errors');

function parseBookingWindow(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new AppError(400, 'INVALID_TIME_RANGE', 'End time must be later than start time.');
  }
  if (start < new Date(Date.now() - 60 * 1000)) {
    throw new AppError(400, 'INVALID_TIME_RANGE', 'Bookings cannot start in the past.');
  }
  return { start, end };
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

function isWithinTimeWindow(start, end, ruleStartStr = '00:00', ruleEndStr = '23:59') {
  const ruleStart = parseTimeToMinutes(ruleStartStr);
  const ruleEnd = parseTimeToMinutes(ruleEndStr);

  // Full day rule covers entire 24h
  if (ruleStart === 0 && (ruleEnd >= 1439 || ruleEnd === 0)) {
    return true;
  }

  const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  // Bookings of 24h or more encompass all hours of the day
  if (durationMinutes >= 1440) {
    return true;
  }

  const startMin = start.getUTCHours() * 60 + start.getUTCMinutes();
  const endMin = startMin + durationMinutes;

  if (ruleStart <= ruleEnd) {
    // Normal daytime window (e.g., 09:00 to 12:00)
    // Overlaps if start is before ruleEnd and end is after ruleStart
    const overlapsToday = startMin < ruleEnd && endMin > ruleStart;
    const overlapsTomorrow = endMin > 1440 && (endMin - 1440) > ruleStart && 0 < ruleEnd;
    return overlapsToday || overlapsTomorrow;
  } else {
    // Overnight window (e.g., 22:00 to 02:00)
    // Overlaps if either evening portion (>= ruleStart) or morning portion (<= ruleEnd)
    const inEvening = endMin > ruleStart;
    const inMorning = startMin < ruleEnd;
    const crossesIntoMorning = endMin > 1440 && (endMin - 1440) > 0;
    return inEvening || inMorning || crossesIntoMorning;
  }
}

function getRuleSpecificityScore(rule, requestedSpotType) {
  let score = 0;

  // 1. Specific spot type matching (+10)
  if (rule.spotType && rule.spotType !== 'ALL' && rule.spotType === requestedSpotType) {
    score += 10;
  }

  // 2. Specific time window (+5)
  const startTime = rule.startTime || '00:00';
  const endTime = rule.endTime || '23:59';
  const isCustomTime =
    startTime !== '00:00' ||
    (endTime !== '23:59' && endTime !== '00:00');
  if (isCustomTime) {
    score += 5;
  }

  // 3. Day of week specificity (fewer days = more specific, up to +6)
  if (Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0 && rule.daysOfWeek.length < 7) {
    score += (7 - rule.daysOfWeek.length);
  }

  return score;
}

function calculatePrice({ start, end, type, hourlyRate, dailyRate, spotType = 'STANDARD', rules = [] }) {
  const durationHours = (end - start) / 3600000;
  const units = type === 'DAILY' ? Math.ceil(durationHours / 24) : Math.ceil(durationHours);

  let effectiveHourly = Number(hourlyRate);
  let effectiveDaily = Number(dailyRate);

  // If initial rates are invalid/non-positive, resolve from active rules if available
  if (!Number.isFinite(effectiveHourly) || effectiveHourly <= 0) {
    if (Array.isArray(rules) && rules.length > 0) {
      const activeRule = rules.find((r) => r.isActive && r.pricePerHour > 0);
      if (activeRule) {
        effectiveHourly = activeRule.pricePerHour;
      }
    }
  }
  if (!Number.isFinite(effectiveDaily) || effectiveDaily <= 0) {
    if (Array.isArray(rules) && rules.length > 0) {
      const activeRule = rules.find((r) => r.isActive && r.pricePerDay > 0);
      if (activeRule) {
        effectiveDaily = activeRule.pricePerDay;
      }
    }
  }

  // Fallback to standard business default rates if still unconfigured
  if (!Number.isFinite(effectiveHourly) || effectiveHourly <= 0) {
    effectiveHourly = Number.isFinite(effectiveDaily) && effectiveDaily > 0 ? Math.max(1, Math.round(effectiveDaily / 6)) : 50;
  }
  if (!Number.isFinite(effectiveDaily) || effectiveDaily <= 0) {
    effectiveDaily = Math.max(1, Math.round(effectiveHourly * 6));
  }

  if (Array.isArray(rules) && rules.length > 0) {
    const dayUTC = start.getUTCDay();
    const dayLocal = start.getDay();

    const matchingRules = rules.filter((rule) => {
      if (!rule.isActive) return false;
      if (rule.spotType !== 'ALL' && rule.spotType !== spotType) return false;

      // Day of week match (check UTC and local for cross-environment compatibility)
      if (Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0) {
        if (!rule.daysOfWeek.includes(dayUTC) && !rule.daysOfWeek.includes(dayLocal)) {
          return false;
        }
      }

      // Time of day window match
      const startTimeStr = rule.startTime || '00:00';
      const endTimeStr = rule.endTime || '23:59';
      if (!isWithinTimeWindow(start, end, startTimeStr, endTimeStr)) {
        return false;
      }

      return true;
    });

    if (matchingRules.length > 0) {
      // Deterministically sort by specificity score descending
      matchingRules.sort((a, b) => getRuleSpecificityScore(b, spotType) - getRuleSpecificityScore(a, spotType));
      const bestRule = matchingRules[0];
      if (Number.isFinite(bestRule.pricePerHour) && bestRule.pricePerHour > 0) {
        effectiveHourly = bestRule.pricePerHour;
      }
      if (Number.isFinite(bestRule.pricePerDay) && bestRule.pricePerDay > 0) {
        effectiveDaily = bestRule.pricePerDay;
      }
    }
  }

  const rate = type === 'DAILY' ? effectiveDaily : effectiveHourly;
  const rawAmount = units * rate;
  const amount = Number(rawAmount.toFixed(2));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'INVALID_PRICING', 'Unable to calculate a valid positive price.');
  }
  return { units, amount };
}

/**
 * Authoritatively converts rupees to integer paise.
 * Enforces positive finite values, standard rounding, and Razorpay's minimum INR amount of ₹1.00 (100 paise).
 */
function rupeesToPaise(rupeesAmount) {
  const num = Number(rupeesAmount);
  if (!Number.isFinite(num) || num <= 0 || isNaN(num)) {
    throw new AppError(400, 'INVALID_PAYMENT_AMOUNT', 'Payable amount must be a valid positive number.');
  }
  const roundedRupees = Number(num.toFixed(2));
  const paise = Math.round(roundedRupees * 100);
  if (paise < 100) {
    throw new AppError(400, 'AMOUNT_BELOW_MINIMUM', 'Order amount must be at least ₹1.00 (100 paise).');
  }
  return paise;
}

module.exports = {
  parseBookingWindow,
  parseTimeToMinutes,
  isWithinTimeWindow,
  getRuleSpecificityScore,
  calculatePrice,
  rupeesToPaise
};
