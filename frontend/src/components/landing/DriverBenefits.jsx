import React from 'react';
import { Radio, MapPin, Receipt, Clock, QrCode, FileText, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function DriverBenefits() {
  const navigate = useNavigate();

  const benefits = [
    {
      title: 'Live availability',
      desc: 'Real-time infrastructure telemetry updates every few seconds so you never drive toward a spot that just got filled.',
      icon: Radio,
      featured: true
    },
    {
      title: 'Exact spot selection',
      desc: 'Choose the bay that matches your preference: near the entrance elevator, next to EV chargers, or ground floor accessible bays.',
      icon: MapPin,
      featured: true
    },
    {
      title: 'Transparent pricing',
      desc: 'Clear hourly and daily rates upfront. No hidden surcharges, mystery meter fees, or unexpected gate charges.',
      icon: Receipt,
      featured: false
    },
    {
      title: 'Flexible booking',
      desc: 'Book on demand 15 minutes before arrival or reserve days in advance for airport and event parking.',
      icon: Clock,
      featured: false
    },
    {
      title: 'Digital parking pass',
      desc: 'Contactless dynamic pass with QR verification and entry code right on your mobile phone screen.',
      icon: QrCode,
      featured: false
    },
    {
      title: 'Booking management',
      desc: 'Easily track active parking sessions, review receipt histories, and manage cancellations with one tap.',
      icon: FileText,
      featured: false
    }
  ];

  return (
    <section className="landing-section" id="for-drivers">
      <div className="landing-container">
        <div className="landing-section-header">
          <span className="landing-eyebrow">Built For Drivers</span>
          <h2 className="landing-section-title">Less circling. More arriving.</h2>
          <p className="landing-section-subtitle">
            Urban drivers waste an average of 17 minutes every trip hunting for open bays.
            ParkSpot turns uncertain street searches into guaranteed reservations.
          </p>
        </div>

        <div className="driver-benefits-grid">
          {benefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div
                key={idx}
                className={`benefit-card ${b.featured ? 'featured' : ''}`}
              >
                <div className="benefit-icon-container">
                  <Icon size={22} strokeWidth={1.8} />
                </div>
                <h3 className="benefit-title">{b.title}</h3>
                <p className="benefit-description">{b.desc}</p>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <button
            type="button"
            className="landing-btn-primary"
            onClick={() => navigate('/driver')}
          >
            Start Finding Parking
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
