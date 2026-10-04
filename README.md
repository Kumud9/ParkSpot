# ParkSpot — B2B Parking Operations & Optimization Platform

ParkSpot is an AI-powered B2B parking operations and optimization platform that uses booking data, occupancy events, analytics, machine learning demand forecasting, algorithmic pricing, and an LLM operations assistant to help parking operators make better decisions. Engineered for parking operators, facility managers, and commercial operators (shopping malls, corporate tech parks, transit hubs, hospitals), it features a multi-tenant hierarchy (`Organization` → `Facility` → `Floor` → `Parking Spot`), atomic concurrency-safe booking reservations, automated booking lifecycle transitions, role-based access control, spatial layout coordinates, configurable pricing rules, and audit/occupancy event logging.

---

## Architecture Stack

- **Client:** React 18, Vite 6, React Router 7, Lucide icons, responsive CSS
- **API:** Node.js, Express 4 (Layered: Routes → Controllers → Services → Models)
- **Database:** MongoDB with Mongoose 8 (Shared database, tenant-scoped schemas)
- **Security:** bcrypt password hashing (12 rounds), JWT tokens, Helmet headers, CORS, brute-force auth rate limiting, ReDoS-safe search, and Zod input validation

---

## Local Setup & Run

1. **Start MongoDB:** Ensure MongoDB is running locally on port `27017` or configure a MongoDB Atlas URI.
2. **Environment Configuration:**
   Copy `.env.example` to `.env`:
   ```env
   MONGODB_URI="mongodb://127.0.0.1:27017/parkspot"
   JWT_SECRET="parkspot-local-development-secret-change-before-deployment"
   PORT=4000
   CLIENT_URL="http://localhost:5173"
   ```
3. **Install Dependencies:**
   ```bash
   npm install
   ```
4. **Seed B2B Test Inventory:**
   ```bash
   npm run db:seed
   ```
5. **Run Development Services:**
   ```bash
   npm run dev
   ```
   - Client: `http://localhost:5173`
   - REST API: `http://localhost:4000`

---

## Seeded B2B & Consumer Test Accounts

| Role | Email | Password | Organization | Description |
| :--- | :--- | :--- | :--- | :--- |
| **OWNER** | `owner@urbanpark.test` | `Pass@12345` | UrbanPark Solutions | Full tenant control |
| **ADMIN** | `admin@urbanpark.test` | `Pass@12345` | UrbanPark Solutions | Facility & user management |
| **MANAGER** | `manager@urbanpark.test` | `Pass@12345` | UrbanPark Solutions | Operations & analytics |
| **OPERATOR** | `operator@urbanpark.test` | `Pass@12345` | UrbanPark Solutions | Spot status overrides |
| **USER** | `user@parkspot.test` | `Pass@12345` | *None* | Consumer driver account |
| **LEGACY ADMIN** | `admin@parkspot.local` | `Admin@123` | UrbanPark Solutions | Backward-compatible admin |

---

## Verification & Testing

Run the full automated test suite (concurrency, lifecycle, tenant isolation, ReDoS regression, auth, B2B domain, and health endpoints):

```bash
npm test
```

Build the client bundle:

```bash
npm run build
```

---

## API Surface

### 1. Version 1 B2B Endpoints (`/api/v1`)

| Domain | Methods & Paths | Role / Auth |
| :--- | :--- | :--- |
| **Auth** | `POST /api/v1/auth/register`<br/>`POST /api/v1/auth/login`<br/>`GET /api/v1/auth/me` | Public (Strict rate limits)<br/>Public<br/>Authenticated |
| **Facilities** | `GET /api/v1/facilities/search`<br/>`GET /api/v1/facilities/:id/public`<br/>`GET /api/v1/facilities`<br/>`POST /api/v1/facilities`<br/>`PATCH /api/v1/facilities/:id` | Public<br/>Public<br/>OWNER, ADMIN, MANAGER, OPERATOR<br/>OWNER, ADMIN<br/>OWNER, ADMIN |
| **Floors** | `GET /api/v1/facilities/:facilityId/floors`<br/>`POST /api/v1/facilities/:facilityId/floors`<br/>`PATCH /api/v1/facilities/:facilityId/floors/:id` | OWNER, ADMIN, MANAGER, OPERATOR<br/>OWNER, ADMIN<br/>OWNER, ADMIN |
| **Spots** | `GET /api/v1/facilities/:facilityId/spots`<br/>`POST /api/v1/facilities/:facilityId/spots`<br/>`PATCH /api/v1/facilities/:facilityId/spots/:id`<br/>`PATCH /api/v1/facilities/:facilityId/spots/:id/status` | OWNER, ADMIN, MANAGER, OPERATOR<br/>OWNER, ADMIN<br/>OWNER, ADMIN, OPERATOR<br/>OWNER, ADMIN, OPERATOR |
| **Pricing** | `GET /api/v1/facilities/:facilityId/pricing`<br/>`POST /api/v1/facilities/:facilityId/pricing`<br/>`PATCH /api/v1/facilities/:facilityId/pricing/:id` | OWNER, ADMIN, MANAGER<br/>OWNER, ADMIN<br/>OWNER, ADMIN |
| **Bookings** | `GET /api/v1/bookings`<br/>`POST /api/v1/bookings`<br/>`PATCH /api/v1/bookings/:id/cancel` | Authenticated USER<br/>Authenticated USER<br/>Authenticated USER |
| **Vehicles** | `GET /api/v1/vehicles`<br/>`POST /api/v1/vehicles` | Authenticated USER<br/>Authenticated USER |
| **Admin** | `GET /api/v1/admin/overview`<br/>`GET /api/v1/admin/users`<br/>`GET /api/v1/admin/reports` | OWNER, ADMIN, MANAGER |

### 2. Legacy / Consumer Compatibility Endpoints (`/api`)

- `GET /api/health`: Service liveness check
- `GET /api/health/ready`: Database connectivity readiness check
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/lots`, `GET /api/lots/:id`
- `GET /api/bookings`, `POST /api/bookings`, `PATCH /api/bookings/:id/cancel`
- `GET /api/admin/overview`, `GET /api/admin/users`, `GET /api/admin/lots`, `GET /api/admin/reports`

For in-depth architectural details and ADRs, consult [server/docs/ARCHITECTURE.md](file:///d:/ParkSpot/server/docs/ARCHITECTURE.md).
