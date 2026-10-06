import React from 'react';
import { Search, MapPin, CheckCircle2, QrCode } from 'lucide-react';

export function BenefitStrip() {
  const benefits = [
    {
      icon: Search,
      title: 'Find faster',
      subtitle: 'Real-time lot availability'
    },
    {
      icon: MapPin,
      title: 'Choose your exact spot',
      subtitle: 'Interactive layout maps'
    },
    {
      icon: CheckCircle2,
      title: 'Book with confidence',
      subtitle: 'Guaranteed space upon arrival'
    },
    {
      icon: QrCode,
      title: 'Digital parking pass',
      subtitle: 'Contactless entry & exit'
    }
  ];

  return (
    <div className="micro-value-strip" aria-label="Core ParkSpot benefits">
      <div className="landing-container">
        <div className="micro-value-grid">
          {benefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div key={idx} className="micro-value-item">
                <div className="micro-value-icon-box">
                  <Icon size={18} strokeWidth={2} />
                </div>
                <div>
                  <div className="micro-value-text">{b.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ps-landing-muted)', marginTop: '1px' }}>
                    {b.subtitle}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
