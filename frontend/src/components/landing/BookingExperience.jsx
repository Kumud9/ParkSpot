import React from 'react';
import { Check, ShieldCheck, Clock, MapPin, QrCode } from 'lucide-react';

export function BookingExperience() {
  const points = [
    {
      title: 'Exact space',
      desc: 'You receive a designated bay number before you pull in. No hunting down aisles.'
    },
    {
      title: 'Reservation window',
      desc: 'Your spot is held exclusively for your vehicle with buffer time for traffic delays.'
    },
    {
      title: 'Transparent price',
      desc: 'Fixed, upfront pricing per hour. No surge surprises at the payment barrier.'
    },
    {
      title: 'Digital pass',
      desc: 'Seamless QR entry straight from your phone for instant, ticketless gate access.'
    }
  ];

  return (
    <section className="landing-section booking-experience-section" id="booking">
      <div className="landing-container">
        <div className="booking-experience-grid">
          {/* Left Column: Editorial & Value Points */}
          <div className="booking-experience-content">
            <span className="landing-eyebrow">Instant Confirmation</span>
            <h2 className="landing-section-title">
              Your parking is already waiting.
            </h2>
            <p className="landing-section-subtitle" style={{ marginBottom: '2.5rem' }}>
              Whether catching a morning meeting or heading to weekend dinner, book ahead in seconds and skip the entry queue.
            </p>

            <div className="booking-features-grid">
              {points.map((pt) => (
                <div key={pt.title} className="booking-feature-item">
                  <div className="feature-marker">
                    <Check size={14} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="feature-item-title">{pt.title}</h3>
                    <p className="feature-item-desc">{pt.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Photography + Small Booking Pass UI */}
          <div className="booking-experience-visual-col">
            <div className="booking-photo-container">
              <img
                src="/assets/booking-confirmation.webp"
                alt="Driver confirming parking spot on smartphone"
                className="booking-photo"
                loading="lazy"
              />

              {/* Minimal Digital Pass UI Card Beside/Over Photo */}
              <div className="booking-pass-card">
                <div className="pass-card-header">
                  <div className="pass-brand">
                    <span className="pass-status-pill">Active Reservation</span>
                  </div>
                  <span className="pass-code">#PSK-4821</span>
                </div>

                <div className="pass-body">
                  <div className="pass-facility">
                    <MapPin size={14} className="pass-icon" />
                    <span>Riverside Mall Garage • Level 2</span>
                  </div>
                  <div className="pass-spot-highlight">
                    <span className="pass-spot-label">Assigned Space</span>
                    <span className="pass-spot-val">Bay B-14</span>
                  </div>

                  <div className="pass-row">
                    <div>
                      <span className="pass-label">Window</span>
                      <span className="pass-val">14:00 – 16:30</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="pass-label">Rate</span>
                      <span className="pass-val">₹40/hr</span>
                    </div>
                  </div>
                </div>

                <div className="pass-footer">
                  <ShieldCheck size={14} color="#2E7D32" />
                  <span>Entry gate barcode active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default BookingExperience;
