// ParkSpot Frontend API Service Layer
// Bridges Driver & Operator components to the Node.js Express backend
// Provides graceful progressive enhancement with fallback to initial mock data.

// Base backend host origin from env (e.g. 'https://parkspot-backend.onrender.com')
// In local development, defaults to '' so requests use relative paths proxied by Vite
const RAW_ENV_URL = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

/**
 * Resolves a full request URL given an endpoint path.
 * Ensures the canonical /api/v1 prefix is consistently applied when calling the backend,
 * gracefully handles paths with or without /api or /v1, and supports root endpoints like /health.
 */
export function buildApiUrl(endpoint) {
  if (!endpoint) return RAW_ENV_URL || '';

  // Return as-is if already an absolute HTTP/HTTPS URL
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Root health endpoints
  if (path === '/health' || path === '/api/health' || path.startsWith('/api/health/')) {
    if (!RAW_ENV_URL) {
      return path.startsWith('/api/') ? path : `/api${path}`;
    }
    return `${RAW_ENV_URL}${path}`;
  }

  // Legacy lots endpoints support
  if (path === '/lots' || path.startsWith('/lots/')) {
    const lotPath = `/api${path}`;
    return RAW_ENV_URL ? `${RAW_ENV_URL}${lotPath}` : lotPath;
  }

  // Canonicalize path under /api/v1
  let canonicalPath = path;
  if (canonicalPath.startsWith('/api/v1/')) {
    // already full canonical path
  } else if (canonicalPath.startsWith('/v1/')) {
    canonicalPath = `/api${canonicalPath}`;
  } else if (canonicalPath.startsWith('/api/')) {
    // e.g. /api/auth/login -> /api/v1/auth/login
    canonicalPath = `/api/v1${canonicalPath.slice(4)}`;
  } else {
    // e.g. /auth/login -> /api/v1/auth/login
    canonicalPath = `/api/v1${canonicalPath}`;
  }

  if (RAW_ENV_URL) {
    if (RAW_ENV_URL.endsWith('/api/v1')) {
      const strippedPath = canonicalPath.replace(/^\/api\/v1/, '');
      return `${RAW_ENV_URL}${strippedPath}`;
    }
    if (RAW_ENV_URL.endsWith('/api')) {
      const strippedPath = canonicalPath.replace(/^\/api/, '');
      return `${RAW_ENV_URL}${strippedPath}`;
    }
    return `${RAW_ENV_URL}${canonicalPath}`;
  }

  return canonicalPath;
}

export const API_BASE = RAW_ENV_URL ? `${RAW_ENV_URL}/api/v1` : '/api/v1';

// Storage keys
const AUTH_TOKEN_KEY = 'parkspot_auth_token';
const AUTH_USER_KEY = 'parkspot_auth_user';

export const authStorage = {
  getToken: () => localStorage.getItem(AUTH_TOKEN_KEY),
  setToken: (token) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  },
  clearToken: () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem('parkspot_driver_token');
    localStorage.removeItem('parkspot_operator_token');
  },
  getUser: () => {
    try {
      const u = localStorage.getItem(AUTH_USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  setUser: (user) => {
    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  },
  clearUser: () => localStorage.removeItem(AUTH_USER_KEY),

  // Backwards compatibility wrappers
  getDriverToken: () => localStorage.getItem(AUTH_TOKEN_KEY),
  setDriverToken: (token) => localStorage.setItem(AUTH_TOKEN_KEY, token),
  clearDriverToken: () => localStorage.removeItem(AUTH_TOKEN_KEY),

  getOperatorToken: () => localStorage.getItem(AUTH_TOKEN_KEY),
  setOperatorToken: (token) => localStorage.setItem(AUTH_TOKEN_KEY, token),
  clearOperatorToken: () => localStorage.removeItem(AUTH_TOKEN_KEY)
};

/**
 * Standard fetch helper with error handling & JSON parsing
 */
async function request(endpoint, options = {}) {
  const url = buildApiUrl(endpoint);
  const rawToken = authStorage.getToken();
  const cleanToken = (typeof rawToken === 'string' && rawToken.trim() && rawToken !== 'null' && rawToken !== 'undefined')
    ? rawToken.trim().replace(/^Bearer\s+/i, '')
    : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(cleanToken ? { Authorization: `Bearer ${cleanToken}` } : {}),
    ...(options.headers || {})
  };

  // Strip duplicate Bearer prefixes, null, or undefined if passed via options
  if (headers.Authorization) {
    const stripped = String(headers.Authorization).replace(/^(Bearer\s+)+/i, '').trim();
    if (!stripped || stripped === 'null' || stripped === 'undefined') {
      delete headers.Authorization;
    } else {
      headers.Authorization = `Bearer ${stripped}`;
    }
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        authStorage.clearToken();
      }
      let errorMsg = data?.error?.message || data?.message || `HTTP error ${res.status}`;
      if (data?.error?.details?.fieldErrors) {
        const parts = [];
        for (const [field, msgs] of Object.entries(data.error.details.fieldErrors)) {
          if (Array.isArray(msgs) && msgs.length > 0) {
            parts.push(`${field}: ${msgs.join(', ')}`);
          }
        }
        if (parts.length > 0 && errorMsg.includes('One or more fields are invalid')) {
          errorMsg = parts.join('. ');
        }
      }
      const err = new Error(errorMsg);
      err.status = res.status;
      err.code = data?.error?.code;
      err.data = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.status !== 401 && !url.includes('/auth/me')) {
      console.warn(`[ParkSpot API] Request to ${url} failed:`, err.message);
    }
    throw err;
  }
}

