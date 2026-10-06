import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, TrendingUp, DollarSign, Settings, ShieldCheck, Check } from 'lucide-react';

const HIGHLIGHTS = [
  {
    icon: BarChart3,
    title: 'Live Parking',
    desc: 'Real-time parking-state visibility across all levels, driving bays, and assigned spaces.'
  },
  {
    icon: TrendingUp,
    title: 'Demand',
    desc: 'Clear foresight into arrival patterns, peak dwell windows, and turnover velocity.'
  },
  {
    icon: DollarSign,
    title: 'Pricing',
    desc: 'Calibrate flexible rates to match utilization and encourage balanced turnover.'
  },
  {
    icon: Settings,
    title: 'Operations',
    desc: 'Automate gate check-ins, overstay identification, and verifiable digital passes.'
  }
];

export function BusinessSection() {
  const navigate = useNavigate();

  return (
    <section className="editorial-section business-section" id="businesses">
      <div className="editorial-container">
        {/* Two-Column Editorial Layout */}
        <div className="business-editorial-grid">
          {/* Left Column: Business Value Proposition */}
          <div className="business-content-col">
            <span className="editorial-eyebrow">FOR FACILITY OPERATORS</span>
            <h2 className="editorial-section-heading">
              Better parking operations start with better visibility.
            </h2>
            <p className="editorial-section-lead">
              ParkSpot gives facility operators a clear view of capacity, bookings, demand, pricing, and operational opportunities.
            </p>

            {/* 4 Feature Highlights */}
            <div className="business-highlights-list">
              {HIGHLIGHTS.map((item) => {
                const IconComponent = item.icon;
                return (
                  <div key={item.title} className="business-highlight-item">
                    <div className="highlight-icon-box">
                      <IconComponent size={20} />
                    </div>
                    <div className="highlight-text-box">
                      <h3 className="highlight-title">{item.title}</h3>
                      <p className="highlight-desc">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* CTA */}
            <div className="business-cta-wrap">
              <button
                type="button"
                className="landing-btn-primary"
                onClick={() => navigate('/operator')}
              >
                <span>Explore ParkSpot for Businesses</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* Right Column: High-Fidelity Console Preview */}
          <div className="business-preview-col">
            <div className="operator-preview-window">
              <div className="window-header">
                <div className="window-dots">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
                <span className="window-title">ParkSpot Operator Console — UrbanPark Solutions</span>
              </div>

              <div className="window-body">
                {/* Metric Cards Row */}
                <div className="preview-metrics-grid">
                  <div className="preview-metric-box">
                    <span className="metric-label">Occupancy</span>
                    <div className="metric-value">76%</div>
                    <span className="metric-sub">28 of 36 bays filled</span>
                  </div>
                  <div className="preview-metric-box">
                    <span className="metric-label">Today's Reservations</span>
                    <div className="metric-value">142</div>
                    <span className="metric-sub">100% digital check-in</span>
                  </div>
                  <div className="preview-metric-box">
                    <span className="metric-label">Peak Demand Window</span>
                    <div className="metric-value">5 PM — 8 PM</div>
                    <span className="metric-sub">High turnover anticipated</span>
                  </div>
                </div>

                {/* Level Occupancy Bar */}
                <div className="preview-levels-breakdown">
                  <div className="breakdown-title">Level Capacity State</div>
                  <div className="level-bar-item">
                    <div className="level-bar-label">
                      <span>Ground Floor (Main Access)</span>
                      <strong>11/12 Bays (92%)</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: '92%' }} />
                    </div>
                  </div>
                  <div className="level-bar-item">
                    <div className="level-bar-label">
                      <span>Level 1 (Standard & EV)</span>
                      <strong>9/12 Bays (75%)</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: '75%' }} />
                    </div>
                  </div>
                  <div className="level-bar-item">
                    <div className="level-bar-label">
                      <span>Level 2 (Long-Stay)</span>
                      <strong>8/12 Bays (67%)</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: '67%' }} />
                    </div>
                  </div>
                </div>

                {/* Live Activity Feed */}
                <div className="preview-status-strip">
                  <div className="strip-status">
                    <span className="status-live-pulse" />
                    <span>Real-time parking state active</span>
                  </div>
                  <button
                    type="button"
                    className="strip-btn"
                    onClick={() => navigate('/operator')}
                  >
                    Open Live Operations →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default BusinessSection;
