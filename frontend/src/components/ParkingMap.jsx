import React from 'react';
import { VehicleTopDown } from './VehicleTopDown';
import { ShieldAlert, Wrench, Check, ArrowRight, ArrowLeft } from 'lucide-react';

const CAR_PALETTE = [
  '#3E444E', // Graphite Gray
  '#1C2D4A', // Deep Navy
  '#7A2525', // Burgundy Red
  '#8E9296', // Silver Metallic
  '#2C3E35', // Forest Green
  '#4A4740'  // Dark Bronze
];

export function ParkingMap({
  floors = ['Floor 1', 'Floor 2', 'Floor 3'],
  activeFloor = 'Floor 1',
  onSelectFloor,
  spots = [],
  selectedSpotId = null,
  onSelectSpot,
  isOperator = false
}) {
  // Partition spots into logical parking rows (A, B, C, D)
  const hasLetterRows = spots.some((s) => /^[A-D]/i.test(s.number));
  let rowA = [];
  let rowB = [];
  let rowC = [];
  let rowD = [];

  if (hasLetterRows) {
    rowA = spots.filter((s) => s.number.toUpperCase().startsWith('A'));
    rowB = spots.filter((s) => s.number.toUpperCase().startsWith('B'));
    rowC = spots.filter((s) => s.number.toUpperCase().startsWith('C'));
    rowD = spots.filter((s) => s.number.toUpperCase().startsWith('D'));
  }

  // If letter-based rows are empty (e.g. backend slots like G-01..G-12, L1-01, etc.),
  // distribute spots evenly across rows A, B, C, D so the entire layout is populated
  if (rowA.length === 0 && rowB.length === 0 && rowC.length === 0 && rowD.length === 0 && spots.length > 0) {
    const perRow = Math.max(1, Math.ceil(spots.length / 4));
    rowA = spots.slice(0, perRow);
    rowB = spots.slice(perRow, perRow * 2);
    rowC = spots.slice(perRow * 2, perRow * 3);
    rowD = spots.slice(perRow * 3);
  }

  const rows = { A: rowA, B: rowB, C: rowC, D: rowD };

  const renderBay = (spot, index) => {
    const isSelected = selectedSpotId === spot.id;
    const isOccupied = spot.status === 'OCCUPIED';
    const isReserved = spot.status === 'RESERVED';
    const isAvailable = spot.status === 'AVAILABLE';
    const isMaintenance = spot.status === 'MAINTENANCE';
    const isBlocked = spot.status === 'BLOCKED';

    // Consistent pseudo-random car color based on spot index
    const carColor = CAR_PALETTE[index % CAR_PALETTE.length];

    let bayClass = 'parking-bay';
    if (isSelected) bayClass += ' selected';
    else if (isOccupied) bayClass += ' occupied';
    else if (isReserved) bayClass += ' reserved';
    else if (isMaintenance) bayClass += ' maintenance';
    else if (isBlocked) bayClass += ' blocked';

    return (
      <div
        key={spot.id}
        className={bayClass}
        onClick={() => {
          if (isAvailable || isOperator || isSelected) {
            onSelectSpot && onSelectSpot(spot);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isAvailable || isOperator || isSelected) {
              onSelectSpot && onSelectSpot(spot);
            }
          }
        }}
        role="button"
        tabIndex={isAvailable || isOperator ? 0 : -1}
        aria-pressed={isSelected}
        aria-disabled={!isAvailable && !isOperator}
        aria-label={`Parking Spot ${spot.number}, ${spot.status}, ${spot.floor || activeFloor}, ${spot.type || 'Standard'} bay${spot.rate ? `, ₹${spot.rate} per hour` : ''}`}
        title={`Spot ${spot.number} — ${spot.status}`}
      >
        <div className="bay-header">
          <span className="bay-id">{spot.number}</span>
          {spot.type && spot.type !== 'STANDARD' && (
            <span style={{ fontSize: '0.625rem', color: 'var(--ps-accent-light)' }}>
              {spot.type === 'EV' ? '⚡EV' : '♿ACC'}
            </span>
          )}
        </div>

        <div className="bay-car-slot">
          {/* AVAILABLE: Empty bay with subtle target prompt */}
          {isAvailable && !isSelected && (
            <div className="bay-empty-indicator">
              <span style={{ fontSize: '0.6875rem' }}>OPEN</span>
            </div>
          )}

          {/* OCCUPIED: Realistic car inside bay */}
          {isOccupied && !isSelected && (
            <VehicleTopDown color={carColor} isReserved={false} />
          )}

          {/* RESERVED: Top-down car with subtle reservation beacon */}
          {isReserved && !isSelected && (
            <VehicleTopDown color="#544D3F" isReserved={true} />
          )}

          {/* SELECTED: High-contrast yellow accent car */}
          {isSelected && (
            <VehicleTopDown color="#25221B" isSelected={true} />
          )}

          {/* MAINTENANCE: Restrained maintenance indicator */}
          {isMaintenance && (
            <div style={{ textAlign: 'center', color: '#888888' }}>
              <Wrench size={20} strokeWidth={1.5} />
              <div style={{ fontSize: '0.625rem', marginTop: '2px' }}>MAINT</div>
            </div>
          )}

          {/* BLOCKED: Reserved / Operator Block indicator */}
          {isBlocked && (
            <div style={{ textAlign: 'center', color: '#555555' }}>
              <ShieldAlert size={20} strokeWidth={1.5} />
              <div style={{ fontSize: '0.625rem', marginTop: '2px' }}>BLOCKED</div>
            </div>
          )}
        </div>

        <div className="bay-footer">
          <div className="bay-bumper"></div>
        </div>
      </div>
    );
  };

  return (
    <div className="parking-structure">
      {/* Top Overhead Bar */}
      <div className="facility-overhead-bar">
        <div className="floor-pill-group">
          {floors.map((floor) => (
            <button
              key={floor}
              className={`floor-pill ${activeFloor === floor ? 'active' : ''}`}
              onClick={() => onSelectFloor && onSelectFloor(floor)}
            >
              {floor}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="parking-legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: 'var(--ps-state-available)' }}></span>
            <span>Available</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: 'var(--ps-state-occupied)' }}></span>
            <span>Occupied</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: 'var(--ps-state-reserved)' }}></span>
            <span>Reserved</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: 'var(--ps-accent-light)' }}></span>
            <span>Selected</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: 'var(--ps-state-maintenance)' }}></span>
            <span>Maint.</span>
          </div>
        </div>
      </div>

      {/* Row A */}
      <div className="parking-row-grid">
        {rows.A.map((spot, idx) => renderBay(spot, idx))}
      </div>

      {/* Driving Lane 1 (One-Way Traffic Flow) */}
      <div className="driving-lane">
        <div className="lane-arrow">
          <span className="lane-indicator entry">ENTRY ▲</span>
          <ArrowRight size={16} />
          <span>LANE 1 (WESTBOUND)</span>
        </div>
        <div className="lane-arrow">
          <span>MAX 10 KM/H</span>
          <ArrowRight size={16} />
        </div>
      </div>

      {/* Row B & Row C (Face-to-Face Stalls) */}
      <div className="parking-row-grid" style={{ marginBottom: '0.75rem' }}>
        {rows.B.map((spot, idx) => renderBay(spot, idx + 10))}
      </div>
      <div className="parking-row-grid">
        {rows.C.map((spot, idx) => renderBay(spot, idx + 20))}
      </div>

      {/* Driving Lane 2 (Exit Traffic Flow) */}
      <div className="driving-lane">
        <div className="lane-arrow">
          <ArrowLeft size={16} />
          <span>LANE 2 (EASTBOUND)</span>
        </div>
        <div className="lane-arrow">
          <ArrowLeft size={16} />
          <span className="lane-indicator exit">EXIT ▼</span>
        </div>
      </div>

      {/* Row D */}
      <div className="parking-row-grid">
        {rows.D.map((spot, idx) => renderBay(spot, idx + 30))}
      </div>
    </div>
  );
}
