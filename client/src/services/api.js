// ParkSpot Frontend API Service Layer
// Bridges Driver & Operator components to the Node.js Express backend
// Provides graceful progressive enhancement with fallback to initial mock data.

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Storage keys
const DRIVER_TOKEN_KEY = 'parkspot_driver_token';
const OPERATOR_TOKEN_KEY = 'parkspot_operator_token';

export const authStorage = {
  getDriverToken: () => localStorage.getItem(DRIVER_TOKEN_KEY),
  setDriverToken: (token) => localStorage.setItem(DRIVER_TOKEN_KEY, token),
  clearDriverToken: () => localStorage.removeItem(DRIVER_TOKEN_KEY),

  getOperatorToken: () => localStorage.getItem(OPERATOR_TOKEN_KEY),
  setOperatorToken: (token) => localStorage.setItem(OPERATOR_TOKEN_KEY, token),
  clearOperatorToken: () => localStorage.removeItem(OPERATOR_TOKEN_KEY)
};

/**
 * Standard fetch helper with error handling & JSON parsing
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = data?.error?.message || data?.message || `HTTP error ${res.status}`;
      const err = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (err) {
    console.warn(`[ParkSpot API] Request to ${url} failed:`, err.message);
    throw err;
  }
}

/**
 * Normalizes backend spot into frontend format
 */
export function normalizeSpot(slot, defaultRate = 40) {
  let status = slot.status || 'AVAILABLE';
  if (slot.available === false && status === 'AVAILABLE') {
    status = 'OCCUPIED';
  }
  return {
    id: slot._id ? String(slot._id) : slot.id,
    number: slot.number,
    floor: slot.level || slot.floor || 'Floor 1',
    type: slot.type || 'STANDARD',
    status: status,
    rate: slot.hourlyRate || defaultRate,
    coordinates: slot.coordinates || null
  };
}

/**
 * Normalizes backend facility into frontend format
 */
export function normalizeFacility(lot) {
  const totalSlots = lot.totalSlots ?? (lot.slots ? lot.slots.length : 48);
  const availableSlots = lot.availableSlots ?? (lot.slots ? lot.slots.filter((s) => s.status === 'AVAILABLE' && s.available !== false).length : 18);
  const occupiedSpots = lot.slots ? lot.slots.filter((s) => s.status === 'OCCUPIED' || s.available === false).length : Math.max(0, Math.floor(totalSlots * 0.5));
  const reservedSpots = lot.slots ? lot.slots.filter((s) => s.status === 'RESERVED').length : Math.max(0, Math.floor(totalSlots * 0.1));
  const maintenanceSpots = lot.slots ? lot.slots.filter((s) => s.status === 'MAINTENANCE' || s.status === 'BLOCKED').length : 1;

  // Map spots if present
  const spots = lot.slots && lot.slots.length > 0
    ? lot.slots.map((s) => normalizeSpot(s, lot.hourlyRate))
    : null;

  // Extract available floors from spots or lot
  const floorSet = new Set();
  if (lot.floors && Array.isArray(lot.floors)) {
    lot.floors.forEach((fl) => floorSet.add(fl.name || fl));
  }
  if (spots) {
    spots.forEach((sp) => {
      if (sp.floor) floorSet.add(sp.floor);
    });
  }
  const floors = floorSet.size > 0 ? Array.from(floorSet) : ['Floor 1', 'Floor 2', 'Floor 3'];

  return {
    id: lot._id ? String(lot._id) : (lot.id || 'fac-default'),
    name: lot.name,
    address: lot.address,
    city: lot.city || 'Delhi',
    distance: lot.distance || '0.5 km away',
    openStatus: lot.openingTime === '00:00' && lot.closingTime === '23:59' ? 'Open 24/7' : `Open · ${lot.openingTime || '08:00'} - ${lot.closingTime || '22:00'}`,
    openingHours: lot.openingTime === '00:00' && lot.closingTime === '23:59' ? '24 Hours' : `${lot.openingTime || '08:00'} – ${lot.closingTime || '22:00'}`,
    rating: lot.rating || 4.8,
    reviewsCount: lot.reviewsCount || 128,
    hourlyRate: lot.hourlyRate || 50,
    dailyRate: lot.dailyRate || 350,
    totalSpots: totalSlots,
    availableSpots: availableSlots,
    occupiedSpots: occupiedSpots,
    reservedSpots: reservedSpots,
    maintenanceSpots: maintenanceSpots,
    type: lot.description ? lot.description.slice(0, 32) : 'Multi-level Facility',
    spots: spots,
    floors: floors
  };
}

// -------------------------------------------------------------
// API CLIENT METHODS
// -------------------------------------------------------------

