import React, { useState } from 'react';
import { ParkingMap } from '../ParkingMap';
import { X, MapPin, Car, ArrowDown, ChevronRight, Navigation } from 'lucide-react';
import { NavigateToEntranceButton } from './NavigateToEntranceButton';

/**
 * Extracts logical row from spot number (e.g. "B12" -> "Row B", "A-04" -> "Row A")
 */
function extractRow(spotNumber) {
  if (!spotNumber) return 'Row 1';
  const match = spotNumber.match(/^([A-Za-z])/);
  if (match) {
    return `Row ${match[1].toUpperCase()}`;
  }
  return 'Main Bay';
}

/**
 * Find My Car Modal
 * Authoritative: Uses the driver's own booking.
 * Highlights the booked spot using the existing ParkingMap.jsx visual language.
 */
export function FindMyCarModal({
  booking,
  facility = null,
  facilitySpots = [],
  onClose
}) {
  const [showMap, setShowMap] = useState(true);

  if (!booking) return null;

  const facilityName = booking.facilityName || facility?.name || 'ParkSpot Facility';
  const facilityAddress = booking.facilityAddress || facility?.address || '';
  const floor = booking.floor || 'Floor 1';
  const spotNumber = booking.spotNumber || '—';
  const spotId = booking.spotId || booking.slotId || spotNumber;
  const row = extractRow(spotNumber);

  // If facilitySpots is empty, synthesize a minimal representation containing the booked spot
  const spotsToDisplay = facilitySpots && facilitySpots.length > 0
    ? facilitySpots
    : [
        {
          id: spotId,
          number: spotNumber,
          floor: floor,
          status: 'RESERVED',
          type: 'STANDARD',
          isMyBooking: true
        }
      ];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '680px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          backgroundColor: 'var(--ps-primary-dark)',
          color: 'var(--ps-primary-light)',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              backgroundColor: 'var(--ps-accent-light)',
              color: 'var(--ps-primary-dark)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Car size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', color: 'rgba(244, 242, 231, 0.7)' }}>
                PARKSPOT ASSISTANT
              </div>
              <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--ps-primary-light)' }}>
                Find My Car
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(244, 242, 231, 0.75)',
              cursor: 'pointer',
              padding: '0.25rem'
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {/* Card: Spot Location Summary */}
          <div style={{
            backgroundColor: 'var(--ps-primary-light)',
            border: '2px solid var(--ps-accent-dark)',
            borderRadius: 'var(--ps-radius-md)',
            padding: '1.25rem',
            marginBottom: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="eyebrow" style={{ color: 'var(--ps-secondary-dark)' }}>YOUR CAR LOCATION</span>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--ps-primary-dark)', marginBottom: '0.25rem' }}>
                  {facilityName}
                </h3>
                {facilityAddress && (
                  <p className="metadata" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MapPin size={13} /> {facilityAddress}
                  </p>
                )}
              </div>

              {/* Large Spot Badge */}
              <div style={{
                backgroundColor: 'var(--ps-primary-dark)',
                color: 'var(--ps-accent-light)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--ps-radius-sm)',
                textAlign: 'center',
                minWidth: '96px'
              }}>
                <div style={{ fontSize: '0.625rem', color: 'rgba(244, 242, 231, 0.7)' }}>SPACE</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--ps-font-mono)', lineHeight: 1 }}>
                  {spotNumber}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(244, 242, 231, 0.85)', marginTop: '2px' }}>
                  {floor}
                </div>
              </div>
            </div>

            {/* In-Garage Wayfinding Path Guidance */}
            <div style={{
              marginTop: '1.25rem',
              padding: '1rem',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--ps-radius-sm)',
              border: '1px solid rgba(0,0,0,0.06)'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ps-secondary-dark)', marginBottom: '0.65rem', letterSpacing: '0.04em' }}>
                WAYFINDING ROUTE
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontFamily: 'var(--ps-font-mono)'
              }}>
                <span style={{ padding: '0.3rem 0.6rem', backgroundColor: 'var(--ps-secondary-light)', borderRadius: 'var(--ps-radius-sm)' }}>
                  Entrance
                </span>
                <ChevronRight size={16} color="var(--ps-secondary-dark)" />
                <span style={{ padding: '0.3rem 0.6rem', backgroundColor: 'var(--ps-secondary-light)', borderRadius: 'var(--ps-radius-sm)' }}>
                  {floor}
                </span>
                <ChevronRight size={16} color="var(--ps-secondary-dark)" />
                <span style={{ padding: '0.3rem 0.6rem', backgroundColor: 'var(--ps-secondary-light)', borderRadius: 'var(--ps-radius-sm)' }}>
                  {row}
                </span>
                <ChevronRight size={16} color="var(--ps-secondary-dark)" />
                <span style={{
                  padding: '0.3rem 0.65rem',
                  backgroundColor: 'var(--ps-accent-light)',
                  color: 'var(--ps-primary-dark)',
                  fontWeight: 800,
                  borderRadius: 'var(--ps-radius-sm)',
                  border: '1px solid var(--ps-accent-dark)'
                }}>
                  {spotNumber} ← YOUR CAR
                </span>
              </div>
            </div>
          </div>

          {/* Toggle Map View button if desired */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ps-primary-dark)' }}>
              Parking Bay Layout
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowMap(!showMap)}
            >
              {showMap ? 'Hide Parking Map' : 'Show My Spot on Map'}
            </button>
          </div>

          {/* Reused EXISTING ParkingMap.jsx component */}
          {showMap && (
            <div style={{
              borderRadius: 'var(--ps-radius-md)',
              overflow: 'hidden',
              border: '1px solid var(--ps-secondary-light)',
              padding: '1rem',
              backgroundColor: '#1E1D1A'
            }}>
              <ParkingMap
                floors={facility?.floors || [floor]}
                activeFloor={floor}
                spots={spotsToDisplay}
                selectedSpotId={spotId}
                userBookings={[booking]}
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--ps-secondary-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#FAFAF7',
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}>
          <NavigateToEntranceButton
            booking={booking}
            facility={facility}
            showDistance={false}
            size="sm"
          />

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default FindMyCarModal;
