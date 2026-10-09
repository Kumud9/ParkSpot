import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';
import parkspotMark from '../../assets/parkspot-mark.png';

export function LandingNavbar({ onOpenAuth }) {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className={`landing-nav-wrapper ${isScrolled ? 'scrolled' : ''}`}>
      <nav className="landing-nav-container">
        {/* Left: ParkSpot Brand (Logo Mark + Wordmark) */}
        <div
          className="landing-nav-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          role="button"
          tabIndex={0}
          aria-label="ParkSpot Home"
        >
          <img
            src={parkspotMark}
            alt="ParkSpot"
            className="landing-brand-logo-img"
            onError={(e) => {
              e.currentTarget.src = '/assets/parkspot-uploaded-logo.png';
            }}
          />
          <span className="landing-brand-wordmark">
            <span className="brand-accent-text">Park</span>Spot
          </span>
        </div>


        {/* Center: Navigation Links */}
        <div className="landing-nav-center">
          <button
            type="button"
            className="landing-nav-item"
            onClick={() => navigate('/driver')}
          >
            Find Parking
          </button>
          <button
            type="button"
            className="landing-nav-item"
            onClick={() => scrollToSection('businesses')}
          >
            For Businesses
          </button>
          <button
            type="button"
            className="landing-nav-item"
            onClick={() => scrollToSection('how-it-works')}
          >
            How It Works
          </button>
          <button
            type="button"
            className="landing-nav-item"
            onClick={() => scrollToSection('principles')}
          >
            About
          </button>
        </div>

        {/* Right: Actions */}
        <div className="landing-nav-actions">
          <button
            type="button"
            className="landing-nav-signin"
            onClick={() => navigate('/login')}
          >
            Sign In
          </button>
          <button
            type="button"
            className="landing-nav-getstarted"
            onClick={() => navigate('/driver')}
          >
            <span>Get Started</span>
            <ArrowRight size={14} />
          </button>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="landing-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="landing-mobile-menu">
          <button
            type="button"
            className="landing-mobile-link"
            onClick={() => {
              setMobileMenuOpen(false);
              navigate('/driver');
            }}
          >
            Find Parking
          </button>
          <button
            type="button"
            className="landing-mobile-link"
            onClick={() => scrollToSection('businesses')}
          >
            For Businesses
          </button>
          <button
            type="button"
            className="landing-mobile-link"
            onClick={() => scrollToSection('how-it-works')}
          >
            How It Works
          </button>
          <button
            type="button"
            className="landing-mobile-link"
            onClick={() => scrollToSection('principles')}
          >
            About
          </button>
          <div className="landing-mobile-actions">
            <button
              type="button"
              className="landing-btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/login');
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className="landing-btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/driver');
              }}
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export default LandingNavbar;
