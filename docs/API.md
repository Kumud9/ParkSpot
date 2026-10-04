# ParkSpot REST API Specification

This document provides a comprehensive reference for all ParkSpot backend REST API routes. All endpoints are hosted under `/api` (or `/api/v1` for versioned enterprise endpoints).

---

## 1. Authentication & Tenant Context

* **Authentication Header:** `Authorization: Bearer <JWT_TOKEN>`
* **Tenant Isolation:** The authenticated organization identifier (`organizationId`) is securely derived from JWT claims. Client-supplied organization IDs are never trusted for operational queries.

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/auth/register` | POST | Public | Register consumer driver account |
| `/api/auth/login` | POST | Public | Authenticate user or operator, returns JWT token |
| `/api/v1/auth/login` | POST | Public | Versioned enterprise auth endpoint |

---

## 2. Public Facility Discovery & Consumer Booking

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/lots` | GET | Public | Discover public parking facilities by city or keyword |
| `/api/lots/:id` | GET | Public | Facility details, current floor maps, and spot availability |
| `/api/v1/facilities/search` | GET | Public | Search facilities with pagination and radius filters |
| `/api/v1/facilities/:id/public` | GET | Public | Public view of facility layout |
| `/api/bookings` | GET | USER | List reservations for the authenticated driver |
| `/api/bookings` | POST | USER | Create atomic, double-booking safe slot reservation |
| `/api/bookings/:id/cancel` | PATCH | USER | Cancel an active booking and emit occupancy events |

---

## 3. Payments (Phase 4.1 Driver Flow)

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/payments/order` | POST | USER | Generate cryptographically signed payment order for booking |
| `/api/v1/payments/verify` | POST | USER | Verify HMAC-SHA256 payment signature and confirm booking |

---

## 4. Tenant Facility & Floor Management (B2B)

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/facilities` | GET | OWNER, ADMIN, MANAGER, OPERATOR | List tenant-scoped facilities |
| `/api/v1/facilities` | POST | OWNER, ADMIN | Create new facility |
| `/api/v1/facilities/:id` | PATCH | OWNER, ADMIN | Update facility parameters |
| `/api/v1/facilities/:id/floors` | GET | OWNER, ADMIN, MANAGER, OPERATOR | List levels/floors for facility |
| `/api/v1/facilities/:id/floors` | POST | OWNER, ADMIN | Add floor to facility |
| `/api/v1/facilities/:id/spots` | GET | OWNER, ADMIN, MANAGER, OPERATOR | List bays for facility |
| `/api/v1/facilities/:id/spots` | POST | OWNER, ADMIN | Create new parking bay |
| `/api/v1/facilities/:id/spots/:spotId/status` | PATCH | OWNER, ADMIN, OPERATOR | Auditable bay state override |

---

## 5. Live Occupancy & Operational Events

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/facilities/:id/occupancy` | GET | OWNER, ADMIN, MANAGER, OPERATOR | Real-time capacity breakdown per floor |
| `/api/v1/facilities/:id/events` | POST | OWNER, ADMIN, MANAGER, OPERATOR | Ingest software-native operational event |

---

## 6. Dynamic Optimization, Simulation & Overstays

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/optimization/recommendations` | GET | ALL B2B | List pending algorithmic pricing recommendations |
| `/api/v1/optimization/recommendations/generate` | POST | OWNER, ADMIN, MANAGER | Trigger generation of algorithmic signals |
| `/api/v1/optimization/recommendations/:id/accept` | POST | OWNER, ADMIN, MANAGER | Deploy recommendation as active PricingRule |
| `/api/v1/optimization/recommendations/:id/reject` | POST | OWNER, ADMIN, MANAGER | Decline recommendation with logged audit trail |
| `/api/v1/optimization/simulate-pricing` | POST | ALL B2B | What-If simulation modeling demand volume elasticity |
| `/api/v1/optimization/overstays` | GET | ALL B2B | Active, resolved, and missing overstay detection |

---

## 7. Machine Learning Demand Forecasting

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/forecasting/demand` | GET | ALL B2B | Hourly expected demand from ML Regressor (12h, 24h, 48h, 7d) |

---

## 8. AI Operations Assistant (LLM Operations Layer)

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/ai/insights` | POST | ALL B2B | Context-bounded operational synthesis from LLM |
| `/api/v1/ai/explain-recommendation/:id` | POST | ALL B2B | Structured AI explanation of pricing recommendations |

---

## 9. Administrative Governance & Audit Logs

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/admin/overview` | GET | OWNER, ADMIN, MANAGER | Cross-lot tenant aggregate counts |
| `/api/v1/admin/reports` | GET | OWNER, ADMIN, MANAGER | MongoDB aggregation reporting |
| `/api/v1/admin/audit-logs` | GET | OWNER, ADMIN, MANAGER | Immutable tenant audit trail |
| `/api/v1/analytics/summary` | GET | ALL B2B | Operational booking counts & KPI summary |
| `/api/v1/analytics/utilization` | GET | ALL B2B | Facility utilization rates |
| `/api/v1/analytics/peak-hours` | GET | ALL B2B | Hourly reservation density histogram |
| `/api/v1/analytics/revenue` | GET | OWNER, ADMIN, MANAGER | Financial revenue analytics (403 for OPERATOR) |
