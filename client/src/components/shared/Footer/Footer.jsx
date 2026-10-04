import React from 'react';
import { Logo } from '../Logo';
import { ShieldCheck, MapPin, Phone, Mail } from 'lucide-react';

export function Footer({ onNavigate }) {
  return (
    <footer style={{
      backgroundColor: 'var(--ps-primary-dark, #25221B)',
      color: 'var(--ps-primary-light, #F4F2E7)',
      padding: '3rem 1.5rem 2rem',
      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
      marginTop: 'auto'
    }}>
      <div className="container" style={{ padding: 0 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '2rem',
          marginBottom: '2.5rem'
        }}>
          {/* Brand Column */}
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <Logo size="sm" theme="dark" />
            </div>
            <p style={{
              fontSize: '0.8125rem',
              color: 'rgba(244, 242, 231, 0.7)',
              lineHeight: 1.6,
              maxWidth: '320px',
              marginBottom: '1rem'
            }}>
              ParkSpot Smart Infrastructure — Real-time top-down parking space telemetry, dynamic reservations, and automated operator management.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'rgba(244, 242, 231, 0.6)' }}>
              <ShieldCheck size={14} color="var(--ps-accent-light, #F3F456)" />
              <span>Certified Intelligent Urban Parking Network</span>
            </div>
          </div>

          {/* Driver Navigation */}
          <div>
            <h4 style={{ color: 'var(--ps-primary-light)', fontSize: '0.875rem', marginBottom: '0.85rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Driver Services
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <li>
                <button
                  onClick={() => onNavigate && onNavigate('driver', 'home')}
                  style={{ background: 'none', border: 'none', color: 'rgba(244, 242, 231, 0.75)', cursor: 'pointer', padding: 0, font: 'inherit' }}
                >
                  Find Parking
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate && onNavigate('driver', 'bookings')}
                  style={{ background: 'none', border: 'none', color: 'rgba(244, 242, 231, 0.75)', cursor: 'pointer', padding: 0, font: 'inherit' }}
                >
                  My Reservations
                </button>
              </li>
              <li>
                <span style={{ color: 'rgba(244, 242, 231, 0.5)' }}>Digital Parking Pass</span>
              </li>
              <li>
                <span style={{ color: 'rgba(244, 242, 231, 0.5)' }}>EV Charging Spaces</span>
              </li>
            </ul>
          </div>

          {/* Operator Navigation */}
          <div>
            <h4 style={{ color: 'var(--ps-primary-light)', fontSize: '0.875rem', marginBottom: '0.85rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Operator & B2B
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <li>
                <button
                  onClick={() => onNavigate && onNavigate('operator')}
                  style={{ background: 'none', border: 'none', color: 'rgba(244, 242, 231, 0.75)', cursor: 'pointer', padding: 0, font: 'inherit' }}
                >
                  B2B Operations Portal
                </button>
              </li>
              <li>
                <span style={{ color: 'rgba(244, 242, 231, 0.5)' }}>Occupancy Telemetry</span>
              </li>
              <li>
                <span style={{ color: 'rgba(244, 242, 231, 0.5)' }}>Dynamic Pricing Simulator</span>
              </li>
              <li>
                <span style={{ color: 'rgba(244, 242, 231, 0.5)' }}>Demand Forecasting</span>
              </li>
            </ul>
          </div>

          {/* Contact / Network Info */}
          <div>
            <h4 style={{ color: 'var(--ps-primary-light)', fontSize: '0.875rem', marginBottom: '0.85rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Network Support
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem', color: 'rgba(244, 242, 231, 0.7)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <MapPin size={14} /> Connaught Place, New Delhi 110001
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Phone size={14} /> +91 11 2345 6789
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Mail size={14} /> support@parkspot.test
              </div>
            </div>
          </div>
        </div>

        {/* Bottom copyright line */}
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.75rem',
          color: 'rgba(244, 242, 231, 0.5)'
        }}>
          <div>
            © 2026 ParkSpot Technologies Inc. All rights reserved. Official Brand Identity.
          </div>
          <div style={{ display: 'flex', gap: '1.25rem' }}>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Security Architecture</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
