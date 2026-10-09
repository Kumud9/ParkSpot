import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ArrowRight,
  Search,
  MapPin,
  Clock,
  ShieldCheck,
  QrCode,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  Navigation,
  Car
} from 'lucide-react';

const STEPS = [
  {
    num: '01',
    id: 'find',
    title: 'Find',
    subtitle: 'Search & Discover',
    desc: 'Search near you or your destination to find verified parking in real time.',
    badge: '12 Nearby Facilities',
    actionPrompt: 'Locating verified parking near Grand Central Avenue...',
    progressStop: 0.10,
    cardData: {
      type: 'search',
      facilityName: 'Central Terminal Garage',
      distance: '0.2 km away · 3 min drive',
      rate: '₹40 / hr',
      spotsAvailable: '14 spaces open',
      levelInfo: 'Covered Multi-Level · Level 1 Active',
      amenities: ['Covered Facility', 'EV Ready', '24/7 CCTV', 'LPR Gate']
    }
  },
  {
    num: '02',
    id: 'choose',
    title: 'Choose',
    subtitle: 'Select Ideal Spot',
    desc: 'See live facility availability and choose the exact space you want.',
    badge: 'Bay P-04 Selected',
    actionPrompt: 'Selecting optimal covered bay on Level 1...',
    progressStop: 0.38,
    cardData: {
      type: 'spot',
      spotId: 'Bay P-04',
      level: 'Level 1 (Covered)',
      typeLabel: 'Standard EV-Adjacent',
      rate: '₹40 / hr',
      status: 'AVAILABLE NOW',
      walkingDistance: '30s to main elevators & exit lobby',
      amenities: ['Wide Bay 2.6m', 'Weather Protected', 'Sensor Monitored']
    }
  },
  {
    num: '03',
    id: 'reserve',
    title: 'Reserve',
    subtitle: 'Guaranteed Hold',
    desc: 'Select your time window, lock in your rate, and secure your 10-minute hold.',
    badge: 'Spot Held · 10:00 Active',
    actionPrompt: 'Securing your reservation with instant hold guarantee...',
    progressStop: 0.65,
    cardData: {
      type: 'reserve',
      duration: '2 Hours (14:00 – 16:00)',
      subtotal: '₹80.00',
      holdTime: '10:00 Hold Active',
      guarantee: '100% Space Guaranteed or Full Refund',
      securityStatus: 'Zero Overbooking Policy',
      policy: 'No cancellation fee up to 15 min prior'
    }
  },
  {
    num: '04',
    id: 'park',
    title: 'Park',
    subtitle: 'Seamless Arrival',
    desc: 'Follow automated lane guidance and use your digital pass at the barrier.',
    badge: 'Pass Active · Gate Open',
    actionPrompt: 'Arriving at Bay P-04. Barrier opened automatically...',
    progressStop: 1.00,
    cardData: {
      type: 'pass',
      passCode: 'PS-8842-TER',
      facilityName: 'Central Terminal Garage',
      spotAssigned: 'Level 1 · Bay P-04',
      qrCodeData: 'PARKSPOT-VERIFIED-P04',
      barrierStatus: 'AUTOMATIC ENTRY GRANTED',
      accessMethod: 'License Plate Sync & QR Code Pass'
    }
  }
];

/**
 * Calculates continuous (x, y, angle) coordinates for the hero vehicle.
 * Mapped to an SVG viewBox of 1080 x 520.
 */
function calculateCarPosition(progress) {
  const p = Math.max(0, Math.min(1, progress));

  // Phase 1 (0.00 -> 0.25): Driving east along Central Avenue
  // Start: (80, 445), End: (250, 445)
  if (p <= 0.25) {
    const t = p / 0.25;
    const x = 80 + t * (250 - 80);
    const y = 445;
    const angle = 0;
    return { x, y, angle };
  }

  // Phase 2 (0.25 -> 0.50): Turn north-east into facility entrance approach
  // Curved quadratic transition from (250, 445) to (380, 310)
  if (p <= 0.50) {
    const t = (p - 0.25) / 0.25;
    const p0 = { x: 250, y: 445 };
    const p1 = { x: 335, y: 445 };
    const p2 = { x: 380, y: 310 };
    const u = 1 - t;
    const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
    const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;

    const dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { x, y, angle };
  }

  // Phase 3 (0.50 -> 0.75): Turn east past auto-gate along facility aisle
  // From (380, 310) along y = 310 to (710, 310)
  if (p <= 0.75) {
    const t = (p - 0.50) / 0.25;
    const p0 = { x: 380, y: 310 };
    const p1 = { x: 440, y: 310 };
    const p2 = { x: 710, y: 310 };
    const u = 1 - t;
    const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
    const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;

    const dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
    const dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { x, y, angle };
  }

  // Phase 4 (0.75 -> 1.00): Turn north and glide smoothly into Bay P-04 at (800, 165)
  const t = (p - 0.75) / 0.25;
  const ease = 1 - Math.pow(1 - t, 2.2);

  const p0 = { x: 710, y: 310 };
  const p1 = { x: 790, y: 310 };
  const p2 = { x: 800, y: 165 };
  const u = 1 - ease;
  const x = u * u * p0.x + 2 * u * ease * p1.x + ease * ease * p2.x;
  const y = u * u * p0.y + 2 * u * ease * p1.y + ease * ease * p2.y;

  const dx = 2 * u * (p1.x - p0.x) + 2 * ease * (p2.x - p1.x);
  const dy = 2 * u * (p1.y - p0.y) + 2 * ease * (p2.y - p1.y);
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);

  if (t > 0.85) {
    const finalT = (t - 0.85) / 0.15;
    angle = angle * (1 - finalT) + (-90) * finalT;
  }
  return { x, y, angle };
}

