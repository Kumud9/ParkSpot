import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { LandingNavbar } from './LandingNavbar';

export function HeroSection({ onOpenAuth }) {
  const navigate = useNavigate();

  const scrollToBusinesses = () => {
    const el = document.getElementById('businesses');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else navigate('/operator');
  };

  return (
    <section className="editorial-hero" id="hero">
      <div className="editorial-hero-container">
        {/* Large Rounded Hero Panel */}
        <div className="editorial-hero-panel">
          {/* Hero Photographic Background (Cover / Center) */}
          <img
            src="/assets/parkspot-hero.jpg"
            alt="ParkSpot managed parking architectural facility"
            className="editorial-hero-bg-img"
            loading="eager"
            onError={(e) => {
              e.currentTarget.src = '/assets/parking-residential.webp';
            }}
          />

          {/* Subtle Dark/Neutral Photographic Gradient Overlay */}
          <div className="editorial-hero-overlay" />

          {/* 4. Integrated Navigation Pill inside the Hero Composition */}
          <div className="editorial-hero-nav-slot">
            <LandingNavbar onOpenAuth={onOpenAuth} />
          </div>

          {/* Mobile Dedicated Hero Image (Rendered only on Mobile per Section 12) */}
          <div className="editorial-hero-mobile-image-wrap">
            <img
              src="/assets/parkspot-hero.jpg"
              alt="ParkSpot parking facilities"
              className="editorial-hero-mobile-img"
              loading="eager"
            />
          </div>

          {/* 5. Hero Editorial Copy ON TOP OF / WITHIN the Hero Image */}
          <div className="editorial-hero-content">
            <span className="editorial-hero-tag">PREMIUM MANAGED PARKING</span>

            <h1 className="editorial-hero-headline">
              Parking,<br className="hero-heading-break" />without the search.
            </h1>

            <p className="editorial-hero-subhead">
              Find a parking facility, choose your exact space,<br className="hero-subhead-break" />
              and reserve it before you arrive.
            </p>

            <div className="editorial-hero-buttons">
              <button
                type="button"
                className="editorial-btn-find-parking"
                onClick={() => navigate('/driver')}
              >
                <span>Find Parking</span>
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="editorial-btn-for-businesses"
                onClick={scrollToBusinesses}
              >
                For Businesses
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
