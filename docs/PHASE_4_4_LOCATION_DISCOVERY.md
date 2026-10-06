# Phase 4.4 — ParkSpot Location-Based Parking Discovery

## 1. Executive Summary & Product Goal
The **Location-Based Parking Discovery** system allows drivers to answer five essential questions within seconds:
1. **"Where can I park?"** — Real-time discovery of verified ParkSpot facilities near the driver's current position or destination.
2. **"How far is it?"** — Accurate, human-readable straight-line geographic distances (`287 m`, `1.2 km`).
3. **"Does it have a space?"** — Live vacancy counts directly aggregated from MongoDB `parkingslots`.
4. **"How much does it cost?"** — Transparent hourly starting rates and operating hours (`From ₹40/hr`, `Open 24/7`).
5. **"Can I reserve a specific spot?"** — One-click entry via **[View Spaces]** straight into the existing facility layout, floor selector, and top-down bay reservation flow.

---

## 2. Core User Flow & Screen Architecture
```
Landing Page (/)
      ↓  (Click "Find Parking" / Hero CTA)
Driver Discovery Experience (/driver)
      ↓
┌────────────────────────────────────────────────────────┐
│ Find Parking                                           │
│ [ Search a destination, airport, or landmark... ]      │
│ [ Use my location ]                                    │
│ Quick Chips: Ahmedabad Airport | Parul Univ | Station  │
└────────────────────────────────────────────────────────┘
      ↓  (Location resolved via Geolocation or Geocoding)
Nearby ParkSpot Facilities Queried from Backend
      ↓
┌────────────────────────────────────────────────────────┐
│ Desktop Split View                                     │
│ LEFT: Results Panel           │ RIGHT: Geographic Map │
│ - 2 facilities within 3 km    │ - Destination Beacon  │
│ - Sort: Recommended | Nearest │ - Facility Pins (P·36)│
│ - Type: All | EV | Accessible │ - Interactive Popups  │
│ - NearbyFacilityCards         │ - Zoom & Pan Controls │
└────────────────────────────────────────────────────────┘
      ↓  (Driver clicks "View Spaces" on Card or Map Marker)
Facility Details & Interactive Parking Map (ParkingMap.jsx)
      ↓
Select Exact Parking Bay (e.g. G-01, L1-04)
      ↓
Date & Time Selection + 10-Minute Temporary Hold
      ↓
Secure Payment (UPI / Card)
      ↓
Digital Parking Pass (Credential Token & Live Verification)
```

---

## 3. Location Sources

### A. Current Location (Browser Geolocation API)
- ParkSpot calls `navigator.geolocation.getCurrentPosition(...)` directly.
- **No third-party paid API is required** to determine the driver's coordinates.
- Supports high accuracy (`enableHighAccuracy: true`), timeout guards (10s), and explicit permission lifecycle:
  - `PERMISSION_DENIED`: Friendly alert stating *"Location access is disabled"* with an instant fallback button *"Search destination instead"*.
  - `POSITION_UNAVAILABLE` & `TIMEOUT`: Graceful feedback prompting direct search without breaking application flow.

### B. Searched Destination (Geocoding Provider)
- Geocoding converts queries (e.g., *"Ahmedabad Airport"*, *"Parul University"*, *"Vadodara Railway Station"*, *"Sayajigunj"*, *"Manjalpur"*, *"Connaught Place"*) into `(latitude, longitude)`.
- **Mapbox Geocoding API** is integrated via `https://api.mapbox.com/geocoding/v5/mapbox.places/` using the frontend environment variable `VITE_MAPBOX_TOKEN`.
- **Built-in Curated Indian Landmark Engine**: In `locationService.js`, ParkSpot maintains an instant, sub-millisecond geocoding dictionary covering major airports, universities, railway stations, and commercial hubs. This ensures 100% functionality even when offline or before a Mapbox token is provisioned.
- Users explicitly select a suggestion before querying the backend; arbitrary raw text is never treated as coordinates.

---

## 4. Map Provider & Separation of Concerns

### Geographic Map vs Parking Facility Map
| Feature | Geographic Discovery Map (`NearbyParkingMap.jsx`) | Parking Facility Map (`ParkingMap.jsx`) |
| :--- | :--- | :--- |
| **Technology** | Mapbox GL JS / Vector Geographic Canvas | Vector/SVG Top-Down Infrastructure Canvas |
| **Purpose** | Help drivers **FIND** a facility in the city | Help drivers **CHOOSE** an exact parking bay |
| **Displays** | User location, destination, facility pins, distance | Floor levels, driving lanes, individual bays, cars |
| **Data Source** | Geographic coordinates `(lat, lng)`, distance | Slot coordinates `(x, y, w, h, rotation)`, status |

### Mapbox GL Integration
- Token configured cleanly via `VITE_MAPBOX_TOKEN` (never committed to repository, never exposed on backend).
- Custom HTML markers:
  - Destination pin with animated radar beacon.
  - ParkSpot facility markers with live vacancy badge (`[36 spots]`).
  - Active selection state styled with ParkSpot accent (`#1e3a8a` / `#2563eb`).
