import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function FinalCTA() {
  const navigate = useNavigate();

  return (
    <section className="editorial-final-cta-section" aria-label="Get started with ParkSpot">
      <div className="editorial-container">
        <div className="final-cta-dark-card">
          <div className="final-cta-content">
            <span className="final-cta-eyebrow">GET STARTED TODAY</span>
            <h2 className="final-cta-heading">
              Parking should be the easy part.
            </h2>
            <p className="final-cta-body">
              Find your space or bring your parking operation into one place.
            </p>

            <div className="final-cta-buttons">
              <button
                type="button"
                className="final-cta-btn-accent"
                onClick={() => navigate('/driver')}
              >
                <span>Find Parking</span>
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="final-cta-btn-outline"
                onClick={() => navigate('/operator')}
              >
                For Businesses
              </button>
            </div>
          </div>

          <div className="final-cta-image-wrapper">
            <img
              src="/assets/driver-parking-confirmation.jpg"
              alt="ParkSpot driver confirming parking reservation on phone"
              className="final-cta-image"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default FinalCTA;
