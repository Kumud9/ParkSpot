import React from 'react';
import { ArrowRight, Compass, MousePointerClick, Calendar, CheckCircle2, Activity, PieChart, TrendingUp, CheckSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function HowItWorks() {
  const navigate = useNavigate();

  const driverSteps = [
    {
      step: '1',
      title: 'Find',
      desc: 'Browse facilities by location with real-time rate and spot availability.'
    },
    {
      step: '2',
      title: 'Select',
      desc: 'Choose your specific parking bay, floor level, and bay type.'
    },
    {
      step: '3',
      title: 'Book',
      desc: 'Secure your reservation with guaranteed pricing and clear cancellation terms.'
    },
    {
      step: '4',
      title: 'Park',
      desc: 'Scan your digital pass at entry and drive directly into your reserved bay.'
    }
  ];

  const operatorSteps = [
    {
      step: '1',
      title: 'Monitor',
      desc: 'Ingest live telemetry from facility gates and bay status overrides in real time.'
    },
    {
      step: '2',
      title: 'Understand',
      desc: 'Evaluate turnover rates, revenue by time-of-day, and localized overstay behaviors.'
    },
    {
      step: '3',
      title: 'Optimize',
      desc: 'Receive algorithmic surge/discount pricing proposals backed by ML demand curves.'
    },
    {
      step: '4',
      title: 'Act',
      desc: 'Approve or reject pricing recommendations with complete audit log accountability.'
    }
  ];

  return (
    <section className="landing-section" style={{ backgroundColor: 'var(--ps-secondary-light)' }} id="workflows">
      <div className="landing-container">
        <div className="landing-section-header">
          <span className="landing-eyebrow">End-to-End Orchestration</span>
          <h2 className="landing-section-title">Built for both sides of the barrier.</h2>
          <p className="landing-section-subtitle">
            Seamless self-service for drivers searching for open bays, paired with comprehensive
            control for facility operators managing high-turnover infrastructure.
          </p>
        </div>

        <div className="flows-grid">
          {/* Driver Workflow Column */}
          <div className="flow-column">
            <div className="flow-header">
              <span className="landing-eyebrow">Driver Flow</span>
              <h3 className="flow-title">How Drivers Experience ParkSpot</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--ps-landing-muted)' }}>
                Frictionless reservation from mobile or desktop in under 60 seconds.
              </p>
            </div>

            <div className="flow-steps">
              {driverSteps.map((s) => (
                <div key={s.step} className="flow-step-item">
                  <div className="flow-step-num">{s.step}</div>
                  <div className="flow-step-content">
                    <h4>{s.title}</h4>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--ps-landing-border)' }}>
              <button
                type="button"
                className="landing-btn-primary"
                style={{ width: '100%' }}
                onClick={() => navigate('/driver')}
              >
                Launch Driver Experience
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* Operator Workflow Column (Darker contrast) */}
          <div className="flow-column operator-flow">
            <div className="flow-header">
              <span className="landing-eyebrow" style={{ color: 'var(--ps-landing-accent)' }}>
                Operator Flow
              </span>
              <h3 className="flow-title" style={{ color: '#F4F2E7' }}>
                How Operators Run ParkSpot
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'rgba(244, 242, 231, 0.7)' }}>
                Actionable visibility, algorithmic pricing recommendations, and tenant audits.
              </p>
            </div>

            <div className="flow-steps">
              {operatorSteps.map((s) => (
                <div key={s.step} className="flow-step-item">
                  <div className="flow-step-num">{s.step}</div>
                  <div className="flow-step-content">
                    <h4>{s.title}</h4>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(244, 242, 231, 0.12)' }}>
              <button
                type="button"
                className="landing-btn-dark-secondary"
                style={{ width: '100%' }}
                onClick={() => navigate('/operator')}
              >
                Launch Operator Portal
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
