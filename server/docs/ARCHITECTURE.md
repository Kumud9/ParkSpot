# ParkSpot Backend Architecture & Engineering Specification

## 1. System Overview
ParkSpot is evolved from a consumer parking reservation app into a **B2B Parking Operations & Optimization Platform**.
The core operational domain hierarchy is:

```text
Organization (Operator/Tenant)
     │
     └── Facility (Parking Lot / Garage)
             │
             └── Floor (Facility Level)
                     │
                     └── Parking Spot (Bay / Slot with Spatial Coordinates)
```

---

## 2. Multi-Tenancy Architecture
- **Isolation Strategy:** Shared database, discriminator/tenant-scoped collections via `organizationId`.
- **Tenant Context:** Derived strictly from the cryptographically verified JWT (`req.user.organizationId`). Client-supplied organization IDs in request bodies or query parameters are never trusted.
- **Data Scoping:** Every operational mutation (facilities, floors, spots, pricing rules, audit logs, and occupancy events) enforces `{ organizationId: req.user.organizationId }`.

---

## 3. Roles and Permissions Matrix

| Role | Domain Scope | Permissions |
| :--- | :--- | :--- |
| **OWNER** | Organization Wide | Full administrative and financial control over facilities, floors, spots, users, pricing, and analytics. |
| **ADMIN** | Organization Wide | Facility configuration, operational floor/spot setups, pricing rules, and reporting. |
| **MANAGER** | Facilities / Operations | Operational overview, spot status overrides, analytics review, and booking management. |
| **OPERATOR** | Day-to-Day Operations | Operational parking bay status toggling (`AVAILABLE`, `OCCUPIED`, `BLOCKED`, `MAINTENANCE`). |
| **USER** | Driver / Consumer | Public search, slot reservation, profile view, vehicle registration, and booking cancellation. |

---

## 4. Concurrency & Double-Booking Strategy
- **TOCTOU Race Condition Resolution:** Overlapping booking prevention operates via an in-process slot lock (`KeyedMutex`) combined with MongoDB multi-document transactions where replica sets or sharding is configured.
- **Overlap Formula:**
  $$\text{existing.startTime} < \text{requested.endTime} \quad \text{AND} \quad \text{existing.endTime} > \text{requested.startTime}$$
- **Atomic Execution:**
  1. Acquire keyed lock on `slotId`.
  2. Start MongoDB session/transaction (if supported on deployment).
  3. Verify slot active and status (`!BLOCKED && !MAINTENANCE`).
  4. Assert `Booking.exists(...)` inside session is `null`.
  5. Calculate price using active `PricingRule` or base facility rates.
  6. Insert `Booking` document.
  7. Commit transaction and release slot lock.
  8. Emit `OccupancyEvent` (`BOOKING_CREATED`) and `AuditLog`.

---

## 5. Booking Lifecycle Engine
- **Idempotent Expiration:** Background worker (`startLifecycleWorker`) periodically queries:
  $$\text{status} = \text{'CONFIRMED'} \quad \text{AND} \quad \text{endTime} \le \text{now()}$$
- Transitions matched bookings to `'COMPLETED'`.
- Preserves `'CANCELED'` bookings untouched.
- Emits `OccupancyEvent` (`BOOKING_COMPLETED`, source: `'SYSTEM'`).
- Pluggable design prepared for BullMQ worker queue integration.

---

## 6. Architecture Decision Records (ADRs)

### ADR 001: Retention of MongoDB and Mongoose
- **Status:** Accepted.
- **Context:** The application was built on MongoDB and Mongoose. Migrating to a relational database (PostgreSQL/Prisma) would require extensive schema rewrites and disrupt working features.
- **Decision:** Retain MongoDB 8 and Mongoose ODM. Enforce strict schema boundaries, compound unique indexes, and tenant scoping in the application layer.

### ADR 002: Modular Monolith vs. Microservices
- **Status:** Accepted.
- **Context:** Initial architecture lacked separation of concerns (all logic was in route files).
- **Decision:** Adopt a layered modular monolith:
  $$\text{Routes} \longrightarrow \text{Controllers} \longrightarrow \text{Services} \longrightarrow \text{Mongoose Models}$$
  Keep domain logic cohesive inside single deployable unit while avoiding network hop latency and microservice operational overhead.

### ADR 003: Software-Driven Operational Occupancy Layer
- **Status:** Accepted.
- **Context:** ParkSpot is a 100% software-only B2B parking operations and optimization platform. Occupancy is derived entirely from software signals: driver booking lifecycles, operator management actions, and system-generated operational events.
- **Decision:** Implement an append-only `OccupancyEvent` stream recording operational state transitions (`OCCUPIED`, `VACATED`, `RESERVED`, `AVAILABLE`, `BLOCKED`, `MAINTENANCE`) with software event source tracking (`source: 'BOOKING'`, `source: 'OPERATOR'`, `source: 'SYSTEM'`).

### ADR 004: Dual API Routing (/api and /api/v1)
- **Status:** Accepted.
- **Context:** Existing frontend consumes legacy `/api/*` endpoints.
- **Decision:** Expose `/api/v1/*` as the comprehensive B2B API while maintaining backward-compatible `/api/*` routes delegating to the unified service layer.
