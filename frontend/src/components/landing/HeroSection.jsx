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
      {/* Background Image: Full-bleed cover */}
      <img
        src="/assets/parkspot-hero.jpg"
        alt="ParkSpot modern managed parking facility"
        className="editorial-hero-bg-img"
        loading="eager"
        onError={(e) => {
          e.currentTarget.src = '/assets/parking-residential.webp';
        }}
      />

      {/* Dark Left-Side Gradient Overlay */}
      <div className="editorial-hero-overlay" />

      {/* Navbar positioned over hero */}
      <div className="editorial-hero-nav-slot">
        <LandingNavbar onOpenAuth={onOpenAuth} />
      </div>

      {/* Hero Content: Left-aligned, high contrast, editorial layout */}
      <div className="editorial-hero-content-wrap">
        <div className="editorial-hero-content">
          {/* Eyebrow: PREMIUM MANAGED PARKING ─── */}
          <div className="editorial-hero-eyebrow">
            <span className="editorial-hero-tag">PREMIUM MANAGED PARKING</span>
            <span className="editorial-hero-eyebrow-line" aria-hidden="true" />
          </div>

          {/* Headline: Parking, without the search. */}
          <h1 className="editorial-hero-headline">
            Parking,<br />
            without the<br />
            <span className="hero-headline-accent">search.</span>
          </h1>

          {/* Supporting Text */}
          <p className="editorial-hero-subhead">
            Find a parking facility, choose your space,<br className="hero-subhead-break" />
            and reserve it before you arrive.
          </p>

          {/* CTA Buttons */}
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
    </section>
  );
}

export default HeroSection;
