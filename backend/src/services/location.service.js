const { ParkingLot, ParkingSlot, Booking } = require('../models');
const { AppError } = require('../errors');

/**
 * Calculates straight-line geographic distance using the Haversine formula
 * @param {number} lat1 - Latitude of point 1 (in degrees)
 * @param {number} lon1 - Longitude of point 1 (in degrees)
 * @param {number} lat2 - Latitude of point 2 (in degrees)
 * @param {number} lon2 - Longitude of point 2 (in degrees)
 * @returns {number} Distance in kilometers
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return parseFloat((R * c).toFixed(3));
}

/**
 * Formats distance into a human-friendly string (e.g. '400 m' or '1.2 km')
 * @param {number} distanceKm - Distance in km
 * @returns {string} Formatted distance
 */
function formatDistance(distanceKm) {
  if (typeof distanceKm !== 'number' || isNaN(distanceKm)) return '—';
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Checks if facility is currently open based on operating hours
 * @param {string} openingTime - 'HH:MM'
 * @param {string} closingTime - 'HH:MM'
 * @returns {boolean}
 */
function isFacilityOpenNow(openingTime = '00:00', closingTime = '23:59') {
  if (openingTime === '00:00' && closingTime === '23:59') return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [openH, openM] = openingTime.split(':').map(Number);
  const [closeH, closeM] = closingTime.split(':').map(Number);
  const openMinutes = openH * 60 + (openM || 0);
  const closeMinutes = closeH * 60 + (closeM || 0);

  if (closeMinutes >= openMinutes) {
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  }
  // Overnight operating hours
  return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
}

/**
 * Discovers ParkSpot facilities near given geographic coordinates
 */
async function findNearbyFacilities({
  lat,
  lng,
  radiusKm = 3,
  sortBy = 'recommended',
  parkingType = null,
  minAvailable = null,
  maxPrice = null
}) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const radius = parseFloat(radiusKm);

  if (isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new AppError(400, 'INVALID_COORDINATES', 'Latitude must be a valid number between -90 and 90.');
  }
  if (isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new AppError(400, 'INVALID_COORDINATES', 'Longitude must be a valid number between -180 and 180.');
  }
  if (isNaN(radius) || radius <= 0 || radius > 100) {
    throw new AppError(400, 'INVALID_RADIUS', 'Radius must be a positive number between 0.1 and 100 km.');
  }

  // 1. Fetch active facilities that have valid geographic coordinates
  const lots = await ParkingLot.find({
    active: true,
    latitude: { $ne: null },
    longitude: { $ne: null }
  }).lean();

  if (lots.length === 0) {
    return {
      facilities: [],
      search: { latitude, longitude, radiusKm: radius, totalFound: 0 }
    };
  }

  // 2. Fetch all active slots for these lots
  const lotIds = lots.map((l) => l._id);
  const slots = await ParkingSlot.find({
    lotId: { $in: lotIds },
    isActive: true
  }).lean();

  // Also query active bookings to accurately determine available spots
  const now = new Date();
  const holdThreshold = new Date(Date.now() - 15 * 60 * 1000);
  const activeBookings = await Booking.find({
    slotId: { $in: slots.map((s) => s._id) },
    $or: [
      { status: 'CONFIRMED' },
      { status: 'PENDING_PAYMENT', createdAt: { $gt: holdThreshold } }
    ],
    startTime: { $lt: new Date(now.getTime() + 2 * 3600000) },
    endTime: { $gt: now }
  })
    .select('slotId')
    .lean();
  const bookedSlotIds = new Set(activeBookings.map((b) => String(b.slotId)));

  // 3. Compute distance, slot availability, and slot types for each lot
  const enriched = [];

  for (const lot of lots) {
    const lotLat = typeof lot.latitude === 'number' ? lot.latitude : null;
    const lotLng = typeof lot.longitude === 'number' ? lot.longitude : null;

    if (lotLat === null || lotLng === null) continue;

    const distanceKm = calculateHaversineDistance(latitude, longitude, lotLat, lotLng);

    // Apply radius boundary filter
    if (distanceKm > radius) continue;

    const lotSlots = slots.filter((s) => String(s.lotId) === String(lot._id));
    const totalSpots = lotSlots.length;
    const availableSpots = lotSlots.filter((s) => s.status === 'AVAILABLE' && !bookedSlotIds.has(String(s._id))).length;
    const supportedTypes = Array.from(new Set(lotSlots.map((s) => s.type).filter(Boolean)));

    // Apply optional parking type filter
    if (parkingType && parkingType !== 'ALL') {
      const typeUpper = parkingType.toUpperCase();
      if (!supportedTypes.includes(typeUpper)) {
        continue;
      }
    }

    // Apply optional minAvailable filter
    if (typeof minAvailable === 'number' && availableSpots < minAvailable) {
      continue;
    }

    // Apply optional maxPrice filter
    if (typeof maxPrice === 'number' && (lot.hourlyRate || 0) > maxPrice) {
      continue;
    }

    const isOpen = isFacilityOpenNow(lot.openingTime, lot.closingTime);
    const operatingHours =
      lot.openingTime === '00:00' && lot.closingTime === '23:59'
        ? 'Open 24/7'
        : `Open · ${lot.openingTime || '08:00'} - ${lot.closingTime || '22:00'}`;

    // Deterministic recommendation score: closer distance + high availability - high price penalty
    const availRatio = totalSpots > 0 ? availableSpots / totalSpots : 0;
    const recommendedScore =
      availRatio * 40 - distanceKm * 10 - (lot.hourlyRate || 40) * 0.15 + (isOpen ? 10 : -20);

    enriched.push({
      id: String(lot._id),
      _id: lot._id,
      name: lot.name,
      address: lot.address,
      city: lot.city,
      description: lot.description,
      latitude: lotLat,
      longitude: lotLng,
      distanceKm,
      distanceFormatted: formatDistance(distanceKm),
      totalSpots: totalSpots || 48,
      availableSpots,
      startingPrice: lot.hourlyRate || 40,
      hourlyRate: lot.hourlyRate || 40,
      dailyRate: lot.dailyRate || 300,
      openingTime: lot.openingTime || '00:00',
      closingTime: lot.closingTime || '23:59',
      operatingHours,
      isOpen,
      supportedTypes: supportedTypes.length > 0 ? supportedTypes : ['STANDARD', 'COMPACT', 'EV'],
      recommendedScore
    });
  }

  // 4. Apply sorting
  if (sortBy === 'nearest') {
    enriched.sort((a, b) => a.distanceKm - b.distanceKm);
  } else if (sortBy === 'price') {
    enriched.sort((a, b) => a.hourlyRate - b.hourlyRate);
  } else if (sortBy === 'availability') {
    enriched.sort((a, b) => b.availableSpots - a.availableSpots);
  } else {
    // Default: 'recommended'
    enriched.sort((a, b) => b.recommendedScore - a.recommendedScore);
  }

  return {
    facilities: enriched,
    search: {
      latitude,
      longitude,
      radiusKm: radius,
      totalFound: enriched.length
    }
  };
}

module.exports = {
  calculateHaversineDistance,
  formatDistance,
  isFacilityOpenNow,
  findNearbyFacilities
};
