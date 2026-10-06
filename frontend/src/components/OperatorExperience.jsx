import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ParkingMap } from './ParkingMap';
import { api } from '../services/api';
import { Logo } from './shared/Logo';
import { ComponentLoader, ActionLoader } from './shared/Loading';
import { ParkSpotCopilot } from './operator/ParkSpotCopilot';
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
  MapPin,
  Plus
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
  onAddSpot,
  isLiveConnected = false,
  activeUser = null,
  activeTab = null,
  onTabChange = null
}) {
  // -------------------------------------------------------------------------
  // CORE OPERATIONAL STATE
  // -------------------------------------------------------------------------
  const [selectedFacility, setSelectedFacility] = useState(() => facilities[0] || null);
  const [activeFloor, setActiveFloor] = useState('Floor 1');
  const [internalTab, setInternalTab] = useState('dashboard');
  const operatorTab = activeTab !== null && activeTab !== undefined ? activeTab : internalTab;
  const setOperatorTab = (tab) => {
    setInternalTab(tab);
    if (onTabChange) onTabChange(tab);
  };
  const activeRole = activeUser?.internalRole || (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(activeUser?.role) ? activeUser.role : 'OPERATOR');

  // Floating ParkSpot Copilot state
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  useEffect(() => {
    if (operatorTab === 'assistant' || operatorTab === 'copilot') {
      setIsCopilotOpen(true);
      setInternalTab('dashboard');
      if (onTabChange) onTabChange('dashboard');
    }
  }, [operatorTab, onTabChange]);

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
  // PARKING SPOTS REGISTRY & MODAL STATE
  // -------------------------------------------------------------------------
  const [isAddSpotModalOpen, setIsAddSpotModalOpen] = useState(false);
  const [newSpotFacilityId, setNewSpotFacilityId] = useState('');
  const [newSpotFloor, setNewSpotFloor] = useState('Floor 1');
  const [newSpotNumber, setNewSpotNumber] = useState('');
  const [newSpotType, setNewSpotType] = useState('STANDARD');
  const [newSpotStatus, setNewSpotStatus] = useState('AVAILABLE');
  const [addSpotLoading, setAddSpotLoading] = useState(false);
  const [addSpotError, setAddSpotError] = useState(null);

  const handleCreateSpotSubmit = async (e) => {
    e.preventDefault();
    if (!newSpotNumber.trim()) {
      setAddSpotError('Please provide a valid Spot ID/number.');
      return;
    }
    setAddSpotLoading(true);
    setAddSpotError(null);

    const targetFacId = newSpotFacilityId || selectedFacility?.id;
    const spotPayload = {
      facilityId: targetFacId,
      number: newSpotNumber.trim().toUpperCase(),
      level: newSpotFloor,
      floor: newSpotFloor,
      type: newSpotType,
      status: newSpotStatus
    };

    try {
      if (onAddSpot) {
        await onAddSpot(targetFacId, spotPayload);
      } else if (isLiveConnected && /^[a-f\d]{24}$/i.test(targetFacId)) {
        await api.createSpot(targetFacId, spotPayload);
      }
      setIsAddSpotModalOpen(false);
      setNewSpotNumber('');
      setSpotFeedback({
        type: 'success',
        message: `Spot ${spotPayload.number} created successfully on ${newSpotFloor}.`
      });
    } catch (err) {
      setAddSpotError(err.message || 'Failed to create parking spot.');
    } finally {
      setAddSpotLoading(false);
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

  // Compute attention items for the ATTENTION section
  const attentionItems = useMemo(() => {
    const items = [];
    const activeOverstayCount = (overstays || []).filter((o) => o.status === 'ACTIVE_OVERSTAY').length;
    if (activeOverstayCount > 0) {
      items.push({
        id: 'att-overstays',
        label: `${activeOverstayCount} Overstay${activeOverstayCount > 1 ? 's' : ''} detected`,
        type: 'warning',
        actionTab: 'overstays',
        desc: `${activeOverstayCount} vehicles exceeding their paid reservation window.`
      });
    }

    const pendingRecsCount = (recommendations || []).filter((r) => r.status === 'PENDING').length;
    if (pendingRecsCount > 0) {
      items.push({
        id: 'att-recs',
        label: `${pendingRecsCount} Pending Recommendation${pendingRecsCount > 1 ? 's' : ''}`,
        type: 'alert',
        actionTab: 'recommendations',
        desc: 'ML pricing or allocation recommendations awaiting operator sign-off.'
      });
    }

    if (occupancyPercent >= 85) {
      items.push({
        id: 'att-occupancy',
        label: `High Occupancy Pressure (${occupancyPercent}%)`,
        type: 'alert',
        actionTab: 'spots',
        desc: `Facility capacity is at ${occupancyPercent}%. Consider opening overflow bays.`
      });
    }

    return items;
  }, [overstays, recommendations, occupancyPercent]);


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

  // Derived facility performance rankings for Analytics comparison
  const rankedFacilities = useMemo(() => {
    return (facilities || []).map((fac) => {
      const spots = fac.spots || [];
      const total = spots.length || fac.totalSpots || 48;
      const occupied = spots.filter((s) => s.status === 'OCCUPIED' || s.status === 'RESERVED').length;
      const util = total > 0 ? Math.round((occupied / total) * 100) : 55;
      let status = 'Balanced';
      let badgeClass = 'available';
      if (util >= 75) {
        status = 'Busiest / High Demand';
        badgeClass = 'occupied';
      } else if (util < 50) {
        status = 'Underutilized';
        badgeClass = 'selected';
      }
      return {
        id: fac.id || fac._id,
        name: fac.name,
        city: fac.city,
        total,
        occupied,
        available: Math.max(0, total - occupied),
        util,
        rate: fac.hourlyRate || 40,
        status,
        badgeClass
      };
    }).sort((a, b) => b.util - a.util);
  }, [facilities]);

  // Derived forecast summary for Operator-First Demand Forecast
  const forecastSummary = useMemo(() => {
    const items = forecastData?.forecast || [];
    if (items.length === 0) {
      return {
        avgDemand: 35,
        peakPeriod: '12:00',
        peakDemand: 45,
        pressurePct: 88,
        isRising: true
      };
    }
    const totalExp = items.reduce((acc, it) => acc + (it.expectedDemand || 0), 0);
    const avgDemand = Math.round(totalExp / items.length);
    const peakItem = items.reduce((max, it) => (it.expectedDemand > max.expectedDemand ? it : max), items[0]);
    const pressurePct = peakItem.utilizationPct || Math.round((peakItem.expectedDemand / (peakItem.capacity || totalBays)) * 100);
    const isRising = peakItem.expectedDemand > (occupiedBays || 20);

    return {
      avgDemand,
      peakPeriod: peakItem.time,
      peakDemand: peakItem.expectedDemand,
      pressurePct,
      isRising
    };
  }, [forecastData?.forecast, occupiedBays, totalBays]);

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
  // AI RECOMMENDATION EXPLANATION MODAL STATE
  // -------------------------------------------------------------------------
  const [aiExplanationModal, setAiExplanationModal] = useState(null); // { isOpen, title, content, loading }

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

  const operatorGreetingName = activeUser?.name?.split(' ')[0] || 'Operator';

  return (
    <div className="operator-layout-container">
      {/* 1. SIDEBAR: Structured Mobility Hierarchy */}
      <aside className="operator-sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0 0.75rem 1.5rem', borderBottom: '1px solid var(--ps-secondary-light)', marginBottom: '1.25rem' }}>
          <Logo variant="mark" size={26} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)' }}>ParkSpot</div>
            <div className="metadata" style={{ fontSize: '0.6875rem' }}>Operations Console</div>
          </div>
        </div>

        {/* SECTION 1: OPERATIONS */}
        <div className="operator-sidebar-group">
          <div className="operator-sidebar-group-title">Operations</div>
          <button
            className={`operator-sidebar-item ${operatorTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setOperatorTab('dashboard')}
          >
            <div className="operator-sidebar-item-left">
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </div>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'map' ? 'active' : ''}`}
            onClick={() => setOperatorTab('map')}
          >
            <div className="operator-sidebar-item-left">
              <MapIcon size={16} />
              <span>Live Parking</span>
            </div>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'bookings' ? 'active' : ''}`}
            onClick={() => setOperatorTab('bookings')}
          >
            <div className="operator-sidebar-item-left">
              <CalendarCheck size={16} />
              <span>Bookings</span>
            </div>
            <span className="operator-sidebar-badge">{bookings.length}</span>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'events' ? 'active' : ''}`}
            onClick={() => setOperatorTab('events')}
          >
            <div className="operator-sidebar-item-left">
              <Activity size={16} />
              <span>Events</span>
            </div>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'overstays' ? 'active' : ''}`}
            onClick={() => setOperatorTab('overstays')}
          >
            <div className="operator-sidebar-item-left">
              <Clock size={16} />
              <span>Overstays</span>
            </div>
            {filteredOverstays.filter((o) => o.status === 'ACTIVE_OVERSTAY').length > 0 && (
              <span className="operator-sidebar-badge" style={{ backgroundColor: 'var(--ps-state-occupied)', color: '#FFFFFF' }}>
                {filteredOverstays.filter((o) => o.status === 'ACTIVE_OVERSTAY').length}
              </span>
            )}
          </button>
        </div>

        {/* SECTION 2: PARKING */}
        <div className="operator-sidebar-group">
          <div className="operator-sidebar-group-title">Parking</div>
          <button
            className={`operator-sidebar-item ${operatorTab === 'occupancy' ? 'active' : ''}`}
            onClick={() => setOperatorTab('occupancy')}
          >
            <div className="operator-sidebar-item-left">
              <Building2 size={16} />
              <span>Facilities</span>
            </div>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'floors' ? 'active' : ''}`}
            onClick={() => setOperatorTab('floors')}
          >
            <div className="operator-sidebar-item-left">
              <Layers size={16} />
              <span>Parking Floors</span>
            </div>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'spots' ? 'active' : ''}`}
            onClick={() => setOperatorTab('spots')}
          >
            <div className="operator-sidebar-item-left">
              <SlidersHorizontal size={16} />
              <span>Parking Spots</span>
            </div>
          </button>
        </div>

        {/* SECTION 3: INSIGHTS */}
        <div className="operator-sidebar-group">
          <div className="operator-sidebar-group-title">Insights</div>
          <button
            className={`operator-sidebar-item ${operatorTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setOperatorTab('analytics')}
          >
            <div className="operator-sidebar-item-left">
              <BarChart3 size={16} />
              <span>Analytics</span>
            </div>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'forecast' ? 'active' : ''}`}
            onClick={() => setOperatorTab('forecast')}
          >
            <div className="operator-sidebar-item-left">
              <TrendingUp size={16} />
              <span>Demand Forecast</span>
            </div>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'recommendations' ? 'active' : ''}`}
            onClick={() => setOperatorTab('recommendations')}
          >
            <div className="operator-sidebar-item-left">
              <BrainCircuit size={16} />
              <span>Optimization</span>
            </div>
            {recommendations.filter((r) => r.status === 'PENDING').length > 0 && (
              <span className="operator-sidebar-badge" style={{ backgroundColor: 'var(--ps-accent-dark)', color: '#FFFFFF' }}>
                {recommendations.filter((r) => r.status === 'PENDING').length}
              </span>
            )}
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'pricing' ? 'active' : ''}`}
            onClick={() => setOperatorTab('pricing')}
          >
            <div className="operator-sidebar-item-left">
              <DollarSign size={16} />
              <span>Pricing</span>
            </div>
          </button>
        </div>

        {/* SECTION 4: ADMINISTRATION */}
        <div className="operator-sidebar-group">
          <div className="operator-sidebar-group-title">Administration</div>
          <button
            className={`operator-sidebar-item ${operatorTab === 'audit' ? 'active' : ''}`}
            onClick={() => setOperatorTab('audit')}
          >
            <div className="operator-sidebar-item-left">
              <FileText size={16} />
              <span>Audit Logs</span>
            </div>
          </button>
          <button
            className={`operator-sidebar-item ${operatorTab === 'settings' ? 'active' : ''}`}
            onClick={() => setOperatorTab('settings')}
          >
            <div className="operator-sidebar-item-left">
              <Settings size={16} />
              <span>Settings</span>
            </div>
          </button>
        </div>
      </aside>

      {/* 2. MAIN CANVAS */}
      <div className="operator-main-canvas">
        {/* DASHBOARD HEADER */}
        <header className="operator-header">
          <div className="operator-header-left">
            <span className="operator-greeting">Good morning, {operatorGreetingName}</span>
            <select
              className="operator-facility-select"
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

          <div className="operator-header-right">
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ps-primary-dark)' }}>
                {activeUser?.name || 'Operator'}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--ps-secondary-dark)' }}>
                {activeRole} · {activeUser?.organizationName || 'Operations'}
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <div className="operator-content-area">
          {/* Global Action Feedback Banners */}
          {spotFeedback && (
            <div style={{
              backgroundColor: spotFeedback.type === 'error' ? '#FDE8E8' : 'rgba(46, 125, 50, 0.1)',
              color: spotFeedback.type === 'error' ? '#9B1C1C' : '#2E7D32',
              border: `1px solid ${spotFeedback.type === 'error' ? '#F87171' : '#2E7D32'}`,
              borderRadius: 'var(--ps-radius-sm)',
              padding: '0.65rem 0.95rem',
              marginBottom: '1.25rem',
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
              marginBottom: '1.25rem',
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
          {/* 1. ATTENTION SECTION */}
          <div className="operator-attention-container">
            {attentionItems.length === 0 ? (
              <div className="operator-attention-banner clear">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <CheckCircle2 size={18} color="var(--ps-state-available)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)' }}>
                      Everything looks good.
                    </div>
                    <div className="metadata" style={{ fontSize: '0.8125rem' }}>
                      All {facilityFloors.length} levels operating nominally. No active overstays or pending operational alerts.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="operator-attention-banner alert">
                <div className="operator-attention-title">ATTENTION REQUIRED</div>
                <div className="operator-attention-items-row">
                  {attentionItems.map((item) => (
                    <div
                      key={item.id}
                      className="operator-attention-item"
                      onClick={() => setOperatorTab(item.actionTab)}
                      title={item.desc}
                    >
                      <span className={`attention-bullet ${item.type}`} />
                      <span><strong>{item.label}</strong></span>
                      <ChevronRight size={14} color="var(--ps-secondary-dark)" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. TODAY'S OPERATIONS: Simple horizontal metric row */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ps-secondary-dark)', marginBottom: '0.65rem' }}>
              Today's Operations
            </div>
            <div className="operator-metrics-strip">
              <div className="operator-metric-block">
                <span className="operator-metric-label">Available</span>
                <span className="operator-metric-number" style={{ color: STATE_COLORS.AVAILABLE }}>{availableBays}</span>
              </div>
              <div className="operator-metric-block">
                <span className="operator-metric-label">Occupied</span>
                <span className="operator-metric-number" style={{ color: STATE_COLORS.OCCUPIED }}>{occupiedBays}</span>
              </div>
              <div className="operator-metric-block">
                <span className="operator-metric-label">Reserved</span>
                <span className="operator-metric-number" style={{ color: STATE_COLORS.RESERVED }}>{reservedBays}</span>
              </div>
              <div className="operator-metric-block">
                <span className="operator-metric-label">Maintenance</span>
                <span className="operator-metric-number" style={{ color: STATE_COLORS.MAINTENANCE }}>{maintenanceBays + blockedBays}</span>
              </div>
              <div className="operator-metric-block">
                <span className="operator-metric-label">Utilization</span>
                <span className="operator-metric-number" style={{ color: 'var(--ps-accent-dark)' }}>{occupancyPercent}%</span>
              </div>
            </div>
          </div>

          {/* 3. LIVE PARKING: Visual Center of Dashboard */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ps-secondary-dark)', marginBottom: '0.65rem' }}>
              Live Parking Operations
            </div>

            <div className="operator-live-center-grid">
              {/* Center Map Stage */}
              <div className="operator-map-stage">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Interactive Facility Map</h3>
                    <p className="metadata">{currentFloorSpots.length} spaces on {activeFloor}</p>
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

                <ParkingMap
                  floors={facilityFloors}
                  activeFloor={activeFloor}
                  onSelectFloor={setActiveFloor}
                  spots={currentFloorSpots}
                  selectedSpotId={selectedSpotForAction?.id}
                  onSelectSpot={(spot) => setSelectedSpotForAction(spot)}
                  isOperator={true}
                />

                {selectedSpotForAction && (
                  <div style={{
                    marginTop: '1.25rem',
                    padding: '1rem',
                    backgroundColor: '#FAF8F2',
                    border: '1px solid var(--ps-secondary-light)',
                    borderRadius: 'var(--ps-radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}>
                    <div>
                      <strong style={{ fontSize: '0.9375rem' }}>Space {selectedSpotForAction.number}</strong> ({selectedSpotForAction.type || 'STANDARD'})
                      <span className={`status-tag ${selectedSpotForAction.status.toLowerCase()}`} style={{ marginLeft: '0.5rem' }}>
                        {selectedSpotForAction.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {selectedSpotForAction.status !== 'AVAILABLE' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={spotActionLoading}
                          onClick={() => handleApplySpotAction('AVAILABLE')}
                        >
                          Vacate
                        </button>
                      )}
                      {selectedSpotForAction.status !== 'BLOCKED' && (
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={spotActionLoading}
                          onClick={() => handleApplySpotAction('BLOCKED')}
                        >
                          Block
                        </button>
                      )}
                      {selectedSpotForAction.status !== 'MAINTENANCE' && (
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={spotActionLoading}
                          onClick={() => handleApplySpotAction('MAINTENANCE')}
                        >
                          Maintenance
                        </button>
                      )}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setSelectedSpotForAction(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Side Telemetry Cards Beside Map */}
              <div className="operator-side-telemetry">
                {/* Facility Status Card */}
                <div className="operator-side-card">
                  <div className="operator-side-card-title">
                    <span>Facility Status</span>
                    <span style={{ color: '#2E7D32', fontSize: '0.75rem' }}>● OPERATIONAL</span>
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {selectedFacility?.name || 'Riverside Facility'}
                  </div>
                  <div className="metadata" style={{ marginBottom: '0.65rem' }}>
                    {selectedFacility?.address || 'Connaught Place, New Delhi'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', paddingTop: '0.5rem', borderTop: '1px solid var(--ps-secondary-light)' }}>
                    <span className="metadata">Operating Window</span>
                    <span>{selectedFacility?.openStatus || 'Open 24/7'}</span>
                  </div>
                </div>

                {/* Capacity Card */}
                <div className="operator-side-card">
                  <div className="operator-side-card-title">
                    <span>Capacity</span>
                    <span>{totalBays} Bays</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{occupiedBays + reservedBays}</span>
                    <span className="metadata">{availableBays} bays open</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: '#E6DFD1', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${occupancyPercent}%`, height: '100%', backgroundColor: occupancyPercent >= 85 ? '#C62828' : 'var(--ps-accent-dark)' }} />
                  </div>
                </div>

                {/* Active Bookings Card */}
                <div className="operator-side-card">
                  <div className="operator-side-card-title">
                    <span>Active Bookings</span>
                    <span className="metadata" style={{ cursor: 'pointer' }} onClick={() => setOperatorTab('bookings')}>
                      View All ({bookings.length})
                    </span>
                  </div>
                  {bookings.slice(0, 3).map((b) => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', padding: '0.4rem 0', borderBottom: '1px solid var(--ps-secondary-light)' }}>
                      <div>
                        <strong>Bay {b.spotNumber || 'A-12'}</strong>
                        <span className="metadata" style={{ marginLeft: '0.4rem' }}>{b.vehiclePlate || 'DL 01 AB 1234'}</span>
                      </div>
                      <span style={{ color: '#2E7D32', fontWeight: 600 }}>{b.status || 'CONFIRMED'}</span>
                    </div>
                  ))}
                </div>

                {/* Overstays Card */}
                <div className="operator-side-card">
                  <div className="operator-side-card-title">
                    <span>Overstays</span>
                    <span className="metadata" style={{ cursor: 'pointer' }} onClick={() => setOperatorTab('overstays')}>
                      {overstays.length} Flagged
                    </span>
                  </div>
                  {overstays.length === 0 ? (
                    <p className="metadata" style={{ fontSize: '0.8125rem' }}>No active overstays detected across all levels.</p>
                  ) : (
                    overstays.slice(0, 2).map((o) => (
                      <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', padding: '0.4rem 0', borderBottom: '1px solid var(--ps-secondary-light)' }}>
                        <div>
                          <strong style={{ color: '#C62828' }}>Bay {o.spotNumber}</strong>
                          <div className="metadata">Plate: {o.vehiclePlate}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ color: '#C62828', fontWeight: 600 }}>+{o.durationMinutes}m</span>
                          <div className="metadata">₹{o.accruedPenalty} fee</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

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

        </div>
      )}

      {/* =====================================================================
          TAB 2B: PARKING FLOORS
          ===================================================================== */}
      {operatorTab === 'floors' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 className="section-title">Parking Floors & Levels</h2>
            <p className="metadata">Real-time floor capacity and bay allocations for {selectedFacility?.name}</p>
          </div>

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
          TAB 4: PARKING SPOTS (DEDICATED MANAGEMENT PAGE)
          ===================================================================== */}
      {operatorTab === 'spots' && (
        <div>
          <div className="operator-spots-header">
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--ps-primary-dark)' }}>
                Parking Spots
              </h2>
              <p className="metadata" style={{ marginTop: '0.25rem', fontSize: '0.9375rem' }}>
                Manage every space in your facility.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.6rem 1.25rem' }}
              onClick={() => {
                setNewSpotFacilityId(selectedFacility?.id || '');
                setNewSpotFloor(activeFloor);
                setAddSpotError(null);
                setIsAddSpotModalOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Add Parking Spot</span>
            </button>
          </div>

          {/* Clean Filters Row: Search, Floor, Type, Status */}
          <div className="operator-spots-filters">
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search by space number or ID..."
                value={spotSearch}
                onChange={(e) => setSpotSearch(e.target.value)}
                style={{ paddingLeft: '2.2rem', backgroundColor: '#FFFFFF' }}
              />
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ps-secondary-dark)' }} />
            </div>

            <select
              className="form-select"
              value={activeFloor}
              onChange={(e) => setActiveFloor(e.target.value)}
              style={{ width: '150px', backgroundColor: '#FFFFFF' }}
            >
              {facilityFloors.map((fl) => (
                <option key={fl} value={fl}>{fl}</option>
              ))}
            </select>

            <select
              className="form-select"
              value={spotTypeFilter}
              onChange={(e) => setSpotTypeFilter(e.target.value)}
              style={{ width: '160px', backgroundColor: '#FFFFFF' }}
            >
              <option value="ALL">All Types</option>
              <option value="STANDARD">Standard</option>
              <option value="COMPACT">Compact</option>
              <option value="EV">EV Charging</option>
              <option value="ACCESSIBLE">Accessible</option>
            </select>

            <select
              className="form-select"
              value={spotStateFilter}
              onChange={(e) => setSpotStateFilter(e.target.value)}
              style={{ width: '160px', backgroundColor: '#FFFFFF' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="RESERVED">Reserved</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="BLOCKED">Blocked</option>
            </select>
          </div>

          {/* Parking Spot Registry Clean Table */}
          {filteredSpotsRegistry.length === 0 ? (
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--ps-secondary-light)',
              borderRadius: 'var(--ps-radius-sm)',
              textAlign: 'center',
              padding: '3rem 1.5rem'
            }}>
              <p className="metadata">No parking bays match the selected filters on {activeFloor}.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Spot</th>
                    <th>Floor</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Booking</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSpotsRegistry.map((spot) => {
                    const activeBooking = bookings.find(
                      (b) =>
                        (b.spotNumber === spot.number || b.spotId === spot.id || b.slotId === spot.id) &&
                        (b.status === 'CONFIRMED' || b.status === 'ACTIVE' || b.status === 'PENDING')
                    );

                    return (
                      <tr key={spot.id}>
                        <td>
                          <strong style={{ fontFamily: 'var(--ps-font-mono)' }}>{spot.number}</strong>
                        </td>
                        <td>{spot.floor}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {spot.type?.toLowerCase().replace('_', ' ') || 'standard'}
                        </td>
                        <td>
                          <span className={`status-tag ${spot.status.toLowerCase()}`}>
                            {spot.status}
                          </span>
                        </td>
                        <td>
                          {activeBooking ? (
                            <span style={{ fontSize: '0.8125rem', color: 'var(--ps-primary-dark)' }}>
                              #{String(activeBooking.id).slice(-4)} ({activeBooking.vehiclePlate || 'Reserved'})
                            </span>
                          ) : (
                            <span className="metadata">—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {spot.status !== 'AVAILABLE' && (
                              <button
                                className="btn btn-secondary btn-sm"
                                disabled={spotActionLoading}
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
                                disabled={spotActionLoading}
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
                                disabled={spotActionLoading}
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
                    );
                  })}
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
          TAB 8: BUSINESS ANALYTICS & PARKING PERFORMANCE
          ===================================================================== */}
      {operatorTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* A. Top Header */}
          <div className="analytics-header-section">
            <div>
              <h2 className="analytics-title">Parking performance</h2>
              <p className="analytics-subtitle">
                Key operational indicators, hourly activity distribution, and facility capacity across the selected period.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="metadata" style={{ fontSize: '0.8125rem' }}>Facility Context:</span>
              <span className="status-tag available" style={{ fontWeight: 600 }}>{selectedFacility?.name || 'All Facilities'}</span>
            </div>
          </div>

          {/* B. KPI Row */}
          <div className="analytics-kpi-grid">
            {/* KPI 1: Utilization */}
            <div className="analytics-kpi-card">
              <div>
                <div className="analytics-kpi-label">Utilization</div>
                <div className="analytics-kpi-value">{occupancyPercent}%</div>
              </div>
              <div className={`analytics-kpi-trend ${occupancyPercent >= 80 ? 'alert' : 'positive'}`}>
                <span>{occupancyPercent >= 80 ? '● High volume' : '● Fluid turnover'}</span>
                <span className="metadata">· {occupiedBays + reservedBays}/{totalBays} bays</span>
              </div>
            </div>

            {/* KPI 2: Occupancy */}
            <div className="analytics-kpi-card">
              <div>
                <div className="analytics-kpi-label">Occupancy</div>
                <div className="analytics-kpi-value">{occupiedBays + reservedBays}</div>
              </div>
              <div className="analytics-kpi-trend neutral">
                <span>{availableBays} bays available</span>
                <span className="metadata">· {totalBays} capacity</span>
              </div>
            </div>

            {/* KPI 3: Revenue */}
            <div className="analytics-kpi-card">
              <div>
                <div className="analytics-kpi-label">Revenue</div>
                <div className="analytics-kpi-value">
                  {revenueRestricted ? 'Restricted' : `₹${(analyticsData.totalRevenue || 28450).toLocaleString('en-IN')}`}
                </div>
              </div>
              <div className="analytics-kpi-trend positive">
                <span>Base rate: ₹{selectedFacility?.hourlyRate || 40}/hr</span>
              </div>
            </div>

            {/* KPI 4: Bookings */}
            <div className="analytics-kpi-card">
              <div>
                <div className="analytics-kpi-label">Bookings</div>
                <div className="analytics-kpi-value">{analyticsData.totalBookings || 142}</div>
              </div>
              <div className="analytics-kpi-trend neutral">
                <span>{analyticsData.activeBookings || 24} active</span>
                <span className="metadata">· {analyticsData.completedBookings || 110} completed</span>
              </div>
            </div>
          </div>

          {/* C. Main Dominant Visualization */}
          <div className="analytics-chart-card">
            <div className="analytics-chart-header">
              <div>
                <span className="eyebrow" style={{ color: 'var(--ps-secondary-dark)' }}>HOURLY PARKING DENSITY</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.2rem 0 0', color: 'var(--ps-primary-dark)' }}>
                  Parking Activity Over Time
                </h3>
              </div>

              {/* Obvious distinction between normal, high-demand, low-demand */}
              <div className="analytics-chart-legend">
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot" style={{ backgroundColor: '#B2A240', border: '1px solid #F3F456' }} />
                  <span>High-demand (35+ bookings)</span>
                </div>
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot" style={{ backgroundColor: 'var(--ps-primary-dark)' }} />
                  <span>Normal activity (20–34 bookings)</span>
                </div>
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot" style={{ backgroundColor: '#DDD4C4' }} />
                  <span>Low-demand (&lt; 20 bookings)</span>
                </div>
              </div>
            </div>

            {/* Timeline Bars */}
            <div className="analytics-timeline-bars">
              {analyticsData.peakHours.map((ph) => {
                const maxCount = 48;
                const heightPct = Math.min(100, Math.max(18, Math.round((ph.bookingCount / maxCount) * 100)));
                const isHigh = ph.bookingCount >= 35;
                const isLow = ph.bookingCount < 20;
                const demandClass = isHigh ? 'high-demand' : isLow ? 'low-demand' : 'normal-demand';
                const demandLabel = isHigh ? 'High Demand' : isLow ? 'Low Demand' : 'Normal Activity';

                return (
                  <div key={ph.hour} className="analytics-bar-col" title={`${ph.bookingCount} bookings (${demandLabel}) at ${String(ph.hour).padStart(2, '0')}:00`}>
                    <span className="analytics-bar-count" style={{ color: isHigh ? 'var(--ps-accent-dark)' : 'var(--ps-primary-dark)' }}>
                      {ph.bookingCount}
                    </span>
                    <div
                      className={`analytics-bar-fill ${demandClass}`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="analytics-bar-time">
                      {String(ph.hour).padStart(2, '0')}:00
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p className="metadata" style={{ margin: 0, fontSize: '0.8125rem' }}>
                Peak periods reflect active driver reservation density. Algorithmic surge pricing automatically buffers high-demand intervals.
              </p>
              <span className="metadata" style={{ fontSize: '0.75rem', fontFamily: 'var(--ps-font-mono)' }}>
                Peak Period: 17:00 (42 bookings)
              </span>
            </div>
          </div>

          {/* D. Operational Insights Section (2-3 concise cards ONLY from existing backend data) */}
          <div>
            <div style={{ marginBottom: '0.85rem' }}>
              <span className="eyebrow">KEY TAKEAWAYS</span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.15rem 0 0', color: 'var(--ps-primary-dark)' }}>
                Operational Insights
              </h3>
            </div>

            <div className="analytics-insights-grid">
              {/* Insight 1: Peak demand timing */}
              <div className="analytics-insight-card highlight">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--ps-accent-dark)' }}>
                  <TrendingUp size={16} />
                  <span className="eyebrow" style={{ color: 'inherit', margin: 0 }}>Peak Concentration</span>
                </div>
                <div className="analytics-insight-title">
                  {`Peak demand is concentrated in the ${
                    ([...analyticsData.peakHours].sort((a,b) => b.bookingCount - a.bookingCount)[0]?.hour || 17) >= 17 ? 'evening' : 'afternoon'
                  }.`}
                </div>
                <p className="analytics-insight-desc">
                  Highest ingress density peaks at {String([...analyticsData.peakHours].sort((a,b) => b.bookingCount - a.bookingCount)[0]?.hour || 17).padStart(2, '0')}:00 with {([...analyticsData.peakHours].sort((a,b) => b.bookingCount - a.bookingCount)[0]?.bookingCount || 42)} bookings. Barrier lanes require smooth ingress routing.
                </p>
              </div>

              {/* Insight 2: Dwell & Turnover */}
              <div className="analytics-insight-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--ps-primary-dark)' }}>
                  <Clock size={16} />
                  <span className="eyebrow" style={{ color: 'inherit', margin: 0 }}>Driver Turnover</span>
                </div>
                <div className="analytics-insight-title">
                  Average vehicle dwell is {analyticsData.averageDwellHours || 3.2} hours.
                </div>
                <p className="analytics-insight-desc">
                  {occupancyPercent >= 75
                    ? `Utilization stands at ${occupancyPercent}%. Sustained dwell yields solid revenue with ${availableBays} bays buffering incoming reservations.`
                    : `Fluid vehicle turnover maintains ${availableBays} vacant bays for immediate driver arrivals across all active levels.`}
                </p>
              </div>

              {/* Insight 3: Capacity & Off-Peak */}
              <div className="analytics-insight-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--ps-secondary-dark)' }}>
                  <Layers size={16} />
                  <span className="eyebrow" style={{ color: 'inherit', margin: 0 }}>Capacity Utilization</span>
                </div>
                <div className="analytics-insight-title">
                  {occupancyPercent < 60
                    ? 'Facility capacity is underused during off-peak hours.'
                    : `Facility operating at ${occupancyPercent}% operational capacity.`}
                </div>
                <p className="analytics-insight-desc">
                  {occupancyPercent < 60
                    ? `${availableBays} bays (${100 - occupancyPercent}%) are currently unreserved. Off-peak pricing incentives can capture overnight dwell.`
                    : `${occupiedBays} parked and ${reservedBays} reserved spaces active. Ensure overstay triage is monitored during peak turnover.`}
                </p>
              </div>
            </div>
          </div>

          {/* E. Facility Comparison */}
          <div className="analytics-facility-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span className="eyebrow">FACILITY BENCHMARK</span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.15rem 0 0', color: 'var(--ps-primary-dark)' }}>
                  Facility Utilization Ranking
                </h3>
              </div>
              <span className="metadata" style={{ fontSize: '0.8125rem' }}>
                Comparing {rankedFacilities.length} operational sites
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rankedFacilities.map((fac, idx) => (
                <div key={fac.id || idx} className="facility-rank-item">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)' }}>
                      {fac.name}
                    </div>
                    <div className="metadata" style={{ fontSize: '0.75rem' }}>
                      {fac.city} · {fac.totalSpots} Total Spaces · ₹{fac.rate}/hr
                    </div>
                  </div>

                  <div>
                    <div className="facility-rank-meter">
                      <div
                        className="facility-rank-meter-fill"
                        style={{
                          width: `${fac.util}%`,
                          backgroundColor: fac.util >= 75 ? 'var(--ps-state-occupied)' : fac.util < 50 ? 'var(--ps-accent-dark)' : 'var(--ps-primary-dark)'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--ps-secondary-dark)', marginTop: '4px' }}>
                      <span>{fac.occupied} occupied</span>
                      <span>{fac.available} available</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ps-primary-dark)' }}>
                      {fac.util}%
                    </span>
                    <span className="metadata" style={{ fontSize: '0.75rem', display: 'block' }}>utilized</span>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span
                      className={`status-tag ${fac.badgeClass}`}
                      style={{ fontSize: '0.6875rem', whiteSpace: 'nowrap' }}
                    >
                      {fac.status}
                    </span>
                  </div>
                </div>
              ))}
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
          TAB 11: DEMAND FORECAST
          ===================================================================== */}
      {operatorTab === 'forecast' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* HEADER */}
          <div className="analytics-header-section">
            <div>
              <h2 className="analytics-title">Demand forecast</h2>
              <p className="analytics-subtitle">
                See expected parking demand before it becomes an operational problem.
              </p>
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

          {/* FORECAST SUMMARY */}
          <div className="forecast-summary-grid">
            <div className="forecast-summary-card">
              <div className="forecast-summary-label">Expected Demand</div>
              <div className="forecast-summary-val">{forecastSummary.avgDemand} vehicles</div>
              <div className="forecast-summary-hint">Average across {forecastHorizon === 168 ? '7 days' : `${forecastHorizon}h`} horizon</div>
            </div>

            <div className="forecast-summary-card">
              <div className="forecast-summary-label">Expected Peak Period</div>
              <div className="forecast-summary-val">{forecastSummary.peakPeriod}</div>
              <div className="forecast-summary-hint">{forecastSummary.peakDemand} vehicles projected at peak</div>
            </div>

            <div className="forecast-summary-card">
              <div className="forecast-summary-label">Capacity Pressure</div>
              <div className="forecast-summary-val" style={{ color: forecastSummary.pressurePct >= 85 ? 'var(--ps-state-occupied)' : 'var(--ps-primary-dark)' }}>
                {forecastSummary.pressurePct}%
              </div>
              <div className="forecast-summary-hint">
                {forecastSummary.pressurePct >= 85 ? 'High capacity pressure' : forecastSummary.pressurePct >= 70 ? 'Moderate capacity pressure' : 'Normal capacity pressure'}
              </div>
            </div>

            <div className="forecast-summary-card">
              <div className="forecast-summary-label">Forecast Horizon</div>
              <div className="forecast-summary-val">{forecastHorizon === 168 ? 'Next 7 Days' : `Next ${forecastHorizon} Hours`}</div>
              <div className="forecast-summary-hint">{forecastData.confidence || '92%'} confidence rating</div>
            </div>
          </div>

          {/* MAIN VISUAL: Historical vs Predicted with clear boundary */}
          <div className="forecast-chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <span className="eyebrow">CAPACITY PROJECTION TIMELINE</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0.2rem 0 0', color: 'var(--ps-primary-dark)' }}>
                  Demand Horizon Timeline
                </h3>
              </div>

              <div className="analytics-chart-legend">
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot" style={{ backgroundColor: 'var(--ps-primary-dark)' }} />
                  <span>Current Actual (Now)</span>
                </div>
                <div className="analytics-legend-item">
                  <span className="analytics-legend-dot" style={{ backgroundColor: '#B2A240', border: '1px solid #F3F456' }} />
                  <span>Predicted Demand</span>
                </div>
                <div className="analytics-legend-item">
                  <span style={{ fontSize: '0.75rem', color: 'var(--ps-secondary-dark)' }}>
                    Confidence band: ±{Math.round(100 - parseFloat(forecastData.confidence || 92))}%
                  </span>
                </div>
              </div>
            </div>

            <div className="forecast-chart-bands">
              {/* Actual / Current Demand Bar */}
              <div className="analytics-bar-col" style={{ maxWidth: '64px' }} title={`Current live occupancy: ${occupiedBays} parked bays`}>
                <span className="analytics-bar-count" style={{ color: 'var(--ps-primary-dark)' }}>
                  {occupiedBays}
                </span>
                <div
                  className="analytics-bar-fill normal-demand"
                  style={{
                    height: `${Math.min(100, Math.max(20, Math.round((occupiedBays / totalBays) * 100)))}%`,
                    backgroundColor: 'var(--ps-primary-dark)'
                  }}
                />
                <span className="analytics-bar-time" style={{ fontWeight: 700, color: 'var(--ps-primary-dark)' }}>
                  Now (Actual)
                </span>
              </div>

              {/* Clear Separation Divider */}
              <div className="forecast-phase-divider">
                <span>Forecast</span>
                <span>Horizon ►</span>
              </div>

              {/* Predicted Demand Bars */}
              {forecastData.forecast.map((fc, idx) => {
                const heightPct = Math.min(100, Math.max(15, Math.round((fc.expectedDemand / (fc.capacity || totalBays)) * 100)));
                const isPeak = heightPct >= 85;

                return (
                  <div key={idx} className="analytics-bar-col" title={`Predicted: ${fc.expectedDemand} vehicles (${heightPct}% capacity) at ${fc.time}`}>
                    <span className="analytics-bar-count" style={{ color: isPeak ? 'var(--ps-state-occupied)' : 'var(--ps-primary-dark)' }}>
                      {fc.expectedDemand}
                    </span>
                    <div
                      className="analytics-bar-fill"
                      style={{
                        height: `${heightPct}%`,
                        background: isPeak
                          ? 'linear-gradient(180deg, #B2A240 0%, #25221B 100%)'
                          : 'linear-gradient(180deg, rgba(178, 162, 64, 0.4) 0%, rgba(37, 34, 27, 0.6) 100%)',
                        borderTop: isPeak ? '2px solid var(--ps-accent-light)' : '1px dashed var(--ps-accent-dark)'
                      }}
                    />
                    <span className="analytics-bar-time">
                      {fc.time}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span className="metadata" style={{ fontSize: '0.8125rem' }}>
                Operational capacity ceiling: {totalBays} total spaces for {selectedFacility?.name || 'facility'}.
              </span>
              <span className="metadata" style={{ fontSize: '0.75rem', fontFamily: 'var(--ps-font-mono)' }}>
                Reliability factor: {forecastData.confidence || '92%'}
              </span>
            </div>
          </div>

          {/* UNDER THE CHART: “What this means” section */}
          <div className="forecast-meaning-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <TrendingUp size={18} color="var(--ps-accent-dark)" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--ps-primary-dark)' }}>
                What this means
              </h3>
            </div>

            <div className="forecast-meaning-row">
              <div className="forecast-meaning-icon-box">
                <Clock size={18} color="var(--ps-primary-dark)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)', marginBottom: '0.2rem' }}>
                  {forecastSummary.isRising ? 'Demand is expected to rise' : 'Demand is expected to stabilize'}
                </div>
                <p className="metadata" style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>
                  Peak pressure is likely around <strong>{forecastSummary.peakPeriod}</strong> with approximately <strong>{forecastSummary.peakDemand} vehicles</strong> ({forecastSummary.pressurePct}% facility capacity).
                </p>
              </div>
            </div>

            <div className="forecast-meaning-row">
              <div className="forecast-meaning-icon-box" style={{ backgroundColor: 'rgba(243, 244, 86, 0.25)' }}>
                <Sparkles size={18} color="var(--ps-accent-dark)" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)', marginBottom: '0.2rem' }}>
                  Recommended attention
                </div>
                <p className="metadata" style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {recommendations.find((r) => r.status === 'PENDING')
                    ? `Review capacity and pricing for the upcoming peak period: "${recommendations.find((r) => r.status === 'PENDING').title}". ${recommendations.find((r) => r.status === 'PENDING').expectedImpact}`
                    : forecastSummary.pressurePct >= 85
                    ? `Review capacity allocations for the upcoming peak window at ${forecastSummary.peakPeriod}. Consider preparing overflow signage or opening reserved buffers.`
                    : `Sufficient operating capacity exists for the upcoming forecast window. Standard drive-in and pre-booked turnover is well accommodated.`}
                </p>
              </div>
            </div>
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
              <label className="form-label">Account Type</label>
              <input type="text" className="form-input" value="OPERATOR" readOnly />
            </div>

            <div className="form-group">
              <label className="form-label">Organization Name</label>
              <input type="text" className="form-input" value={activeUser?.organizationName || 'ParkSpot Operator'} readOnly />
            </div>

            <div className="form-group">
              <label className="form-label">Facility Identifier</label>
              <input type="text" className="form-input" value={selectedFacility?.id || 'fac-default'} readOnly />
            </div>

            <div className="form-group">
              <label className="form-label">Internal Role (Read Only)</label>
              <input
                type="text"
                className="form-input"
                value={activeRole}
                readOnly
              />
            </div>

            <div className="form-group">
              <label className="form-label">Demand Forecasting Engine</label>
              <input type="text" className="form-input" defaultValue="Automated Predictive Demand Engine" readOnly />
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
                    <td>ParkSpot Copilot Assistant</td>
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

        </div>
      </div>

      {/* =====================================================================
          ADD PARKING SPOT MODAL
          ===================================================================== */}
      {isAddSpotModalOpen && (
        <div className="clean-modal-backdrop" onClick={() => setIsAddSpotModalOpen(false)} role="dialog" aria-modal="true">
          <div className="clean-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="clean-modal-header">
              <h3 className="clean-modal-title">Add Parking Spot</h3>
              <button
                type="button"
                onClick={() => setIsAddSpotModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ps-secondary-dark)' }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {addSpotError && (
              <div style={{
                backgroundColor: '#FDE8E8',
                color: '#9B1C1C',
                border: '1px solid #F87171',
                borderRadius: 'var(--ps-radius-sm)',
                padding: '0.65rem 0.85rem',
                marginBottom: '1rem',
                fontSize: '0.8125rem'
              }}>
                {addSpotError}
              </div>
            )}

            <form onSubmit={handleCreateSpotSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Facility</label>
                <select
                  className="form-select"
                  value={newSpotFacilityId}
                  onChange={(e) => {
                    setNewSpotFacilityId(e.target.value);
                    const target = facilities.find((f) => f.id === e.target.value);
                    if (target?.floors && target.floors.length > 0) {
                      setNewSpotFloor(target.floors[0]);
                    }
                  }}
                  required
                >
                  {facilities.map((fac) => (
                    <option key={fac.id} value={fac.id}>{fac.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Floor</label>
                <select
                  className="form-select"
                  value={newSpotFloor}
                  onChange={(e) => setNewSpotFloor(e.target.value)}
                  required
                >
                  {facilityFloors.map((fl) => (
                    <option key={fl} value={fl}>{fl}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Spot ID</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. A-12"
                  value={newSpotNumber}
                  onChange={(e) => setNewSpotNumber(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={newSpotType}
                  onChange={(e) => setNewSpotType(e.target.value)}
                >
                  <option value="STANDARD">Standard</option>
                  <option value="COMPACT">Compact</option>
                  <option value="EV">EV Charging</option>
                  <option value="ACCESSIBLE">Accessible</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={newSpotStatus}
                  onChange={(e) => setNewSpotStatus(e.target.value)}
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="OCCUPIED">Occupied</option>
                  <option value="RESERVED">Reserved</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="BLOCKED">Blocked</option>
                </select>
              </div>

              <div className="clean-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddSpotModalOpen(false)}
                  disabled={addSpotLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={addSpotLoading}
                >
                  {addSpotLoading ? <ActionLoader text="Creating spot..." /> : 'Create Spot'}
                </button>
              </div>
            </form>
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

      {/* Real Floating ParkSpot Copilot Chatbot */}
      <ParkSpotCopilot
        operatorName={operatorGreetingName || 'Operator'}
        selectedFacility={selectedFacility}
        onNavigateTab={(tab) => setOperatorTab(tab)}
        isLiveConnected={isLiveConnected}
        isOpen={isCopilotOpen}
        onToggle={setIsCopilotOpen}
      />
    </div>
  );
}

export default OperatorExperience;