- **Interactive Fallback Engine**: If `VITE_MAPBOX_TOKEN` is unset or fails, an interactive vector surface automatically renders real coordinate positions, zoom/pan controls, and interactive popups with zero broken visuals.

---

## 5. Backend Architecture & MongoDB Geospatial Data

### Route Hierarchy
```
Route (GET /api/lots/nearby)
  ↓
Validation (Zod schema: lat [-90, 90], lng [-180, 180], radius [0.1, 100], sortBy, parkingType)
  ↓
Controller (facility.controller.js -> getNearby)
  ↓
Service (location.service.js -> findNearbyFacilities)
  ↓
Mongoose Model (ParkingLot with 2dsphere index & compound lat/lng index)
  ↓
MongoDB Atlas
```

### Data Schema (`ParkingLot`)
```javascript
{
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  hourlyRate: { type: Number, required: true },
  dailyRate: { type: Number, required: true },
  openingTime: { type: String, default: '00:00' },
  closingTime: { type: String, default: '23:59' },
  active: { type: Boolean, default: true },
  latitude: { type: Number, default: null, index: true },
  longitude: { type: Number, default: null, index: true },
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number] // [lng, lat]
  }
}
```

### Seeded Public Facilities
| Facility | Landmark / Area | Coordinates (Lat, Lng) | Starting Rate |
| :--- | :--- | :--- | :--- |
| **Riverside Airport Parking** | Airport Circle, Hansol (Ahmedabad Airport) | 23.0765, 72.6240 | ₹40/hr |
| **Airport Terminal P1 Hub** | Terminal 1 Approach (Ahmedabad Airport) | 23.0715, 72.6285 | ₹50/hr |
| **Riverfront Promenade Deck** | Sabarmati Riverfront, Ahmedabad | 23.0375, 72.5714 | ₹30/hr |
| **Sayajigunj Station Plaza** | Vadodara Central Railway Station | 22.3120, 73.1830 | ₹35/hr |
| **Alkapuri Commercial Hub** | RC Dutt Road, Alkapuri (Vadodara) | 22.3142, 73.1740 | ₹45/hr |
| **Parul Campus Mobility Hub** | Parul University Gate 1 (Waghodia) | 22.2895, 73.3648 | ₹20/hr |
| **Waghodia Crossroad Mobility Lot** | Limda / Parul University corridor | 22.2980, 73.3520 | ₹25/hr |
| **Manjalpur Sports Complex Bay** | Darbar Ring Road, Manjalpur | 22.2698, 73.1955 | ₹30/hr |
| **Central Business District Parking** | Connaught Place, New Delhi | 28.6315, 77.2167 | ₹60/hr |
| **Metro Central Garage** | Barakhamba Metro, New Delhi | 28.6290, 77.2285 | ₹40/hr |
| **Airport Express Lot** | Aerocity / IGI Airport, New Delhi | 28.5494, 77.1212 | ₹70/hr |
| **City Mall Parking** | Sector 38A, Noida | 28.5677, 77.3259 | ₹50/hr |

---

## 6. Distance Calculation & Deterministic Ranking

### Haversine Formula
Straight-line distance calculation avoids costly external matrix API requests:
```javascript
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

### Human-Readable Rounding
- `< 1.0 km`: Rounded to meters (`400 m`, `850 m`).
- `≥ 1.0 km`: Rounded to 1 decimal place (`1.2 km`, `4.8 km`).

### Sorting Modes
1. **Recommended (Default)**: Deterministic formula:
   $$\text{Score} = (100 - \text{distanceKm} \times 12) + \text{availableRatio} \times 30 + (\text{isOpen} ? 15 : 0) - (\text{price} \times 0.2)$$
2. **Nearest**: Pure ascending distance sort (`distanceKm`).
3. **Lowest Price**: Ascending hourly rate (`startingPrice`).
4. **Most Available**: Descending available slot count (`availableSpots`).

---

## 7. Authentication & Guest Discovery
- **Discovery is 100% public**: Unauthenticated guests can search locations, browse facilities, inspect distance/rates, and examine the interactive parking map.
- **Authentication is required at booking hold time**: Clicking "Proceed to Date & Time" / "Proceed to Payment" invokes `AuthModal` if the user is unauthenticated.
- **Role Isolation**: Driver and Operator roles remain strictly separate. Drivers discover and book; operators manage infrastructure and pricing rules.

---

## 8. Automated Verification & Test Results
- **Backend Test Suite**: **106/106 tests passing** (95 existing regression tests + 11 new Phase 4.4 tests).
  - Distance formula precision and formatted strings.
  - 0.5 km, 2 km, 5 km, 10 km radius filtering.
  - Sorting modes (`nearest`, `price`, `availability`, `recommended`).
  - Parking slot type filtering (`EV`, `ACCESSIBLE`, `STANDARD`).
  - Empty results for remote coordinates.
  - Zod validation rejections for latitude > 90 and longitude > 180.
  - Endpoint consistency (`/api/lots/nearby` and `/api/v1/facilities/nearby`).
- **Python ML Test Suite**: **11/11 tests passing** (`test_api.py`, `test_features.py`, `test_pipeline.py`).
- **Frontend Production Build**: **`vite build` passed with 0 errors** (1,637 modules transformed).
