import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { VehicleTopDown } from '../VehicleTopDown';
import { ArrowRight } from 'lucide-react';

/**
 * Compact Product Demonstration of ParkSpot Top-Down Infrastructure
 * Automatically animates the sequence:
 * Discover available space -> Pointer moves & selects spot -> Spot highlights in ParkSpot yellow
 * -> Reservation hold confirmed -> Spot transforms to signature black + diagonal neon yellow-green stripes!
 *
 * Fully client-side simulation: Zero backend mutations, zero fake bookings.
 */
export function ParkingMapShowcase() {
  const navigate = useNavigate();

  // Demonstration State Sequence:
  // step 0: Browse (initial layout, A-02 open, pointer idle)
  // step 1: Pointer moving toward A-02
  // step 2: Pointer clicks A-02 -> A-02 SELECTED (#F3F456 yellow)
  // step 3: Reservation in progress -> A-02 becomes RESERVED (black + neon diagonal stripes)
  // step 4: Pointer moves toward B-03
  // step 5: Pointer clicks B-03 -> B-03 SELECTED
  // step 6: Short pause, then reset cycle
  const [demoStep, setDemoStep] = useState(0);
  const [pointerPos, setPointerPos] = useState({ x: 80, y: 75 });
  const [isPointerClicking, setIsPointerClicking] = useState(false);
  const [pointerVisible, setPointerVisible] = useState(true);

  // Spot States (simulated locally)
  const [spotA02Status, setSpotA02Status] = useState('AVAILABLE'); // AVAILABLE -> SELECTED -> RESERVED
  const [spotB03Status, setSpotB03Status] = useState('AVAILABLE'); // AVAILABLE -> SELECTED
  const [userSelectedSpot, setUserSelectedSpot] = useState(null);
  const [userInteractionActive, setUserInteractionActive] = useState(false);
  const [userFeedbackMsg, setUserFeedbackMsg] = useState(null);

  const interactionTimeoutRef = useRef(null);

  // Automated Demonstration Loop
  useEffect(() => {
    if (userInteractionActive) return;

    let timeoutId;

    switch (demoStep) {
      case 0:
        // Initial state
        setSpotA02Status('AVAILABLE');
        setSpotB03Status('AVAILABLE');
        setUserSelectedSpot(null);
        setPointerVisible(true);
        setPointerPos({ x: 78, y: 72 });
        setIsPointerClicking(false);
        timeoutId = setTimeout(() => setDemoStep(1), 1200);
        break;

      case 1:
        // Pointer moves smoothly toward Spot A-02 (top middle bay ~50%, 25%)
        setPointerPos({ x: 50, y: 22 });
        timeoutId = setTimeout(() => setDemoStep(2), 900);
        break;

      case 2:
        // Pointer reaches A-02 and clicks
        setIsPointerClicking(true);
        setSpotA02Status('SELECTED');
        timeoutId = setTimeout(() => {
          setIsPointerClicking(false);
          setDemoStep(3);
        }, 1200);
        break;

      case 3:
        // Spot A-02 transforms to signature RESERVED (Black + Diagonal Neon Stripes)
        setSpotA02Status('RESERVED');
        timeoutId = setTimeout(() => setDemoStep(4), 2200);
        break;

      case 4:
        // Pointer moves toward Spot B-03 (bottom right bay ~83%, 78%)
        setPointerPos({ x: 83, y: 76 });
        timeoutId = setTimeout(() => setDemoStep(5), 900);
        break;

      case 5:
        // Pointer clicks Spot B-03
        setIsPointerClicking(true);
        setSpotB03Status('SELECTED');
        timeoutId = setTimeout(() => {
          setIsPointerClicking(false);
          setDemoStep(6);
        }, 1400);
        break;

      case 6:
        // Hold final state before looping
        timeoutId = setTimeout(() => {
          setDemoStep(0);
        }, 1600);
        break;

      default:
        setDemoStep(0);
    }

    return () => clearTimeout(timeoutId);
  }, [demoStep, userInteractionActive]);

  // Handle user manual interaction
  const handleSpotClick = (spotId, currentStatus, spotNumber) => {
    setUserInteractionActive(true);
    setPointerVisible(false);

    if (currentStatus === 'AVAILABLE') {
      setUserSelectedSpot(spotId);
      setUserFeedbackMsg(`Spot ${spotNumber} selected by you`);
    } else if (currentStatus === 'RESERVED') {
      setUserFeedbackMsg(`Spot ${spotNumber} is already reserved`);
    } else if (currentStatus === 'OCCUPIED') {
      setUserFeedbackMsg(`Spot ${spotNumber} is currently occupied`);
    }

    // Resume automated demo after 5s of inactivity
    if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = setTimeout(() => {
      setUserInteractionActive(false);
      setUserFeedbackMsg(null);
      setDemoStep(0);
    }, 5000);
  };

  // Derive step narrative label
  const getStepLabel = () => {
    if (userFeedbackMsg) return userFeedbackMsg;
    switch (demoStep) {
      case 0:
      case 1:
        return '1. Facility layout live preview';
      case 2:
        return '2. Driver selects Spot A-02';
      case 3:
        return '3. Spot A-02 reserved & confirmed';
      case 4:
      case 5:
      case 6:
        return '4. Dynamic space hold active';
      default:
        return 'Interactive parking demonstration';
    }
  };

  // Static + dynamic spots configuration (Row A: 3 spots, Row B: 3 spots)
  const rowA = [
    { id: 'spot-a01', number: 'A-01', status: 'OCCUPIED', carColor: '#3E444E', type: 'STANDARD' },
    {
      id: 'spot-a02',
      number: 'A-02',
      status: userSelectedSpot === 'spot-a02' ? 'SELECTED' : spotA02Status,
      carColor: '#23272F',
      type: 'STANDARD'
    },
    { id: 'spot-a03', number: 'A-03', status: 'OCCUPIED', carColor: '#1C2D4A', type: 'STANDARD' }
  ];

  const rowB = [
    {
      id: 'spot-b01',
      number: 'B-01',
      status: userSelectedSpot === 'spot-b01' ? 'SELECTED' : 'AVAILABLE',
      carColor: '#4A4740',
      type: 'EV'
    },
    { id: 'spot-b02', number: 'B-02', status: 'RESERVED', carColor: '#23272F', type: 'STANDARD' },
    {
      id: 'spot-b03',
      number: 'B-03',
      status: userSelectedSpot === 'spot-b03' ? 'SELECTED' : spotB03Status,
      carColor: '#2C3E35',
      type: 'STANDARD'
    }
  ];

  const renderCompactBay = (spot) => {
    const isSelected = spot.status === 'SELECTED';
    const isReserved = spot.status === 'RESERVED';
    const isOccupied = spot.status === 'OCCUPIED';
    const isAvailable = spot.status === 'AVAILABLE';

    let bayClass = 'demo-bay';
    if (isSelected) bayClass += ' selected';
    else if (isReserved) bayClass += ' reserved';
    else if (isOccupied) bayClass += ' occupied';

    return (
      <div
        key={spot.id}
        className={bayClass}
        onClick={() => handleSpotClick(spot.id, spot.status, spot.number)}
        role="button"
        tabIndex={0}
        aria-label={`Demo Spot ${spot.number} — ${spot.status}`}
        title={`Spot ${spot.number} (${spot.status}) — Click to interact`}
      >
        <div className="demo-bay-header">
          <span className="demo-bay-id">{spot.number}</span>
          {isReserved && <span className="demo-bay-badge reserved-badge">RESERVED</span>}
          {spot.type === 'EV' && !isReserved && <span className="demo-bay-badge ev-badge">⚡EV</span>}
        </div>

        <div className="demo-bay-slot">
          {/* AVAILABLE: Subtle OPEN prompt */}
          {isAvailable && (
            <div className="demo-empty-prompt">
              <span>OPEN</span>
            </div>
          )}

          {/* OCCUPIED: Parked automotive silhouette */}
          {isOccupied && (
            <VehicleTopDown color={spot.carColor} isReserved={false} width={38} height={66} />
          )}

          {/* RESERVED: Vehicle resting cleanly over diagonal neon stripes */}
          {isReserved && (
            <VehicleTopDown
              color="#23272F"
              roofColor="#191B20"
              isReserved={true}
              width={38}
              height={66}
            />
          )}

          {/* SELECTED: High-contrast yellow accent vehicle */}
          {isSelected && (
            <VehicleTopDown color="#25221B" isSelected={true} width={38} height={66} />
          )}
        </div>

        <div className="demo-bay-footer">
          <div className="demo-bay-curb" />
        </div>
      </div>
    );
  };

  return (
    <section className="editorial-section map-showcase-section" id="parking-map">
      <div className="editorial-container">
        {/* Header with reduced vertical spacing */}
        <div className="editorial-section-header text-center compact-header">
          <span className="editorial-eyebrow">TOP-DOWN INFRASTRUCTURE</span>
          <h2 className="editorial-section-heading">
            Choose your space before you arrive.
          </h2>
          <p className="editorial-section-sub">
            See the facility layout and select the exact parking space that works for you.
          </p>
        </div>

        {/* Compact Product Demonstration Card */}
        <div className="demo-showcase-wrapper">
          <div className="demo-map-card">
            {/* Top Status Bar: Step indicator + Minimal Legend */}
            <div className="demo-card-topbar">
              <div className="demo-live-badge">
                <span className="demo-live-dot" />
                <span className="demo-step-text">{getStepLabel()}</span>
              </div>

              <div className="demo-compact-legend">
                <span className="demo-legend-item">
                  <span className="legend-chip available" /> Available
                </span>
                <span className="demo-legend-item">
                  <span className="legend-chip selected" /> Selected
                </span>
                <span className="demo-legend-item">
                  <span className="legend-chip reserved-stripe" /> Reserved
                </span>
              </div>
            </div>

            {/* Compact Interactive Floor Canvas */}
            <div className="demo-canvas-viewport">
              {/* Minimalist Animated Precision Cursor */}
              <div
                className={`demo-pointer-cursor ${isPointerClicking ? 'clicking' : ''}`}
                style={{
                  left: `${pointerPos.x}%`,
                  top: `${pointerPos.y}%`,
                  opacity: pointerVisible ? 1 : 0
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="cursor-svg">
                  <path
                    d="M3 3L10.5 21L13.5 13.5L21 10.5L3 3Z"
                    fill="#F4F2E7"
                    stroke="#1E1B16"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                {isPointerClicking && <span className="click-pulse-ring" />}
              </div>

              {/* Row A: 3 Facing Stalls */}
              <div className="demo-spots-row">
                {rowA.map((spot) => renderCompactBay(spot))}
              </div>

              {/* Driving Lane */}
              <div className="demo-driving-lane">
                <div className="demo-lane-line" />
                <div className="demo-lane-content">
                  <span className="demo-lane-tag">ENTRY ▲</span>
                  <span className="demo-lane-label">ONE-WAY LANE · MAX 10 KM/H</span>
                  <span className="demo-lane-arrow">➔</span>
                </div>
                <div className="demo-lane-line" />
              </div>

              {/* Row B: 3 Stalls */}
              <div className="demo-spots-row">
                {rowB.map((spot) => renderCompactBay(spot))}
              </div>
            </div>

            {/* Bottom Caption / Interaction Indicator */}
            <div className="demo-card-footer">
              <span className="demo-footer-hint">
                Interactive preview · Click any open space to test selection
              </span>
              <button
                type="button"
                className="demo-view-full-btn"
                onClick={() => navigate('/driver')}
              >
                <span>Reserve in Driver App</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ParkingMapShowcase;
