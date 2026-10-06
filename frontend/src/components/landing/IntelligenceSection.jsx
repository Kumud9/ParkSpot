import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, Activity, TrendingUp, CheckCircle2, ShieldCheck } from 'lucide-react';

const SCENARIOS = [
  {
    id: 'evening',
    label: 'Evening Horizon',
    window: '5 PM – 7 PM',
    stage1: {
      tag: '01 · WHAT WE SEE',
      title: 'Parking Activity',
      status: 'Rising volume detected',
      sub: 'Recent parking patterns show demand beginning to rise.',
      bars: [
        { label: '12 PM', height: 28 },
        { label: '1 PM', height: 38 },
        { label: '2 PM', height: 44 },
        { label: '3 PM', height: 58 },
        { label: '4 PM', height: 74 },
        { label: '5 PM', height: 92, peak: true }
      ]
    },
    stage2: {
      tag: '02 · WHAT WE EXPECT',
      title: 'Demand Forecast',
      status: 'Upcoming peak period',
      sub: 'ParkSpot identifies when demand is likely to tighten.',
      peakWindow: 'Expected peak: 5:30 PM — 6:45 PM',
      currentLabel: 'Current',
      forecastLabel: 'Forecast'
    },
    stage3: {
      tag: '03 · WHAT TO DO',
      title: 'Operator Action',
      status: 'Actionable guidance',
      sub: 'The operator reviews guidance and makes the final decision.',
      recommendation: 'Prepare additional capacity on Level 2.',
      reason: 'Preserves ground-floor turnover as evening commuter departures overlap with retail arrivals.',
      actionLabel: 'Review recommendation'
    }
  },
  {
    id: 'morning',
    label: 'Morning Inbound',
    window: '8 AM – 10 AM',
    stage1: {
      tag: '01 · WHAT WE SEE',
      title: 'Parking Activity',
      status: 'Commuter arrivals building',
      sub: 'Early check-ins concentrate around perimeter entry gates.',
      bars: [
        { label: '6 AM', height: 18 },
        { label: '7 AM', height: 32 },
        { label: '8 AM', height: 68 },
        { label: '9 AM', height: 95, peak: true },
        { label: '10 AM', height: 82 },
        { label: '11 AM', height: 50 }
      ]
    },
    stage2: {
      tag: '02 · WHAT WE EXPECT',
      title: 'Demand Forecast',
      status: 'Capacity tightening',
      sub: 'Commercial permit decks anticipate rapid occupancy surge.',
      peakWindow: 'Expected peak: 8:45 AM — 9:30 AM',
      currentLabel: 'Current',
      forecastLabel: 'Forecast'
    },
    stage3: {
      tag: '03 · WHAT TO DO',
      title: 'Operator Action',
      status: 'Actionable guidance',
      sub: 'The operator reviews guidance and makes the final decision.',
      recommendation: 'Pre-designate East Lane for express permit access.',
      reason: 'Prevents entry bottlenecking during concurrent morning tenant arrivals.',
      actionLabel: 'Review recommendation'
    }
  },
  {
    id: 'weekend',
    label: 'Weekend Horizon',
    window: '1 PM – 4 PM',
    stage1: {
      tag: '01 · WHAT WE SEE',
      title: 'Parking Activity',
      status: 'Longer dwell durations observed',
      sub: 'Midday arrivals show extended average dwell times.',
      bars: [
        { label: '11 AM', height: 35 },
        { label: '12 PM', height: 55 },
        { label: '1 PM', height: 82 },
        { label: '2 PM', height: 94, peak: true },
        { label: '3 PM', height: 88 },
        { label: '4 PM', height: 65 }
      ]
    },
    stage2: {
      tag: '02 · WHAT WE EXPECT',
      title: 'Demand Forecast',
      status: 'Turnover slowing down',
      sub: 'Fewer bays releasing as retail and dining visitors linger.',
      peakWindow: 'Expected peak: 1:30 PM — 3:45 PM',
      currentLabel: 'Current',
      forecastLabel: 'Forecast'
    },
    stage3: {
      tag: '03 · WHAT TO DO',
      title: 'Operator Action',
      status: 'Actionable guidance',
      sub: 'The operator reviews guidance and makes the final decision.',
      recommendation: 'Direct oversized vehicles to Surface Lot B.',
      reason: 'Maintains open circulation and optimizes available spaces inside multi-level decks.',
      actionLabel: 'Review recommendation'
    }
  }
];

