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

## Repository Structure

```text
ParkSpot/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
│
├── backend/
│   ├── src/
│   ├── tests/
│   ├── scripts/
│   ├── package.json
│   └── README.md
│
├── ml/
│   ├── config.py
│   ├── features.py
│   ├── train.py
│   ├── predict.py
│   ├── api.py
│   ├── requirements.txt
│   └── tests/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── PHASE_4_1_DRIVER_MVP.md
│   └── PHASE_4_2_OPERATOR_MVP.md
│
├── .env.example
├── .gitignore
└── README.md
```

For complete documentation:
- System Architecture & ADRs: [docs/ARCHITECTURE.md](file:///d:/ParkSpot/docs/ARCHITECTURE.md)
- REST API Specification: [docs/API.md](file:///d:/ParkSpot/docs/API.md)
- Phase 4.1 Driver MVP: [docs/PHASE_4_1_DRIVER_MVP.md](file:///d:/ParkSpot/docs/PHASE_4_1_DRIVER_MVP.md)
- Phase 4.2 Operator MVP: [docs/PHASE_4_2_OPERATOR_MVP.md](file:///d:/ParkSpot/docs/PHASE_4_2_OPERATOR_MVP.md)

