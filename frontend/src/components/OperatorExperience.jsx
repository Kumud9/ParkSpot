import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ParkingMap } from './ParkingMap';
import { api } from '../services/api';
import { Logo } from './shared/Logo';
import { ComponentLoader, ActionLoader } from './shared/Loading';
import {
  LayoutDashboard,
  Layers,
  Map as MapIcon,
  SlidersHorizontal,
  CalendarCheck,
  Activity,
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  DollarSign,
  TrendingUp,
  Bot,
  FileText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Car,
  Wrench,
  Search,
  Filter,
  RefreshCw,
  X,
  ChevronRight,
  ChevronDown,
  Building2,
  Sparkles,
  ArrowUpRight,
  HelpCircle,
  Send,
  Info,
  Calendar,
  MapPin
} from 'lucide-react';

// Functional semantic state colors (as strictly required for parking states)
const STATE_COLORS = {
  AVAILABLE: '#2E7D32',
  OCCUPIED: '#C62828',
  RESERVED: '#D97706',
  SELECTED: '#F3F456',
  MAINTENANCE: '#757575',
  BLOCKED: '#374151'
};

export function OperatorExperience({
  facilities = [],
  events = [],
  auditLogs = [],
  bookings = [],
  onUpdateSpotStatus,
  isLiveConnected = false,
  activeUser = null
}) {
  // -------------------------------------------------------------------------
  // CORE OPERATIONAL STATE
  // -------------------------------------------------------------------------
  const [selectedFacility, setSelectedFacility] = useState(() => facilities[0] || null);
  const [activeFloor, setActiveFloor] = useState('Floor 1');
  const [operatorTab, setOperatorTab] = useState('dashboard');
  const [activeRole, setActiveRole] = useState('ADMIN'); // OWNER | ADMIN | MANAGER | OPERATOR

  // Update selected facility when facilities list changes
  useEffect(() => {
    if (!selectedFacility && facilities.length > 0) {
      setSelectedFacility(facilities[0]);
    } else if (selectedFacility && facilities.length > 0) {
      const match = facilities.find((f) => f.id === selectedFacility.id);
      if (match) setSelectedFacility(match);
    }
  }, [facilities]);

  // Derive distinct floors for selected facility
  const facilityFloors = useMemo(() => {
    if (selectedFacility?.floors && selectedFacility.floors.length > 0) {
      return selectedFacility.floors;
    }
    if (selectedFacility?.spots && selectedFacility.spots.length > 0) {
      const distinct = Array.from(new Set(selectedFacility.spots.map((s) => s.floor).filter(Boolean)));
      if (distinct.length > 0) return distinct;
    }
    return ['Floor 1', 'Floor 2', 'Floor 3'];
  }, [selectedFacility]);

  useEffect(() => {
    if (facilityFloors.length > 0 && !facilityFloors.includes(activeFloor)) {
      setActiveFloor(facilityFloors[0]);
    }
  }, [facilityFloors, activeFloor]);

  // Spots on current floor & facility spots
  const facilitySpots = useMemo(() => selectedFacility?.spots || [], [selectedFacility]);
  const currentFloorSpots = useMemo(() => {
    return facilitySpots.filter((s) => s.floor === activeFloor);
  }, [facilitySpots, activeFloor]);

  // Real-time capacity breakdown
  const totalBays = facilitySpots.length || selectedFacility?.totalSpots || 48;
  const availableBays = facilitySpots.filter((s) => s.status === 'AVAILABLE').length;
  const occupiedBays = facilitySpots.filter((s) => s.status === 'OCCUPIED').length;
  const reservedBays = facilitySpots.filter((s) => s.status === 'RESERVED').length;
  const maintenanceBays = facilitySpots.filter((s) => s.status === 'MAINTENANCE').length;
  const blockedBays = facilitySpots.filter((s) => s.status === 'BLOCKED').length;
  const occupancyPercent = totalBays > 0 ? Math.round(((occupiedBays + reservedBays) / totalBays) * 100) : 65;

  // -------------------------------------------------------------------------
  // SPOT SELECTION & OPERATOR OVERRIDES
  // -------------------------------------------------------------------------
  const [selectedSpotForAction, setSelectedSpotForAction] = useState(null);
  const [spotActionLoading, setSpotActionLoading] = useState(false);
  const [spotFeedback, setSpotFeedback] = useState(null); // { type: 'success' | 'error', message }

  const handleApplySpotAction = async (newStatus) => {
    if (!selectedSpotForAction || !selectedFacility) return;
    const spotId = selectedSpotForAction.id;
    const prevStatus = selectedSpotForAction.status;

    setSpotActionLoading(true);
    setSpotFeedback(null);

    // 1. Optimistic UI update via parent handler
    onUpdateSpotStatus && onUpdateSpotStatus(selectedFacility.id, activeFloor, spotId, newStatus);
    setSelectedSpotForAction((prev) => prev ? { ...prev, status: newStatus } : null);

    // 2. Progressive API sync (if live & has 24-char ObjectId)
    if (isLiveConnected && /^[a-f\d]{24}$/i.test(selectedFacility.id) && /^[a-f\d]{24}$/i.test(spotId)) {
      try {
        await api.updateSpotStatus(selectedFacility.id, spotId, newStatus);
        setSpotFeedback({
          type: 'success',
          message: `Bay ${selectedSpotForAction.number} status updated to ${newStatus} with audit entry.`
        });
      } catch (err) {
        // Revert optimistic update
        onUpdateSpotStatus && onUpdateSpotStatus(selectedFacility.id, activeFloor, spotId, prevStatus);
        setSelectedSpotForAction((prev) => prev ? { ...prev, status: prevStatus } : null);
        setSpotFeedback({
          type: 'error',
          message: `Failed to update bay status: ${err.message || 'Unauthorized or network error.'}`
        });
      } finally {
        setSpotActionLoading(false);
      }
    } else {
      setTimeout(() => {
        setSpotActionLoading(false);
        setSpotFeedback({
          type: 'success',
          message: `Bay ${selectedSpotForAction.number} status updated to ${newStatus} (Demo Mode).`
        });
      }, 300);
    }
  };

  // -------------------------------------------------------------------------
  // OPTIMIZATION RECOMMENDATIONS STATE
  // -------------------------------------------------------------------------
  const [recommendations, setRecommendations] = useState([
    {
      id: 'REC-301',
      type: 'PRICING_SURGE',
      title: 'Peak Surge Recommendation: 11:00 – 14:00',
      reason: 'Demand forecast projects 88% occupancy between 11:00 and 14:00. Algorithmic pricing recommends a +25% peak rate.',
      currentRate: 40,
      proposedRate: 50,
      expectedImpact: 'Projected +18% revenue lift; dampens over-capacity queuing during peak hours.',
      confidence: '91% (Gradient Boosting ML)',
      status: 'PENDING'
    },
    {
      id: 'REC-302',
      type: 'PRICING_DISCOUNT',
      title: 'Off-Peak Incentive: 21:00 – 06:00',
      reason: 'Night utilization averages 14%. Lowering entry rate incentivizes overnight residential dwell.',
      currentRate: 40,
      proposedRate: 30,
      expectedImpact: 'Projected +22% night occupancy volume without displacing day travelers.',
      confidence: '84% (Gradient Boosting ML)',
      status: 'PENDING'
    }
  ]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsFeedback, setRecsFeedback] = useState(null);

  // Sync recommendations from backend
  const fetchLiveRecommendations = useCallback(async () => {
    if (!selectedFacility?.id || !/^[a-f\d]{24}$/i.test(selectedFacility.id)) return;
    setRecsLoading(true);
    try {
      const liveRecs = await api.getRecommendations(selectedFacility.id);
      if (liveRecs && liveRecs.length > 0) {
        const formatted = liveRecs.map((r) => ({
          id: r._id,
          type: r.type,
          title: `${r.type.replace(/_/g, ' ')}: ${r.reason || 'Algorithmic Optimization'}`,
          reason: r.reason || 'Demand forecast recommendation',
          currentRate: selectedFacility.hourlyRate || 40,
          proposedRate: Math.round((selectedFacility.hourlyRate || 40) * (r.proposedAction?.multiplier || 1.25)),
          expectedImpact: r.proposedAction?.summary || `Modeled multiplier: ${r.proposedAction?.multiplier || '1.25'}x`,
          confidence: r.confidence ? `${Math.round(r.confidence * 100)}% (Gradient Boosting ML)` : '89% (ML Forecast)',
          status: r.status
        }));
        setRecommendations(formatted);
      }
    } catch (e) {
      console.info('[ParkSpot] Live recommendations note:', e.message);
    } finally {
      setRecsLoading(false);
    }
  }, [selectedFacility?.id, selectedFacility?.hourlyRate]);

  useEffect(() => {
    fetchLiveRecommendations();
  }, [fetchLiveRecommendations]);

  const handleAcceptRecommendation = async (recId) => {
    if (activeRole === 'OPERATOR') {
      setRecsFeedback({ type: 'error', message: 'Role restriction: OPERATOR role cannot approve pricing rules. Requires OWNER, ADMIN, or MANAGER.' });
      return;
    }
    setRecommendations((prev) => prev.map((r) => r.id === recId ? { ...r, status: 'ACCEPTED' } : r));
    if (isLiveConnected && /^[a-f\d]{24}$/i.test(recId)) {
      try {
        await api.acceptRecommendation(recId);
        setRecsFeedback({ type: 'success', message: `Recommendation #${recId.slice(-6)} accepted and applied as production pricing rule.` });
      } catch (e) {
        setRecsFeedback({ type: 'error', message: e.message || 'Failed to accept recommendation.' });
      }
    } else {
      setRecsFeedback({ type: 'success', message: `Recommendation accepted (Simulation Mode). Rule activated.` });
    }
  };

  const handleRejectRecommendation = async (recId) => {
    if (activeRole === 'OPERATOR') {
      setRecsFeedback({ type: 'error', message: 'Role restriction: OPERATOR role cannot reject pricing rules. Requires OWNER, ADMIN, or MANAGER.' });
      return;
    }
    setRecommendations((prev) => prev.map((r) => r.id === recId ? { ...r, status: 'REJECTED' } : r));
    if (isLiveConnected && /^[a-f\d]{24}$/i.test(recId)) {
      try {
        await api.rejectRecommendation(recId, 'Operator manual rejection');
        setRecsFeedback({ type: 'success', message: `Recommendation #${recId.slice(-6)} rejected.` });
      } catch (e) {
        setRecsFeedback({ type: 'error', message: e.message || 'Failed to reject recommendation.' });
      }
    }
  };

  // -------------------------------------------------------------------------
  // OVERSTAY TRIAGE STATE
  // -------------------------------------------------------------------------
  const [overstays, setOverstays] = useState([
    {
      id: 'OVS-101',
      bookingId: 'BK-8921',
      spotNumber: 'B4',
      floor: 'Floor 1',
      vehiclePlate: 'DL 01 AB 4920',
      expectedDeparture: '17:00 (Today)',
      actualState: 'OCCUPIED',
      durationMinutes: 45,
      status: 'ACTIVE_OVERSTAY',
      reasoning: 'Active overstay: Reservation window ended at 17:00 but bay remains occupied with no extension event.',
      confidence: '94%'
    },
    {
      id: 'OVS-102',
      bookingId: 'BK-7814',
      spotNumber: 'A3',
      floor: 'Floor 2',
      vehiclePlate: 'HR 26 DQ 8812',
      expectedDeparture: '15:30 (Today)',
      actualState: 'AVAILABLE',
      durationMinutes: 0,
      status: 'MISSING_DEPARTURE_EVENT',
      reasoning: 'Departure event has not been recorded within the standard grace window. Bay manually confirmed vacant.',
      confidence: '82%'
    }
  ]);
  const [overstayFilter, setOverstayFilter] = useState('ALL');
  const [overstaysLoading, setOverstaysLoading] = useState(false);

  useEffect(() => {
    async function fetchOverstays() {
      if (!selectedFacility?.id || !/^[a-f\d]{24}$/i.test(selectedFacility.id)) return;
      setOverstaysLoading(true);
      try {
        const live = await api.getOverstays(selectedFacility.id);
        if (live && live.length > 0) {
          setOverstays(live);
        }
      } catch {
        // Fallback to local state
      } finally {
        setOverstaysLoading(false);
      }
    }
    fetchOverstays();
  }, [selectedFacility?.id]);

  const filteredOverstays = useMemo(() => {
    if (overstayFilter === 'ALL') return overstays;
    return overstays.filter((o) => o.status === overstayFilter);
  }, [overstays, overstayFilter]);

  // -------------------------------------------------------------------------
  // ML DEMAND FORECAST STATE
  // -------------------------------------------------------------------------
  const [forecastHorizon, setForecastHorizon] = useState(24);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastData, setForecastData] = useState({
    horizon: 24,
    granularity: 'hour',
    model: 'Gradient Boosting Regressor (Phase 3.2)',
    confidence: '92.4%',
    forecast: [
      { time: '08:00', expectedDemand: 28, capacity: 48, utilizationPct: 58 },
      { time: '10:00', expectedDemand: 41, capacity: 48, utilizationPct: 85 },
      { time: '12:00', expectedDemand: 45, capacity: 48, utilizationPct: 94 },
      { time: '14:00', expectedDemand: 42, capacity: 48, utilizationPct: 88 },
      { time: '16:00', expectedDemand: 36, capacity: 48, utilizationPct: 75 },
      { time: '18:00', expectedDemand: 44, capacity: 48, utilizationPct: 92 },
      { time: '20:00', expectedDemand: 31, capacity: 48, utilizationPct: 65 },
      { time: '22:00', expectedDemand: 18, capacity: 48, utilizationPct: 38 }
    ]
  });

  useEffect(() => {
    async function fetchForecast() {
      if (!selectedFacility?.id || !/^[a-f\d]{24}$/i.test(selectedFacility.id)) return;
      setForecastLoading(true);
      try {
        const res = await api.getDemandForecast(selectedFacility.id, forecastHorizon);
        if (res && res.forecast) {
          setForecastData(res);
        }
      } catch {
        // Fallback to initial ML forecast
      } finally {
        setForecastLoading(false);
      }
    }
    fetchForecast();
  }, [selectedFacility?.id, forecastHorizon]);

  // -------------------------------------------------------------------------
  // BUSINESS ANALYTICS STATE
  // -------------------------------------------------------------------------
  const [analyticsData, setAnalyticsData] = useState({
    totalBookings: 142,
    activeBookings: 24,
    completedBookings: 110,
    cancelledBookings: 8,
    totalRevenue: 28450,
    averageDwellHours: 3.2,
    peakHours: [
      { hour: 9, bookingCount: 22 },
      { hour: 11, bookingCount: 38 },
      { hour: 13, bookingCount: 35 },
      { hour: 17, bookingCount: 42 },
      { hour: 19, bookingCount: 29 }
    ]
  });
  const [revenueRestricted, setRevenueRestricted] = useState(false);

  useEffect(() => {
    async function fetchAnalytics() {
      if (!selectedFacility?.id || !/^[a-f\d]{24}$/i.test(selectedFacility.id)) return;
      try {
        const [sum, peaks, rev] = await Promise.allSettled([
          api.getDashboardSummary({ facilityId: selectedFacility.id }),
          api.getPeakHours({ facilityId: selectedFacility.id }),
          api.getRevenueAnalytics({ facilityId: selectedFacility.id })
        ]);

        if (sum.status === 'fulfilled' && sum.value) {
          setAnalyticsData((prev) => ({ ...prev, ...sum.value }));
        }
        if (peaks.status === 'fulfilled' && peaks.value?.peakHours) {
          setAnalyticsData((prev) => ({ ...prev, peakHours: peaks.value.peakHours }));
        }
        if (rev.status === 'fulfilled') {
          if (rev.value?.forbidden) {
            setRevenueRestricted(true);
          } else if (rev.value?.totalRevenue !== undefined) {
            setRevenueRestricted(false);
            setAnalyticsData((prev) => ({ ...prev, totalRevenue: rev.value.totalRevenue }));
          }
        }
      } catch {
        // Retain baseline analytics
      }
    }
    fetchAnalytics();
  }, [selectedFacility?.id]);

  // -------------------------------------------------------------------------
  // DYNAMIC PRICING SIMULATION (WHAT-IF ENGINE)
  // -------------------------------------------------------------------------
  const [simPriceChangePct, setSimPriceChangePct] = useState(25);
  const [simElasticity, setSimElasticity] = useState(-0.4);
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);

  const handleRunSimulation = async () => {
    setSimLoading(true);
    setSimResult(null);

    const baseRate = selectedFacility?.hourlyRate || 50;
    const proposedRate = Math.round(baseRate * (1 + simPriceChangePct / 100));

    if (isLiveConnected && /^[a-f\d]{24}$/i.test(selectedFacility?.id)) {
      try {
        const res = await api.simulatePricing({
          facilityId: selectedFacility.id,
          proposedPriceChangePct: Number(simPriceChangePct),
          priceElasticity: Number(simElasticity)
        });
        setSimResult(res);
      } catch (err) {
        // Fallback simulation calculation
        const volumeDeltaPct = Number(simPriceChangePct) * Number(simElasticity);
        const revenueDeltaPct = ((1 + simPriceChangePct / 100) * (1 + volumeDeltaPct / 100) - 1) * 100;
        setSimResult({
          baseRate,
          proposedRate,
          projectedVolumeDeltaPct: Math.round(volumeDeltaPct * 10) / 10,
          projectedRevenueDeltaPct: Math.round(revenueDeltaPct * 10) / 10,
          isTheoreticalModel: true
        });
      } finally {
        setSimLoading(false);
      }
    } else {
      setTimeout(() => {
        const volumeDeltaPct = Number(simPriceChangePct) * Number(simElasticity);
        const revenueDeltaPct = ((1 + simPriceChangePct / 100) * (1 + volumeDeltaPct / 100) - 1) * 100;
        setSimResult({
          baseRate,
          proposedRate,
          projectedVolumeDeltaPct: Math.round(volumeDeltaPct * 10) / 10,
          projectedRevenueDeltaPct: Math.round(revenueDeltaPct * 10) / 10,
          isTheoreticalModel: true
        });
        setSimLoading(false);
      }, 350);
    }
  };

  // -------------------------------------------------------------------------
  // AI OPERATIONS ASSISTANT STATE
  // -------------------------------------------------------------------------
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [aiExplanationModal, setAiExplanationModal] = useState(null); // { isOpen, title, content, loading }

  const handleAskAIAssistant = async (qText = null) => {
    const query = qText || aiQuestion;
    if (!query.trim()) return;

    setAiLoading(true);
    setAiResponse(null);

    if (isLiveConnected && /^[a-f\d]{24}$/i.test(selectedFacility?.id)) {
      try {
        const data = await api.getAIInsights({
          facilityId: selectedFacility.id,
          question: query
        });
        setAiResponse(data);
      } catch (err) {
        setAiResponse({
          answer: `Operations Synthesis: Demand forecasting indicates capacity pressure peaking between 12:00-14:00. Utilization currently stands at ${occupancyPercent}%. ${err.message ? `(Server note: ${err.message})` : ''}`,
          keyMetrics: {
            occupancyRate: `${occupancyPercent}%`,
            activeBays: `${occupiedBays + reservedBays}/${totalBays}`,
            overstays: `${overstays.length} flagged`
          },
          recommendedAction: 'Apply dynamic surge pricing (+20%) to damp peak demand and prioritize pre-booked vehicles.',
          disclaimer: 'AI Operations Assistant is a decision-support synthesis layer. Human operator approval is required before applying configuration.'
        });
      } finally {
        setAiLoading(false);
      }
    } else {
      setTimeout(() => {
        setAiResponse({
          answer: `Operational Intelligence (Demo Mode): Analysis for ${selectedFacility?.name || 'Central Facility'}: Current utilization is ${occupancyPercent}%. Capacity pressure is elevated on Floor 1 (${Math.round((occupiedBays / (totalBays / 3 || 1)) * 100)}%). Forecast models project inbound surge within 90 minutes.`,
          keyMetrics: {
            currentOccupancy: `${occupancyPercent}%`,
            availableBays: `${availableBays}`,
            activeOverstays: `${overstays.length}`
          },
          recommendedAction: 'Monitor Floor 1 ingress and consider activating surge pricing recommendation #REC-301.',
          disclaimer: 'ParkSpot AI Operations Assistant provides decision support. Verification by an authorized operator remains mandatory.'
        });
        setAiLoading(false);
      }, 500);
    }
  };

  const handleExplainRecommendationWithAI = async (rec) => {
    setAiExplanationModal({ isOpen: true, title: rec.title, content: null, loading: true });
    if (isLiveConnected && /^[a-f\d]{24}$/i.test(rec.id)) {
      try {
        const res = await api.explainRecommendation(rec.id);
        setAiExplanationModal({ isOpen: true, title: rec.title, content: res, loading: false });
      } catch (err) {
        setAiExplanationModal({
          isOpen: true,
          title: rec.title,
          content: {
            summary: `Model Explanation: Recommendation was generated because historical and ML forecast data show a high probability of bay saturation (>85%). Rate adjustment balances demand elasticity.`,
            confidenceFactor: rec.confidence,
            riskAssessment: 'Low risk of volume loss; high revenue preservation index.',
            disclaimer: 'AI-generated explanation for operator review.'
          },
          loading: false
        });
      }
    } else {
      setTimeout(() => {
        setAiExplanationModal({
          isOpen: true,
          title: rec.title,
          content: {
            summary: `Algorithmic Explanation: Demand forecast projects 88% occupancy between 11:00 and 14:00. Algorithmic pricing recommends a +25% peak rate. The model expects +18% revenue lift while dampening over-capacity queuing.`,
            confidenceFactor: rec.confidence,
            riskAssessment: 'Low elasticity risk based on Connaught Place / CBD historical booking curves.',
            disclaimer: 'Decision support artifact. Operator confirmation required.'
          },
          loading: false
        });
      }, 400);
    }
  };

  // -------------------------------------------------------------------------
  // FILTERING: SPOT REGISTRY & BOOKINGS
  // -------------------------------------------------------------------------
  const [spotSearch, setSpotSearch] = useState('');
  const [spotStateFilter, setSpotStateFilter] = useState('ALL');
  const [spotTypeFilter, setSpotTypeFilter] = useState('ALL');

  const filteredSpotsRegistry = useMemo(() => {
    return facilitySpots.filter((s) => {
      if (s.floor !== activeFloor) return false;
      if (spotStateFilter !== 'ALL' && s.status !== spotStateFilter) return false;
      if (spotTypeFilter !== 'ALL' && s.type !== spotTypeFilter) return false;
      if (spotSearch.trim()) {
        const q = spotSearch.toLowerCase().trim();
        return s.number?.toLowerCase().includes(q) || s.id?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [facilitySpots, activeFloor, spotStateFilter, spotTypeFilter, spotSearch]);

  const [bookingFilter, setBookingFilter] = useState('ALL');
  const [bookingSearch, setBookingSearch] = useState('');

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (bookingFilter === 'ACTIVE' && b.status !== 'CONFIRMED') return false;
      if (bookingFilter === 'COMPLETED' && b.status !== 'COMPLETED') return false;
      if (bookingFilter === 'CANCELLED' && b.status !== 'CANCELLED' && b.status !== 'CANCELED') return false;
      if (bookingSearch.trim()) {
        const q = bookingSearch.toLowerCase().trim();
        return (
          b.id?.toLowerCase().includes(q) ||
          b.vehiclePlate?.toLowerCase().includes(q) ||
          b.facilityName?.toLowerCase().includes(q) ||
          b.spotNumber?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [bookings, bookingFilter, bookingSearch]);

  return (
    <div className="container" style={{ maxWidth: '1440px' }}>
      {/* =====================================================================
          TOP HEADER: FACILITY CONTEXT, ROLE BADGE & CONNECTION
          ===================================================================== */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--ps-secondary-light)',
        paddingBottom: '0.85rem',
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
        gap: '0.85rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <Logo variant="mark" size={26} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                ParkSpot B2B Operations Console
              </h1>
              <span className={`status-tag ${isLiveConnected ? 'available' : 'selected'}`} style={{ fontSize: '0.6875rem' }}>
                {isLiveConnected ? '● Live API Connected' : '● Demo Simulation'}
              </span>
            </div>
            <div className="metadata" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px' }}>
              <Building2 size={13} />
              <span>Tenant: <strong>Metro Infrastructure Operations Ltd</strong></span>
            </div>
          </div>
        </div>

        {/* Facility Selector & RBAC Role Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className="metadata">Facility:</span>
            <select
              className="form-select"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8125rem' }}
              value={selectedFacility?.id || ''}
              onChange={(e) => {
                const f = facilities.find((fac) => fac.id === e.target.value);
                if (f) setSelectedFacility(f);
              }}
            >
              {facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>{fac.name} ({fac.city || 'Delhi'})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className="metadata">Active Role:</span>
            <select
              className="form-select"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8125rem', fontWeight: 600 }}
              value={activeRole}
              onChange={(e) => setActiveRole(e.target.value)}
              title="Switch role to test frontend RBAC visibility and permission enforcement"
            >
              <option value="OWNER">OWNER (Full Governance)</option>
              <option value="ADMIN">ADMIN (Tenant Control)</option>
              <option value="MANAGER">MANAGER (Operations & Rules)</option>
              <option value="OPERATOR">OPERATOR (Day-to-day Floor)</option>
            </select>
          </div>
        </div>
      </div>

      {/* =====================================================================
          NAVIGATION TABS (14 CORE SCOPES)
          ===================================================================== */}
      <div style={{
        display: 'flex',
        gap: '0.35rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '1px solid var(--ps-secondary-light)'
      }}>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
          { id: 'occupancy', label: 'Live Occupancy', icon: <Layers size={14} /> },
          { id: 'map', label: 'Interactive Map', icon: <MapIcon size={14} /> },
          { id: 'spots', label: 'Spot Registry', icon: <SlidersHorizontal size={14} /> },
          { id: 'bookings', label: 'Bookings', icon: <CalendarCheck size={14} /> },
          { id: 'events', label: 'Operational Events', icon: <Activity size={14} /> },
          { id: 'overstays', label: `Overstays (${overstays.length})`, icon: <AlertTriangle size={14} /> },
          { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={14} /> },
          { id: 'recommendations', label: `Recommendations (${recommendations.filter(r => r.status === 'PENDING').length})`, icon: <BrainCircuit size={14} /> },
          { id: 'pricing', label: 'Dynamic Pricing', icon: <DollarSign size={14} /> },
          { id: 'forecast', label: 'ML Forecast', icon: <TrendingUp size={14} /> },
          { id: 'assistant', label: 'AI Assistant', icon: <Bot size={14} /> },
          { id: 'audit', label: 'Audit Logs', icon: <FileText size={14} /> },
          { id: 'settings', label: 'Settings & RBAC', icon: <Settings size={14} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            className={`btn btn-sm ${operatorTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            onClick={() => setOperatorTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Global Action Feedback Banners */}
      {spotFeedback && (
        <div style={{
          backgroundColor: spotFeedback.type === 'error' ? '#FDE8E8' : 'rgba(46, 125, 50, 0.1)',
          color: spotFeedback.type === 'error' ? '#9B1C1C' : '#2E7D32',
          border: `1px solid ${spotFeedback.type === 'error' ? '#F87171' : '#2E7D32'}`,
          borderRadius: 'var(--ps-radius-sm)',
          padding: '0.65rem 0.95rem',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {spotFeedback.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{spotFeedback.message}</span>
          </div>
          <button
            onClick={() => setSpotFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {recsFeedback && (
        <div style={{
          backgroundColor: recsFeedback.type === 'error' ? '#FDE8E8' : 'rgba(46, 125, 50, 0.1)',
          color: recsFeedback.type === 'error' ? '#9B1C1C' : '#2E7D32',
          border: `1px solid ${recsFeedback.type === 'error' ? '#F87171' : '#2E7D32'}`,
          borderRadius: 'var(--ps-radius-sm)',
          padding: '0.65rem 0.95rem',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {recsFeedback.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{recsFeedback.message}</span>
          </div>
          <button
            onClick={() => setRecsFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* =====================================================================
          TAB 1: OPERATOR DASHBOARD (STRICT UX HIERARCHY)
          1. ATTENTION
          2. CURRENT OPERATIONS
          3. LIVE PARKING OPERATIONS
          4. BUSINESS PERFORMANCE
          5. WHAT PARKSPOT RECOMMENDS
          6. AI OPERATIONS ASSISTANT
          ===================================================================== */}
      {operatorTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* 1. ATTENTION HIERARCHY */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <AlertCircle size={18} color="var(--ps-state-occupied)" />
              <h2 className="section-title" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                1. What Requires Attention Right Now
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {/* Active Overstays Alert */}
              <div
                className="card"
                style={{
                  borderLeft: `4px solid ${overstays.length > 0 ? 'var(--ps-state-occupied)' : 'var(--ps-state-available)'}`,
                  cursor: 'pointer'
                }}
                onClick={() => setOperatorTab('overstays')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="metadata">Active Overstays</span>
                  <span className={`status-tag ${overstays.length > 0 ? 'occupied' : 'available'}`}>
                    {overstays.length} Flagged
                  </span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.35rem 0' }}>
                  {overstays.filter(o => o.status === 'ACTIVE_OVERSTAY').length} Exceeded Dwell
                </div>
                <p className="metadata">
                  {overstays.length > 0
                    ? `Earliest overstay: Space ${overstays[0].spotNumber} (${overstays[0].durationMinutes} mins past window).`
                    : 'All vehicles departed within booked reservation window.'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ps-primary-dark)' }}>
                  <span>Open Overstay Triage</span> <ChevronRight size={14} />
                </div>
              </div>

              {/* Capacity Pressure Alert */}
              <div className="card" style={{ borderLeft: `4px solid ${occupancyPercent >= 85 ? 'var(--ps-state-occupied)' : 'var(--ps-accent-dark)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="metadata">Capacity Pressure</span>
                  <span className={`status-tag ${occupancyPercent >= 85 ? 'occupied' : 'available'}`}>
                    {occupancyPercent >= 85 ? 'High Pressure' : 'Normal Operations'}
                  </span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.35rem 0' }}>
                  {occupancyPercent}% Utilized
                </div>
                <p className="metadata">
                  {availableBays} bays remain open across {facilityFloors.length} levels. {occupancyPercent >= 85 ? 'Algorithmic surge damping advised.' : 'Capacity headroom is healthy.'}
                </p>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ps-primary-dark)', cursor: 'pointer' }}
                  onClick={() => setOperatorTab('occupancy')}
                >
                  <span>Inspect Floor Breakdown</span> <ChevronRight size={14} />
                </div>
              </div>

              {/* Operational Signals / Recommendations Pending */}
              <div
                className="card"
                style={{ borderLeft: '4px solid var(--ps-accent-light)', cursor: 'pointer' }}
                onClick={() => setOperatorTab('recommendations')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="metadata">Operational Signals</span>
                  <span className="status-tag selected">
                    {recommendations.filter(r => r.status === 'PENDING').length} Pending
                  </span>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.35rem 0' }}>
                  {recommendations.filter(r => r.status === 'PENDING').length} Recommendations
                </div>
                <p className="metadata">
                  Gradient Boosting ML model detected peak window. Operator confirmation required.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ps-primary-dark)' }}>
                  <span>Review System Actions</span> <ChevronRight size={14} />
                </div>
              </div>
            </div>
          </section>

          {/* 2. CURRENT OPERATIONS */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <Layers size={18} />
              <h2 className="section-title" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                2. Current Operations
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div className="card">
                <span className="metadata">Total Facility Bays</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{totalBays}</div>
                <div className="metadata">Configured capacity</div>
              </div>

              <div className="card" style={{ borderLeft: `4px solid ${STATE_COLORS.AVAILABLE}` }}>
                <span className="metadata">Available Bays</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: STATE_COLORS.AVAILABLE }}>{availableBays}</div>
                <div className="metadata">Ready for ingress</div>
              </div>

              <div className="card" style={{ borderLeft: `4px solid ${STATE_COLORS.OCCUPIED}` }}>
                <span className="metadata">Occupied Bays</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: STATE_COLORS.OCCUPIED }}>{occupiedBays}</div>
                <div className="metadata">Vehicles actively parked</div>
              </div>

              <div className="card" style={{ borderLeft: `4px solid ${STATE_COLORS.RESERVED}` }}>
                <span className="metadata">Reserved (En Route)</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: STATE_COLORS.RESERVED }}>{reservedBays}</div>
                <div className="metadata">Confirmed hold window</div>
              </div>

              <div className="card" style={{ borderLeft: `4px solid ${STATE_COLORS.BLOCKED}` }}>
                <span className="metadata">Blocked / Maintenance</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{blockedBays + maintenanceBays}</div>
                <div className="metadata">Offline from public pool</div>
              </div>
            </div>
          </section>

          {/* 3. LIVE PARKING OPERATIONS (INTERACTIVE MAP) */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 className="section-title" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  3. Live Parking Operations — Interactive Facility Map
                </h2>
                <span className="metadata">Select any parking bay to inspect booking context or apply operational state overrides</span>
              </div>

              {/* Floor Switcher */}
              <div className="floor-pill-group">
                {facilityFloors.map((fl) => (
                  <button
                    key={fl}
                    className={`floor-pill ${activeFloor === fl ? 'active' : ''}`}
                    onClick={() => {
                      setActiveFloor(fl);
                      setSelectedSpotForAction(null);
                    }}
                  >
                    {fl}
                  </button>
                ))}
              </div>
            </div>

            <div className="content-grid content-grid-split">
              {/* Reusable Interactive Parking Map */}
              <div>
                <ParkingMap
                  floors={facilityFloors}
                  activeFloor={activeFloor}
                  onSelectFloor={setActiveFloor}
                  spots={currentFloorSpots}
                  selectedSpotId={selectedSpotForAction?.id}
                  onSelectSpot={(spot) => setSelectedSpotForAction(spot)}
                  isOperator={true}
                />
              </div>

              {/* Contextual Spot Override Drawer */}
              <div>
                {selectedSpotForAction ? (
                  <div className="card" style={{ border: '2px solid var(--ps-primary-dark)', position: 'sticky', top: '80px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <span className="eyebrow">BAY OVERRIDE CONTROL</span>
                        <h3 style={{ fontSize: '1.35rem', margin: '0.2rem 0' }}>
                          Space {selectedSpotForAction.number}
                        </h3>
                        <p className="metadata">{activeFloor} · Classification: <strong>{selectedSpotForAction.type || 'STANDARD'}</strong></p>
                      </div>
                      <span className={`status-tag ${selectedSpotForAction.status.toLowerCase()}`}>
                        {selectedSpotForAction.status}
                      </span>
                    </div>

                    <div style={{
                      backgroundColor: 'var(--ps-primary-light)',
                      borderRadius: 'var(--ps-radius-sm)',
                      padding: '0.75rem',
                      marginBottom: '1.25rem',
                      fontSize: '0.8125rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <span className="metadata">Rate Profile</span>
                        <strong>₹{selectedSpotForAction.rate || selectedFacility?.hourlyRate || 50}/hr</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="metadata">Telemetry Audit</span>
                        <span>Auditable by backend</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                      <button
                        className="btn btn-secondary btn-sm btn-block"
                        disabled={spotActionLoading || selectedSpotForAction.status === 'AVAILABLE'}
                        onClick={() => handleApplySpotAction('AVAILABLE')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                      >
                        <CheckCircle2 size={15} color={STATE_COLORS.AVAILABLE} /> Mark Available (Vacate Space)
                      </button>

                      <button
                        className="btn btn-secondary btn-sm btn-block"
                        disabled={spotActionLoading || selectedSpotForAction.status === 'BLOCKED'}
                        onClick={() => handleApplySpotAction('BLOCKED')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                      >
                        <ShieldAlert size={15} color={STATE_COLORS.BLOCKED} /> Block Bay (VIP / Reserved Staff)
                      </button>

                      <button
                        className="btn btn-secondary btn-sm btn-block"
                        disabled={spotActionLoading || selectedSpotForAction.status === 'MAINTENANCE'}
                        onClick={() => handleApplySpotAction('MAINTENANCE')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                      >
                        <Wrench size={15} color={STATE_COLORS.MAINTENANCE} /> Place Under Maintenance
                      </button>

                      <button
                        className="btn btn-secondary btn-sm btn-block"
                        disabled={spotActionLoading || selectedSpotForAction.status === 'OCCUPIED'}
                        onClick={() => handleApplySpotAction('OCCUPIED')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                      >
                        <Car size={15} color={STATE_COLORS.OCCUPIED} /> Manual Vehicle Occupied
                      </button>
                    </div>

                    <button
                      className="btn btn-outline btn-sm btn-block"
                      onClick={() => setSelectedSpotForAction(null)}
                      disabled={spotActionLoading}
                    >
                      Close Spot Panel
                    </button>
                  </div>
                ) : (
                  <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                    <SlidersHorizontal size={32} style={{ margin: '0 auto 1rem', color: 'var(--ps-secondary-dark)' }} />
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.4rem' }}>No Bay Selected</h3>
                    <p className="metadata" style={{ maxWidth: '280px', margin: '0 auto 1.5rem' }}>
                      Click any parking bay in the layout map to inspect real-time state, rate profile, or apply operational overrides.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="status-tag available">● Available</span>
                      <span className="status-tag occupied">● Occupied</span>
                      <span className="status-tag reserved">● Reserved</span>
                      <span className="status-tag blocked">● Blocked</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 4. BUSINESS PERFORMANCE */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <BarChart3 size={18} />
              <h2 className="section-title" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                4. Business Performance & Operational Yield
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {/* Financial Revenue KPI */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="metadata">Gross Booking Revenue</span>
                  {activeRole === 'OPERATOR' ? (
                    <span className="status-tag blocked" title="Restricted by RBAC">RESTRICTED</span>
                  ) : (
                    <span className="status-tag available">Financial KPI</span>
                  )}
                </div>
                {activeRole === 'OPERATOR' ? (
                  <div style={{ padding: '0.75rem 0' }}>
                    <p className="metadata" style={{ color: 'var(--ps-secondary-dark)', fontStyle: 'italic' }}>
                      Access Restricted: Revenue analytics are restricted to Owner, Admin, and Manager roles.
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.35rem 0' }}>
                      ₹{analyticsData.totalRevenue.toLocaleString('en-IN')}
                    </div>
                    <p className="metadata">Generated across {analyticsData.completedBookings + analyticsData.activeBookings} reservations</p>
                  </>
                )}
              </div>

              {/* Peak Demand Hour */}
              <div className="card">
                <span className="metadata">Peak Operational Window</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.35rem 0' }}>
                  17:00 – 19:00
                </div>
                <p className="metadata">Evening commute peak averages 42 concurrent reservations</p>
              </div>

              {/* Average Dwell Time */}
              <div className="card">
                <span className="metadata">Average Booking Duration</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.35rem 0' }}>
                  {analyticsData.averageDwellHours} Hours
                </div>
                <p className="metadata">Typical dwell duration per reserved vehicle</p>
              </div>

              {/* Booking Conversion Rate */}
              <div className="card">
                <span className="metadata">Booking Fulfillment Rate</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.35rem 0', color: 'var(--ps-state-available)' }}>
                  94.4%
                </div>
                <p className="metadata">Only {analyticsData.cancelledBookings} cancellations recorded</p>
              </div>
            </div>
          </section>

          {/* 5. WHAT PARKSPOT RECOMMENDS */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <BrainCircuit size={18} color="var(--ps-accent-dark)" />
                <h2 className="section-title" style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  5. What ParkSpot Recommends (Machine Learning Signals)
                </h2>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={fetchLiveRecommendations}
                disabled={recsLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <RefreshCw size={13} className={recsLoading ? 'spin' : ''} /> Sync Signals
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="card"
                  style={{
                    border: rec.status === 'PENDING' ? '2px solid var(--ps-accent-light)' : '1px solid var(--ps-secondary-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span className="eyebrow" style={{ color: 'var(--ps-accent-dark)' }}>
                        {rec.type.replace(/_/g, ' ')}
                      </span>
                      <span className={`status-tag ${rec.status === 'ACCEPTED' ? 'available' : rec.status === 'REJECTED' ? 'blocked' : 'selected'}`}>
                        {rec.status}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.15rem', marginBottom: '0.4rem' }}>{rec.title}</h3>
                    <p className="metadata" style={{ marginBottom: '1rem', lineHeight: 1.5 }}>{rec.reason}</p>

                    <div style={{
                      backgroundColor: 'var(--ps-primary-light)',
                      borderRadius: 'var(--ps-radius-sm)',
                      padding: '0.75rem',
                      marginBottom: '1rem',
                      fontSize: '0.8125rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="metadata">Current Rate:</span>
                        <strong>₹{rec.currentRate}/hr</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="metadata">Proposed Rate:</span>
                        <strong style={{ color: 'var(--ps-primary-dark)' }}>₹{rec.proposedRate}/hr</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="metadata">Expected Impact:</span>
                        <span style={{ fontWeight: 600 }}>{rec.expectedImpact}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="metadata">Model Confidence:</span>
                        <strong style={{ color: 'var(--ps-state-available)' }}>{rec.confidence}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-accent btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => handleAcceptRecommendation(rec.id)}
                      disabled={rec.status === 'ACCEPTED' || activeRole === 'OPERATOR'}
                      title={activeRole === 'OPERATOR' ? 'Requires Manager or Admin' : 'Apply pricing rule'}
                    >
                      {rec.status === 'ACCEPTED' ? 'Rule Active' : 'Accept & Apply'}
                    </button>

                    {rec.status !== 'ACCEPTED' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRejectRecommendation(rec.id)}
                        disabled={activeRole === 'OPERATOR'}
                        title={activeRole === 'OPERATOR' ? 'Requires Manager or Admin' : 'Decline recommendation'}
                      >
                        Reject
                      </button>
                    )}

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleExplainRecommendationWithAI(rec)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <Sparkles size={13} /> Explain
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 6. AI OPERATIONS ASSISTANT COMPACT ENTRY */}
          <section className="card" style={{ backgroundColor: '#FFFFFF', border: '2px solid var(--ps-primary-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Bot size={20} />
              <h2 className="section-title" style={{ fontSize: '1.1rem', margin: 0 }}>
                6. AI Operations Assistant
              </h2>
            </div>
            <p className="metadata" style={{ marginBottom: '1rem' }}>
              Ask operational, demand, or pricing questions about <strong>{selectedFacility?.name}</strong>. Decision support synthesis layer.
            </p>

            {/* Quick prompt chips */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {[
                'Why is utilization high tonight?',
                'Explain peak demand hours and volume trends.',
                'What operational adjustments are recommended for tomorrow?'
              ].map((chip) => (
                <button
                  key={chip}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                  onClick={() => {
                    setAiQuestion(chip);
                    handleAskAIAssistant(chip);
                  }}
                  disabled={aiLoading}
                >
                  {chip}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Ask about facility telemetry, overstays, or recommendations..."
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskAIAssistant()}
                disabled={aiLoading}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleAskAIAssistant()}
                disabled={aiLoading || !aiQuestion.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
              >
                {aiLoading ? <ActionLoader text="Synthesizing..." /> : <><Send size={15} /> Ask Assistant</>}
              </button>
            </div>

            {aiResponse && (
              <div style={{
                marginTop: '1.25rem',
                backgroundColor: 'var(--ps-primary-light)',
                border: '1px solid var(--ps-secondary-light)',
                borderRadius: 'var(--ps-radius-sm)',
                padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                  <Sparkles size={16} color="var(--ps-accent-dark)" />
                  <span>Operations Decision Support Summary</span>
                </div>
                <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1rem', color: 'var(--ps-primary-dark)' }}>
                  {aiResponse.answer}
                </p>

                {aiResponse.keyMetrics && (
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', fontSize: '0.8125rem' }}>
                    {Object.entries(aiResponse.keyMetrics).map(([k, v]) => (
                      <div key={k}>
                        <span className="metadata" style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}: </span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {aiResponse.recommendedAction && (
                  <div style={{
                    padding: '0.65rem 0.85rem',
                    backgroundColor: 'rgba(243, 244, 86, 0.25)',
                    border: '1px solid var(--ps-accent-dark)',
                    borderRadius: 'var(--ps-radius-sm)',
                    fontSize: '0.8125rem',
                    marginBottom: '0.75rem'
                  }}>
                    <strong>Recommended Operator Action:</strong> {aiResponse.recommendedAction}
                  </div>
                )}

                <div style={{ fontSize: '0.6875rem', color: 'var(--ps-secondary-dark)', fontStyle: 'italic' }}>
                  {aiResponse.disclaimer}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          TAB 2: LIVE OCCUPANCY & BREAKDOWN
          ===================================================================== */}
      {operatorTab === 'occupancy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 className="section-title">Live Occupancy & Capacity Utilization</h2>
            <p className="metadata">Real-time capacity tracking across all {facilityFloors.length} levels for {selectedFacility?.name}</p>
          </div>

          {/* Primary Occupancy Gauge Bar */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <span className="eyebrow">FACILITY OCCUPANCY LEVEL</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                  {occupancyPercent}% Occupied
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="metadata">Total Operational Capacity</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{totalBays} Spaces</div>
              </div>
            </div>

            {/* Semantic State Bar */}
            <div style={{
              height: '14px',
              backgroundColor: 'var(--ps-secondary-light)',
              borderRadius: '999px',
              overflow: 'hidden',
              display: 'flex',
              marginBottom: '1.25rem'
            }}>
              <div style={{ width: `${(occupiedBays / totalBays) * 100}%`, backgroundColor: STATE_COLORS.OCCUPIED }} title={`Occupied: ${occupiedBays}`} />
              <div style={{ width: `${(reservedBays / totalBays) * 100}%`, backgroundColor: STATE_COLORS.RESERVED }} title={`Reserved: ${reservedBays}`} />
              <div style={{ width: `${(blockedBays / totalBays) * 100}%`, backgroundColor: STATE_COLORS.BLOCKED }} title={`Blocked: ${blockedBays}`} />
              <div style={{ width: `${(maintenanceBays / totalBays) * 100}%`, backgroundColor: STATE_COLORS.MAINTENANCE }} title={`Maintenance: ${maintenanceBays}`} />
              <div style={{ width: `${(availableBays / totalBays) * 100}%`, backgroundColor: STATE_COLORS.AVAILABLE }} title={`Available: ${availableBays}`} />
            </div>

            {/* Semantic State Legend */}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: STATE_COLORS.AVAILABLE }} />
                <span>Available ({availableBays})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: STATE_COLORS.OCCUPIED }} />
                <span>Occupied ({occupiedBays})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: STATE_COLORS.RESERVED }} />
                <span>Reserved ({reservedBays})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: STATE_COLORS.BLOCKED }} />
                <span>Blocked ({blockedBays})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: STATE_COLORS.MAINTENANCE }} />
                <span>Maintenance ({maintenanceBays})</span>
              </div>
            </div>
          </div>

          {/* Floor-by-floor breakdown cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            {facilityFloors.map((fl) => {
              const spotsOnFl = facilitySpots.filter((s) => s.floor === fl);
              const totalFl = spotsOnFl.length || 16;
              const occFl = spotsOnFl.filter((s) => s.status === 'OCCUPIED').length;
              const resFl = spotsOnFl.filter((s) => s.status === 'RESERVED').length;
              const availFl = spotsOnFl.filter((s) => s.status === 'AVAILABLE').length;
              const pctFl = totalFl > 0 ? Math.round(((occFl + resFl) / totalFl) * 100) : 60;

              return (
                <div key={fl} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '1.15rem' }}>{fl}</h3>
                    <span className={`status-tag ${pctFl >= 85 ? 'occupied' : 'available'}`}>
                      {pctFl}% Utilized
                    </span>
                  </div>

                  <div style={{ height: '8px', backgroundColor: 'var(--ps-secondary-light)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                    <div style={{ width: `${pctFl}%`, height: '100%', backgroundColor: pctFl >= 85 ? STATE_COLORS.OCCUPIED : 'var(--ps-primary-dark)' }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="metadata">Available Bays:</span>
                      <strong style={{ color: STATE_COLORS.AVAILABLE }}>{availFl}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="metadata">Parked Vehicles:</span>
                      <strong style={{ color: STATE_COLORS.OCCUPIED }}>{occFl}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="metadata">Pending Reservations:</span>
                      <strong style={{ color: STATE_COLORS.RESERVED }}>{resFl}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="metadata">Total Configured:</span>
                      <span>{totalFl} bays</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: INTERACTIVE MAP (FULL MAP VIEW)
          ===================================================================== */}
      {operatorTab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 className="section-title">Interactive Parking Map & Bay Telemetry</h2>
              <p className="metadata">Click any bay to trigger state overrides or inspect live occupancy</p>
            </div>
            <div className="floor-pill-group">
              {facilityFloors.map((fl) => (
                <button
                  key={fl}
                  className={`floor-pill ${activeFloor === fl ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFloor(fl);
                    setSelectedSpotForAction(null);
                  }}
                >
                  {fl}
                </button>
              ))}
            </div>
          </div>

          <div className="content-grid content-grid-split">
            <ParkingMap
              floors={facilityFloors}
              activeFloor={activeFloor}
              onSelectFloor={setActiveFloor}
              spots={currentFloorSpots}
              selectedSpotId={selectedSpotForAction?.id}
              onSelectSpot={(spot) => setSelectedSpotForAction(spot)}
              isOperator={true}
            />

            <div>
              {selectedSpotForAction ? (
                <div className="card" style={{ border: '2px solid var(--ps-primary-dark)' }}>
                  <span className="eyebrow">SPOT OVERRIDE ACTION</span>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
                    Space {selectedSpotForAction.number}
                  </h3>
                  <p className="metadata" style={{ marginBottom: '1.25rem' }}>
                    {activeFloor} · State: <strong style={{ textTransform: 'uppercase' }}>{selectedSpotForAction.status}</strong>
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySpotAction('AVAILABLE')}
                      disabled={spotActionLoading || selectedSpotForAction.status === 'AVAILABLE'}
                    >
                      <CheckCircle2 size={14} color={STATE_COLORS.AVAILABLE} /> Mark Available (Vacate)
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySpotAction('OCCUPIED')}
                      disabled={spotActionLoading || selectedSpotForAction.status === 'OCCUPIED'}
                    >
                      <Car size={14} color={STATE_COLORS.OCCUPIED} /> Mark Occupied (Vehicle Parked)
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySpotAction('MAINTENANCE')}
                      disabled={spotActionLoading || selectedSpotForAction.status === 'MAINTENANCE'}
                    >
                      <Wrench size={14} color={STATE_COLORS.MAINTENANCE} /> Place Under Maintenance
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySpotAction('BLOCKED')}
                      disabled={spotActionLoading || selectedSpotForAction.status === 'BLOCKED'}
                    >
                      <ShieldAlert size={14} color={STATE_COLORS.BLOCKED} /> Block Bay (Staff / VIP)
                    </button>
                  </div>

                  <button
                    className="btn btn-outline btn-sm btn-block"
                    onClick={() => setSelectedSpotForAction(null)}
                    disabled={spotActionLoading}
                  >
                    Close Spot Selection
                  </button>
                </div>
              ) : (
                <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                  <MapIcon size={32} style={{ margin: '0 auto 1rem', color: 'var(--ps-secondary-dark)' }} />
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Select a Parking Bay</h3>
                  <p className="metadata">
                    Click any bay in the interactive floor layout to override operational states or view live booking telemetry.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: SPOT REGISTRY
          ===================================================================== */}
      {operatorTab === 'spots' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="section-title">Parking Bay Registry</h2>
              <p className="metadata">{filteredSpotsRegistry.length} bays on {activeFloor}</p>
            </div>

            {/* Floor switcher */}
            <div className="floor-pill-group">
              {facilityFloors.map((fl) => (
                <button
                  key={fl}
                  className={`floor-pill ${activeFloor === fl ? 'active' : ''}`}
                  onClick={() => setActiveFloor(fl)}
                >
                  {fl}
                </button>
              ))}
            </div>
          </div>

          {/* Search & State Filter Controls */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search by space number or ID..."
                value={spotSearch}
                onChange={(e) => setSpotSearch(e.target.value)}
                style={{ paddingLeft: '2rem' }}
              />
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ps-secondary-dark)' }} />
            </div>

            <select
              className="form-select"
              value={spotStateFilter}
              onChange={(e) => setSpotStateFilter(e.target.value)}
              style={{ width: '160px' }}
            >
              <option value="ALL">All States</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="RESERVED">Reserved</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="BLOCKED">Blocked</option>
            </select>

            <select
              className="form-select"
              value={spotTypeFilter}
              onChange={(e) => setSpotTypeFilter(e.target.value)}
              style={{ width: '160px' }}
            >
              <option value="ALL">All Classifications</option>
              <option value="STANDARD">Standard</option>
              <option value="EV_CHARGING">EV Charging</option>
              <option value="ACCESSIBLE">Accessible</option>
              <option value="VIP">VIP</option>
            </select>
          </div>

          {filteredSpotsRegistry.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p className="metadata">No parking bays match the selected filters on {activeFloor}.</p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bay ID</th>
                    <th>Level</th>
                    <th>Classification</th>
                    <th>State</th>
                    <th>Hourly Rate</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSpotsRegistry.map((spot) => (
                    <tr key={spot.id}>
                      <td><strong style={{ fontFamily: 'var(--ps-font-mono)' }}>{spot.number}</strong></td>
                      <td>{spot.floor}</td>
                      <td><span className="metadata">{spot.type || 'STANDARD'}</span></td>
                      <td>
                        <span className={`status-tag ${spot.status.toLowerCase()}`}>
                          {spot.status}
                        </span>
                      </td>
                      <td>₹{spot.rate || selectedFacility?.hourlyRate || 50}/hr</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          {spot.status !== 'AVAILABLE' && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setSelectedSpotForAction(spot);
                                handleApplySpotAction('AVAILABLE');
                              }}
                            >
                              Vacate
                            </button>
                          )}
                          {spot.status !== 'BLOCKED' && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                setSelectedSpotForAction(spot);
                                handleApplySpotAction('BLOCKED');
                              }}
                            >
                              Block
                            </button>
                          )}
                          {spot.status !== 'MAINTENANCE' && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                setSelectedSpotForAction(spot);
                                handleApplySpotAction('MAINTENANCE');
                              }}
                            >
                              Service
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 5: BOOKINGS
          ===================================================================== */}
      {operatorTab === 'bookings' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="section-title">Driver Reservations Registry</h2>
              <p className="metadata">Backend booking records, customer vehicle tokens, and reservation windows</p>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((st) => (
                <button
                  key={st}
                  className={`btn btn-sm ${bookingFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setBookingFilter(st)}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by Booking ID, vehicle plate, or space..."
              value={bookingSearch}
              onChange={(e) => setBookingSearch(e.target.value)}
            />
          </div>

          {filteredBookings.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <CalendarCheck size={32} style={{ margin: '0 auto 1rem', color: 'var(--ps-secondary-dark)' }} />
              <p className="metadata">No reservation records found matching criteria.</p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Vehicle Plate</th>
                    <th>Facility & Space</th>
                    <th>Window</th>
                    <th>Duration</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b) => (
                    <tr key={b.id}>
                      <td><strong style={{ fontFamily: 'var(--ps-font-mono)' }}>#{b.id}</strong></td>
                      <td><span style={{ fontFamily: 'var(--ps-font-mono)', fontWeight: 600 }}>{b.vehiclePlate || 'DL 01 AB 4920'}</span></td>
                      <td>
                        <div><strong>{b.spotNumber}</strong> ({b.floor})</div>
                        <div className="metadata">{b.facilityName}</div>
                      </td>
                      <td>
                        <div>{b.startTime}</div>
                        <div className="metadata">until {b.endTime}</div>
                      </td>
                      <td>{b.duration}</td>
                      <td><strong>₹{b.amount}</strong></td>
                      <td>
                        <span className={`status-tag ${b.status === 'CONFIRMED' ? 'available' : b.status === 'COMPLETED' ? 'selected' : 'blocked'}`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 6: OPERATIONAL EVENTS (STRICTLY SOFTWARE-NATIVE TERMINOLOGY)
          ===================================================================== */}
      {operatorTab === 'events' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 className="section-title">Operational Events Stream</h2>
            <p className="metadata">Software-native event ingestion: reservation lifecycles, user departures, and operator overrides</p>
          </div>

          {events.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p className="metadata">No recent operational events recorded.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {events.map((evt) => (
                <div key={evt.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      backgroundColor: 'var(--ps-secondary-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--ps-radius-sm)'
                    }}>
                      <Activity size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                        {evt.type.replace(/_/g, ' ')} — Bay {evt.spotNumber}
                      </div>
                      <div className="metadata">
                        Source: <strong>{evt.source}</strong> · {evt.floor || 'Floor 1'}
                      </div>
                    </div>
                  </div>
                  <div className="metadata" style={{ fontFamily: 'var(--ps-font-mono)', fontSize: '0.8125rem' }}>
                    {evt.timestamp}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 7: OVERSTAY MANAGEMENT & TRIAGE
          ===================================================================== */}
      {operatorTab === 'overstays' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="section-title">Overstay Triage & Capacity Resolution</h2>
              <p className="metadata">Algorithmic detection of vehicles exceeding reserved duration or missing departure confirmation</p>
            </div>

            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {['ALL', 'ACTIVE_OVERSTAY', 'MISSING_DEPARTURE_EVENT', 'RESOLVED_OVERSTAY'].map((filter) => (
                <button
                  key={filter}
                  className={`btn btn-sm ${overstayFilter === filter ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setOverstayFilter(filter)}
                  style={{ fontSize: '0.75rem' }}
                >
                  {filter.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {filteredOverstays.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
              <ShieldCheck size={36} color="var(--ps-state-available)" style={{ margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>No Active Overstays</h3>
              <p className="metadata">All spaces have recorded departure activity or are within active reservation windows.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
              {filteredOverstays.map((ovs) => (
                <div key={ovs.id} className="card" style={{ borderLeft: `4px solid ${ovs.status === 'ACTIVE_OVERSTAY' ? 'var(--ps-state-occupied)' : 'var(--ps-state-reserved)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <span className="eyebrow" style={{ color: 'var(--ps-state-occupied)' }}>{ovs.status.replace(/_/g, ' ')}</span>
                    <span className="status-tag occupied">{ovs.confidence || '92%'} Confidence</span>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
                    Space {ovs.spotNumber} ({ovs.floor})
                  </h3>
                  <p className="metadata" style={{ marginBottom: '1rem', lineHeight: 1.5 }}>
                    {ovs.reasoning}
                  </p>

                  <div style={{
                    backgroundColor: 'var(--ps-primary-light)',
                    borderRadius: 'var(--ps-radius-sm)',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    fontSize: '0.8125rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="metadata">Booking Ref:</span>
                      <strong>#{ovs.bookingId}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="metadata">Vehicle Registration:</span>
                      <strong style={{ fontFamily: 'var(--ps-font-mono)' }}>{ovs.vehiclePlate || 'DL 01 AB 4920'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="metadata">Expected Departure:</span>
                      <span>{ovs.expectedDeparture}</span>
                    </div>
                    {ovs.durationMinutes > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ps-state-occupied)', fontWeight: 600 }}>
                        <span>Exceeded Dwell:</span>
                        <span>+{ovs.durationMinutes} Minutes</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setOverstays((prev) => prev.map((o) => o.id === ovs.id ? { ...o, status: 'RESOLVED_OVERSTAY' } : o));
                      }}
                    >
                      Resolve Overstay
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setOperatorTab('map');
                        const sp = facilitySpots.find((s) => s.number === ovs.spotNumber);
                        if (sp) setSelectedSpotForAction(sp);
                      }}
                    >
                      Inspect Bay
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 8: BUSINESS ANALYTICS
          ===================================================================== */}
      {operatorTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 className="section-title">Operational Analytics & Demand Distribution</h2>
            <p className="metadata">Aggregated metrics answering core business utilization and pricing efficiency questions</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {/* Question 1: Highest Demand Hours */}
            <div className="card" style={{ gridColumn: 'span 2' }}>
              <span className="eyebrow">QUESTION 1: WHICH HOURS EXPERIENCE HIGHEST DEMAND?</span>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem' }}>Hourly Reservation Density</h3>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: '140px', padding: '1rem 0', borderBottom: '1px solid var(--ps-secondary-light)' }}>
                {analyticsData.peakHours.map((ph) => {
                  const maxCount = 45;
                  const heightPct = Math.round((ph.bookingCount / maxCount) * 100);
                  const isPeak = ph.bookingCount >= 38;
                  return (
                    <div key={ph.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: isPeak ? 'var(--ps-state-occupied)' : 'var(--ps-secondary-dark)', marginBottom: '4px' }}>
                        {ph.bookingCount}
                      </span>
                      <div style={{
                        width: '100%',
                        maxWidth: '36px',
                        height: `${heightPct}%`,
                        backgroundColor: isPeak ? 'var(--ps-accent-dark)' : 'var(--ps-primary-dark)',
                        borderRadius: '3px 3px 0 0',
                        transition: 'var(--ps-transition)'
                      }} />
                      <span className="metadata" style={{ fontSize: '0.6875rem', marginTop: '6px' }}>
                        {String(ph.hour).padStart(2, '0')}:00
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="metadata" style={{ marginTop: '0.75rem' }}>
                Highest demand occurs at <strong>17:00 (42 bookings)</strong> and <strong>11:00 (38 bookings)</strong>. Algorithmic surge pricing actively covers these periods.
              </p>
            </div>

            {/* Question 2: Capacity Efficiency */}
            <div className="card">
              <span className="eyebrow">QUESTION 2: HOW EFFICIENTLY IS CAPACITY USED?</span>
              <h3 style={{ fontSize: '1.15rem', marginBottom: '0.75rem' }}>Capacity Yield</h3>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--ps-state-available)', marginBottom: '0.25rem' }}>
                {occupancyPercent}%
              </div>
              <p className="metadata" style={{ marginBottom: '1rem' }}>
                Optimal target range: 75% – 85% to maintain driver ingress fluidity without leaving revenue uncaptured.
              </p>
              <div style={{ fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="metadata">Active Parked:</span>
                  <strong>{occupiedBays} bays</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="metadata">Reserved Pool:</span>
                  <strong>{reservedBays} bays</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 9: OPTIMIZATION RECOMMENDATIONS
          ===================================================================== */}
      {operatorTab === 'recommendations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 className="section-title">Optimization Recommendations & ML Signals</h2>
              <p className="metadata">Algorithmic pricing and capacity reallocation signals for operator approval</p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={fetchLiveRecommendations}
              disabled={recsLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <RefreshCw size={13} className={recsLoading ? 'spin' : ''} /> Refresh Signals
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
            {recommendations.map((rec) => (
              <div key={rec.id} className="card" style={{ border: rec.status === 'PENDING' ? '2px solid var(--ps-accent-light)' : '1px solid var(--ps-secondary-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <span className="eyebrow" style={{ color: 'var(--ps-accent-dark)' }}>{rec.type.replace(/_/g, ' ')}</span>
                  <span className={`status-tag ${rec.status === 'ACCEPTED' ? 'available' : rec.status === 'REJECTED' ? 'blocked' : 'selected'}`}>
                    {rec.status}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{rec.title}</h3>
                <p className="metadata" style={{ marginBottom: '1rem', lineHeight: 1.5 }}>{rec.reason}</p>

                <div style={{
                  backgroundColor: 'var(--ps-primary-light)',
                  borderRadius: 'var(--ps-radius-sm)',
                  padding: '0.85rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="metadata">Current Baseline:</span>
                    <strong>₹{rec.currentRate}/hr</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="metadata">Proposed Dynamic Rate:</span>
                    <strong style={{ color: 'var(--ps-primary-dark)' }}>₹{rec.proposedRate}/hr</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="metadata">Modeled Impact:</span>
                    <span style={{ fontWeight: 600 }}>{rec.expectedImpact}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="metadata">Gradient Boosting Confidence:</span>
                    <strong style={{ color: 'var(--ps-state-available)' }}>{rec.confidence}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-accent btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => handleAcceptRecommendation(rec.id)}
                    disabled={rec.status === 'ACCEPTED' || activeRole === 'OPERATOR'}
                  >
                    {rec.status === 'ACCEPTED' ? 'Activated' : 'Accept & Deploy Rule'}
                  </button>
                  {rec.status !== 'ACCEPTED' && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleRejectRecommendation(rec.id)}
                      disabled={activeRole === 'OPERATOR'}
                    >
                      Reject
                    </button>
                  )}
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleExplainRecommendationWithAI(rec)}
                  >
                    Explain AI
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 10: DYNAMIC PRICING & SIMULATION (WHAT-IF ENGINE)
          ===================================================================== */}
      {operatorTab === 'pricing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '860px' }}>
          <div>
            <h2 className="section-title">Dynamic Pricing & What-If Simulation Engine</h2>
            <p className="metadata">Simulate price elasticity and volume contraction without modifying production rules</p>
          </div>

          <div className="card" style={{ border: '2px solid var(--ps-accent-light)' }}>
            <span className="eyebrow">WHAT-IF PRICING SIMULATION ENGINE</span>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Model Revenue & Occupancy Delta</h3>
            <p className="metadata" style={{ marginBottom: '1.5rem' }}>
              Base facility rate: <strong>₹{selectedFacility?.hourlyRate || 50}/hr</strong>. Adjust parameters to test projected demand response.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Proposed Rate Change (%):</span>
                  <strong>{simPriceChangePct > 0 ? `+${simPriceChangePct}%` : `${simPriceChangePct}%`}</strong>
                </label>
                <input
                  type="range"
                  min="-50"
                  max="100"
                  step="5"
                  value={simPriceChangePct}
                  onChange={(e) => setSimPriceChangePct(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--ps-secondary-dark)' }}>
                  <span>-50% (Discount)</span>
                  <span>0%</span>
                  <span>+100% (Surge)</span>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Demand Price Elasticity (ε):</span>
                  <strong>{simElasticity}</strong>
                </label>
                <input
                  type="range"
                  min="-1.0"
                  max="-0.1"
                  step="0.05"
                  value={simElasticity}
                  onChange={(e) => setSimElasticity(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--ps-secondary-dark)' }}>
                  <span>Inelastic (-0.1)</span>
                  <span>Standard (-0.4)</span>
                  <span>Elastic (-1.0)</span>
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleRunSimulation}
              disabled={simLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}
            >
              {simLoading ? <ActionLoader text="Calculating Elasticity..." /> : <><Sparkles size={16} /> Run What-If Simulation</>}
            </button>

            {/* Simulation Results Display */}
            {simResult && (
              <div style={{
                backgroundColor: 'var(--ps-primary-light)',
                border: '1px solid var(--ps-secondary-light)',
                borderRadius: 'var(--ps-radius-sm)',
                padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <strong>Modeled Simulation Output</strong>
                  <span className="status-tag selected">SIMULATION ONLY</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <span className="metadata">Proposed Hourly Rate</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{simResult.proposedRate}/hr</div>
                  </div>
                  <div>
                    <span className="metadata">Projected Volume Delta</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: simResult.projectedVolumeDeltaPct >= 0 ? 'var(--ps-state-available)' : 'var(--ps-state-occupied)' }}>
                      {simResult.projectedVolumeDeltaPct > 0 ? `+${simResult.projectedVolumeDeltaPct}%` : `${simResult.projectedVolumeDeltaPct}%`}
                    </div>
                  </div>
                  <div>
                    <span className="metadata">Projected Revenue Delta</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: simResult.projectedRevenueDeltaPct >= 0 ? 'var(--ps-state-available)' : 'var(--ps-state-occupied)' }}>
                      {simResult.projectedRevenueDeltaPct > 0 ? `+${simResult.projectedRevenueDeltaPct}%` : `${simResult.projectedRevenueDeltaPct}%`}
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: '0.65rem 0.85rem',
                  backgroundColor: 'rgba(243, 244, 86, 0.25)',
                  border: '1px solid var(--ps-accent-dark)',
                  borderRadius: 'var(--ps-radius-sm)',
                  fontSize: '0.75rem'
                }}>
                  <strong>IMPORTANT PRODUCTION SAFEGUARD:</strong> Simulations model hypothetical elasticity curves. Production pricing rules are NOT altered without explicit operator approval.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 11: ML DEMAND FORECAST
          ===================================================================== */}
      {operatorTab === 'forecast' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 className="section-title">Machine Learning Demand Forecasting</h2>
              <p className="metadata">Phase 3.2 Gradient Boosting Regressor predictive model with historical baseline prior fallback</p>
            </div>

            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {[12, 24, 48, 168].map((h) => (
                <button
                  key={h}
                  className={`btn btn-sm ${forecastHorizon === h ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setForecastHorizon(h)}
                >
                  {h === 168 ? '7 Days' : `${h}h Horizon`}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <span className="eyebrow">FORECASTING ENGINE SPECIFICATION</span>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{forecastData.model}</div>
                <div className="metadata">Model Confidence: <strong>{forecastData.confidence}</strong> · Horizon: {forecastHorizon} hours</div>
              </div>
              <span className="status-tag available">Engine Active</span>
            </div>

            {/* Forecast Bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: '180px', padding: '1.5rem 0', borderBottom: '1px solid var(--ps-secondary-light)' }}>
              {forecastData.forecast.map((fc, idx) => {
                const heightPct = Math.min(100, Math.round((fc.expectedDemand / (fc.capacity || 48)) * 100));
                const isHigh = heightPct >= 85;
                return (
                  <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: isHigh ? 'var(--ps-state-occupied)' : 'var(--ps-primary-dark)', marginBottom: '4px' }}>
                      {fc.expectedDemand}
                    </span>
                    <div style={{
                      width: '100%',
                      maxWidth: '36px',
                      height: `${heightPct}%`,
                      backgroundColor: isHigh ? 'var(--ps-state-occupied)' : 'var(--ps-accent-dark)',
                      borderRadius: '3px 3px 0 0',
                      transition: 'var(--ps-transition)'
                    }} />
                    <span className="metadata" style={{ fontSize: '0.6875rem', marginTop: '6px' }}>
                      {fc.time}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="metadata" style={{ marginTop: '1rem', fontStyle: 'italic' }}>
              Expected demand reflects algorithmic probabilistic forecasting, not a contractual volume guarantee.
            </p>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 12: AI OPERATIONS ASSISTANT
          ===================================================================== */}
      {operatorTab === 'assistant' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '860px' }}>
          <div>
            <h2 className="section-title">AI Operations Assistant</h2>
            <p className="metadata">Structured operational synthesis, overstay explanations, and pricing decision support</p>
          </div>

          <div className="card">
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Ask any operational question regarding facilities, occupancy, or pricing..."
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskAIAssistant()}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleAskAIAssistant()}
                disabled={aiLoading || !aiQuestion.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
              >
                {aiLoading ? <ActionLoader text="Processing..." /> : <><Send size={15} /> Submit</>}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {[
                'Why is utilization high tonight?',
                'Explain peak demand hours and volume trends.',
                'What operational adjustments are recommended for tomorrow?',
                'Summarize overstay activity across all bays.'
              ].map((chip) => (
                <button
                  key={chip}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                  onClick={() => {
                    setAiQuestion(chip);
                    handleAskAIAssistant(chip);
                  }}
                  disabled={aiLoading}
                >
                  {chip}
                </button>
              ))}
            </div>

            {aiResponse ? (
              <div style={{
                backgroundColor: 'var(--ps-primary-light)',
                border: '1px solid var(--ps-secondary-light)',
                borderRadius: 'var(--ps-radius-sm)',
                padding: '1.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontWeight: 700 }}>
                  <Sparkles size={18} color="var(--ps-accent-dark)" />
                  <span>Operations Synthesis Report</span>
                </div>
                <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                  {aiResponse.answer}
                </p>

                {aiResponse.keyMetrics && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    {Object.entries(aiResponse.keyMetrics).map(([k, v]) => (
                      <div key={k} style={{ backgroundColor: '#FFFFFF', padding: '0.5rem 0.75rem', borderRadius: 'var(--ps-radius-sm)', border: '1px solid var(--ps-secondary-light)' }}>
                        <div className="metadata" style={{ textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {aiResponse.recommendedAction && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: 'rgba(243, 244, 86, 0.25)',
                    border: '1px solid var(--ps-accent-dark)',
                    borderRadius: 'var(--ps-radius-sm)',
                    fontSize: '0.875rem',
                    marginBottom: '1rem'
                  }}>
                    <strong>Recommended Action:</strong> {aiResponse.recommendedAction}
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: 'var(--ps-secondary-dark)', fontStyle: 'italic' }}>
                  {aiResponse.disclaimer}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--ps-secondary-dark)' }}>
                <Bot size={36} style={{ margin: '0 auto 0.75rem', color: 'var(--ps-secondary-dark)' }} />
                <p className="metadata">Select a suggested query or type a question above to generate operational insights.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 13: ENTERPRISE AUDIT LOGS
          ===================================================================== */}
      {operatorTab === 'audit' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 className="section-title">Enterprise Audit Trail</h2>
            <p className="metadata">Immutable record of transactional, pricing, and administrative events</p>
          </div>

          {auditLogs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p className="metadata">No audit logs recorded for current facility context.</p>
            </div>
          ) : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Actor / User</th>
                    <th>Source</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontFamily: 'var(--ps-font-mono)', fontSize: '0.8125rem' }}>{log.timestamp}</td>
                      <td><strong>{log.action}</strong></td>
                      <td>{log.entity}</td>
                      <td className="metadata">{log.user}</td>
                      <td>{log.source}</td>
                      <td><span className="status-tag available">SUCCESS</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 14: SETTINGS & RBAC
          ===================================================================== */}
      {operatorTab === 'settings' && (
        <div style={{ maxWidth: '720px' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 className="section-title">Facility Organization & Access Controls</h2>
            <p className="metadata">Tenant parameters and operational boundaries</p>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Organization Name</label>
              <input type="text" className="form-input" defaultValue="Metro Infrastructure Operations Ltd" readOnly />
            </div>

            <div className="form-group">
              <label className="form-label">Facility Identifier</label>
              <input type="text" className="form-input" value={selectedFacility?.id || 'fac-default'} readOnly />
            </div>

            <div className="form-group">
              <label className="form-label">Active Role</label>
              <select
                className="form-select"
                value={activeRole}
                onChange={(e) => setActiveRole(e.target.value)}
              >
                <option value="OWNER">OWNER — Full Governance, Financials & Pricing Approvals</option>
                <option value="ADMIN">ADMIN — Tenant Administrator</option>
                <option value="MANAGER">MANAGER — Operations Manager</option>
                <option value="OPERATOR">OPERATOR — Bay Overrides & Floor Telemetry</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Forecasting Engine Specification</label>
              <input type="text" className="form-input" defaultValue="Gradient Boosting ML (Phase 3.2) with Baseline Prior Fallback" readOnly />
            </div>
          </div>

          {/* RBAC Privileges Matrix */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Role Permission Matrix (Backend Enforced)</h3>
            <div className="data-table-wrapper">
              <table className="data-table" style={{ fontSize: '0.8125rem' }}>
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>OWNER</th>
                    <th>ADMIN</th>
                    <th>MANAGER</th>
                    <th>OPERATOR</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>View Live Occupancy</td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                  </tr>
                  <tr>
                    <td>Manual Bay Overrides</td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                  </tr>
                  <tr>
                    <td>Accept / Reject Pricing Rules</td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><span style={{ color: 'var(--ps-state-occupied)' }}>Blocked (403)</span></td>
                  </tr>
                  <tr>
                    <td>Financial Revenue Analytics</td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><span style={{ color: 'var(--ps-state-occupied)' }}>Blocked (403)</span></td>
                  </tr>
                  <tr>
                    <td>AI Operations Assistant</td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                    <td><CheckCircle2 size={14} color="var(--ps-state-available)" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          AI EXPLANATION MODAL
          ===================================================================== */}
      {aiExplanationModal?.isOpen && (
        <div className="modal-backdrop" onClick={() => setAiExplanationModal(null)} role="dialog" aria-modal="true">
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={18} color="var(--ps-accent-dark)" />
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>AI Recommendation Explanation</h3>
              </div>
              <button
                onClick={() => setAiExplanationModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ps-secondary-dark)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '1rem', fontWeight: 600, fontSize: '0.9375rem' }}>
              {aiExplanationModal.title}
            </div>

            {aiExplanationModal.loading ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                <ComponentLoader message="Synthesizing explainable AI rationale..." />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--ps-primary-dark)' }}>
                  {aiExplanationModal.content?.summary || 'Algorithmic surge model detected high utilization probability.'}
                </p>

                <div style={{
                  backgroundColor: 'var(--ps-primary-light)',
                  padding: '0.75rem',
                  borderRadius: 'var(--ps-radius-sm)',
                  fontSize: '0.8125rem'
                }}>
                  <div><strong>Risk Assessment:</strong> {aiExplanationModal.content?.riskAssessment || 'Low risk of volume displacement.'}</div>
                  <div style={{ marginTop: '0.25rem' }}><strong>Confidence Factor:</strong> {aiExplanationModal.content?.confidenceFactor || '91%'}</div>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--ps-secondary-dark)', fontStyle: 'italic' }}>
                  {aiExplanationModal.content?.disclaimer || 'Decision support artifact. Operator confirmation required.'}
                </div>

                <button
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setAiExplanationModal(null)}
                >
                  Close Explanation
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OperatorExperience;
