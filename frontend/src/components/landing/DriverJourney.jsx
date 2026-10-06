import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    title: 'Find',
    desc: 'Search near you or near your destination.'
  },
  {
    num: '02',
    title: 'Choose',
    desc: 'See facility availability and choose the exact space you want.'
  },
  {
    num: '03',
    title: 'Reserve',
    desc: 'Select your time and reserve your space.'
  },
  {
    num: '04',
    title: 'Park',
    desc: 'Use your digital parking pass when you arrive.'
  }
];

export function DriverJourney() {
  const navigate = useNavigate();

  return (
    <section className="editorial-section driver-journey-section" id="how-it-works">
      <div className="editorial-container">
        {/* Header */}
        <div className="editorial-section-header text-center">
          <span className="editorial-eyebrow">HOW IT WORKS</span>
          <h2 className="editorial-section-heading">
            From search to parked in a few steps.
          </h2>
          <p className="editorial-section-sub">
            A frictionless discovery and reservation flow designed to eliminate arrival uncertainty.
          </p>
        </div>

        {/* Editorial Timeline Flow */}
        <div className="journey-flow-track">
          {STEPS.map((step, idx) => (
            <div key={step.num} className="journey-step-item">
              <div className="journey-step-num-wrap">
                <span className="journey-step-num">{step.num}</span>
                <span className="journey-step-line" />
              </div>
              <div className="journey-step-content">
                <h3 className="journey-step-title">{step.title}</h3>
                <p className="journey-step-desc">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Action Prompt */}
        <div className="journey-bottom-action">
          <button
            type="button"
            className="landing-btn-primary"
            onClick={() => navigate('/driver')}
          >
            <span>Experience the Flow</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

export default DriverJourney;
