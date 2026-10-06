// ParkSpot Location & Geocoding Service (Phase 4.4 + Mapbox Integration)
// Supports Browser Geolocation API + Mapbox Geocoding + Arbitrary Global Real-World Place Search

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/**
 * Curated dictionary of Indian cities, airports, universities and transit hubs
 * Ensures instant, sub-millisecond suggestions and offline resilience
 */
const CURATED_DESTINATIONS = [
  // Ahmedabad
  {
    id: 'poi-ahmedabad-airport',
    name: 'Ahmedabad Airport',
    description: 'Sardar Vallabhbhai Patel International Airport, Hansol, Ahmedabad',
    city: 'Ahmedabad',
    lat: 23.0734,
    lng: 72.6266,
    type: 'airport'
  },
  {
    id: 'poi-ahmedabad-station',
    name: 'Ahmedabad Railway Station',
    description: 'Kalupur, Ahmedabad, Gujarat',
    city: 'Ahmedabad',
    lat: 23.0244,
    lng: 72.6006,
    type: 'transit'
  },
  {
    id: 'poi-sabarmati-riverfront',
    name: 'Sabarmati Riverfront',
    description: 'Riverfront Promenade, West Ahmedabad, Gujarat',
    city: 'Ahmedabad',
    lat: 23.0375,
    lng: 72.5714,
    type: 'landmark'
  },
  {
    id: 'poi-vastrapur',
    name: 'Vastrapur',
    description: 'Vastrapur Lake & Commercial District, Ahmedabad, Gujarat',
    city: 'Ahmedabad',
    lat: 23.0350,
    lng: 72.5280,
    type: 'locality'
  },
  {
    id: 'poi-prahlad-nagar',
    name: 'Prahlad Nagar',
    description: 'Corporate Garden Corridor, SG Highway, Ahmedabad, Gujarat',
    city: 'Ahmedabad',
    lat: 23.0120,
    lng: 72.5080,
    type: 'locality'
  },
  // Vadodara
  {
    id: 'poi-parul-university',
    name: 'Parul University',
    description: 'Parul Campus, Limda, Waghodia, Vadodara, Gujarat',
    city: 'Vadodara',
    lat: 22.2887,
    lng: 73.3634,
    type: 'university'
  },
  {
    id: 'poi-vadodara-station',
    name: 'Vadodara Railway Station',
    description: 'Station Road, Sayajigunj, Vadodara, Gujarat',
    city: 'Vadodara',
    lat: 22.3107,
    lng: 73.1812,
    type: 'transit'
  },
  {
    id: 'poi-sayajigunj',
    name: 'Sayajigunj',
    description: 'Commercial & Transit Hub, Central Vadodara, Gujarat',
    city: 'Vadodara',
    lat: 22.3115,
    lng: 73.1825,
    type: 'locality'
  },
  {
    id: 'poi-akota',
    name: 'Akota',
    description: 'Akota Gardens & Productivity Road, Central Vadodara, Gujarat',
    city: 'Vadodara',
    lat: 22.2965,
    lng: 73.1675,
    type: 'locality'
  },
  {
    id: 'poi-alkapuri',
    name: 'Alkapuri',
    description: 'RC Dutt Road Corporate Corridor, Vadodara, Gujarat',
    city: 'Vadodara',
    lat: 22.3142,
    lng: 73.1740,
    type: 'locality'
  },
  {
    id: 'poi-manjalpur',
    name: 'Manjalpur',
    description: 'Manjalpur Sports Complex & Ring Road, Vadodara, Gujarat',
    city: 'Vadodara',
    lat: 22.2685,
    lng: 73.1942,
    type: 'locality'
  },
  {
    id: 'poi-gotri',
    name: 'Gotri',
    description: 'Gotri Road & GMERS Medical Campus, West Vadodara, Gujarat',
    city: 'Vadodara',
    lat: 22.3180,
    lng: 73.1480,
    type: 'locality'
  },
  {
    id: 'poi-fatehgunj',
    name: 'Fatehgunj',
    description: 'MS University Campus Corridor, Vadodara, Gujarat',
    city: 'Vadodara',
    lat: 22.3210,
    lng: 73.1870,
    type: 'locality'
  },
  // Delhi & NCR
  {
    id: 'poi-connaught-place',
    name: 'Connaught Place',
    description: 'Central Business District, New Delhi',
    city: 'Delhi',
    lat: 28.6315,
    lng: 77.2167,
    type: 'landmark'
  },
  {
    id: 'poi-aerocity-delhi',
    name: 'Aerocity Delhi',
    description: 'IGI Airport T3 Hospitality District, New Delhi',
    city: 'Delhi',
    lat: 28.5494,
    lng: 77.1212,
    type: 'airport'
  },
  {
    id: 'poi-noida-sec38',
    name: 'Noida Sector 38A',
    description: 'Entertainment City & Great India Place, Noida, UP',
    city: 'Noida',
    lat: 28.5677,
    lng: 77.3259,
    type: 'commercial'
  }
];

