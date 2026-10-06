import React, { useState, useEffect } from 'react';
import { Navigation, MapPin } from 'lucide-react';

/**
 * Calculates straight-line distance in km using Haversine formula
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(distKm) {
  if (typeof distKm !== 'number' || isNaN(distKm)) return null;
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m away`;
  }
  return `${distKm.toFixed(1)} km away`;
}

/**
 * Navigate to Facility Entrance Component
 * Uses the facility's existing geographic coordinates (no fake coordinates).
 * Opens user's preferred navigation/maps app with entrance destination preset.
 */
export function NavigateToEntranceButton({
  booking,
  facility,
  showDistance = true,
  className = '',
  size = 'md',
  style = {}
}) {
  const [distanceText, setDistanceText] = useState(null);

  // Extract real geographic coordinates from booking or facility
  const lat =
    booking?.lot?.latitude ??
    booking?.latitude ??
    facility?.latitude ??
    (booking?.lot?.location?.coordinates ? booking.lot.location.coordinates[1] : null) ??
    (facility?.location?.coordinates ? facility.location.coordinates[1] : null);

  const lng =
    booking?.lot?.longitude ??
    booking?.longitude ??
    facility?.longitude ??
    (booking?.lot?.location?.coordinates ? booking.lot.location.coordinates[0] : null) ??
    (facility?.location?.coordinates ? facility.location.coordinates[0] : null);

  const facilityAddress =
    booking?.facilityAddress ||
    booking?.lot?.address ||
    facility?.address ||
    booking?.facilityName ||
    facility?.name ||
    '';

  useEffect(() => {
    if (!showDistance || typeof lat !== 'number' || typeof lng !== 'number') return;

    if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = calculateDistance(pos.coords.latitude, pos.coords.longitude, lat, lng);
          setDistanceText(formatDistance(d));
        },
        () => {
          // Fallback silently if location permission denied
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, [lat, lng, showDistance]);

  const handleNavigate = (e) => {
    e.stopPropagation();
    if (typeof lat === 'number' && typeof lng === 'number') {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (facilityAddress) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(facilityAddress)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const hasCoordsOrAddress = (typeof lat === 'number' && typeof lng === 'number') || Boolean(facilityAddress);

  return (
    <div className={`navigate-entrance-wrapper ${className}`} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem', ...style }}>
      {showDistance && distanceText && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          fontSize: '0.75rem',
          color: 'var(--ps-secondary-dark)',
          fontWeight: 600
        }}>
          <MapPin size={12} />
          <span>{distanceText}</span>
        </div>
      )}
      <button
        type="button"
        className={`btn btn-primary ${size === 'sm' ? 'btn-sm' : ''} navigate-to-entrance-btn`}
        onClick={handleNavigate}
        disabled={!hasCoordsOrAddress}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: size === 'sm' ? '0.45rem 0.85rem' : '0.65rem 1.15rem',
          fontWeight: 600,
          borderRadius: 'var(--ps-radius-sm)',
          cursor: hasCoordsOrAddress ? 'pointer' : 'not-allowed'
        }}
        title="Open navigation directions to facility entrance"
      >
        <Navigation size={size === 'sm' ? 14 : 16} />
        <span>Navigate to Entrance →</span>
      </button>
    </div>
  );
}

export default NavigateToEntranceButton;
