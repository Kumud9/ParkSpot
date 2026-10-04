# ParkSpot Backend REST API & Services

Modular monolith REST API service for ParkSpot B2B Parking Operations & Optimization Platform.

---

## Technology Stack

* **Runtime:** Node.js (v18+)
* **Framework:** Express 4
* **Database & ODM:** MongoDB with Mongoose 8
* **Validation:** Zod schemas
* **Authentication:** JWT with bcrypt password hashing
* **Security:** Helmet, CORS, rate limiting, and parameter sanitization

---

## Directory Structure

```text
backend/
├── src/
│   ├── controllers/      # Request handlers and Zod validation
│   ├── services/         # Core business logic and database mutations
│   ├── models/           # Mongoose schemas with multi-tenant discriminator
│   ├── routes/           # Express routing (public & /v1/ versioned)
│   ├── middleware/       # Auth, RBAC, tenant context, and rate limiting
│   ├── utils/            # Mutex slot locking, sanitize, booking helpers
│   ├── db.js             # MongoDB connection management
│   ├── errors.js         # Standardized AppError classes
│   └── index.js          # Express app initialization
├── tests/                # Automated Node test suite (95 tests)
├── scripts/              # Data export & operational maintenance utilities
├── seed.js               # Multi-tenant B2B inventory seed script
└── package.json
```

---

## Execution Commands

```bash
# Start API in development mode
npm run dev

# Start API in production mode
npm start

# Run full automated test suite (95 tests)
npm test

# Seed initial multi-tenant facilities and test accounts
npm run seed
```
