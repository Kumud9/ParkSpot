import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../shared/Logo';

export function LandingFooter() {
  const navigate = useNavigate();

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="editorial-landing-footer">
      <div className="editorial-container">
        <div className="editorial-footer-grid">
          {/* Brand Info */}
          <div className="footer-brand-col">
            <div
              className="footer-logo-wrap"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              role="button"
              tabIndex={0}
            >
              <Logo variant="full" size="md" theme="dark" />
            </div>
            <p className="footer-tagline">Parking, without the search.</p>
            <p className="footer-desc">
              Structured space reservation and real-time parking-state information for managed residential, commercial, and transit facilities.
            </p>
          </div>

          {/* Links Column */}
          <div className="footer-links-col">
            <h4 className="footer-links-heading">Explore ParkSpot</h4>
            <div className="footer-links-list">
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => navigate('/driver')}
              >
                Find Parking
              </button>
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => {
                  scrollToSection('businesses');
                }}
              >
                For Businesses
              </button>
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => {
                  scrollToSection('how-it-works');
                }}
              >
                How It Works
              </button>
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => {
                  scrollToSection('about');
                }}
              >
                About
              </button>
            </div>
          </div>

          {/* Legal / Contact Column */}
          <div className="footer-links-col">
            <h4 className="footer-links-heading">Platform & Support</h4>
            <div className="footer-links-list">
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => navigate('/driver')}
              >
                Contact
              </button>
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => navigate('/driver')}
              >
                Privacy
              </button>
              <button
                type="button"
                className="footer-link-btn"
                onClick={() => navigate('/driver')}
              >
                Terms
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Strip */}
        <div className="editorial-footer-bottom">
          <div className="footer-copy">
            © {new Date().getFullYear()} ParkSpot Technologies Inc. All rights reserved.
          </div>
          <div className="footer-bottom-badge">
            <span className="dot-green" /> Verified Managed Facilities Platform
          </div>
        </div>
      </div>
    </footer>
  );
}

export default LandingFooter;
