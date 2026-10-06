import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';

export function ParkingMadeSimple() {
  const navigate = useNavigate();

  return (
    <section className="editorial-section parking-simple-section" id="about">
      <div className="editorial-container">
        <div className="parking-simple-grid">
          {/* Left Column: Real Photographic Composition */}
          <div className="parking-simple-visual">
            <div className="parking-simple-photo-frame">
              <img
                src="/assets/parkspot-hero.jpg"
                alt="Managed parking facility layout"
                className="parking-simple-photo"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = '/assets/parking-residential.webp';
                }}
              />
              <div className="parking-simple-badge">
                <span className="badge-dot" />
                <span className="badge-text">Managed Facility Network</span>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Narrative & Principles */}
          <div className="parking-simple-content">
            <span className="editorial-eyebrow">A BETTER WAY TO PARK</span>
            <h2 className="editorial-section-heading">
              Parking that works around you.
            </h2>
            <p className="editorial-section-lead">
              ParkSpot connects drivers with managed parking facilities while helping operators understand demand, manage capacity, and run their facilities more efficiently.
            </p>

            <div className="parking-simple-narrative">
              <div className="narrative-point">
                <div className="point-marker"><Check size={16} strokeWidth={3} /></div>
                <div className="point-body">
                  <h3 className="point-title">Guaranteed Space Allocation</h3>
                  <p className="point-desc">
                    Eliminate circular driving and congested search patterns. Your exact parking bay is held and verified before departure.
                  </p>
                </div>
              </div>

              <div className="narrative-point">
                <div className="point-marker"><Check size={16} strokeWidth={3} /></div>
                <div className="point-body">
                  <h3 className="point-title">Top-Down Facility Visibility</h3>
                  <p className="point-desc">
                    View real driving lanes, floor levels, EV bays, and accessible spaces on an accurate spatial layout.
                  </p>
                </div>
              </div>

              <div className="narrative-point">
                <div className="point-marker"><Check size={16} strokeWidth={3} /></div>
                <div className="point-body">
                  <h3 className="point-title">Tailored for Managed Facilities</h3>
                  <p className="point-desc">
                    Focused exclusively on structured parking environments: residential societies, commercial complexes, university campuses, and transit hubs.
                  </p>
                </div>
              </div>
            </div>

            <div className="parking-simple-cta-wrap">
              <button
                type="button"
                className="landing-btn-secondary"
                onClick={() => navigate('/driver')}
              >
                <span>Find Your Space</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ParkingMadeSimple;