/**
 * Normalizes backend spot into frontend format
 */
export function normalizeSpot(slot, defaultRate = 40) {
  let status = slot.status || 'AVAILABLE';
  if (slot.available === false && status === 'AVAILABLE') {
    status = 'RESERVED';
  }
  return {
    id: slot._id ? String(slot._id) : (slot.id || `spot-${slot.number}`),
    number: slot.number,
    floor: slot.level || slot.floor || 'Ground Floor',
    level: slot.level || slot.floor || 'Ground Floor',
    type: slot.type || 'STANDARD',
    status: status,
    rate: slot.hourlyRate || defaultRate,
    coordinates: slot.coordinates || null,
    bookingInfo: slot.bookingInfo || null
  };
}

/**
 * Normalizes backend facility into frontend format
 */
export function normalizeFacility(lot) {
  // Map spots if present in either slots or spots format
  const rawSpots = (lot.slots && Array.isArray(lot.slots) && lot.slots.length > 0)
    ? lot.slots
    : (Array.isArray(lot.spots) && lot.spots.length > 0 ? lot.spots : null);

  const spots = rawSpots ? rawSpots.map((s) => normalizeSpot(s, lot.hourlyRate)) : null;

  const totalSlots = spots ? spots.length : (lot.totalSlots ?? lot.capacity ?? 48);
  const availableSlots = spots
    ? spots.filter((s) => s.status === 'AVAILABLE' && s.available !== false).length
    : (lot.availableSlots ?? Math.round(totalSlots * 0.5));
  const occupiedSpots = spots
    ? spots.filter((s) => s.status === 'OCCUPIED' || s.available === false).length
    : (lot.occupiedSpots ?? Math.round(totalSlots * 0.25));
  const reservedSpots = spots
    ? spots.filter((s) => s.status === 'RESERVED').length
    : (lot.reservedSpots ?? Math.round(totalSlots * 0.18));
  const maintenanceSpots = spots
    ? spots.filter((s) => s.status === 'MAINTENANCE' || s.status === 'BLOCKED').length
    : (lot.maintenanceSpots ?? Math.round(totalSlots * 0.06));

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
  const floors = floorSet.size > 0 ? Array.from(floorSet) : ['Ground Floor', 'Level 1', 'Level 2'];

  return {
    id: lot._id ? String(lot._id) : (lot.id || 'fac-default'),
    _id: lot._id ? String(lot._id) : (lot.id || 'fac-default'),
    name: lot.name,
    address: lot.address,
    city: lot.city || 'Vadodara',
    distance: lot.distance || '0.5 km away',
    openStatus: lot.openingTime === '00:00' && lot.closingTime === '23:59' ? 'Open 24/7' : `Open · ${lot.openingTime || '07:00'} - ${lot.closingTime || '22:00'}`,
    openingHours: lot.openingTime === '00:00' && lot.closingTime === '23:59' ? '24 Hours' : `${lot.openingTime || '07:00'} – ${lot.closingTime || '22:00'}`,
    rating: lot.rating || 4.8,
    reviewsCount: lot.reviewsCount || 128,
    hourlyRate: lot.hourlyRate || 20,
    dailyRate: lot.dailyRate || 120,
    totalSpots: totalSlots,
    totalSlots: totalSlots,
    availableSlots: availableSlots,
    occupiedSpots: occupiedSpots,
    reservedSpots: reservedSpots,
    maintenanceSpots: maintenanceSpots,
    type: lot.description ? lot.description.slice(0, 32) : 'Campus Multi-level Parking',
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
  async login(email, password, accountType = null) {
    const data = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        ...(accountType ? { accountType: String(accountType).toUpperCase() } : {})
      })
    });
    return data;
  },

  /**
   * Auth: Register / Signup new user (Driver or Operator)
   */
  async register({ email, password, name, accountType, organizationName, role }) {
    const data = await request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, accountType, organizationName, role })
    });
    return data;
  },

  /**
   * Auth: Two-step signup alias
   */
  async signup(payload) {
    return api.register(payload);
  },

  /**
   * Auth: Verify 6-digit signup TOTP setup challenge
   */
  async verifyMfaSetup({ email, code, otp, setupToken, token }) {
    const data = await request('/api/v1/auth/mfa/verify-setup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        code: code || otp,
        setupToken: setupToken || token
      })
    });
    return data;
  },

  /**
   * Auth: Verify 6-digit TOTP code during login
   */
  async verifyMfaLogin({ email, code, otp, mfaToken, token }) {
    const data = await request('/api/v1/auth/mfa/verify-login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        code: code || otp,
        mfaToken: mfaToken || token
      })
    });
    return data;
  },

  /**
   * Auth: Verify one-time backup recovery code during login
   */
  async verifyMfaRecovery({ email, recoveryCode, mfaToken, token }) {
    const data = await request('/api/v1/auth/mfa/verify-recovery', {
      method: 'POST',
      body: JSON.stringify({
        email,
        recoveryCode,
        mfaToken: mfaToken || token
      })
    });
    return data;
  },

  /**
   * Auth: Verify 6-digit signup OTP / TOTP (alias)
   */
  async verifySignup({ email, otp, code, token, setupToken }) {
    const data = await request('/api/v1/auth/verify-signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        code: code || otp,
        otp: otp || code,
        token: token || setupToken,
        setupToken: setupToken || token
      })
    });
    return data;
  },

  /**
   * Auth: Resend / refresh 2-step setup challenge
   */
  async resendSignupOtp({ email, token, setupToken }) {
    const data = await request('/api/v1/auth/resend-signup-otp', {
      method: 'POST',
      body: JSON.stringify({ email, token: token || setupToken })
    });
    return data;
  },


  /**
   * Auth: Fetch current authenticated profile
   */
  async getMe() {
    const token = authStorage.getToken();
    if (!token) return null;
    try {
      const data = await request('/api/v1/auth/me');
      return data?.user || null;
    } catch {
      return null;
    }
  },

  /**
   * Public Facilities Discovery
   */
  async getFacilities(city) {
    const query = city ? `?city=${encodeURIComponent(city)}` : '';
    const data = await request(`/api/v1/facilities/search${query}`);
    const rawList = data.lots || data.facilities || [];
    return rawList.map(normalizeFacility);
  },

  /**
   * Public Location-Based Facilities Discovery (Phase 4.4)
   */
  async getNearbyFacilities({ lat, lng, radius = 3, sortBy = 'recommended', parkingType = 'ALL', minAvailable, maxPrice } = {}) {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radius),
      sortBy
    });
    if (parkingType && parkingType !== 'ALL') {
      params.append('parkingType', parkingType);
    }
    if (minAvailable) {
      params.append('minAvailable', String(minAvailable));
    }
    if (maxPrice) {
      params.append('maxPrice', String(maxPrice));
    }

    const data = await request(`/api/v1/facilities/nearby?${params.toString()}`);
    const rawList = data.facilities || [];
    return {
      facilities: rawList.map((f) => ({
        ...normalizeFacility(f),
        distanceKm: f.distanceKm,
        distanceFormatted: f.distanceFormatted,
        latitude: f.latitude,
        longitude: f.longitude,
        startingPrice: f.startingPrice || f.hourlyRate,
        isOpen: f.isOpen,
        operatingHours: f.operatingHours,
        supportedTypes: f.supportedTypes || ['STANDARD']
      })),
      search: data.search || { latitude: lat, longitude: lng, radiusKm: radius, totalFound: rawList.length }
    };
  },

  /**
   * Public Facility Detail by ID with spots (supports optional time window for conflict checking)
   */
  async getFacility(id, window = null) {
    let query = '';
    if (window?.startTime && window?.endTime) {
      query = `?startTime=${encodeURIComponent(new Date(window.startTime).toISOString())}&endTime=${encodeURIComponent(new Date(window.endTime).toISOString())}`;
    }
    const data = await request(`/api/v1/facilities/${id}${query}`);
    const raw = data.lot || data.facility;
    return raw ? normalizeFacility(raw) : null;
  },

  /**
   * Enforce that a valid JWT exists for protected API endpoints
   */
  requireToken() {
    const rawToken = authStorage.getToken();
    const clean = (typeof rawToken === 'string' && rawToken.trim() && rawToken !== 'null' && rawToken !== 'undefined')
      ? rawToken.trim().replace(/^Bearer\s+/i, '')
      : null;
    if (!clean) {
      const err = new Error('Your session has expired. Please sign in again to continue.');
      err.status = 401;
      err.code = 'AUTH_REQUIRED';
      throw err;
    }
    return clean;
  },

  /**
   * Driver: Ensure authenticated session for driver API requests
   */
  async ensureDriverAuth() {
    return api.requireToken();
  },

  /**
   * Driver: List user bookings
   */
  async getBookings() {
    const token = authStorage.getToken();
    if (!token) return [];
    try {
      const data = await request('/api/v1/bookings');
      return data.bookings || [];
    } catch {
      return [];
    }
  },

  /**
   * Driver: Create booking
   */
  async createBooking(bookingPayload) {
    api.requireToken();
    const data = await request('/api/v1/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingPayload)
    });
    return data.booking;
  },

  /**
   * Driver: Cancel booking
   */
  async cancelBooking(bookingId) {
    api.requireToken();
    const data = await request(`/api/v1/bookings/${bookingId}/cancel`, {
      method: 'PATCH'
    });
    return data.booking;
  },

  /**
   * Driver: Get single booking
   */
  async getBooking(bookingId) {
    api.requireToken();
    const data = await request(`/api/v1/bookings/${bookingId}`);
    return data.booking;
  },

  /**
   * Driver: List user vehicles
   */
  async getVehicles() {
    const token = authStorage.getToken();
    if (!token) return [];
    try {
      const data = await request('/api/v1/vehicles');
      return data.vehicles || [];
    } catch {
      return [];
    }
  },

  /**
   * Driver: Create vehicle
   */
  async createVehicle(payload) {
    api.requireToken();
    const data = await request('/api/v1/vehicles', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return data.vehicle;
  },

  /**
   * Driver: Update vehicle
   */
  async updateVehicle(vehicleId, payload) {
    api.requireToken();
    const data = await request(`/api/v1/vehicles/${vehicleId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    return data.vehicle;
  },

  /**
   * Driver: Delete vehicle
   */
  async deleteVehicle(vehicleId) {
    api.requireToken();
    const data = await request(`/api/v1/vehicles/${vehicleId}`, {
      method: 'DELETE'
    });
    return data;
  },

  /**
   * Driver: Set default vehicle
   */
  async setDefaultVehicle(vehicleId) {
    api.requireToken();
    const data = await request(`/api/v1/vehicles/${vehicleId}/default`, {
      method: 'PATCH'
    });
    return data.vehicle;
  },

  /**
   * Payment: Create payment order for a booking
   */
  async createPaymentOrder(bookingId) {
    api.requireToken();
    const data = await request('/api/v1/payments/order', {
      method: 'POST',
      body: JSON.stringify({ bookingId })
    });
    return data;
  },

  /**
   * Payment: Verify completed payment
   */
  async verifyPayment({ orderId, paymentId, signature }) {
    api.requireToken();
    const data = await request('/api/v1/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ orderId, paymentId, signature })
    });
    return data;
  },

  /**
   * Operator: Ensure authenticated operator session
   */
  async ensureOperatorAuth() {
    return authStorage.getToken();
  },

  /**
   * Operator: Register and onboard single facility with floors and spots
   */
  async onboardFacility(payload) {
    api.requireToken();
    const data = await request('/api/v1/facilities/onboard', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (data?.token) {
      authStorage.setToken(data.token);
    }
    if (data?.user) {
      authStorage.setUser(data.user);
    }
    return data;
  },

  /**
   * Operator: Ingest operational spot event
   */
  async ingestEvent(facilityId, payload) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request(`/api/v1/facilities/${facilityId}/events`, {
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
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request(`/api/v1/facilities/${facilityId}/occupancy`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Update spot status
   */
  async updateSpotStatus(facilityId, spotId, status) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request(`/api/v1/facilities/${facilityId}/spots/${spotId}/status`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ status })
    });
    return data;
  },

  /**
   * Operator: Get bookings for facility
   */
  async getFacilityBookings(facilityId, params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/api/v1/facilities/${facilityId}/bookings${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data.bookings || [];
  },

  /**
   * Operator: Create parking spot in facility
   */
  async createSpot(facilityId, spotData) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request(`/api/v1/facilities/${facilityId}/spots`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(spotData)
    });
    return data.slot || data.spot || data;
  },

  /**
   * Operator: List spots in facility
   */
  async listFacilitySpots(facilityId, params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/api/v1/facilities/${facilityId}/spots${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data.slots || data.spots || [];
  },

  /**
   * Operator: Get audit logs
   */
  async getAuditLogs(params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    try {
      const data = await request(`/api/v1/admin/audit-logs${query ? `?${query}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return data.auditLogs || [];
    } catch {
      return [];
    }
  },

  /**
   * Operator: Get optimization recommendations
   */
  async getRecommendations(facilityId) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : '';
    const data = await request(`/api/v1/optimization/recommendations${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data.recommendations || [];
  },

  /**
   * Operator: Accept recommendation
   */
  async acceptRecommendation(id) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request(`/api/v1/optimization/recommendations/${id}/accept`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Reject recommendation
   */
  async rejectRecommendation(id, reason = 'Operator manual decline') {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request(`/api/v1/optimization/recommendations/${id}/reject`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ reason })
    });
    return data;
  },

  /**
   * Operator: Dynamic pricing simulation (What-If engine)
   */
  async simulatePricing(payload) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request('/api/v1/optimization/simulate-pricing', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(payload)
    });
    return data;
  },

  /**
   * Operator: Get demand forecast
   */
  async getDemandForecast(facilityId, horizon = 24, granularity = 'hour') {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request(`/api/v1/forecasting/demand?facilityId=${facilityId}&horizon=${horizon}&granularity=${granularity}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Get overstays triage list
   */
  async getOverstays(facilityId, status = null) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const params = new URLSearchParams();
    if (facilityId) params.append('facilityId', facilityId);
    if (status) params.append('status', status);
    const query = params.toString();
    const data = await request(`/api/v1/optimization/overstays${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data.overstays || [];
  },

  /**
   * Operator: AI Operations Assistant Insights
   */
  async getAIInsights({ facilityId, question, startDate, endDate }) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request('/api/v1/ai/insights', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ facilityId, question, startDate, endDate })
    });
    return data;
  },

  /**
   * Operator: Explain recommendation via AI Operations Assistant
   */
  async explainRecommendation(id) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request(`/api/v1/ai/explain-recommendation/${id}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Conversational ParkSpot Copilot Chat
   */
  async chatCopilot({ messages, facilityId = null }) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    console.log('[API.chatCopilot] Initiating POST /api/v1/ai/copilot/chat', {
      turns: messages?.length,
      facilityId
    });
    const data = await request('/api/v1/ai/copilot/chat', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ messages, facilityId })
    });
    console.log('[API.chatCopilot] Response from backend:', data);
    return data;
  },

  /**
   * Operator: Analytics - Dashboard Summary
   */
  async getDashboardSummary(params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/api/v1/analytics/summary${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Analytics - Utilization
   */
  async getUtilization(params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/api/v1/analytics/utilization${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Analytics - Occupancy Trends
   */
  async getOccupancyTrends(params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/api/v1/analytics/occupancy${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Analytics - Peak Hours
   */
  async getPeakHours(params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/api/v1/analytics/peak-hours${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Analytics - Revenue (Restricted to OWNER, ADMIN, MANAGER)
   */
  async getRevenueAnalytics(params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    try {
      const data = await request(`/api/v1/analytics/revenue${query ? `?${query}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return data;
    } catch (err) {
      if (err.status === 403) {
        return { forbidden: true, message: 'Revenue analytics restricted to Owner, Admin, and Manager roles.' };
      }
      throw err;
    }
  },

  /**
   * Operator: Analytics - Facilities comparison
   */
  async getFacilityPerformance(params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/api/v1/analytics/facilities${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Analytics - Spot performance
   */
  async getSpotPerformance(params = {}) {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const query = new URLSearchParams(params).toString();
    const data = await request(`/api/v1/analytics/spots${query ? `?${query}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data;
  },

  /**
   * Operator: Overview summary metrics
   */
  async getAdminOverview() {
    await api.ensureOperatorAuth();
    const token = authStorage.getOperatorToken();
    const data = await request('/api/v1/admin/overview', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return data?.overview || null;
  }
};