export const api = {
  /**
   * Health / Connectivity check
   */
  async checkHealth() {
    try {
      const data = await request('/health');
      return data?.status === 'ok';
    } catch {
      return false;
    }
  },

  /**
   * Auth: Login user / operator
   */
  async login(email, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return data;
  },

  /**
   * Public Facilities Discovery
   */
  async getFacilities(city) {
    const query = city ? `?city=${encodeURIComponent(city)}` : '';
    const data = await request(`/lots${query}`);
    const rawList = data.lots || data.facilities || [];
    return rawList.map(normalizeFacility);
  },

  /**
   * Public Facility Detail by ID with spots (supports optional time window for conflict checking)
   */
  async getFacility(id, window = null) {
    let query = '';
    if (window?.startTime && window?.endTime) {
      query = `?startTime=${encodeURIComponent(new Date(window.startTime).toISOString())}&endTime=${encodeURIComponent(new Date(window.endTime).toISOString())}`;
    }
    const data = await request(`/lots/${id}${query}`);
    const raw = data.lot || data.facility;
    return raw ? normalizeFacility(raw) : null;
  },

  /**
   * Driver: Ensure authenticated session for driver API requests
   */
  async ensureDriverAuth() {
    let token = authStorage.getDriverToken();
    if (token) return token;
    try {
      const auth = await api.login('user@parkspot.test', 'Pass@12345');
      if (auth?.token) {
        authStorage.setDriverToken(auth.token);
        return auth.token;
      }
    } catch (e) {
      console.info('[ParkSpot API] Auto-driver auth fallback note:', e.message);
    }
    return null;
  },

  /**
   * Driver: List user bookings
   */
  async getBookings() {
    await api.ensureDriverAuth();
    const token = authStorage.getDriverToken();
    if (!token) return null;
    const data = await request('/bookings', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data.bookings || [];
  },

  /**
   * Driver: Create booking
   */
  async createBooking(bookingPayload) {
    await api.ensureDriverAuth();
    const token = authStorage.getDriverToken();
    const data = await request('/bookings', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(bookingPayload)
    });
    return data.booking;
  },

  /**
   * Driver: Cancel booking
   */
  async cancelBooking(bookingId) {
    await api.ensureDriverAuth();
    const token = authStorage.getDriverToken();
    const data = await request(`/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data.booking;
  },

  /**
   * Payment: Create payment order for a booking
   */
  async createPaymentOrder(bookingId) {
    await api.ensureDriverAuth();
    const token = authStorage.getDriverToken();
    const data = await request('/v1/payments/order', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ bookingId })
    });
    return data;
  },

  /**
   * Payment: Verify completed payment
   */
  async verifyPayment({ orderId, paymentId, signature }) {
    await api.ensureDriverAuth();
    const token = authStorage.getDriverToken();
    const data = await request('/v1/payments/verify', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ orderId, paymentId, signature })
    });
    return data;
  },

  /**
   * Operator: Ingest operational spot event
   */
  async ingestEvent(facilityId, payload) {
    const token = authStorage.getOperatorToken();
    const data = await request(`/v1/facilities/${facilityId}/events`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(payload)
    });
    return data;
  },

  /**
   * Operator: Get live facility occupancy
   */
  async getOccupancy(facilityId) {
    const token = authStorage.getOperatorToken();
    const data = await request(`/v1/facilities/${facilityId}/occupancy`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Get audit logs
   */
  async getAuditLogs(params = {}) {
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/v1/audit-logs${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data.auditLogs || [];
  },

  /**
   * Operator: Get optimization recommendations
   */
  async getRecommendations(facilityId) {
    const token = authStorage.getOperatorToken();
    const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : '';
    const data = await request(`/v1/optimization/recommendations${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data.recommendations || [];
  },

  /**
   * Operator: Accept recommendation
   */
  async acceptRecommendation(id) {
    const token = authStorage.getOperatorToken();
    const data = await request(`/v1/optimization/recommendations/${id}/accept`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Reject recommendation
   */
  async rejectRecommendation(id) {
    const token = authStorage.getOperatorToken();
    const data = await request(`/v1/optimization/recommendations/${id}/reject`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Get demand forecast
   */
  async getDemandForecast(facilityId, horizon = 24, granularity = 'hour') {
    const token = authStorage.getOperatorToken();
    const data = await request(`/v1/forecasting/demand?facilityId=${facilityId}&horizon=${horizon}&granularity=${granularity}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Get overstays
   */
  async getOverstays(facilityId) {
    const token = authStorage.getOperatorToken();
    const query = facilityId ? `?facilityId=${facilityId}` : '';
    const data = await request(`/v1/optimization/overstays${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data.overstays || [];
  }
};
