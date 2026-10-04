import React from 'react';

/**
 * Realistic Top-Down Automotive Vehicle Representation
 * Renders a contoured vehicle chassis with windshield, rear glass, roof, side mirrors, and lights.
 */
export function VehicleTopDown({
  color = '#404348',
  roofColor = null,
  isReserved = false,
  isSelected = false,
  width = 54,
  height = 92
}) {
  const actualRoofColor = roofColor || color;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 60 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        filter: isSelected
          ? 'drop-shadow(0 0 6px rgba(243, 244, 86, 0.75))'
          : 'drop-shadow(0 3px 5px rgba(0, 0, 0, 0.5))',
        transition: 'transform 0.2s ease, filter 0.2s ease',
        transform: isSelected ? 'scale(1.04)' : 'scale(1)'
      }}
    >
      {/* 4 Wheels / Tires */}
      <rect x="2" y="14" width="6" height="15" rx="2" fill="#111111" />
      <rect x="52" y="14" width="6" height="15" rx="2" fill="#111111" />
      <rect x="2" y="66" width="6" height="15" rx="2" fill="#111111" />
      <rect x="52" y="66" width="6" height="15" rx="2" fill="#111111" />

      {/* Main Car Body Chassis */}
      <path
        d="M 12 16
           C 12 8, 20 4, 30 4
           C 40 4, 48 8, 48 16
           L 49 76
           C 49 86, 44 94, 30 94
           C 16 94, 11 86, 11 76
           Z"
        fill={isSelected ? '#F3F456' : color}
        stroke={isSelected ? '#25221B' : '#141412'}
        strokeWidth="1.5"
      />

      {/* Side Mirrors */}
      <path d="M 9 26 L 4 23 C 3 22, 3 20, 5 20 L 10 22 Z" fill={isSelected ? '#B2A240' : color} />
      <path d="M 51 26 L 56 23 C 57 22, 57 20, 55 20 L 50 22 Z" fill={isSelected ? '#B2A240' : color} />

      {/* Front Hood Line */}
      <path
        d="M 18 20 Q 30 23 42 20"
        stroke={isSelected ? 'rgba(37,34,27,0.3)' : 'rgba(255,255,255,0.25)'}
        strokeWidth="1"
        fill="none"
      />

      {/* Front Windshield */}
      <path
        d="M 15 28
           C 15 26, 20 25, 30 25
           C 40 25, 45 26, 45 28
           L 43 40
           L 17 40
           Z"
        fill="#1C242B"
        stroke="#11161B"
        strokeWidth="0.8"
      />

      {/* Windshield Reflection */}
      <path
        d="M 18 29 L 28 27 L 25 38 L 19 39 Z"
        fill="rgba(255, 255, 255, 0.18)"
      />

      {/* Car Roof */}
      <rect
        x="17"
        y="40"
        width="26"
        height="26"
        rx="3"
        fill={isSelected ? '#E2E348' : actualRoofColor}
        stroke={isSelected ? '#B2A240' : 'rgba(0,0,0,0.25)'}
        strokeWidth="1"
      />

      {/* Rear Window */}
      <path
        d="M 18 68
           L 42 68
           L 44 76
           C 44 78, 38 80, 30 80
           C 22 80, 16 78, 16 76
           Z"
        fill="#1C242B"
        stroke="#11161B"
        strokeWidth="0.8"
      />

      {/* Headlights */}
      <rect x="13" y="6" width="6" height="3" rx="1.5" fill="#FFFDE6" opacity="0.9" />
      <rect x="41" y="6" width="6" height="3" rx="1.5" fill="#FFFDE6" opacity="0.9" />

      {/* Taillights */}
      <rect x="14" y="91" width="7" height="2" rx="1" fill="#E53935" />
      <rect x="39" y="91" width="7" height="2" rx="1" fill="#E53935" />

      {/* Subtle Reservation Beacon / Indicator */}
      {isReserved && !isSelected && (
        <g>
          <circle cx="30" cy="53" r="6" fill="#D97706" />
          <text
            x="30"
            y="56"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="8"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            R
          </text>
        </g>
      )}

      {/* Selection Accent Beacon */}
      {isSelected && (
        <g>
          <circle cx="30" cy="53" r="7" fill="#25221B" />
          <path
            d="M 27 53 L 29 55 L 34 50"
            stroke="#F3F456"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}
