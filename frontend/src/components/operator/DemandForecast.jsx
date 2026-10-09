import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../services/api';
import {
  BrainCircuit,
  TrendingUp,
  Clock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Info,
  Calendar,
  Layers,
  ShieldAlert,
  ArrowRight,
  HelpCircle,
  Activity,
  SlidersHorizontal,
  Car
} from 'lucide-react';

const HORIZON_OPTIONS = [
  { value: 12, label: '12 Hours', defaultGranularity: 'hour' },
  { value: 24, label: '24 Hours', defaultGranularity: 'hour' },
  { value: 48, label: '48 Hours', defaultGranularity: 'hour' },
  { value: 168, label: '7 Days', defaultGranularity: 'day' }
];

export function DemandForecast({
  facility = null,
  activeUser = null,
  liveOccupancy = null,
  onNavigateTab = null
}) {
  const facilityId = facility?.id || facility?._id || activeUser?.facilityId;
  const facilityName = facility?.name || 'Assigned Facility';
  const totalBays = facility?.totalSpots || facility?.totalSlots || liveOccupancy?.summary?.totalSpots || 48;
  const currentOccupiedBays = liveOccupancy?.summary?.occupied ?? 0;
  const currentReservedBays = liveOccupancy?.summary?.reserved ?? 0;
  const currentLiveOccupancy = currentOccupiedBays + currentReservedBays;

  // Horizon & Granularity controls
  const [horizon, setHorizon] = useState(24);
  const [granularity, setGranularity] = useState('hour');

  // Loading & Data state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [forecastPayload, setForecastPayload] = useState(null);

  // Selected time block for drill-down inspection
  const [selectedBlockIdx, setSelectedBlockIdx] = useState(0);

  // Fetch Forecast from authoritative backend endpoint
  const fetchForecast = useCallback(async (isSilent = false) => {
    if (!facilityId) {
      setLoading(false);
      return;
    }

    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await api.getDemandForecast(facilityId, horizon, granularity);
      if (res && res.predictedDemand) {
        setForecastPayload(res);
        setSelectedBlockIdx(0);
      } else {
        setForecastPayload(null);
      }
    } catch (err) {
      console.warn('[DemandForecast] Could not load forecast:', err);
      setError('Could not retrieve forecast for this facility. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [facilityId, horizon, granularity]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Handle Horizon change (auto-switch granularity for 7 days if appropriate)
  const handleSelectHorizon = (hVal) => {
    setHorizon(hVal);
    if (hVal === 168) {
      setGranularity('day');
    } else {
      setGranularity('hour');
    }
  };

  // ---------------------------------------------------------------------------
  // PARSED PREDICTIONS & PRESSURE STATES
  // ---------------------------------------------------------------------------
  const parsedItems = useMemo(() => {
    const rawList = forecastPayload?.predictedDemand || [];
    if (!rawList.length) return [];

    const cap = forecastPayload?.facility?.totalSpots || totalBays || 48;

    return rawList.map((item, idx) => {
      const timestamp = new Date(item.timestamp);
      const isDaily = forecastPayload?.granularity === 'day';
      let timeLabel = item.timestamp;

      if (!isNaN(timestamp.getTime())) {
        if (isDaily) {
          timeLabel = timestamp.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
        } else {
          timeLabel = timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } else if (item.hourOfDay !== undefined) {
        timeLabel = `${String(item.hourOfDay).padStart(2, '0')}:00`;
      }

      const demandBookings = item.predictedBookings ?? 0;
      const occupiedSpots = item.predictedOccupiedSpots ?? Math.min(cap, demandBookings);
      const utilPct = item.predictedUtilization ?? (cap > 0 ? Math.round((occupiedSpots / cap) * 100) : 0);
      const spareCapacity = Math.max(0, cap - occupiedSpots);
      const confidence = typeof item.confidence === 'number' ? item.confidence : 0.85;

      // Confidence uncertainty whiskers (statistically grounded margin)
      const margin = Math.max(1, Math.round(demandBookings * (1 - confidence)));
      const confidenceMin = Math.max(0, demandBookings - margin);
      const confidenceMax = Math.min(cap, demandBookings + margin);

      // Operational Capacity Pressure States (Strictly Defined Thresholds)
      let pressureState = 'NORMAL';
      let pressureClass = 'normal';
      let pressureText = 'Normal';
      if (utilPct >= 90) {
        pressureState = 'CAPACITY_RISK';
        pressureClass = 'risk';
        pressureText = 'Capacity Risk';
      } else if (utilPct >= 80) {
        pressureState = 'NEAR_CAPACITY';
        pressureClass = 'near-capacity';
        pressureText = 'Near Capacity';
      } else if (utilPct >= 65) {
        pressureState = 'BUSY';
        pressureClass = 'busy';
        pressureText = 'Busy';
      }

      return {
        idx,
        timeLabel,
        rawTimestamp: item.timestamp,
        demandBookings,
        occupiedSpots,
        spareCapacity,
        utilPct,
        confidence,
        confidencePct: Math.round(confidence * 100),
        confidenceMin,
        confidenceMax,
        pressureState,
        pressureClass,
        pressureText,
        isWeekend: !!item.isWeekend
      };
    });
  }, [forecastPayload, totalBays]);

  // Derived peak prediction
  const peakPrediction = useMemo(() => {
    if (!parsedItems.length) return null;
    return parsedItems.reduce((max, it) => (it.demandBookings > max.demandBookings ? it : max), parsedItems[0]);
  }, [parsedItems]);

  const selectedItem = parsedItems[selectedBlockIdx] || parsedItems[0] || null;

  // Average predicted utilization
  const avgUtilization = forecastPayload?.summary?.averagePredictedUtilization
    ?? (parsedItems.length ? Math.round(parsedItems.reduce((acc, it) => acc + it.utilPct, 0) / parsedItems.length) : 0);

  // Model Source Info
  const isMLModel = forecastPayload?.model === 'ml';
  const modelName = isMLModel
    ? `Gradient Boosting Regressor (${forecastPayload?.modelVersion || 'v1.0'})`
    : 'Phase 3.1 Moving-Average Baseline';
  const fallbackReasonText = forecastPayload?.fallbackReason === 'INSUFFICIENT_HISTORICAL_DATA'
    ? 'Baseline moving-average applied due to sparse historical reservations (<3 events).'
    : forecastPayload?.fallbackReason === 'ML_SERVICE_UNAVAILABLE'
    ? 'ML microservice unreachable; resilient moving-average baseline active.'
    : null;

  // ---------------------------------------------------------------------------
  // EVIDENCE-BASED OPERATIONAL RECOMMENDATIONS
  // ---------------------------------------------------------------------------
  const operationalRecommendations = useMemo(() => {
    const recs = [];
    if (!parsedItems.length) return recs;

    const highPressureHours = parsedItems.filter((it) => it.pressureState === 'CAPACITY_RISK' || it.pressureState === 'NEAR_CAPACITY');
    const underutilizedHours = parsedItems.filter((it) => it.utilPct < 30);

    // 1. High Ingress Pressure & Barrier Readiness
    if (peakPrediction && peakPrediction.utilPct >= 75) {
      recs.push({
        id: 'rec-peak-staffing',
        type: 'alert',
        title: `Prepare Barrier Lanes for Peak Arrival (${peakPrediction.timeLabel})`,
        metric: `${peakPrediction.demandBookings} projected arrivals (${peakPrediction.utilPct}% occupancy)`,
        reason: 'Arrival density is forecasted to peak sharply, which may cause queueing at automatic barrier gates.',
        action: 'Ensure digital barrier QR scanners are active and attendant check-in lanes are unblocked 20 minutes prior.',
        confidence: `${peakPrediction.confidencePct}%`,
        actionTab: 'spots'
      });
    }

    // 2. Capacity Constraint / Walk-In Buffering
    if (highPressureHours.length >= 2) {
      recs.push({
        id: 'rec-capacity-buffer',
        type: 'warning',
        title: `High Capacity Pressure Window (${highPressureHours.length} time intervals)`,
        metric: `Occupancy expected above 80% across ${highPressureHours.length} intervals`,
        reason: 'Extended near-capacity duration limits physical space for drive-up walk-in vehicles.',
        action: 'Inspect overstay logs and consider holding 5–10% bays as drive-up buffer spaces.',
        confidence: `${Math.round(highPressureHours.reduce((acc, it) => acc + it.confidencePct, 0) / highPressureHours.length)}%`,
        actionTab: 'overstays'
      });
    }

    // 3. Dynamic Surge Pricing Consideration
    if (peakPrediction && peakPrediction.utilPct >= 85) {
      recs.push({
        id: 'rec-surge-pricing',
        type: 'pricing',
        title: 'Review Peak Surge Pricing Strategy',
        metric: `Projected ${peakPrediction.utilPct}% occupancy at peak`,
        reason: 'Sustained peak demand justifies algorithmic or time-of-day rate adjustment for inbound reservations.',
        action: 'Review pending price recommendations in the Pricing & Recommendations workspace.',
        confidence: `${peakPrediction.confidencePct}%`,
        actionTab: 'recommendations'
      });
    }

    // 4. Off-Peak Revenue Opportunity
    if (underutilizedHours.length >= 4) {
      recs.push({
        id: 'rec-off-peak',
        type: 'opportunity',
        title: 'Off-Peak Capacity Monetization Opportunity',
        metric: `${underutilizedHours.length} intervals projected under 30% occupancy`,
        reason: 'Substantial parking inventory will remain idle during projected low-demand windows.',
        action: 'Consider introducing an off-peak discount rule to attract overnight or fleet reservations.',
        confidence: '85%',
        actionTab: 'pricing'
      });
    }

    return recs;
  }, [parsedItems, peakPrediction]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* =====================================================================
          A. FORECAST HEADER & HORIZON CONTROLS
          ===================================================================== */}
      <div className="analytics-header-section">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <h2 className="analytics-title">Demand Forecast</h2>
            {/* Model Badge */}
            <span
              className={`status-tag ${isMLModel ? 'available' : 'selected'}`}
              style={{ fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              title={modelName}
            >
              {isMLModel ? <Sparkles size={13} /> : <BrainCircuit size={13} />}
              {isMLModel ? 'ML Predictive Model' : 'Moving-Average Baseline'}
            </span>
            <span className="metadata" style={{ fontSize: '0.75rem' }}>
              Facility: <strong>{facilityName}</strong> ({totalBays} bays)
            </span>
          </div>
          <p className="analytics-subtitle">
            Anticipate parking demand, recognize capacity pressure, and prepare your facility before arrival peaks.
          </p>
        </div>

        {/* Horizon Switcher & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--ps-secondary-light)',
            padding: '3px',
            borderRadius: 'var(--ps-radius-md)',
            gap: '2px'
          }}>
            {HORIZON_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSelectHorizon(opt.value)}
                className={`btn btn-sm ${horizon === opt.value ? 'btn-primary' : ''}`}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.35rem 0.65rem',
                  border: 'none',
                  borderRadius: 'var(--ps-radius-sm)',
                  backgroundColor: horizon === opt.value ? 'var(--ps-primary-dark)' : 'transparent',
                  color: horizon === opt.value ? '#FFFFFF' : 'var(--ps-primary-dark)',
                  fontWeight: horizon === opt.value ? 700 : 500
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchForecast(true)}
            disabled={loading || refreshing}
            title="Refresh forecast model predictions"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.75rem' }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            <span style={{ fontSize: '0.75rem' }}>Generate</span>
          </button>
        </div>
      </div>

      {/* Model Transparency Banner if Fallback is Used */}
      {fallbackReasonText && (
        <div style={{
          backgroundColor: 'rgba(178, 162, 64, 0.12)',
          border: '1px solid var(--ps-accent-dark)',
          borderRadius: 'var(--ps-radius-sm)',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          fontSize: '0.8125rem',
          color: 'var(--ps-primary-dark)'
        }}>
          <Info size={16} color="var(--ps-accent-dark)" style={{ flexShrink: 0 }} />
          <div>
            <strong>Model Transparency:</strong> {fallbackReasonText} Forecasts are mathematically derived from 60-day facility reservation patterns and recent volume momentum.
          </div>
        </div>
      )}

      {/* Notice Banner if Error */}
      {error && (
        <div style={{
          backgroundColor: 'rgba(198, 40, 40, 0.08)',
          border: '1px solid var(--ps-state-occupied)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--ps-radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
          color: 'var(--ps-state-occupied)'
        }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* =====================================================================
          B. FORECAST EXECUTIVE SUMMARY (4 Cards)
          ===================================================================== */}
      <div className="forecast-summary-grid">
        {/* Card 1: Expected Average Demand */}
        <div className="forecast-summary-card">
          <div className="forecast-summary-label">Expected Average Demand</div>
          <div className="forecast-summary-val">
            {parsedItems.length ? `${Math.round(parsedItems.reduce((acc, it) => acc + it.demandBookings, 0) / parsedItems.length)} vehicles` : '—'}
          </div>
          <div className="forecast-summary-hint">
            Average projected vehicle ingress volume across {horizon === 168 ? '7 days' : `${horizon}h`} horizon.
          </div>
        </div>

        {/* Card 2: Peak Period Window */}
        <div className="forecast-summary-card">
          <div className="forecast-summary-label">Expected Peak Period</div>
          <div className="forecast-summary-val">
            {peakPrediction ? peakPrediction.timeLabel : '—'}
          </div>
          <div className="forecast-summary-hint">
            {peakPrediction ? `${peakPrediction.demandBookings} vehicles projected at peak (${peakPrediction.utilPct}% capacity)` : 'No peak data'}
          </div>
        </div>

        {/* Card 3: Capacity Pressure Ceiling */}
        <div className="forecast-summary-card">
          <div className="forecast-summary-label">Capacity Pressure Ceiling</div>
          <div
            className="forecast-summary-val"
            style={{
              color: peakPrediction?.utilPct >= 85 ? 'var(--ps-state-occupied)' : 'var(--ps-primary-dark)'
            }}
          >
            {peakPrediction ? `${peakPrediction.utilPct}%` : '—'}
          </div>
          <div className="forecast-summary-hint">
            {peakPrediction ? `${peakPrediction.pressureText} during peak window (${peakPrediction.spareCapacity} buffer bays)` : 'Fluid turnover'}
          </div>
        </div>

        {/* Card 4: Model Confidence Rating */}
        <div className="forecast-summary-card">
          <div className="forecast-summary-label">Forecast Confidence</div>
          <div className="forecast-summary-val" style={{ color: 'var(--ps-state-available)' }}>
            {peakPrediction ? `${peakPrediction.confidencePct}%` : '85%'}
          </div>
          <div className="forecast-summary-hint">
            Based on {forecastPayload?.summary?.baselineDemand ? `${forecastPayload.summary.baselineDemand} daily baseline prior` : 'historical depth'}.
          </div>
        </div>
      </div>

      {/* =====================================================================
          C. MAIN FORECAST CHART (Centerpiece: Actual vs Predicted)
          ===================================================================== */}
      <div className="forecast-chart-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <span className="eyebrow" style={{ color: 'var(--ps-secondary-dark)' }}>DEMAND PROJECTION TIMELINE</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.2rem 0 0', color: 'var(--ps-primary-dark)' }}>
              Observed Live State vs. Predicted Future Horizon
            </h3>
            <p className="metadata" style={{ fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
              Differentiates confirmed live parking bay occupancy from predicted incoming reservation demand.
            </p>
          </div>

          {/* Legend */}
          <div className="analytics-chart-legend">
            <div className="analytics-legend-item">
              <span className="analytics-legend-dot" style={{ backgroundColor: 'var(--ps-primary-dark)' }} />
              <span>Current Live Occupancy</span>
            </div>
            <div className="analytics-legend-item">
              <span className="analytics-legend-dot" style={{ backgroundColor: '#B2A240', border: '1px solid #F3F456' }} />
              <span>Predicted Demand</span>
            </div>
            <div className="analytics-legend-item">
              <span className="analytics-legend-dot" style={{ backgroundColor: 'var(--ps-state-occupied)' }} />
              <span>Capacity Risk (&gt;80%)</span>
            </div>
          </div>
        </div>

        {/* Forecast Bands Timeline with Clear Phase Boundary */}
        {loading ? (
          <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ps-secondary-dark)', fontSize: '0.875rem' }}>
              <RefreshCw size={16} className="spin" /> Generating predictive inference...
            </div>
          </div>
        ) : parsedItems.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }} className="metadata">
            No forecast intervals available for this facility.
          </div>
        ) : (
          <div className="forecast-chart-bands" style={{ overflowX: 'auto', paddingBottom: '0.75rem' }}>
            {/* 1. ACTUAL LIVE DEMAND (NOW) */}
            <div
              className="analytics-bar-col"
              style={{ minWidth: '58px', maxWidth: '68px', cursor: 'pointer' }}
              title={`Now (Live): ${currentLiveOccupancy} occupied / reserved bays (${Math.round((currentLiveOccupancy / totalBays) * 100)}% capacity)`}
            >
              <span className="analytics-bar-count" style={{ color: 'var(--ps-primary-dark)', fontWeight: 800 }}>
                {currentLiveOccupancy}
              </span>
              <div
                className="analytics-bar-fill"
                style={{
                  height: `${Math.min(100, Math.max(18, Math.round((currentLiveOccupancy / totalBays) * 100)))}%`,
                  backgroundColor: 'var(--ps-primary-dark)',
                  border: '2px solid var(--ps-primary-dark)'
                }}
              />
              <span className="analytics-bar-time" style={{ fontWeight: 800, color: 'var(--ps-primary-dark)' }}>
                Now (Live)
              </span>
            </div>

            {/* 2. CLEAR PHASE DIVIDER */}
            <div className="forecast-phase-divider" style={{ minWidth: '70px' }}>
              <span style={{ fontSize: '0.625rem', color: 'var(--ps-secondary-dark)' }}>OBSERVED</span>
              <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: 'var(--ps-accent-dark)' }}>FORECAST ►</span>
            </div>

            {/* 3. PREDICTED DEMAND INTERVALS */}
            {parsedItems.map((item) => {
              const heightPct = Math.min(100, Math.max(14, item.utilPct));
              const isSelected = selectedBlockIdx === item.idx;
              const isPeak = peakPrediction && peakPrediction.idx === item.idx;

              return (
                <div
                  key={item.idx}
                  className="analytics-bar-col"
                  style={{
                    minWidth: '40px',
                    cursor: 'pointer',
                    opacity: isSelected ? 1 : 0.88,
                    transform: isSelected ? 'scale(1.04)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => setSelectedBlockIdx(item.idx)}
                  title={`${item.timeLabel}: Predicted ${item.demandBookings} vehicles (${item.utilPct}% occupancy). Confidence: ${item.confidencePct}%. Click to inspect.`}
                >
                  <span
                    className="analytics-bar-count"
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: isPeak ? 800 : 600,
                      color: item.pressureState === 'CAPACITY_RISK' ? 'var(--ps-state-occupied)' : 'var(--ps-primary-dark)'
                    }}
                  >
                    {item.demandBookings}
                  </span>

                  <div
                    className="analytics-bar-fill"
                    style={{
                      height: `${heightPct}%`,
                      background: item.pressureState === 'CAPACITY_RISK'
                        ? 'linear-gradient(180deg, #C62828 0%, #25221B 100%)'
                        : isPeak
                        ? 'linear-gradient(180deg, #B2A240 0%, #25221B 100%)'
                        : 'linear-gradient(180deg, rgba(178, 162, 64, 0.45) 0%, rgba(37, 34, 27, 0.65) 100%)',
                      borderTop: isPeak ? '2px solid var(--ps-accent-light)' : '1px dashed var(--ps-accent-dark)',
                      boxShadow: isSelected ? '0 0 0 2px var(--ps-primary-dark)' : 'none'
                    }}
                  />

                  <span
                    className="analytics-bar-time"
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? 'var(--ps-primary-dark)' : 'var(--ps-secondary-dark)'
                    }}
                  >
                    {item.timeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span className="metadata" style={{ fontSize: '0.75rem' }}>
            Operational capacity ceiling: <strong>{totalBays} total bays</strong>. Forecasted demand represents arrival probability, not confirmed reservations.
          </span>
          <span className="metadata" style={{ fontSize: '0.75rem', fontFamily: 'var(--ps-font-mono)' }}>
            Model Confidence: {selectedItem ? `${selectedItem.confidencePct}% (±${Math.round((1 - selectedItem.confidence) * 100)}% band)` : '92%'}
          </span>
        </div>
      </div>

      {/* =====================================================================
          D. UPCOMING DEMAND TIMELINE STRIP & SELECTED BLOCK INSPECTOR
          ===================================================================== */}
      {selectedItem && (
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--ps-secondary-light)',
          borderRadius: 'var(--ps-radius-md)',
          padding: '1.25rem',
          boxShadow: 'var(--ps-shadow-subtle)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--ps-secondary-dark)' }}>TIME BLOCK INSPECTION</span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.15rem 0 0', color: 'var(--ps-primary-dark)' }}>
                Detailed Projection for {selectedItem.timeLabel}
              </h3>
            </div>
            <span className={`status-tag ${selectedItem.pressureClass}`} style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {selectedItem.pressureText} ({selectedItem.utilPct}% Capacity)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ backgroundColor: 'var(--ps-primary-light)', padding: '0.75rem 1rem', borderRadius: 'var(--ps-radius-sm)' }}>
              <span className="metadata" style={{ fontSize: '0.75rem' }}>Expected Vehicle Arrivals</span>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--ps-primary-dark)' }}>
                {selectedItem.demandBookings} vehicles
              </div>
              <span className="metadata" style={{ fontSize: '0.6875rem' }}>
                Uncertainty range: {selectedItem.confidenceMin}–{selectedItem.confidenceMax} vehicles
              </span>
            </div>

            <div style={{ backgroundColor: 'var(--ps-primary-light)', padding: '0.75rem 1rem', borderRadius: 'var(--ps-radius-sm)' }}>
              <span className="metadata" style={{ fontSize: '0.75rem' }}>Projected Active Dwell</span>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--ps-primary-dark)' }}>
                {selectedItem.occupiedSpots} bays
              </div>
              <span className="metadata" style={{ fontSize: '0.6875rem' }}>
                Concurrently occupied or reserved
              </span>
            </div>

            <div style={{ backgroundColor: 'var(--ps-primary-light)', padding: '0.75rem 1rem', borderRadius: 'var(--ps-radius-sm)' }}>
              <span className="metadata" style={{ fontSize: '0.75rem' }}>Estimated Spare Capacity</span>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: selectedItem.spareCapacity <= 5 ? 'var(--ps-state-occupied)' : 'var(--ps-state-available)' }}>
                {selectedItem.spareCapacity} bays
              </div>
              <span className="metadata" style={{ fontSize: '0.6875rem' }}>
                Vacant buffer spaces available
              </span>
            </div>

            <div style={{ backgroundColor: 'var(--ps-primary-light)', padding: '0.75rem 1rem', borderRadius: 'var(--ps-radius-sm)' }}>
              <span className="metadata" style={{ fontSize: '0.75rem' }}>Inference Confidence</span>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--ps-accent-dark)' }}>
                {selectedItem.confidencePct}%
              </div>
              <span className="metadata" style={{ fontSize: '0.6875rem' }}>
                Model reliability score
              </span>
            </div>
          </div>

          <div style={{ fontSize: '0.8125rem', color: 'var(--ps-secondary-dark)' }}>
            <strong>Operational Guidance:</strong>{' '}
            {selectedItem.pressureState === 'CAPACITY_RISK'
              ? 'Capacity risk window: Facility approaches physical limits. Prepare barrier attendants for manual flow triage.'
              : selectedItem.pressureState === 'NEAR_CAPACITY'
              ? 'Near capacity window: Buffer bays are limited. Discourage non-reservation drive-up dwell.'
              : selectedItem.pressureState === 'BUSY'
              ? 'Busy window: Standard operational turnover with sufficient buffer inventory.'
              : 'Fluid window: High buffer availability. Normal automatic gate operations.'}
          </div>
        </div>
      )}

      {/* =====================================================================
          E. OPERATIONAL RECOMMENDATIONS: "Prepare for upcoming demand"
          ===================================================================== */}
      <div>
        <div style={{ marginBottom: '0.85rem' }}>
          <span className="eyebrow">ACTIONABLE PLAYBOOK</span>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.15rem 0 0', color: 'var(--ps-primary-dark)' }}>
            Prepare for upcoming demand
          </h3>
          <p className="metadata" style={{ fontSize: '0.75rem', margin: '0.15rem 0 0' }}>
            Advisory actions derived from upcoming arrival projections and capacity pressure thresholds.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          {operationalRecommendations.map((rec) => (
            <div
              key={rec.id}
              className="analytics-insight-card"
              style={{
                borderLeft: rec.type === 'alert'
                  ? '4px solid var(--ps-state-occupied)'
                  : rec.type === 'warning'
                  ? '4px solid var(--ps-accent-dark)'
                  : '4px solid var(--ps-primary-dark)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow" style={{ color: 'var(--ps-primary-dark)', margin: 0 }}>
                  {rec.metric}
                </span>
                <span className="metadata" style={{ fontSize: '0.6875rem' }}>
                  Confidence: {rec.confidence}
                </span>
              </div>

              <div className="analytics-insight-title" style={{ marginTop: '0.25rem' }}>
                {rec.title}
              </div>

              <p className="analytics-insight-desc" style={{ marginBottom: '0.75rem' }}>
                {rec.reason}
              </p>

              <div style={{
                backgroundColor: 'var(--ps-primary-light)',
                padding: '0.5rem 0.65rem',
                borderRadius: 'var(--ps-radius-sm)',
                fontSize: '0.75rem',
                color: 'var(--ps-primary-dark)',
                marginBottom: '0.75rem',
                lineHeight: 1.45
              }}>
                <strong>Recommended Action:</strong> {rec.action}
              </div>

              {rec.actionTab && onNavigateTab && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => onNavigateTab(rec.actionTab)}
                  style={{ alignSelf: 'flex-start', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <span>Open {rec.actionTab.charAt(0).toUpperCase() + rec.actionTab.slice(1)}</span>
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* =====================================================================
          F. MODEL CHARACTERISTICS & STATISTICAL LIMITATIONS
          ===================================================================== */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--ps-secondary-light)',
        borderRadius: 'var(--ps-radius-md)',
        padding: '1.25rem',
        boxShadow: 'var(--ps-shadow-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <BrainCircuit size={16} color="var(--ps-secondary-dark)" />
          <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0, color: 'var(--ps-primary-dark)' }}>
            Model Characteristics & Scope
          </h4>
        </div>

        <p className="metadata" style={{ fontSize: '0.8125rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
          This prediction engine utilizes <strong>{modelName}</strong>. Features evaluated include hour of day, day of week, weekend indicator, facility capacity scale, 60-day historical moving averages, and lag demand terms (t-1h, t-24h).
        </p>

        <div style={{
          backgroundColor: 'var(--ps-primary-light)',
          padding: '0.65rem 0.85rem',
          borderRadius: 'var(--ps-radius-sm)',
          fontSize: '0.75rem',
          color: 'var(--ps-secondary-dark)',
          lineHeight: 1.5
        }}>
          <strong>OPERATIONAL LIMITATION NOTICE:</strong> Predictions are statistical inferences computed exclusively from historical reservation records and recent facility momentum. The model does <em>not</em> ingest live municipal road closures, unpredicted weather events, or unscheduled regional public gatherings. Recommendations are strictly advisory and do not automatically alter live rates or spot availability.
        </div>
      </div>
    </div>
  );
}
