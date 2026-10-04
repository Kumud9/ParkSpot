# ParkSpot Phase 4.2 — Operator MVP Production Flow

## 1. Executive Summary & Product Positioning

ParkSpot is **an AI-powered B2B parking operations and optimization platform that uses booking data, occupancy events, analytics, machine learning demand forecasting, algorithmic pricing, and an LLM operations assistant to help parking operators make better decisions.**

The ParkSpot Operator Portal is not merely an administrative CRUD dashboard; it is an **operational decision-support system**. The architecture is 100% software-native (no IoT, hardware sensors, ANPR, or barrier gates), leveraging software booking lifecycles, manual operator updates, predictive machine learning models, and real-time mathematical elasticity simulations.

---

## 2. Operator Operational Journey

The B2B operator experience is desktop-first, designed for facility managers and on-ground operators managing urban multi-level facilities:
1. **Facility & Role Orientation**: Operator selects an active facility context (e.g., *Metro Center Grand Terminal*) and operates under an RBAC role (`OWNER`, `ADMIN`, `MANAGER`, or `OPERATOR`).
2. **Immediate Attention Triage**: Operator begins on the unified **Operator Dashboard**, reviewing active overstays and capacity saturation pressure.
3. **Real-Time Operational Monitoring**: Operator monitors floor-by-floor occupancy, bay states, and live reservation inflows.
4. **Bay Management & Overrides**: Operator switches floors on the interactive parking map, inspects bay metadata, and triggers auditable state overrides (`AVAILABLE`, `BLOCKED`, `MAINTENANCE`, `OCCUPIED`).
5. **Algorithmic Signal Review**: Operator reviews Machine Learning pricing surge or incentive recommendations, inspects explainable AI factors, and deploys or rejects rules.
6. **What-If Pricing Exploration**: Operator simulates price changes against demand elasticity ($\epsilon$) to project revenue and volume impact before taking production action.
7. **AI Operations Assistant Consult**: Operator queries the assistant for operational trend summaries, overstay root causes, or next-day demand forecasts.

---

## 3. Dashboard Visual & Operational Hierarchy

The Operator Dashboard is organized in strict visual priority to answer **"What requires my attention right now?"**:

```
+-----------------------------------------------------------------------------------+
|  1. WHAT REQUIRES ATTENTION RIGHT NOW                                             |
|  [ Active Overstays (1 Exceeded) ]  [ Capacity Pressure (88% Warning) ]  [ Signals ]|
+-----------------------------------------------------------------------------------+
|  2. CURRENT OPERATIONS                                                            |
|  [ Total Bays ]  [ Available ]  [ Occupied ]  [ Reserved ]  [ Blocked/Maint ]     |
+-----------------------------------------------------------------------------------+
|  3. LIVE PARKING OPERATIONS — INTERACTIVE FACILITY MAP                            |
|  [ Floor 1 | Floor 2 | Floor 3 ]  +  [ Interactive Layout ] + [ Override Drawer ]  |
+-----------------------------------------------------------------------------------+
|  4. BUSINESS PERFORMANCE                                                          |
|  [ Gross Revenue (RBAC) ]  [ Peak Window 17-19h ]  [ Avg Dwell ]  [ Conversion ]  |
+-----------------------------------------------------------------------------------+
|  5. WHAT PARKSPOT RECOMMENDS (ALGORITHMIC SIGNALS)                                |
|  [ High Demand Surge Card ]   [ Reason | Impact | Confidence ]   [ Accept|Reject ]|
+-----------------------------------------------------------------------------------+
|  6. AI OPERATIONS ASSISTANT                                                       |
|  [ Quick Chips ]  [ Query Input ]  -->  [ Synthesis Report + Disclaimer ]         |
+-----------------------------------------------------------------------------------+
```

---

## 4. API Endpoints Consumed

All operator console actions are backed by real Phase 2 & 3 modular monolith backend endpoints:

| Endpoint | Method | Role Privileges | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/auth/login` | POST | ALL | Operator and tenant authentication |
| `/api/v1/facilities/:id/occupancy` | GET | ALL B2B | Real-time capacity breakdown per facility |
| `/api/v1/facilities/:id/spots/:spotId/status` | PATCH | OWNER, ADMIN, OPERATOR | Auditable bay state override |
| `/api/v1/facilities/:id/events` | POST | ALL B2B | Ingest operational occupancy event |
| `/api/v1/optimization/overstays` | GET | ALL B2B | Active, resolved, and missing overstay detection |
| `/api/v1/analytics/summary` | GET | ALL B2B | High-level booking counts and revenue summaries |
| `/api/v1/analytics/utilization` | GET | ALL B2B | Current and historic utilization metrics |
| `/api/v1/analytics/peak-hours` | GET | ALL B2B | Hourly demand distribution histogram |
| `/api/v1/analytics/revenue` | GET | OWNER, ADMIN, MANAGER | Financial yield and average booking revenue (403 for OPERATOR) |
| `/api/v1/optimization/recommendations` | GET | ALL B2B | List pending algorithmic recommendations |
| `/api/v1/optimization/recommendations/:id/accept` | POST | OWNER, ADMIN, MANAGER | Deploy recommendation as active PricingRule |
| `/api/v1/optimization/recommendations/:id/reject` | POST | OWNER, ADMIN, MANAGER | Reject recommendation with logged audit trail |
| `/api/v1/optimization/simulate-pricing` | POST | ALL B2B | What-If simulation modeling demand volume elasticity |
| `/api/v1/forecasting/demand` | GET | ALL B2B | Hourly expected demand from ML Regressor |
| `/api/v1/ai/insights` | POST | ALL B2B | Bounded context operational synthesis from LLM |
| `/api/v1/ai/explain-recommendation/:id` | POST | ALL B2B | Structured AI explanation of pricing recommendations |
| `/api/v1/admin/audit-logs` | GET | OWNER, ADMIN, MANAGER | Immutable tenant audit trail |
| `/api/v1/admin/overview` | GET | OWNER, ADMIN, MANAGER | Cross-lot tenant aggregate counts |

---

## 5. Live Occupancy & Functional State Colors

Live occupancy strictly separates brand identity colors from **functional parking semantic tokens**:

* **AVAILABLE (`#2E7D32`)**: Spot vacant, unreserved, and immediately ready for vehicle parking.
* **OCCUPIED (`#C62828`)**: Active vehicle dwell recorded via booking check-in or manual operator confirmation.
* **RESERVED (`#D97706`)**: Active reservation held by an en-route driver.
* **SELECTED (`#F3F456`)**: Interactive focus / active target for operator inspection.
* **MAINTENANCE (`#757575`)**: Bay temporarily removed from booking inventory for physical or facility service.
* **BLOCKED (`#374151`)**: Bay restricted for VIP, operational staff, or emergency access.

---

## 6. Interactive Map & Spot Management Workflow

