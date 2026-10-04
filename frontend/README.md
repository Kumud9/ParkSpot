# ParkSpot Frontend Application

The modern web application for ParkSpot — covering both the consumer **Driver Experience** and the B2B **Operator Console**.

---

## Technology Stack

* **Core Framework:** React 18
* **Build Tool:** Vite 6
* **Routing:** React Router 7
* **Icons:** Lucide React
* **Styling:** Vanilla CSS with custom ParkSpot Design Tokens (`#F4F2E7`, `#25221B`, `#E6DFD1`, `#707371`, `#F3F456`, `#B2A240`)
* **Brand Assets:** Official transparent ParkSpot Wordmark and Mark assets

---

## Directory Structure

```text
frontend/
├── public/
│   ├── parkspot-logo.png
│   └── parkspot-mark.png
├── src/
│   ├── assets/
│   │   ├── parkspot-logo.png
│   │   └── parkspot-mark.png
│   ├── components/
│   │   ├── DriverExperience.jsx
│   │   ├── OperatorExperience.jsx
│   │   ├── ParkingMap.jsx
│   │   ├── VehicleTopDown.jsx
│   │   └── shared/
│   │       ├── AuthModal/
│   │       ├── Footer/
│   │       ├── Loading/
│   │       └── Logo/
│   ├── data/
│   │   └── mockData.js
│   ├── services/
│   │   └── api.js
│   ├── main.jsx
│   └── styles.css
├── index.html
├── package.json
└── vite.config.js
```

---

## Development & Production Commands

```bash
# Start local development dev server
npm run dev

# Compile production bundle
npm run build

# Preview production build locally
npm run preview
```