export function DriverJourney() {
  const navigate = useNavigate();
  const trackRef = useRef(null);

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [currentProgress, setCurrentProgress] = useState(STEPS[0].progressStop);
  const [targetProgress, setTargetProgress] = useState(STEPS[0].progressStop);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [isInView, setIsInView] = useState(false);

  // Check accessibility preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);

    const handleChange = (e) => setIsReducedMotion(e.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      }
    };
  }, []);

  // Intersection Observer to detect when section enters viewport
  useEffect(() => {
    if (!trackRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );
    observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, []);

  // Scroll listener tied to sticky section traversal
  useEffect(() => {
    if (isReducedMotion) return;

    let rafId = null;

    const handleScroll = () => {
      if (!trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const totalScrollableDistance = rect.height - viewportHeight;

      if (totalScrollableDistance <= 0) return;

      const scrolled = -rect.top;
      const rawProgress = scrolled / totalScrollableDistance;
      const clamped = Math.max(0, Math.min(1, rawProgress));

      // Derive active step from scroll
      let derivedIndex = 0;
      if (clamped >= 0.75) derivedIndex = 3;
      else if (clamped >= 0.50) derivedIndex = 2;
      else if (clamped >= 0.25) derivedIndex = 1;

      // Only update if auto-play is paused
      if (!isAutoPlaying) {
        setActiveStepIndex(derivedIndex);
        setTargetProgress(clamped);
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        handleScroll();
        rafId = null;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isReducedMotion, isAutoPlaying]);

  // Smooth progress lerp loop (60fps transition between states)
  useEffect(() => {
    if (isReducedMotion) {
      setCurrentProgress(targetProgress);
      return;
    }

    let animId = null;

    const step = () => {
      setCurrentProgress((prev) => {
        const diff = targetProgress - prev;
        if (Math.abs(diff) < 0.002) {
          return targetProgress;
        }
        return prev + diff * 0.12;
      });

      if (Math.abs(targetProgress - currentProgress) >= 0.002) {
        animId = requestAnimationFrame(step);
      }
    };

    animId = requestAnimationFrame(step);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [targetProgress, isReducedMotion]);

  // Auto-play timer for demonstrative walkthrough
  useEffect(() => {
    if (!isAutoPlaying || !isInView) return;

    const timer = setInterval(() => {
      setActiveStepIndex((prev) => {
        const next = (prev + 1) % STEPS.length;
        setTargetProgress(STEPS[next].progressStop);
        return next;
      });
    }, 3800);

    return () => clearInterval(timer);
  }, [isAutoPlaying, isInView]);

  // Handle direct step tab click
  const handleStepSelect = useCallback((idx) => {
    setIsAutoPlaying(false);
    setActiveStepIndex(idx);
    setTargetProgress(STEPS[idx].progressStop);
  }, []);

  const handleNextStep = useCallback(() => {
    setIsAutoPlaying(false);
    const nextIdx = Math.min(STEPS.length - 1, activeStepIndex + 1);
    setActiveStepIndex(nextIdx);
    setTargetProgress(STEPS[nextIdx].progressStop);
  }, [activeStepIndex]);

  const handlePrevStep = useCallback(() => {
    setIsAutoPlaying(false);
    const prevIdx = Math.max(0, activeStepIndex - 1);
    setActiveStepIndex(prevIdx);
    setTargetProgress(STEPS[prevIdx].progressStop);
  }, [activeStepIndex]);

  // Compute live vehicle coordinates
  const carTransform = useMemo(() => {
    return calculateCarPosition(currentProgress);
  }, [currentProgress]);

  const activeStep = STEPS[activeStepIndex];

  return (
    <section className="how-it-works-section" id="how-it-works" ref={trackRef}>
      <div className="how-it-works-sticky-stage">
        <div className="how-it-works-content editorial-container">
          {/* 1. Header (Eyebrow, Heading, Supporting Subtitle) */}
          <div className="how-it-works-header text-center">
            <span className="editorial-eyebrow">HOW IT WORKS</span>
            <h2 className="how-it-works-heading">
              From search to parked in a few steps.
            </h2>
            <p className="how-it-works-sub">
              An intelligent discovery, guaranteed hold, and barrier-synced parking journey.
            </p>
          </div>

          {/* 2. Step Indicator Bar (Larger, accessible, interactive pills) */}
          <div className="how-it-works-steps-bar" role="tablist" aria-label="Reservation steps">
            <div className="steps-progress-track">
              <div
                className="steps-progress-fill"
                style={{ width: `${Math.min(100, Math.max(0, currentProgress * 100))}%` }}
              />
            </div>

            {STEPS.map((step, idx) => {
              const isActive = activeStepIndex === idx;
              const isPassed = activeStepIndex > idx;
              return (
                <button
                  key={step.num}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`step-panel-${step.id}`}
                  className={`how-it-works-step-tab ${isActive ? 'active' : ''} ${isPassed ? 'passed' : ''}`}
                  onClick={() => handleStepSelect(idx)}
                >
                  <span className="step-num-badge">
                    {isPassed ? <CheckCircle2 size={16} strokeWidth={2.5} /> : step.num}
                  </span>
                  <div className="step-tab-text">
                    <div className="step-tab-title-row">
                      <span className="step-tab-title">{step.title}</span>
                      {isActive && <span className="step-live-dot" />}
                    </div>
                    <span className="step-tab-desc">{step.subtitle}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 3. Main Stage Visual Frame (Modern Garage Illustration + Interactive Story Card) */}
          <div className="how-it-works-stage-grid">
            {/* The SVG Architectural Parking Canvas */}
            <div className="how-it-works-visual-frame">
              <svg
                className="how-it-works-canvas"
                viewBox="0 0 1080 520"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMid meet"
                aria-label="Interactive parking journey illustration"
              >
                <defs>
                  {/* Vehicle Drop Shadow */}
                  <filter id="hwCarShadow" x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#15120E" floodOpacity="0.45" />
                  </filter>

                  {/* Soft Spot Glow Filter (Restrained, not aggressive) */}
                  <filter id="hwSpotGlow" x="-25%" y="-25%" width="150%" height="150%">
                    <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#F3F456" floodOpacity="0.65" />
                  </filter>

                  {/* Golden Hour Ambient Sunlight Wash */}
                  <radialGradient id="hwSunlightGlow" cx="15%" cy="15%" r="75%">
                    <stop offset="0%" stopColor="#FFF9E6" stopOpacity="0.85" />
                    <stop offset="50%" stopColor="#FAF5E8" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#F5F2E8" stopOpacity="0" />
                  </radialGradient>

                  {/* Headlight Beam Cone */}
                  <linearGradient id="hwHeadlights" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="#FFFEE6" stopOpacity="0.7" />
                    <stop offset="40%" stopColor="#F3F456" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#F3F456" stopOpacity="0.0" />
                  </linearGradient>

                  {/* Subtle Grid Texture */}
                  <pattern id="hwGrid" width="28" height="28" patternUnits="userSpaceOnUse">
                    <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#E6DFD1" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />
                  </pattern>

                  {/* Garage Overhead LED Light Beam */}
                  <linearGradient id="hwCeilingLed" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#E6DFD1" stopOpacity="0.2" />
                  </linearGradient>

                  {/* Pillar Hazard Pattern (45-degree yellow & dark stripes from reference photo) */}
                  <pattern id="hwHazardStripe" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="0" y2="16" stroke="#F3F456" strokeWidth="8" />
                    <line x1="8" y1="0" x2="8" y2="16" stroke="#25221B" strokeWidth="8" />
                  </pattern>
                </defs>

                {/* 1. Master Architectural Ground Canvas */}
                <rect width="1080" height="520" rx="18" fill="#F6F4EB" stroke="#E6DFD1" strokeWidth="1.2" />
                <rect x="8" y="8" width="1064" height="504" rx="14" fill="url(#hwGrid)" opacity="0.65" />
                <rect width="1080" height="520" rx="18" fill="url(#hwSunlightGlow)" pointerEvents="none" />

                {/* 2. Perimeter Landscape & Trees (Inspired by Reference Photo Entrance) */}
                <g className="hw-scene-landscaping">
                  {/* Street Curb Planter Left */}
                  <rect x="0" y="380" width="180" height="20" rx="4" fill="#E6DFD1" stroke="#C5BCAE" strokeWidth="1" />
                  <rect x="6" y="383" width="168" height="14" rx="3" fill="#2E4A28" />
                  <circle cx="28" cy="385" r="9" fill="#3D6435" />
                  <circle cx="56" cy="384" r="11" fill="#47753D" />
                  <circle cx="92" cy="386" r="10" fill="#3D6435" />
                  <circle cx="130" cy="384" r="12" fill="#4A7B40" />

                  {/* Lush Planter Box alongside Avenue Curve */}
                  <rect x="190" y="375" width="80" height="22" rx="5" fill="#E6DFD1" stroke="#C5BCAE" strokeWidth="1" />
                  <rect x="194" y="378" width="72" height="16" rx="3" fill="#2E4A28" />
                  <circle cx="210" cy="382" r="11" fill="#4A7B40" />
                  <circle cx="242" cy="381" r="13" fill="#3D6435" />

                  {/* Entrance Flanking Greenery */}
                  <g transform="translate(320, 240)">
                    <rect x="0" y="0" width="38" height="48" rx="6" fill="#E6DFD1" stroke="#C5BCAE" strokeWidth="1" />
                    <rect x="3" y="3" width="32" height="42" rx="4" fill="#283E24" />
                    <circle cx="19" cy="18" r="14" fill="#3B6334" />
                    <circle cx="19" cy="32" r="12" fill="#4B7C42" />
                  </g>

                  {/* Upper Terrace Greenery (Modern building terrace from reference photo) */}
                  <g transform="translate(390, 16)">
                    <rect x="0" y="0" width="650" height="18" rx="4" fill="#25221B" />
                    <circle cx="60" cy="10" r="7" fill="#47753D" />
                    <circle cx="140" cy="10" r="8" fill="#3D6435" />
                    <circle cx="280" cy="10" r="7" fill="#47753D" />
                    <circle cx="440" cy="10" r="8" fill="#3D6435" />
                    <circle cx="580" cy="10" r="7" fill="#47753D" />
                    <text x="24" y="13" fill="#F4F2E7" fontSize="9" fontWeight="800" letterSpacing="0.08em">
                      PARKSPOT URBAN CANOPY · LEVEL 1 FACILITY
                    </text>
                  </g>
                </g>

                {/* 3. Public Street (Central Avenue Eastbound) */}
                <g className="hw-scene-street">
                  {/* Street Asphalt */}
                  <rect x="0" y="405" width="360" height="95" rx="4" fill="#25221B" />
                  <line x1="0" y1="405" x2="360" y2="405" stroke="#7A7871" strokeWidth="3" />

                  {/* Animated Road Dashed Centerline */}
                  <line
                    x1="0"
                    y1="445"
                    x2="240"
                    y2="445"
                    stroke="#FAF8F2"
                    strokeWidth="3"
                    strokeDasharray="16 14"
                    className="hw-animated-road-line"
                    opacity="0.8"
                  />

                  {/* Street Directional Guide Arrow on Pavement */}
                  <g transform="translate(140, 445)">
                    <path d="M -12 -6 L 0 0 L -12 6" stroke="#FAF8F2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6" />
                  </g>

                  {/* Street Signage */}
                  <text x="24" y="485" fill="#A8A499" fontSize="10" fontWeight="700" letterSpacing="0.09em">
                    CENTRAL AVENUE · EASTBOUND
                  </text>

                  {/* Interactive Map Search Pin (Step 1 - Find) */}
                  <g
                    transform="translate(180, 420)"
                    className={`hw-pin-marker ${activeStepIndex === 0 ? 'active' : ''}`}
                  >
                    <circle cx="0" cy="0" r="14" fill="#F3F456" fillOpacity="0.25" className="hw-pulse-circle" />
                    <path
                      d="M 0 -18 C -7 -18 -11 -13 -11 -7 C -11 1 0 14 0 14 C 0 14 11 1 11 -7 C 11 -13 7 -18 0 -18 Z"
                      fill="#25221B"
                      stroke="#F3F456"
                      strokeWidth="2"
                    />
                    <circle cx="0" cy="-8" r="4" fill="#F3F456" />
                  </g>
                </g>

                {/* 4. Covered Facility Approach & Entrance Portal */}
                <g className="hw-scene-entrance">
                  {/* Curved Driveway connecting street to garage */}
                  <path
                    d="M 240 500 L 240 445 Q 290 445 340 375 Q 375 325 385 270 L 1030 270 L 1030 350 L 385 350 Q 340 350 300 415 Q 270 475 220 500 Z"
                    fill="#27241D"
                  />

                  {/* Covered Garage Interior Floor */}
                  <rect x="370" y="44" width="660" height="436" rx="10" fill="#25221B" />
                  <rect x="376" y="50" width="648" height="424" rx="8" fill="#2C2922" />

                  {/* Garage Interior Aisle Driveway */}
                  <rect x="376" y="270" width="648" height="85" fill="#23201A" />
                  <line x1="376" y1="270" x2="1024" y2="270" stroke="#48443B" strokeWidth="2" />
                  <line x1="376" y1="355" x2="1024" y2="355" stroke="#48443B" strokeWidth="2" />

                  {/* Ceiling LED Light Strips (Modern linear garage fixtures from reference photo) */}
                  <line x1="420" y1="90" x2="1000" y2="90" stroke="#FFFEE6" strokeWidth="3" opacity="0.4" strokeLinecap="round" />
                  <line x1="420" y1="272" x2="1000" y2="272" stroke="#FFFEE6" strokeWidth="3.5" opacity="0.65" strokeLinecap="round" />
                  <line x1="420" y1="465" x2="1000" y2="465" stroke="#FFFEE6" strokeWidth="3" opacity="0.4" strokeLinecap="round" />

                  {/* Road Directional Guidance Arrows inside Aisle */}
                  <g transform="translate(520, 312)">
                    <path d="M -16 0 L 16 0 M 6 -7 L 16 0 L 6 7" stroke="#FAF8F2" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
                  </g>
                  <g transform="translate(680, 312)">
                    <path d="M -16 0 L 16 0 M 6 -7 L 16 0 L 6 7" stroke="#FAF8F2" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
                  </g>
                  {/* Curving arrow into Bay P-04 */}
                  <g transform="translate(775, 312)">
                    <path d="M -10 0 Q 15 0 15 -25 L 15 -35 M 9 -27 L 15 -35 L 21 -27" stroke={activeStepIndex >= 1 ? "#F3F456" : "#FAF8F2"} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity={activeStepIndex >= 1 ? "0.8" : "0.35"} />
                  </g>

                  {/* Modern Support Pillars with Hazard Stripes (From Reference Photo) */}
                  <g transform="translate(365, 252)">
                    <rect x="0" y="0" width="18" height="36" rx="3" fill="#1C1A15" stroke="#4A453A" strokeWidth="1" />
                    <rect x="2" y="16" width="14" height="18" fill="url(#hwHazardStripe)" />
                  </g>
                  <g transform="translate(365, 335)">
                    <rect x="0" y="0" width="18" height="36" rx="3" fill="#1C1A15" stroke="#4A453A" strokeWidth="1" />
                    <rect x="2" y="16" width="14" height="18" fill="url(#hwHazardStripe)" />
                  </g>
                  <g transform="translate(670, 252)">
                    <rect x="0" y="0" width="18" height="36" rx="3" fill="#1C1A15" stroke="#4A453A" strokeWidth="1" />
                    <rect x="2" y="16" width="14" height="18" fill="url(#hwHazardStripe)" />
                  </g>
                  <g transform="translate(670, 335)">
                    <rect x="0" y="0" width="18" height="36" rx="3" fill="#1C1A15" stroke="#4A453A" strokeWidth="1" />
                    <rect x="2" y="16" width="14" height="18" fill="url(#hwHazardStripe)" />
                  </g>

                  {/* Smart Access Gate / Barrier Structure */}
                  <g transform="translate(420, 310)">
                    {/* Gate Pedestal */}
                    <rect x="-8" y="-36" width="16" height="72" rx="4" fill="#1E1C16" stroke="#5E584A" strokeWidth="1.2" />
                    {/* Status Indicator LED (Red = Waiting, Green = Raised) */}
                    <circle
                      cx="0"
                      cy="-22"
                      r="4"
                      fill={currentProgress >= 0.50 ? "#48BB78" : "#E53E3E"}
                      style={{ transition: 'fill 0.3s ease' }}
                    />
                    {/* Auto Gate Barrier Arm */}
                    <line
                      x1="0"
                      y1="-8"
                      x2={currentProgress >= 0.50 ? "34" : "46"}
                      y2={currentProgress >= 0.50 ? "-52" : "-8"}
                      stroke="#F3F456"
                      strokeWidth="5"
                      strokeDasharray="9 5"
                      strokeLinecap="round"
                      style={{ transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
                    />
                    <text x="12" y="-38" fill="#C5BFB2" fontSize="9" fontWeight="800" letterSpacing="0.06em">
                      {currentProgress >= 0.50 ? "GATE OPEN" : "SMART GATE"}
                    </text>
                  </g>
                </g>

                {/* 5. Upper Parking Bays Row (P-01 to P-05) */}
                <g className="hw-scene-bays-upper">
                  {/* Bay P-01 (Occupied) */}
                  <g transform="translate(415, 68)">
                    <rect x="0" y="0" width="82" height="135" rx="7" fill="#201E19" stroke="#423E33" strokeWidth="1.5" strokeDasharray="5 3" />
                    <circle cx="41" cy="14" r="3.5" fill="#E53E3E" />
                    <text x="10" y="18" fill="#8C887E" fontSize="10" fontWeight="700">P-01</text>
                    {/* Parked Vehicle */}
                    <g transform="translate(41, 75) rotate(-90)">
                      <rect x="-28" y="-15" width="56" height="30" rx="8" fill="#525760" />
                      <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#9CA3AF" opacity="0.8" />
                      <text x="0" y="3.5" fill="#FFFFFF" fontSize="7.5" fontWeight="700" textAnchor="middle">OCCUPIED</text>
                    </g>
                  </g>

                  {/* Bay P-02 (Occupied) */}
                  <g transform="translate(510, 68)">
                    <rect x="0" y="0" width="82" height="135" rx="7" fill="#201E19" stroke="#423E33" strokeWidth="1.5" strokeDasharray="5 3" />
                    <circle cx="41" cy="14" r="3.5" fill="#E53E3E" />
                    <text x="10" y="18" fill="#8C887E" fontSize="10" fontWeight="700">P-02</text>
                    <g transform="translate(41, 75) rotate(-90)">
                      <rect x="-28" y="-15" width="56" height="30" rx="8" fill="#323842" />
                      <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#6B7280" opacity="0.8" />
                      <text x="0" y="3.5" fill="#FFFFFF" fontSize="7.5" fontWeight="700" textAnchor="middle">OCCUPIED</text>
                    </g>
                  </g>

                  {/* Bay P-03 (Occupied) */}
                  <g transform="translate(605, 68)">
                    <rect x="0" y="0" width="82" height="135" rx="7" fill="#201E19" stroke="#423E33" strokeWidth="1.5" strokeDasharray="5 3" />
                    <circle cx="41" cy="14" r="3.5" fill="#E53E3E" />
                    <text x="10" y="18" fill="#8C887E" fontSize="10" fontWeight="700">P-03</text>
                    <g transform="translate(41, 75) rotate(-90)">
                      <rect x="-28" y="-15" width="56" height="30" rx="8" fill="#4B5563" />
                      <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#D1D5DB" opacity="0.8" />
                      <text x="0" y="3.5" fill="#FFFFFF" fontSize="7.5" fontWeight="700" textAnchor="middle">OCCUPIED</text>
                    </g>
                  </g>

                  {/* BAY P-04: THE HERO TARGET SELECTED & RESERVED BAY! (PROMINENT, LARGER SIZE) */}
                  <g transform="translate(735, 60)">
                    {/* Glowing Foundation when active */}
                    <rect
                      x="0"
                      y="0"
                      width="130"
                      height="150"
                      rx="10"
                      fill={activeStepIndex >= 1 ? "#302D21" : "#201E19"}
                      stroke={activeStepIndex >= 1 ? "#F3F456" : "#423E33"}
                      strokeWidth={activeStepIndex >= 1 ? 2.8 : 1.5}
                      filter={activeStepIndex >= 1 ? "url(#hwSpotGlow)" : "none"}
                      style={{ transition: 'all 0.35s ease' }}
                    />

                    {/* Sensor Light (Green when available, Yellow when reserved, Checkmark when parked) */}
                    <circle
                      cx="65"
                      cy="15"
                      r="4.5"
                      fill={activeStepIndex === 3 ? "#48BB78" : (activeStepIndex >= 1 ? "#F3F456" : "#38A169")}
                    />

                    {/* Stencil ID */}
                    <text
                      x="14"
                      y="22"
                      fill={activeStepIndex >= 1 ? "#F3F456" : "#C5BFB2"}
                      fontSize="14"
                      fontWeight="900"
                      letterSpacing="0.05em"
                    >
                      P-04
                    </text>

                    {/* Dynamic Status Badge */}
                    <g transform="translate(14, 30)">
                      <rect
                        x="0"
                        y="0"
                        width="102"
                        height="22"
                        rx="5"
                        fill={activeStepIndex === 3 ? "#25221B" : (activeStepIndex >= 1 ? "#25221B" : "#3A362B")}
                        stroke={activeStepIndex >= 1 ? "#F3F456" : "none"}
                        strokeWidth="1"
                      />
                      <text
                        x="51"
                        y="15"
                        fill={activeStepIndex === 3 ? "#48BB78" : (activeStepIndex >= 1 ? "#F3F456" : "#FAF8F2")}
                        fontSize="9"
                        fontWeight="800"
                        letterSpacing="0.04em"
                        textAnchor="middle"
                      >
                        {activeStepIndex === 3
                          ? "PARKED & LOCKED"
                          : (activeStepIndex === 2
                            ? "RESERVED · ₹40/h"
                            : (activeStepIndex === 1
                              ? "AVAILABLE · P-04"
                              : "BAY P-04"))}
                      </text>
                    </g>
                  </g>

                  {/* Bay P-05 (Occupied) */}
                  <g transform="translate(895, 68)">
                    <rect x="0" y="0" width="82" height="135" rx="7" fill="#201E19" stroke="#423E33" strokeWidth="1.5" strokeDasharray="5 3" />
                    <circle cx="41" cy="14" r="3.5" fill="#E53E3E" />
                    <text x="10" y="18" fill="#8C887E" fontSize="10" fontWeight="700">P-05</text>
                    <g transform="translate(41, 75) rotate(-90)">
                      <rect x="-28" y="-15" width="56" height="30" rx="8" fill="#525760" />
                      <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#9CA3AF" opacity="0.8" />
                      <text x="0" y="3.5" fill="#FFFFFF" fontSize="7.5" fontWeight="700" textAnchor="middle">OCCUPIED</text>
                    </g>
                  </g>
                </g>

                {/* 6. Lower Parking Bays Row (P-06 to P-08) */}
                <g className="hw-scene-bays-lower">
                  <g transform="translate(470, 365)">
                    <rect x="0" y="0" width="82" height="95" rx="7" fill="#201E19" stroke="#423E33" strokeWidth="1.5" strokeDasharray="5 3" />
                    <circle cx="41" cy="14" r="3.5" fill="#E53E3E" />
                    <text x="10" y="18" fill="#8C887E" fontSize="10" fontWeight="700">P-06</text>
                    <g transform="translate(41, 55) rotate(90)">
                      <rect x="-28" y="-15" width="56" height="30" rx="8" fill="#374151" />
                      <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#9CA3AF" opacity="0.8" />
                    </g>
                  </g>

                  <g transform="translate(600, 365)">
                    <rect x="0" y="0" width="82" height="95" rx="7" fill="#201E19" stroke="#423E33" strokeWidth="1.5" strokeDasharray="5 3" />
                    <circle cx="41" cy="14" r="3.5" fill="#E53E3E" />
                    <text x="10" y="18" fill="#8C887E" fontSize="10" fontWeight="700">P-07</text>
                    <g transform="translate(41, 55) rotate(90)">
                      <rect x="-28" y="-15" width="56" height="30" rx="8" fill="#4B5563" />
                      <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#D1D5DB" opacity="0.8" />
                    </g>
                  </g>

                  <g transform="translate(770, 365)">
                    <rect x="0" y="0" width="82" height="95" rx="7" fill="#201E19" stroke="#423E33" strokeWidth="1.5" strokeDasharray="5 3" />
                    <circle cx="41" cy="14" r="3.5" fill="#E53E3E" />
                    <text x="10" y="18" fill="#8C887E" fontSize="10" fontWeight="700">P-08</text>
                    <g transform="translate(41, 55) rotate(90)">
                      <rect x="-28" y="-15" width="56" height="30" rx="8" fill="#323842" />
                      <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#6B7280" opacity="0.8" />
                    </g>
                  </g>
                </g>

                {/* 7. Milestone Floating Tooltip Indicators in SVG Canvas */}
                {activeStepIndex === 0 && (
                  <g className="hw-canvas-cue hw-cue-find" transform="translate(130, 335)">
                    <rect x="0" y="0" width="180" height="30" rx="8" fill="#25221B" stroke="#F3F456" strokeWidth="1.2" />
                    <circle cx="15" cy="15" r="4" fill="#F3F456" />
                    <text x="26" y="19" fill="#FAF8F2" fontSize="10" fontWeight="800" letterSpacing="0.04em">
                      01 · FINDING NEARBY SPOTS
                    </text>
                  </g>
                )}

                {activeStepIndex === 1 && (
                  <g className="hw-canvas-cue hw-cue-choose" transform="translate(430, 205)">
                    <rect x="0" y="0" width="185" height="30" rx="8" fill="#25221B" stroke="#F3F456" strokeWidth="1.2" />
                    <circle cx="15" cy="15" r="4" fill="#F3F456" />
                    <text x="26" y="19" fill="#FAF8F2" fontSize="10" fontWeight="800" letterSpacing="0.04em">
                      02 · SELECTING BAY P-04
                    </text>
                  </g>
                )}

                {activeStepIndex === 2 && (
                  <g className="hw-canvas-cue hw-cue-reserve" transform="translate(460, 215)">
                    <rect x="0" y="0" width="185" height="30" rx="8" fill="#25221B" stroke="#F3F456" strokeWidth="1.2" />
                    <circle cx="15" cy="15" r="4" fill="#F3F456" />
                    <text x="26" y="19" fill="#FAF8F2" fontSize="10" fontWeight="800" letterSpacing="0.04em">
                      03 · 10-MIN HOLD LOCKED
                    </text>
                  </g>
                )}

                {activeStepIndex === 3 && (
                  <g className="hw-canvas-cue hw-cue-park" transform="translate(710, 25)">
                    <rect x="0" y="0" width="180" height="30" rx="8" fill="#25221B" stroke="#48BB78" strokeWidth="1.2" />
                    <circle cx="15" cy="15" r="4" fill="#48BB78" />
                    <text x="26" y="19" fill="#FAF8F2" fontSize="10" fontWeight="800" letterSpacing="0.04em">
                      04 · PARKED & VERIFIED
                    </text>
                  </g>
                )}

                {/* 8. THE HERO ANIMATED VEHICLE (Sleek Modern SUV inspired by reference photo) */}
                <g
                  className="hw-hero-car"
                  transform={`translate(${carTransform.x}, ${carTransform.y}) rotate(${carTransform.angle})`}
                  filter="url(#hwCarShadow)"
                >
                  {/* Headlight Beam Cones (projecting forward) */}
                  <polygon
                    points="32,-14 96,-36 96,36 32,14"
                    fill="url(#hwHeadlights)"
                    opacity={activeStepIndex === 3 ? "0.25" : "0.75"}
                  />

                  {/* Car Chassis Body (Larger, beautifully proportioned) */}
                  <rect
                    x="-32"
                    y="-17"
                    width="64"
                    height="34"
                    rx="9"
                    fill="#25221B"
                    stroke="#5A5445"
                    strokeWidth="1.5"
                  />

                  {/* Aerodynamic Mirrors */}
                  <rect x="-3" y="-20" width="5" height="3" rx="1.5" fill="#25221B" stroke="#4A453A" strokeWidth="0.8" />
                  <rect x="-3" y="17" width="5" height="3" rx="1.5" fill="#25221B" stroke="#4A453A" strokeWidth="0.8" />

                  {/* Front Windshield (Tinted glass) */}
                  <path d="M 12 -11 Q 18 0 12 11 L 3 10 Q 7 0 3 -10 Z" fill="#E6DFD1" opacity="0.9" />

                  {/* Tinted Panoramic Sunroof */}
                  <rect x="-10" y="-9" width="12" height="18" rx="3" fill="#171511" stroke="#38342B" strokeWidth="0.8" />

                  {/* Rear Windshield */}
                  <path d="M -13 -10 Q -9 0 -13 10 L -19 9 Q -16 0 -19 -9 Z" fill="#E6DFD1" opacity="0.8" />

                  {/* Front LED Headlights (Glowing Yellow) */}
                  <rect x="29" y="-14" width="2.5" height="6" rx="1" fill="#F3F456" />
                  <rect x="29" y="8" width="2.5" height="6" rx="1" fill="#F3F456" />

                  {/* Rear LED Taillight Bar (Vibrant Red) */}
                  <rect x="-31.5" y="-13" width="2" height="26" rx="1" fill="#E53E3E" opacity="0.95" />

                  {/* ParkSpot Roof Brand Emblem */}
                  <circle cx="-4" cy="0" r="3" fill="#F3F456" />
                </g>
              </svg>
            </div>

            {/* Right/Companion Interactive Story Card (Large, readable, real-world context) */}
            <div className="how-it-works-story-card" id={`step-panel-${activeStep.id}`}>
              <div className="story-card-header">
                <div className="story-card-step-badge">
                  <span className="story-badge-num">{activeStep.num}</span>
                  <span className="story-badge-name">{activeStep.title}</span>
                </div>
                <div className="story-card-status-pill">
                  {activeStep.badge}
                </div>
              </div>

              <div className="story-card-body">
                {/* Step 1: Find Card View */}
                {activeStepIndex === 0 && (
                  <div className="story-detail-content animate-fade-in">
                    <div className="story-main-item">
                      <div className="story-icon-wrap">
                        <MapPin size={22} className="text-accent" />
                      </div>
                      <div className="story-item-text">
                        <h4 className="story-facility-title">{activeStep.cardData.facilityName}</h4>
                        <p className="story-facility-sub">{activeStep.cardData.distance}</p>
                      </div>
                    </div>

                    <div className="story-stats-row">
                      <div className="story-stat-box">
                        <span className="story-stat-label">Hourly Rate</span>
                        <span className="story-stat-val text-bold">{activeStep.cardData.rate}</span>
                      </div>
                      <div className="story-stat-box">
                        <span className="story-stat-label">Live Availability</span>
                        <span className="story-stat-val text-success">{activeStep.cardData.spotsAvailable}</span>
                      </div>
                    </div>

                    <div className="story-tags-list">
                      {activeStep.cardData.amenities.map((item) => (
                        <span key={item} className="story-feature-tag">
                          <CheckCircle2 size={12} /> {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2: Choose Card View */}
                {activeStepIndex === 1 && (
                  <div className="story-detail-content animate-fade-in">
                    <div className="story-main-item">
                      <div className="story-icon-wrap select-accent">
                        <Sparkles size={22} />
                      </div>
                      <div className="story-item-text">
                        <h4 className="story-facility-title">{activeStep.cardData.spotId} — Prime Space</h4>
                        <p className="story-facility-sub">{activeStep.cardData.level} · {activeStep.cardData.typeLabel}</p>
                      </div>
                    </div>

                    <div className="story-stats-row">
                      <div className="story-stat-box">
                        <span className="story-stat-label">Spot Status</span>
                        <span className="story-stat-val text-success">{activeStep.cardData.status}</span>
                      </div>
                      <div className="story-stat-box">
                        <span className="story-stat-label">Lobby Proximity</span>
                        <span className="story-stat-val">{activeStep.cardData.walkingDistance}</span>
                      </div>
                    </div>

                    <div className="story-tags-list">
                      {activeStep.cardData.amenities.map((item) => (
                        <span key={item} className="story-feature-tag">
                          <CheckCircle2 size={12} /> {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 3: Reserve Card View */}
                {activeStepIndex === 2 && (
                  <div className="story-detail-content animate-fade-in">
                    <div className="story-main-item">
                      <div className="story-icon-wrap hold-amber">
                        <Clock size={22} />
                      </div>
                      <div className="story-item-text">
                        <h4 className="story-facility-title">{activeStep.cardData.duration}</h4>
                        <p className="story-facility-sub">{activeStep.cardData.holdTime} · Locked at {activeStep.cardData.subtotal}</p>
                      </div>
                    </div>

                    <div className="story-stats-row">
                      <div className="story-stat-box">
                        <span className="story-stat-label">Hold Assurance</span>
                        <span className="story-stat-val text-accent-dark">{activeStep.cardData.guarantee}</span>
                      </div>
                      <div className="story-stat-box">
                        <span className="story-stat-label">Protection</span>
                        <span className="story-stat-val">{activeStep.cardData.securityStatus}</span>
                      </div>
                    </div>

                    <div className="story-hold-progress-bar">
                      <div className="story-hold-fill animate-countdown" />
                    </div>
                    <span className="story-policy-text">{activeStep.cardData.policy}</span>
                  </div>
                )}

                {/* Step 4: Park Card View */}
                {activeStepIndex === 3 && (
                  <div className="story-detail-content animate-fade-in">
                    <div className="story-main-item">
                      <div className="story-icon-wrap pass-green">
                        <ShieldCheck size={24} />
                      </div>
                      <div className="story-item-text">
                        <h4 className="story-facility-title">Pass #{activeStep.cardData.passCode}</h4>
                        <p className="story-facility-sub">{activeStep.cardData.facilityName} · {activeStep.cardData.spotAssigned}</p>
                      </div>
                    </div>

                    <div className="story-digital-pass-strip">
                      <div className="pass-barcode-box">
                        <QrCode size={42} strokeWidth={1.8} />
                      </div>
                      <div className="pass-meta-box">
                        <span className="pass-barrier-label">{activeStep.cardData.barrierStatus}</span>
                        <span className="pass-sync-hint">{activeStep.cardData.accessMethod}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Story Card Footer Interactive Controls */}
              <div className="story-card-footer">
                <div className="story-controls-group">
                  <button
                    type="button"
                    className="story-nav-btn"
                    onClick={handlePrevStep}
                    disabled={activeStepIndex === 0}
                    aria-label="Previous step"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <button
                    type="button"
                    className={`story-autoplay-btn ${isAutoPlaying ? 'active' : ''}`}
                    onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                    title={isAutoPlaying ? "Pause walkthrough" : "Auto-play journey"}
                  >
                    {isAutoPlaying ? <Pause size={13} /> : <Play size={13} />}
                    <span>{isAutoPlaying ? "Pause" : "Play Journey"}</span>
                  </button>

                  <button
                    type="button"
                    className="story-nav-btn"
                    onClick={handleNextStep}
                    disabled={activeStepIndex === STEPS.length - 1}
                    aria-label="Next step"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <button
                  type="button"
                  className="story-cta-action"
                  onClick={() => navigate('/driver')}
                >
                  <span>Book a Spot</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* 4. Bottom Main Action CTA */}
          <div className="how-it-works-action">
            <button
              type="button"
              className="landing-btn-primary"
              onClick={() => navigate('/driver')}
            >
              <span>Explore Real-Time Parking</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default DriverJourney;