export function IntelligenceSection() {
  const navigate = useNavigate();
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [activeStage, setActiveStage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const scenario = SCENARIOS[scenarioIndex];

  // Automatic subtle animation cycle (approx 7.5 seconds total)
  useEffect(() => {
    // Respect user's reduced-motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setActiveStage(2); // Show final complete state directly
      return;
    }

    if (isPaused) return;

    const interval = setInterval(() => {
      setActiveStage((prev) => (prev + 1) % 3);
    }, 2600);

    return () => clearInterval(interval);
  }, [isPaused, scenarioIndex]);

  return (
    <section className="editorial-section intelligence-section" id="intelligence">
      <div className="editorial-container">
        {/* Section Header */}
        <div className="editorial-section-header text-center compact-header">
          <span className="editorial-eyebrow">PREDICTIVE OPERATIONS</span>
          <h2 className="editorial-section-heading">
            Know what's coming next.
          </h2>
          <p className="editorial-section-sub">
            ParkSpot turns parking activity into an early signal — helping operators see rising demand before it becomes a problem.
          </p>
        </div>

        {/* Storytelling Demonstration Container */}
        <div 
          className="pred-story-card"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Top Control Bar */}
          <div className="pred-topbar">
            <div className="pred-topbar-left">
              <span className="pred-live-dot" />
              <span className="pred-topbar-title">OPERATIONAL INTELLIGENCE STORY</span>
              <span className="pred-topbar-step">
                {activeStage === 0 && 'Stage 1: Detecting activity patterns'}
                {activeStage === 1 && 'Stage 2: Anticipating demand horizon'}
                {activeStage === 2 && 'Stage 3: Operator evaluates suggested response'}
              </span>
            </div>

            {/* Scenario Switcher Pills */}
            <div className="pred-scenario-pills" role="tablist" aria-label="Forecast Scenarios">
              {SCENARIOS.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={scenarioIndex === idx}
                  className={`pred-pill-btn ${scenarioIndex === idx ? 'active' : ''}`}
                  onClick={() => {
                    setScenarioIndex(idx);
                    setActiveStage(0);
                  }}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Three Connected Stages */}
          <div className="pred-stages-grid">
            {/* STAGE 01: WHAT PARKSPOT SEES */}
            <div 
              className={`pred-stage-col stage-01 ${activeStage === 0 ? 'stage-focused' : ''} ${activeStage >= 0 ? 'stage-active' : ''}`}
              onClick={() => setActiveStage(0)}
            >
              <div className="pred-stage-header">
                <span className="pred-stage-badge">{scenario.stage1.tag}</span>
                <h3 className="pred-stage-title">{scenario.stage1.title}</h3>
                <span className="pred-stage-status">
                  <Activity size={13} className="pred-icon-spin" />
                  {scenario.stage1.status}
                </span>
              </div>

              {/* Simplified Visual Bars */}
              <div className="pred-visual-box bars-box">
                <div className="bars-timeline">
                  {scenario.stage1.bars.map((bar, i) => {
                    // Stagger bar heights based on active stage
                    const barFillHeight = activeStage >= 0 ? bar.height : Math.max(15, bar.height * 0.4);
                    return (
                      <div key={bar.label} className={`pred-bar-item ${bar.peak ? 'peak' : ''}`}>
                        <div className="pred-bar-track">
                          <div 
                            className="pred-bar-fill" 
                            style={{ 
                              height: `${barFillHeight}%`,
                              transitionDelay: `${i * 60}ms`
                            }} 
                          />
                        </div>
                        <span className="pred-bar-label">{bar.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="pred-box-caption">
                  <span className="pred-caption-dot" />
                  <span>Incoming vehicle check-ins building steadily</span>
                </div>
              </div>

              <p className="pred-stage-sub">{scenario.stage1.sub}</p>
            </div>

            {/* Visual Connector 1 -> 2 */}
            <div className={`pred-connector connector-1-2 ${activeStage >= 1 ? 'connector-active' : ''}`}>
              <div className="pred-connector-line">
                <div className="pred-connector-pulse" />
              </div>
              <ChevronRight size={18} className="pred-connector-arrow" />
            </div>

            {/* STAGE 02: WHAT PARKSPOT EXPECTS */}
            <div 
              className={`pred-stage-col stage-02 ${activeStage === 1 ? 'stage-focused' : ''} ${activeStage >= 1 ? 'stage-active' : ''}`}
              onClick={() => setActiveStage(1)}
            >
              <div className="pred-stage-header">
                <span className="pred-stage-badge">{scenario.stage2.tag}</span>
                <h3 className="pred-stage-title">{scenario.stage2.title}</h3>
                <span className="pred-stage-status forecast-status">
                  <TrendingUp size={13} />
                  {scenario.stage2.status}
                </span>
              </div>

              {/* Transition Curve Graphic: Current -> Forecast */}
              <div className="pred-visual-box curve-box">
                <div className="pred-curve-container">
                  <svg className="pred-curve-svg" viewBox="0 0 240 90" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="forecastGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#707371" stopOpacity="0.7" />
                        <stop offset="45%" stopColor="#25221B" stopOpacity="1" />
                        <stop offset="50%" stopColor="#F3F456" stopOpacity="1" />
                        <stop offset="100%" stopColor="#B2A240" stopOpacity="1" />
                      </linearGradient>
                      <linearGradient id="forecastFill" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(243, 244, 86, 0.25)" />
                        <stop offset="100%" stopColor="rgba(243, 244, 86, 0.0)" />
                      </linearGradient>
                    </defs>

                    {/* Area under forecast */}
                    <path
                      d="M 120 48 Q 170 18 220 22 L 220 85 L 120 85 Z"
                      fill="url(#forecastFill)"
                      className={`forecast-area ${activeStage >= 1 ? 'visible' : ''}`}
                    />

                    {/* Current solid path */}
                    <path
                      d="M 15 65 Q 65 60 120 48"
                      fill="none"
                      stroke="#707371"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Forecast projection path */}
                    <path
                      d="M 120 48 Q 170 18 220 22"
                      fill="none"
                      stroke="url(#forecastGlow)"
                      strokeWidth="3"
                      strokeDasharray={activeStage >= 1 ? 'none' : '4 4'}
                      strokeLinecap="round"
                      className={`forecast-stroke ${activeStage >= 1 ? 'highlighted' : ''}`}
                    />

                    {/* Transition Divider Node */}
                    <circle cx="120" cy="48" r="4.5" fill="#25221B" stroke="#F4F2E7" strokeWidth="2" />
                    
                    {/* Peak Forecast Node */}
                    <circle 
                      cx="205" 
                      cy="21" 
                      r={activeStage >= 1 ? "6" : "4"} 
                      fill="#F3F456" 
                      stroke="#25221B" 
                      strokeWidth="2"
                      className={`pred-peak-node ${activeStage >= 1 ? 'pulse-node' : ''}`}
                    />
                  </svg>

                  {/* Curve Axis Labels */}
                  <div className="pred-curve-labels">
                    <span className="curve-lbl current-lbl">{scenario.stage2.currentLabel}</span>
                    <span className="curve-lbl divider-lbl">Now</span>
                    <span className="curve-lbl forecast-lbl">{scenario.stage2.forecastLabel}</span>
                  </div>
                </div>

                <div className="pred-box-caption">
                  <span className="pred-caption-dot yellow" />
                  <span>{scenario.stage2.peakWindow}</span>
                </div>
              </div>

              <p className="pred-stage-sub">{scenario.stage2.sub}</p>
            </div>

            {/* Visual Connector 2 -> 3 */}
            <div className={`pred-connector connector-2-3 ${activeStage >= 2 ? 'connector-active' : ''}`}>
              <div className="pred-connector-line">
                <div className="pred-connector-pulse" />
              </div>
              <ChevronRight size={18} className="pred-connector-arrow" />
            </div>

            {/* STAGE 03: WHAT THE OPERATOR CAN DO */}
            <div 
              className={`pred-stage-col stage-03 ${activeStage === 2 ? 'stage-focused' : ''} ${activeStage >= 2 ? 'stage-active' : ''}`}
              onClick={() => setActiveStage(2)}
            >
              <div className="pred-stage-header">
                <span className="pred-stage-badge">{scenario.stage3.tag}</span>
                <h3 className="pred-stage-title">{scenario.stage3.title}</h3>
                <span className="pred-stage-status action-status">
                  <CheckCircle2 size={13} />
                  {scenario.stage3.status}
                </span>
              </div>

              {/* High-Touch Recommendation Card */}
              <div className="pred-visual-box action-box">
                <div className="pred-action-card">
                  <div className="pred-action-top">
                    <span className="pred-action-badge">RECOMMENDED ACTION</span>
                    <span className="pred-action-pill">{scenario.window}</span>
                  </div>

                  <h4 className="pred-action-heading">
                    {scenario.stage3.recommendation}
                  </h4>

                  <p className="pred-action-reason">
                    {scenario.stage3.reason}
                  </p>

                  <div className="pred-action-footer">
                    <button
                      type="button"
                      className="pred-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/operator');
                      }}
                    >
                      <span>{scenario.stage3.actionLabel}</span>
                      <ArrowRight size={14} />
                    </button>
                    <span className="pred-action-human-tag">
                      <ShieldCheck size={13} />
                      <span>Operator confirmation required</span>
                    </span>
                  </div>
                </div>
              </div>

              <p className="pred-stage-sub">{scenario.stage3.sub}</p>
            </div>
          </div>

          {/* Bottom Card Footer */}
          <div className="pred-card-footer">
            <div className="pred-footer-story-summary">
              <span className="pred-summary-pill">HOW IT WORKS</span>
              <p className="pred-summary-text">
                ParkSpot analyzes historical occupancy patterns and dwell trends to anticipate pressure before congestion occurs. The operator remains in full control of all operational responses.
              </p>
            </div>

            <button
              type="button"
              className="landing-btn-primary pred-explore-btn"
              onClick={() => navigate('/operator')}
            >
              <span>Explore Operator Workspace</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default IntelligenceSection;