Reuses [`ParkingMap.jsx`](file:///d:/ParkSpot/client/src/components/ParkingMap.jsx) without creating redundant map implementations:
1. Operator switches between floors (`Floor 1`, `Floor 2`, `Floor 3`).
2. Clicking any bay selects it and activates the contextual **Spot Override Control** drawer.
3. Operator selects a target state (`AVAILABLE`, `BLOCKED`, `MAINTENANCE`, `OCCUPIED`).
4. **Optimistic Update**: UI immediately updates local spot visual state.
5. **Progressive Backend Sync**: Dispatches `PATCH /api/v1/facilities/:facilityId/spots/:id/status`.
6. **Fault Tolerance**: If the API call fails (e.g. network disconnect or role restriction), the optimistic change is automatically reverted, and an alert banner notifies the operator.
7. **Audit Logging**: Every status transition generates an immutable record in `AuditLog`.

---

## 7. Operational Events & Software-Native Telemetry

ParkSpot is strictly 100% software-only. Telemetry represents software-driven event ingestion:
* **Terminology Rules**:
  * **Approved**: `operational event`, `occupancy event`, `booking lifecycle event`, `departure event`, `system event`, `operator action`.
  * **Forbidden**: Never use hardware terms like *sensor*, *camera*, *IoT*, *barrier*, or *ANPR*.
* Events display timestamp, event classification, target bay, floor level, and originating source (e.g., *Driver Mobile App*, *B2B Admin Console*, *Automated Worker*).

---

## 8. Overstay Management & Resolution

The Overstay Triage console groups capacity anomalies into four software-native categories:
1. `ACTIVE_OVERSTAY`: Vehicle dwell has exceeded the confirmed reservation duration without an extension event.
2. `MISSING_DEPARTURE_EVENT`: Reservation window has elapsed, but no departure confirmation has been recorded within the standard grace window.
3. `RESOLVED_OVERSTAY`: Overstay resolved via departure confirmation or manual operator clearance.
4. `NO_OVERSTAY`: Normal operations within reservation tolerances.

Operators can inspect vehicle registration plates (`DL 01 AB 4920`), booking references, and overstay duration, or resolve the flag with one click.

---

## 9. Business Analytics

Analytics answer core commercial and capacity questions:
* **"Which hours experience the highest demand?"**: Visual hourly histogram displaying peak reservation hours (e.g., 17:00 evening peak with 42 concurrent reservations).
* **"How efficiently is facility capacity being used?"**: Live capacity yield percentage compared against target operating envelopes (75%–85%).
* **"Which facilities generate the most revenue?"**: Financial KPIs showing gross revenue and fulfillment rates (with RBAC protection for operational staff).

---

## 10. Optimization Recommendations & Explainable AI

ParkSpot algorithms generate dynamic pricing recommendations based on demand velocity:
* **Recommendation Anatomy**:
  * **WHAT**: Action type (`PRICING_SURGE`, `PRICING_DISCOUNT`, `CAPACITY_REALLOCATION`).
  * **WHY**: Explicit algorithmic reason (e.g., *Demand forecast projects 88% occupancy between 11:00 and 14:00*).
  * **EXPECTED IMPACT**: Modeled revenue lift and queuing dampening metrics.
  * **CONFIDENCE**: Quantified model confidence percentage (e.g., *91% Gradient Boosting ML*).
  * **ACTION**: Accept, Reject, or Explain with AI.
* **Explain with AI Modal**: Calls `POST /api/v1/ai/explain-recommendation/:id` to retrieve bounded, risk-assessed rationales explaining elasticity and volume displacement risks.

---

## 11. Dynamic Pricing Simulation (What-If Engine)

The simulation engine allows operators to model rate changes before making production decisions:
* Sliders adjust **Proposed Rate Change %** (-50% to +100%) and **Demand Price Elasticity $\epsilon$** (-0.1 to -1.0).
* Dispatches `POST /api/v1/optimization/simulate-pricing` to compute projected volume and revenue deltas.
* **Production Safeguard**: Prominent badge and disclaimer explicitly reinforce that simulations *never* automatically alter active facility pricing rules without approval.

---

## 12. Machine Learning Demand Forecasting

Integrates the Phase 3.2 Gradient Boosting Regressor ML model:
* Selectable forecast horizons: **12 Hours**, **24 Hours**, **48 Hours**, **7 Days**.
* Visual forecast curve highlighting peak pressure hours in crimson (`#C62828`).
* Displays model confidence (e.g., *92.4%*) and active engine architecture (Python ML Microservice with baseline prior fallback).
* Uses probabilistic terminology (*Expected demand*, *Forecast*) rather than misleading guarantees.

---

## 13. AI Operations Assistant

Integrated decision-support layer powered by `POST /api/v1/ai/insights`:
* Quick-prompt chips for common operational inquiries (*"Why is utilization high tonight?"*, *"Explain peak demand hours"*).
* Structured response outputs:
  1. **Executive Operational Synthesis**: Contextual explanation of facility conditions.
  2. **Key Metric Snapshots**: Structured numbers (occupancy rate, active bays, flagged overstays).
  3. **Recommended Operator Action**: Actionable next step for facility managers.
  4. **Safety Disclaimer**: Explicit notice that the assistant is an advisory layer requiring operator verification.

---

## 14. Enterprise Audit Trail

Connects to `GET /api/v1/admin/audit-logs`:
* Records immutable entries for all administrative actions: `SPOT_STATUS_*`, `RECOMMENDATION_ACCEPTED`, `RECOMMENDATION_REJECTED`, `PRICING_RULE_APPLIED`, `BOOKING_CONFIRMED`.
* Displays timestamp, action type, entity identifier, actor email, and originating client source.

---

## 15. Role-Based Access Control (RBAC)

Enforces backend privilege tiers on the console:

| Role | Operational Controls | Pricing Rule Approval | Financial Revenue Analytics | AI Assistant |
| :--- | :---: | :---: | :---: | :---: |
| **OWNER** | Full | Allowed | Allowed | Allowed |
| **ADMIN** | Full | Allowed | Allowed | Allowed |
| **MANAGER** | Full | Allowed | Allowed | Allowed |
| **OPERATOR** | Full | Blocked (403) | Blocked (403) | Allowed |

The console features an interactive **Active Role Switcher** in the header, allowing operators and testers to preview and verify RBAC behavior (e.g., observing the financial revenue card display a *RESTRICTED* badge and disabling Accept/Reject buttons when switched to `OPERATOR`).

---

## 16. Real Data vs Demo Mode

Preserves a strict separation between live backend data and simulated fallbacks:
* **Live API**: When connected to MongoDB with 24-character ObjectIds, operations execute against live endpoints.
* **Demo Simulation**: When backend is offline or mock facilities are loaded, operations use explicit local fallbacks with clear indicator tags (`● Demo Simulation`).
* Datasets are never mixed silently.

---

## 17. Brand System & Loading Consistency

* **Brand Identity**: Reusable [`Logo.jsx`](file:///d:/ParkSpot/client/src/components/shared/Logo/Logo.jsx) component is used with `variant="mark"` and `variant="full"`. Logo assets are strictly preserved without distortion or recoloring.
* **Loading System**: Reusable [`Loading`](file:///d:/ParkSpot/client/src/components/shared/Loading) components are utilized:
  * `ActionLoader` inside override and simulation buttons.
  * `ComponentLoader` inside AI explanation modals.
  * `MapLoader` during layout and floor transitions.
* **Reduced Motion**: Respects `prefers-reduced-motion` with static visual fallbacks.

---

## 18. Accessibility & Engineering Quality

* Accessible dialogs with `role="dialog"`, `aria-modal="true"`, and escape handlers.
* Visible outline focus styles on all interactive table actions, pills, and inputs (`:focus-visible`).
* All functional state tags include text descriptors (not color alone).
* Clean separation of concerns with zero new microservices or unnecessary dependencies.
