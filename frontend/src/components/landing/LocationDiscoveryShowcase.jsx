import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ArrowRight, CheckCircle2, Clock, Car } from 'lucide-react';

const REAL_DISCOVERY_EXAMPLES = {
  'Ahmedabad Airport': {
    landmark: 'Ahmedabad Airport',
    city: 'Ahmedabad',
    lat: 23.0734,
    lng: 72.6266,
    facilities: [
      {
        id: 'ahmedabad-riverside',
        name: 'Riverside Airport Parking',
        address: 'Airport Circle, Hansol',
        distance: '0.4 km away',
        spaces: 36,
        rate: 40,
        hours: 'Open 24/7',
        types: ['STANDARD', 'EV', 'ACCESSIBLE']
      },
      {
        id: 'ahmedabad-p1',
        name: 'Airport Terminal P1 Hub',
        address: 'Terminal 1 Approach Road, Hansol',
        distance: '0.3 km away',
        spaces: 36,
        rate: 50,
        hours: 'Open 24/7',
        types: ['STANDARD', 'EV']
      }
    ]
  },
  'Vadodara Railway Station': {
    landmark: 'Vadodara Railway Station',
    city: 'Vadodara',
    lat: 22.3107,
    lng: 73.1812,
    facilities: [
      {
        id: 'vadodara-sayajigunj',
        name: 'Sayajigunj Station Plaza',
        address: 'Station Road, Sayajigunj',
        distance: '0.2 km away',
        spaces: 36,
        rate: 35,
        hours: 'Open 24/7',
        types: ['STANDARD', 'COMPACT', 'EV']
      },
      {
        id: 'vadodara-alkapuri',
        name: 'Alkapuri Commercial Hub',
        address: 'RC Dutt Road, Alkapuri',
        distance: '0.8 km away',
        spaces: 36,
        rate: 45,
        hours: '07:00 – 23:30',
        types: ['STANDARD', 'EV', 'ACCESSIBLE']
      }
    ]
  },
  'Parul University': {
    landmark: 'Parul University',
    city: 'Vadodara',
    lat: 22.2887,
    lng: 73.3634,
    facilities: [
      {
        id: 'vadodara-parul',
        name: 'Parul Campus Mobility Hub',
        address: 'Parul University Gate 1, Limda',
        distance: '0.2 km away',
        spaces: 36,
        rate: 20,
        hours: '07:00 – 22:00',
        types: ['STANDARD', 'COMPACT']
      },
      {
        id: 'vadodara-waghodia',
        name: 'Waghodia Crossroad Mobility Lot',
        address: 'Waghodia Main Road, Limda',
        distance: '1.6 km away',
        spaces: 36,
        rate: 25,
        hours: '06:00 – 23:00',
        types: ['STANDARD', 'EV']
      }
    ]
  }
};

export function LocationDiscoveryShowcase() {
  const navigate = useNavigate();
  const [activeLandmark, setActiveLandmark] = useState('Ahmedabad Airport');

  const currentData = REAL_DISCOVERY_EXAMPLES[activeLandmark] || REAL_DISCOVERY_EXAMPLES['Ahmedabad Airport'];

  const handleOpenDiscovery = (dest) => {
    navigate('/driver', {
      state: {
        destination: {
          name: dest.landmark,
          city: dest.city,
          lat: dest.lat,
          lng: dest.lng,
          isCurrentLocation: false
        }
      }
    });
  };

  return (
    <section className="editorial-section location-discovery-section" id="destinations">
      <div className="editorial-container">
        {/* Header */}
        <div className="editorial-section-header text-center">
          <span className="editorial-eyebrow">LOCATION-BASED DISCOVERY</span>
          <h2 className="editorial-section-heading">
            Parking near where you're going.
          </h2>
          <p className="editorial-section-sub">
            Verified ParkSpot facilities near airports, transit interchanges, and universities.
          </p>
        </div>

        {/* Destination Filter Tabs */}
        <div className="discovery-tabs-row">
          {Object.keys(REAL_DISCOVERY_EXAMPLES).map((landmark) => (
            <button
              key={landmark}
              type="button"
              className={`discovery-tab-btn ${activeLandmark === landmark ? 'active' : ''}`}
              onClick={() => setActiveLandmark(landmark)}
            >
              <MapPin size={15} />
              <span>{landmark}</span>
            </button>
          ))}
        </div>

        {/* Facilities Grid */}
        <div className="discovery-preview-grid">
          {currentData.facilities.map((fac) => (
            <div key={fac.id} className="discovery-preview-card">
              <div className="preview-card-header">
                <div>
                  <h3 className="preview-facility-name">{fac.name}</h3>
                  <p className="preview-facility-address">{fac.address}, {currentData.city}</p>
                </div>
                <span className="preview-distance-pill">📍 {fac.distance}</span>
              </div>

              <div className="preview-card-stats">
                <div className="preview-stat-item">
                  <span className="stat-dot available" />
                  <span className="stat-label"><strong>{fac.spaces}</strong> spaces available</span>
                </div>
                <div className="preview-stat-item">
                  <span className="stat-label">From <strong>₹{fac.rate}</strong>/hour</span>
                </div>
                <div className="preview-stat-item">
                  <span className="stat-label">{fac.hours}</span>
                </div>
              </div>

              <div className="preview-types-row">
                {fac.types.map((t) => (
                  <span key={t} className="preview-type-pill">
                    {t === 'EV' ? '⚡ EV Charging' : t === 'ACCESSIBLE' ? '♿ Accessible' : '🅿️ Standard'}
                  </span>
                ))}
              </div>

              <div className="preview-card-action">
                <button
                  type="button"
                  className="preview-view-btn"
                  onClick={() => handleOpenDiscovery(currentData)}
                >
                  <span>View Spaces</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA to Full Search */}
        <div className="discovery-bottom-strip">
          <span className="strip-text">Discover parking across all verified city hubs</span>
          <button
            type="button"
            className="landing-btn-secondary"
            onClick={() => handleOpenDiscovery(currentData)}
          >
            <span>Explore All Locations</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

export default LocationDiscoveryShowcase;