export const locationService = {
  /**
   * Retrieves the driver's current coordinates using browser Geolocation API
   * Handles permission denial, unavailability, and timeouts gracefully.
   */
  async getCurrentPosition(options = {}) {
    if (!navigator || !navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.');
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
      ...options
    };

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            isCurrentLocation: true,
            label: 'Your Current Location'
          });
        },
        (error) => {
          let message = 'Unable to determine your location.';
          let code = 'UNKNOWN';
          if (error.code === 1) {
            code = 'PERMISSION_DENIED';
            message = 'Location access is disabled.';
          } else if (error.code === 2) {
            code = 'POSITION_UNAVAILABLE';
            message = 'Current location is unavailable.';
          } else if (error.code === 3) {
            code = 'TIMEOUT';
            message = 'Location request timed out.';
          }
          const err = new Error(message);
          err.code = code;
          reject(err);
        },
        defaultOptions
      );
    });
  },

  /**
   * Resolves arbitrary search query into real-world geographic place suggestions.
   * Priority:
   * 1. Instant curated landmark match (sub-millisecond)
   * 2. Mapbox Geocoding API (when VITE_MAPBOX_TOKEN is present)
   * 3. Public OpenStreetMap Nominatim Geocoding fallback for arbitrary global places
   */
  async searchDestinations(query) {
    if (!query || query.trim().length < 2) {
      return [];
    }
    const cleanQuery = query.trim().toLowerCase();

    // 1. Curated landmarks check
    const curatedMatches = CURATED_DESTINATIONS.filter((item) => {
      const name = item.name.toLowerCase();
      const desc = item.description.toLowerCase();
      const city = item.city.toLowerCase();
      return name.includes(cleanQuery) || desc.includes(cleanQuery) || city.includes(cleanQuery);
    });

    let externalMatches = [];

    // 2. Query Mapbox Geocoding API if token is configured
    if (MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.')) {
      try {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=IN&types=poi,address,place,neighborhood,locality&limit=5`;
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          if (data.features && data.features.length > 0) {
            externalMatches = data.features.map((f) => ({
              id: `mapbox-${f.id}`,
              name: f.text,
              description: f.place_name,
              city: f.context?.find((c) => c.id.startsWith('place'))?.text || '',
              lng: f.center[0],
              lat: f.center[1],
              type: f.place_type?.[0] || 'place'
            }));
          }
        }
      } catch (err) {
        console.warn('[LocationService] Mapbox geocoding error:', err.message);
      }
    }

    // 3. Fallback: If externalMatches is empty and user query isn't fully matched, use OpenStreetMap Nominatim for arbitrary real-world search
    if (externalMatches.length === 0 && curatedMatches.length < 3) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=4&addressdetails=1`;
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: { 'Accept-Language': 'en' }
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            externalMatches = data.map((item) => ({
              id: `osm-${item.place_id}`,
              name: item.name || item.display_name.split(',')[0],
              description: item.display_name,
              city: item.address?.city || item.address?.state_district || item.address?.state || '',
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
              type: item.type || 'place'
            }));
          }
        }
      } catch (e) {
        // Silently continue if network unavailable
      }
    }

    // Merge and deduplicate by proximity / name
    const combined = [...curatedMatches, ...externalMatches];
    const seen = new Set();
    const results = [];
    for (const item of combined) {
      const key = `${item.name.toLowerCase()}-${item.lat.toFixed(2)}-${item.lng.toFixed(2)}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(item);
      }
    }

    return results.slice(0, 7);
  },

  /**
   * Get Mapbox Token
   */
  getMapboxToken() {
    return MAPBOX_TOKEN;
  },

  /**
   * Default fallback destination: Vadodara Railway Station
   */
  getDefaultDestination() {
    return {
      lat: 22.3107,
      lng: 73.1812,
      name: 'Vadodara Railway Station',
      city: 'Vadodara'
    };
  }
};

export default locationService;
