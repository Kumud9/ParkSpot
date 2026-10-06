import React from 'react';
import { ArrowRight, MapPin } from 'lucide-react';

export default function NearbyFacilityCard({
  facility,
  isSelected,
  isRecommended,
  onSelect,
  onHover,
  onViewSpaces
}) {
  const isAvailable = (facility.availableSpots ?? 0) > 0;
  const rate = facility.startingPrice || facility.hourlyRate || 40;
  const total = facility.totalSpots || 48;
  const available = facility.availableSpots ?? 0;

  // Format distance cleanly
  let distanceDisplay = facility.distanceFormatted;
  if (!distanceDisplay && typeof facility.distanceKm === 'number') {
    if (facility.distanceKm < 1) {
      distanceDisplay = `${Math.round(facility.distanceKm * 1000)} metres`;
    } else {
      distanceDisplay = `${facility.distanceKm.toFixed(1)} km`;
    }
  } else if (!distanceDisplay && facility.distance) {
    distanceDisplay = facility.distance;
  }
  if (!distanceDisplay) distanceDisplay = 'Nearby';

  // Structure / parking type
  const structureDisplay = facility.type || 'Covered Facility';

  // Surveillance / operating hours
  const surveillanceDisplay = facility.openStatus || facility.openingHours || 'Security 24/7';

  // Eyebrow tag: show RECOMMENDED or CLOSEST FACILITY if appropriate
  let topTag = null;
  if (isRecommended) {
    topTag = 'RECOMMENDED';
  } else if (typeof facility.distanceKm === 'number' && facility.distanceKm < 0.6) {
    topTag = 'CLOSEST FACILITY';
  }

  // Derive feature pills from real data
  const tags = [];
  if (facility.supportedTypes?.includes('EV')) tags.push('EV Charging');
  if (facility.supportedTypes?.includes('ACCESSIBLE')) tags.push('Accessible');
  if (
    structureDisplay.toLowerCase().includes('covered') ||
    structureDisplay.toLowerCase().includes('indoor') ||
    structureDisplay.toLowerCase().includes('multi-level')
  ) {
    tags.push('Covered');
  }

  return (
    <div
      className={`nearby-facility-card ${isSelected ? 'is-selected' : ''} ${isRecommended ? 'is-recommended' : ''}`}
      onClick={() => onSelect && onSelect(facility)}
      onMouseEnter={() => onHover && onHover(facility.id)}
      onMouseLeave={() => onHover && onHover(null)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect && onSelect(facility);
        }
      }}
      aria-label={`Facility ${facility.name}, ${distanceDisplay}, ${available} of ${total} spaces available`}
    >
      {/* 1. TOP HEADER ROW: Eyebrow Tag + Status Pill */}
      <div className="card-top-row">
        <div className="card-eyebrow-tag">
          {topTag ? <span className="top-badge">{topTag}</span> : <span />}
        </div>
        <div className="card-availability-pill">
          <span className={`avail-dot ${isAvailable ? 'is-active' : 'is-full'}`} />
          <span className="avail-text">
            <strong>{available}</strong>/{total} SPACES LEFT
          </span>
        </div>
      </div>

      {/* 2. TITLE & RATE ROW */}
      <div className="card-main-row">
        <div className="card-name-address">
          <h3 className="card-facility-name">{facility.name}</h3>
          <p className="card-facility-address">
            <MapPin size={12} className="pin-icon" />
            <span>{facility.address}{facility.city ? `, ${facility.city}` : ''}</span>
          </p>
        </div>
        <div className="card-price-display">
          <span className="price-currency">₹</span>
          <span className="price-val">{rate}</span>
          <span className="price-unit">/hr</span>
        </div>
      </div>

      {/* 3. OPERATIONAL METADATA ROW (3-column tabular display) */}
      <div className="card-meta-grid">
        <div className="meta-col">
          <span className="meta-label">DISTANCE</span>
          <span className="meta-val">{distanceDisplay}</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">STRUCTURE</span>
          <span className="meta-val">{structureDisplay}</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">SURVEILLANCE</span>
          <span className="meta-val">{surveillanceDisplay}</span>
        </div>
      </div>

      {/* 4. FOOTER: AMENITY TAGS + VIEW SPACES CTA */}
      <div className="card-bottom-row">
        <div className="card-tags-group">
          {tags.map((t) => (
            <span key={t} className="amenity-pill">
              {t === 'EV Charging' ? '⚡ ' : ''}{t}
            </span>
          ))}
        </div>

        <button
          type="button"
          className="view-spaces-cta"
          onClick={(e) => {
            e.stopPropagation();
            onViewSpaces && onViewSpaces(facility);
          }}
          aria-label={`View parking spaces for ${facility.name}`}
        >
          <span>VIEW SPACES</span>
          <ArrowRight size={14} className="cta-arrow" />
        </button>
      </div>
    </div>
  );
}
