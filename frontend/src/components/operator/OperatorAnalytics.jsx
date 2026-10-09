import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../services/api';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  CalendarCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Info,
  Calendar,
  Filter,
  BarChart3,
  Building2,
  ChevronRight,
  ArrowUpRight,
  SlidersHorizontal,
  Car
} from 'lucide-react';

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today', days: 1 },
  { id: '7d', label: '7 Days', days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
  { id: 'custom', label: 'Custom' }
];

export function OperatorAnalytics({
  facility = null,
  activeUser = null,
  onNavigateTab = null
}) {
  const facilityId = facility?.id || facility?._id || activeUser?.facilityId;
  const facilityName = facility?.name || 'Assigned Facility';
  const totalBays = facility?.totalSpots || facility?.totalSlots || 0;

  // Date range filter state
  const [selectedRange, setSelectedRange] = useState('30d');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Chart view mode
  const [chartMetric, setChartMetric] = useState('revenue'); // 'revenue' | 'volume' | 'occupancy'
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [summaryData, setSummaryData] = useState(null);
  const [prevSummaryData, setPrevSummaryData] = useState(null);
  const [utilizationData, setUtilizationData] = useState(null);
  const [occupancyTrends, setOccupancyTrends] = useState(null);
  const [peakHoursData, setPeakHoursData] = useState(null);
  const [revenueData, setRevenueData] = useState(null);
  const [revenueRestricted, setRevenueRestricted] = useState(false);

  // Compute ISO dates for query
  const dateWindows = useMemo(() => {
    const now = new Date();
    let start, end;
    let prevStart, prevEnd;

    if (selectedRange === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = now;
      prevStart = new Date(start.getTime() - 86400000);
      prevEnd = new Date(start.getTime() - 1);
    } else if (selectedRange === 'custom') {
      start = new Date(`${customStartDate}T00:00:00.000Z`);
      end = new Date(`${customEndDate}T23:59:59.999Z`);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        start = new Date(Date.now() - 30 * 86400000);
        end = now;
      }
      const dur = end.getTime() - start.getTime();
      prevStart = new Date(start.getTime() - dur);
      prevEnd = new Date(start.getTime() - 1);
    } else {
      const days = RANGE_OPTIONS.find((r) => r.id === selectedRange)?.days || 30;
      start = new Date(now.getTime() - days * 86400000);
      end = now;
      prevStart = new Date(start.getTime() - days * 86400000);
      prevEnd = new Date(start.getTime() - 1);
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
      prevStart: prevStart.toISOString(),
      prevEnd: prevEnd.toISOString(),
      displayLabel: `${start.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`
    };
  }, [selectedRange, customStartDate, customEndDate]);

  // Fetch all analytics with period comparison
  const fetchAnalytics = useCallback(async (isSilentRefresh = false) => {
    if (!facilityId) {
      setLoading(false);
      return;
    }

    if (!isSilentRefresh) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const isDaily = selectedRange !== 'today' && selectedRange !== '7d';
    const bucket = isDaily ? 'daily' : 'hourly';

    try {
      const [sumRes, prevSumRes, utilRes, occRes, peakRes, revRes] = await Promise.allSettled([
        api.getDashboardSummary({
          facilityId,
          startDate: dateWindows.start,
          endDate: dateWindows.end
        }),
        api.getDashboardSummary({
          facilityId,
          startDate: dateWindows.prevStart,
          endDate: dateWindows.prevEnd
        }),
        api.getUtilization({
          facilityId,
          startDate: dateWindows.start,
          endDate: dateWindows.end
        }),
        api.getOccupancyTrends({
          facilityId,
          startDate: dateWindows.start,
          endDate: dateWindows.end,
          bucket
        }),
        api.getPeakHours({
          facilityId,
          startDate: dateWindows.start,
          endDate: dateWindows.end
        }),
        api.getRevenueAnalytics({
          facilityId,
          startDate: dateWindows.start,
          endDate: dateWindows.end
        })
      ]);

      if (sumRes.status === 'fulfilled' && sumRes.value) {
        setSummaryData(sumRes.value);
      }
      if (prevSumRes.status === 'fulfilled' && prevSumRes.value) {
        setPrevSummaryData(prevSumRes.value);
      } else {
        setPrevSummaryData(null);
      }
      if (utilRes.status === 'fulfilled' && utilRes.value) {
        setUtilizationData(utilRes.value);
      }
      if (occRes.status === 'fulfilled' && occRes.value) {
        setOccupancyTrends(occRes.value);
      }
      if (peakRes.status === 'fulfilled' && peakRes.value) {
        setPeakHoursData(peakRes.value);
      }
      if (revRes.status === 'fulfilled') {
        if (revRes.value?.forbidden) {
          setRevenueRestricted(true);
          setRevenueData(null);
        } else {
          setRevenueRestricted(false);
          setRevenueData(revRes.value);
        }
      }
    } catch (err) {
      console.warn('[OperatorAnalytics] Failed to fetch data:', err);
      setError('Could not load complete analytics. Displaying available facility records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [facilityId, dateWindows, selectedRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // ---------------------------------------------------------------------------
  // KPI CALCULATIONS (Strictly Authentic Data, No Fake Values)
  // ---------------------------------------------------------------------------
  const kpis = useMemo(() => {
    // 1. Revenue
    const curRevenue = summaryData?.financials?.revenue ?? (revenueData?.totalRevenue ?? 0);
    const prevRevenue = prevSummaryData?.financials?.revenue ?? null;
    let revTrend = null;
    if (prevRevenue !== null && prevRevenue > 0) {
      const delta = ((curRevenue - prevRevenue) / prevRevenue) * 100;
      revTrend = {
        pct: Math.abs(Math.round(delta * 10) / 10),
        isPositive: delta >= 0,
        label: `${delta >= 0 ? '+' : '-'}${Math.abs(Math.round(delta * 10) / 10)}% vs prev period`
      };
    } else if (prevRevenue === 0 && curRevenue > 0) {
      revTrend = { isPositive: true, label: 'First active revenue period' };
    }

    // 2. Parking Utilization
    const curUtil = utilizationData?.summary?.averageUtilizationPercentage ?? (summaryData?.utilization?.averagePercentage ?? 0);
    const prevUtil = prevSummaryData?.utilization?.averagePercentage ?? null;
    let utilTrend = null;
    if (prevUtil !== null && prevUtil > 0) {
      const delta = curUtil - prevUtil;
      utilTrend = {
        pct: Math.abs(Math.round(delta * 10) / 10),
        isPositive: delta >= 0,
        label: `${delta >= 0 ? '+' : '-'}${Math.abs(Math.round(delta * 10) / 10)}% pts vs prev`
      };
    }

    // 3. Booking Volume
    const curBookings = summaryData?.bookings?.total ?? 0;
    const prevBookings = prevSummaryData?.bookings?.total ?? null;
    let bookTrend = null;
    if (prevBookings !== null && prevBookings > 0) {
      const delta = ((curBookings - prevBookings) / prevBookings) * 100;
      bookTrend = {
        pct: Math.abs(Math.round(delta * 10) / 10),
        isPositive: delta >= 0,
        label: `${delta >= 0 ? '+' : '-'}${Math.abs(Math.round(delta * 10) / 10)}% vs prev`
      };
    }

    // 4. Peak Occupancy
    const peakVolume = peakHoursData?.summary?.peakBookingVolume ?? 0;
    const busiestHour = peakHoursData?.summary?.busiestHour ?? 'N/A';
    const totalSpots = facility?.totalSpots || summaryData?.spots?.total || peakHoursData?.summary?.totalSpots || 1;
    const peakPct = totalSpots > 0 ? Math.min(100, Math.round((peakVolume / totalSpots) * 100)) : 0;

    return {
      revenue: curRevenue,
      revTrend,
      utilization: curUtil,
      utilTrend,
      occupiedHours: utilizationData?.summary?.occupiedHours ?? summaryData?.utilization?.occupiedSpotHours ?? 0,
      totalCapacityHours: utilizationData?.summary?.totalCapacitySpotHours ?? summaryData?.utilization?.totalCapacitySpotHours ?? 0,
      bookings: curBookings,
      bookTrend,
      completed: summaryData?.bookings?.completed ?? 0,
      confirmed: summaryData?.bookings?.confirmed ?? 0,
      cancelled: summaryData?.bookings?.cancelled ?? 0,
      cancellationRate: summaryData?.bookings?.cancellationRate ?? 0,
      busiestHour,
      peakVolume,
      peakPct
    };
  }, [summaryData, prevSummaryData, utilizationData, peakHoursData, revenueData, facility]);

  // ---------------------------------------------------------------------------
  // MAIN CHART TIME SERIES DATA
  // ---------------------------------------------------------------------------
  const chartPoints = useMemo(() => {
    const rawList = occupancyTrends?.data || [];
    if (!rawList.length) return [];

    return rawList.map((pt) => {
      let label = pt.bucket;
      // Formatted label for display
      if (pt.bucket.includes(' ')) {
        const [, timePart] = pt.bucket.split(' ');
        label = timePart;
      } else if (pt.bucket.includes('-')) {
        const parts = pt.bucket.split('-');
        if (parts.length === 3) {
          label = `${parts[1]}/${parts[2]}`;
        }
      }

      return {
        bucket: pt.bucket,
        label,
        revenue: pt.revenue || 0,
        volume: pt.bookingsCount || 0,
        occupancy: pt.occupancyPercentage || 0,
        occupiedSpots: pt.occupiedSpots || 0,
        totalSpots: pt.totalSpots || totalBays,
        avgDurationMinutes: pt.avgDurationMinutes || 0
      };
    });
  }, [occupancyTrends?.data, totalBays]);

  // Compute chart SVG scaling
  const chartGeometry = useMemo(() => {
    if (!chartPoints.length) return null;

    let maxVal = 1;
    if (chartMetric === 'revenue') {
      maxVal = Math.max(...chartPoints.map((p) => p.revenue), 100);
    } else if (chartMetric === 'volume') {
      maxVal = Math.max(...chartPoints.map((p) => p.volume), 5);
    } else {
      maxVal = Math.max(...chartPoints.map((p) => p.occupancy), 100);
    }

    const width = 800;
    const height = 240;
    const padX = 40;
    const padY = 30;

    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const stepX = chartPoints.length > 1 ? innerW / (chartPoints.length - 1) : innerW / 2;

    const coords = chartPoints.map((p, idx) => {
      const val = chartMetric === 'revenue' ? p.revenue : chartMetric === 'volume' ? p.volume : p.occupancy;
      const x = padX + idx * stepX;
      const y = height - padY - (val / maxVal) * innerH;
      return { x, y, point: p, val };
    });

    // Build SVG path
    const linePath = coords.reduce((acc, c, idx) => {
      return idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`;
    }, '');

    const areaPath = coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x} ${height - padY} L ${coords[0].x} ${height - padY} Z`
      : '';

    return {
      width,
      height,
      padX,
      padY,
      innerH,
      maxVal,
      coords,
      linePath,
      areaPath
    };
  }, [chartPoints, chartMetric]);

  // ---------------------------------------------------------------------------
  // HOURLY DENSITY BARS (From Peak Hours API)
  // ---------------------------------------------------------------------------
  const hourlyBars = useMemo(() => {
    const list = peakHoursData?.hourlyDistribution || [];
    if (!list.length) return [];

    const maxCount = Math.max(...list.map((h) => h.bookingVolume), 10);
    return list.map((item) => {
      const vol = item.bookingVolume || 0;
      const heightPct = Math.min(100, Math.max(10, Math.round((vol / maxCount) * 100)));
      const isHigh = vol >= (maxCount * 0.75) && vol > 0;
      const isLow = vol <= (maxCount * 0.25);
      return {
        hour: item.hour,
        label: item.hourFormatted,
        volume: vol,
        heightPct,
        isHigh,
        isLow,
        utilPct: item.occupancyPercentage || 0,
        avgDurationMinutes: item.avgDurationMinutes || 0
      };
    });
  }, [peakHoursData]);

  // ---------------------------------------------------------------------------
  // EVIDENCE-BASED OPERATIONAL INSIGHTS (No Hallucinated Text)
  // ---------------------------------------------------------------------------
  const operationalInsights = useMemo(() => {
    const items = [];
    const totalB = kpis.bookings;

    if (totalB === 0) {
      items.push({
        id: 'no-bookings',
        type: 'info',
        title: 'Initial Facility Operations',
        metric: '0 reservations in selected window',
        reason: 'There are no driver bookings recorded during this period.',
        action: 'Ensure facility status is set to active and baseline parking slots are published for driver discovery.'
      });
      return items;
    }

    // 1. Peak Ingress Density
    if (kpis.peakVolume > 0 && kpis.busiestHour !== 'N/A') {
      items.push({
        id: 'peak-ingress',
        type: 'highlight',
        title: `Ingress Pressure Concentration at ${kpis.busiestHour}`,
        metric: `${kpis.peakVolume} bookings (${kpis.peakPct}% peak bay density)`,
        reason: 'Driver arrival density peaks sharply during this interval, requiring barrier gate fluidity.',
        action: 'Ensure entry barrier lanes and digital pass scanners operate without manual intervention 15 minutes prior.'
      });
    }

    // 2. Off-Peak Capacity Window
    const offPeakHours = hourlyBars.filter((b) => b.isLow && (b.hour >= 8 && b.hour <= 20));
    if (offPeakHours.length >= 3) {
      const startH = String(offPeakHours[0].hour).padStart(2, '0');
      const endH = String(offPeakHours[offPeakHours.length - 1].hour + 1).padStart(2, '0');
      items.push({
        id: 'off-peak-window',
        type: 'opportunity',
        title: `Daytime Underutilized Window (${startH}:00 – ${endH}:00)`,
        metric: `${offPeakHours.length} consecutive off-peak daylight hours`,
        reason: 'Facility maintains ample vacant capacity with low concurrent dwell during this window.',
        action: 'Consider configuring off-peak pricing discounts in the Dynamic Pricing tab to attract fleet or commuter parking.'
      });
    }

    // 3. Cancellation Health
    if (kpis.cancellationRate > 12) {
      items.push({
        id: 'cancellation-alert',
        type: 'alert',
        title: 'Elevated Cancellation Rate',
        metric: `${kpis.cancellationRate}% cancellation rate (${kpis.cancelled} cancelled)`,
        reason: 'High booking attrition reduces revenue certainty and causes phantom spot reservations.',
        action: 'Review cancellation rules and check if drivers are cancelling due to tight reservation time buffers.'
      });
    } else if (kpis.completed > 5) {
      items.push({
        id: 'turnover-healthy',
        type: 'positive',
        title: 'Strong Booking Completion Ratio',
        metric: `${kpis.completed} completed of ${kpis.bookings} bookings (${100 - kpis.cancellationRate}% completed)`,
        reason: 'Driver commitment is high and vehicle turnover conforms cleanly to expected reservation windows.',
        action: 'Maintain existing buffer times and barrier check-in protocols.'
      });
    }

    // 4. Overall Capacity Utilization
    if (kpis.utilization >= 75) {
      items.push({
        id: 'high-capacity',
        type: 'alert',
        title: 'Sustained High Capacity Utilization',
        metric: `${kpis.utilization}% average facility utilization`,
        reason: 'Occupancy is approaching the facility saturation ceiling during key operational hours.',
        action: 'Monitor overstay triage closely and consider activating surge pricing to balance arrival flow.'
      });
    }

    return items;
  }, [kpis, hourlyBars]);

  // ---------------------------------------------------------------------------
  // FLOOR LEVEL PERFORMANCE (From utilization byFloor API)
  // ---------------------------------------------------------------------------
  const floorStats = useMemo(() => {
    const list = utilizationData?.byFloor || [];
    if (!list.length) return [];

    return list.map((fl) => {
      const util = fl.utilizationPercentage || 0;
      let statusLabel = 'Balanced Demand';
      let badgeClass = 'available';
      if (util >= 75) {
        statusLabel = 'High Utilization';
        badgeClass = 'occupied';
      } else if (util < 35) {
        statusLabel = 'Underutilized Level';
        badgeClass = 'selected';
      }

      return {
        id: fl.floorId,
        name: fl.name || `Floor ${fl.floorNumber ?? 1}`,
        totalSpots: fl.totalSpots || 0,
        occupiedHours: fl.occupiedHours || 0,
        utilization: util,
        bookingsCount: fl.bookingsCount || 0,
        statusLabel,
        badgeClass
      };
    });
  }, [utilizationData?.byFloor]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* =====================================================================
          A. HEADER & DATE RANGE CONTROLS
          ===================================================================== */}
      <div className="analytics-header-section">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h2 className="analytics-title">Parking Performance</h2>
            <span className="status-tag available" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              {facilityName}
            </span>
          </div>
          <p className="analytics-subtitle">
            Understand utilization, revenue, and operational efficiency across real driver activity.
          </p>
        </div>

        {/* Date Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--ps-secondary-light)',
            padding: '3px',
            borderRadius: 'var(--ps-radius-md)',
            gap: '2px'
          }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSelectedRange(opt.id)}
                className={`btn btn-sm ${selectedRange === opt.id ? 'btn-primary' : ''}`}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.35rem 0.65rem',
                  border: 'none',
                  borderRadius: 'var(--ps-radius-sm)',
                  backgroundColor: selectedRange === opt.id ? 'var(--ps-primary-dark)' : 'transparent',
                  color: selectedRange === opt.id ? '#FFFFFF' : 'var(--ps-primary-dark)',
                  fontWeight: selectedRange === opt.id ? 700 : 500
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchAnalytics(true)}
            disabled={loading || refreshing}
            title="Refresh analytics metrics"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.75rem' }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            <span style={{ fontSize: '0.75rem' }}>Refresh</span>
          </button>
        </div>
      </div>

      {/* Custom Date Pickers Row (if Custom is chosen) */}
      {selectedRange === 'custom' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          backgroundColor: '#FFFFFF',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--ps-radius-md)',
          border: '1px solid var(--ps-secondary-light)'
        }}>
          <Calendar size={16} color="var(--ps-secondary-dark)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <label style={{ fontWeight: 600 }}>Start:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid var(--ps-secondary-light)',
                borderRadius: 'var(--ps-radius-sm)'
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <label style={{ fontWeight: 600 }}>End:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid var(--ps-secondary-light)',
                borderRadius: 'var(--ps-radius-sm)'
              }}
            />
          </div>
          <span className="metadata" style={{ fontSize: '0.75rem' }}>
            Selected window: {dateWindows.displayLabel}
          </span>
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
          B. KPI METRICS ROW
          ===================================================================== */}
      <div className="analytics-kpi-grid">
        {/* KPI 1: Revenue */}
        <div className="analytics-kpi-card">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="analytics-kpi-label">Revenue</span>
              <DollarSign size={16} color="var(--ps-secondary-dark)" />
            </div>
            <div className="analytics-kpi-value">
              {revenueRestricted
                ? 'Restricted'
                : `₹${kpis.revenue.toLocaleString('en-IN')}`}
            </div>
            <p className="metadata" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
              Confirmed & collected via payment gateway.
            </p>
          </div>
          <div>
            {revenueRestricted ? (
              <span className="status-tag blocked" style={{ fontSize: '0.6875rem' }}>
                Restricted to Manager/Admin
              </span>
            ) : kpis.revTrend ? (
              <div className={`analytics-kpi-trend ${kpis.revTrend.isPositive ? 'positive' : 'alert'}`}>
                {kpis.revTrend.isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                <span>{kpis.revTrend.label}</span>
              </div>
            ) : (
              <span className="metadata" style={{ fontSize: '0.6875rem' }}>
                Base rate: ₹{facility?.hourlyRate || 50}/hr
              </span>
            )}
          </div>
        </div>

        {/* KPI 2: Parking Utilization */}
        <div className="analytics-kpi-card">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="analytics-kpi-label">Parking Utilization</span>
              <Layers size={16} color="var(--ps-secondary-dark)" />
            </div>
            <div className="analytics-kpi-value">{kpis.utilization}%</div>
            <p className="metadata" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
              Occupied spot-hours / available spot-hours.
            </p>
          </div>
          <div>
            {kpis.utilTrend ? (
              <div className={`analytics-kpi-trend ${kpis.utilTrend.isPositive ? 'positive' : 'neutral'}`}>
                {kpis.utilTrend.isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                <span>{kpis.utilTrend.label}</span>
              </div>
            ) : (
              <span className="metadata" style={{ fontSize: '0.6875rem' }}>
                {Math.round(kpis.occupiedHours)}h occupied of {Math.round(kpis.totalCapacityHours)}h capacity
              </span>
            )}
          </div>
        </div>

        {/* KPI 3: Booking Volume */}
        <div className="analytics-kpi-card">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="analytics-kpi-label">Booking Volume</span>
              <CalendarCheck size={16} color="var(--ps-secondary-dark)" />
            </div>
            <div className="analytics-kpi-value">{kpis.bookings}</div>
            <p className="metadata" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
              {kpis.completed} completed · {kpis.confirmed} active
            </p>
          </div>
          <div>
            {kpis.bookTrend ? (
              <div className={`analytics-kpi-trend ${kpis.bookTrend.isPositive ? 'positive' : 'neutral'}`}>
                {kpis.bookTrend.isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                <span>{kpis.bookTrend.label}</span>
              </div>
            ) : (
              <span className="metadata" style={{ fontSize: '0.6875rem' }}>
                {kpis.cancelled > 0 ? `${kpis.cancelled} cancellations (${kpis.cancellationRate}%)` : '0 cancellations'}
              </span>
            )}
          </div>
        </div>

        {/* KPI 4: Peak Occupancy */}
        <div className="analytics-kpi-card">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span className="analytics-kpi-label">Peak Occupancy</span>
              <Clock size={16} color="var(--ps-secondary-dark)" />
            </div>
            <div className="analytics-kpi-value">
              {kpis.busiestHour !== 'N/A' ? kpis.busiestHour : '—'}
            </div>
            <p className="metadata" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
              Highest observed booking density window.
            </p>
          </div>
          <div>
            <span className={`status-tag ${kpis.peakPct >= 80 ? 'occupied' : 'available'}`} style={{ fontSize: '0.6875rem' }}>
              {kpis.peakVolume > 0 ? `${kpis.peakVolume} bookings (${kpis.peakPct}% cap)` : 'Fluid turnover'}
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          C. MAIN DOMINANT VISUALIZATION (Switchable Interactive Chart)
          ===================================================================== */}
      <div className="analytics-chart-card">
        <div className="analytics-chart-header">
          <div>
            <span className="eyebrow" style={{ color: 'var(--ps-secondary-dark)' }}>OPERATIONAL TREND VISUALIZATION</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.2rem 0 0', color: 'var(--ps-primary-dark)' }}>
              {chartMetric === 'revenue' && 'Revenue Over Time'}
              {chartMetric === 'volume' && 'Reservation Volume Over Time'}
              {chartMetric === 'occupancy' && 'Estimated Facility Occupancy (%) Over Time'}
            </h3>
            <p className="metadata" style={{ fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
              Aggregated across {dateWindows.displayLabel}
            </p>
          </div>

          {/* Metric Switcher Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              display: 'flex',
              backgroundColor: 'var(--ps-primary-light)',
              padding: '2px',
              borderRadius: 'var(--ps-radius-sm)',
              border: '1px solid var(--ps-secondary-light)'
            }}>
              <button
                className="btn btn-sm"
                onClick={() => setChartMetric('revenue')}
                style={{
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: chartMetric === 'revenue' ? 700 : 500,
                  backgroundColor: chartMetric === 'revenue' ? 'var(--ps-primary-dark)' : 'transparent',
                  color: chartMetric === 'revenue' ? '#FFFFFF' : 'var(--ps-primary-dark)',
                  borderRadius: 'var(--ps-radius-sm)'
                }}
              >
                Revenue
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setChartMetric('volume')}
                style={{
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: chartMetric === 'volume' ? 700 : 500,
                  backgroundColor: chartMetric === 'volume' ? 'var(--ps-primary-dark)' : 'transparent',
                  color: chartMetric === 'volume' ? '#FFFFFF' : 'var(--ps-primary-dark)',
                  borderRadius: 'var(--ps-radius-sm)'
                }}
              >
                Bookings
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setChartMetric('occupancy')}
                style={{
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: chartMetric === 'occupancy' ? 700 : 500,
                  backgroundColor: chartMetric === 'occupancy' ? 'var(--ps-primary-dark)' : 'transparent',
                  color: chartMetric === 'occupancy' ? '#FFFFFF' : 'var(--ps-primary-dark)',
                  borderRadius: 'var(--ps-radius-sm)'
                }}
              >
                Occupancy %
              </button>
            </div>
          </div>
        </div>

        {/* SVG Interactive Chart or Honest Empty State */}
        {loading ? (
          <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ps-secondary-dark)', fontSize: '0.875rem' }}>
              <RefreshCw size={16} className="spin" /> Loading operational telemetry...
            </div>
          </div>
        ) : chartPoints.length === 0 ? (
          <div style={{
            height: '240px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--ps-primary-light)',
            borderRadius: 'var(--ps-radius-md)',
            border: '1px dashed var(--ps-secondary-light)',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <BarChart3 size={32} color="var(--ps-secondary-dark)" style={{ marginBottom: '0.75rem' }} />
            <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem' }}>No Activity Points Recorded</h4>
            <p className="metadata" style={{ fontSize: '0.8125rem', maxWidth: '400px', margin: 0 }}>
              There are no confirmed bookings in this date window. Try selecting a wider range (e.g. 30 Days) or check back as reservations are placed.
            </p>
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
              style={{ width: '100%', height: 'auto', display: 'block', minWidth: '600px' }}
            >
              <defs>
                <linearGradient id="analyticsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B2A240" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#B2A240" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = chartGeometry.padY + ratio * chartGeometry.innerH;
                const val = Math.round(chartGeometry.maxVal * (1 - ratio));
                return (
                  <g key={ratio}>
                    <line
                      x1={chartGeometry.padX}
                      y1={y}
                      x2={chartGeometry.width - chartGeometry.padX}
                      y2={y}
                      stroke="var(--ps-secondary-light)"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={chartGeometry.padX - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="var(--ps-secondary-dark)"
                      fontFamily="var(--ps-font-mono)"
                    >
                      {chartMetric === 'revenue' ? `₹${val}` : chartMetric === 'occupancy' ? `${val}%` : val}
                    </text>
                  </g>
                );
              })}

              {/* Area fill */}
              {chartGeometry.areaPath && (
                <path d={chartGeometry.areaPath} fill="url(#analyticsAreaGrad)" />
              )}

              {/* Stroke line */}
              {chartGeometry.linePath && (
                <path
                  d={chartGeometry.linePath}
                  fill="none"
                  stroke="var(--ps-primary-dark)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points */}
              {chartGeometry.coords.map((c, i) => {
                const isHovered = hoveredPoint?.bucket === c.point.bucket;
                return (
                  <g key={i}>
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={isHovered ? 6 : 3.5}
                      fill={isHovered ? 'var(--ps-accent-light)' : 'var(--ps-primary-dark)'}
                      stroke={isHovered ? 'var(--ps-primary-dark)' : '#FFFFFF'}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                      onMouseEnter={() => setHoveredPoint(c.point)}
                    />
                    {/* X-axis label (show subset to avoid clutter) */}
                    {(chartGeometry.coords.length <= 14 || i % Math.ceil(chartGeometry.coords.length / 10) === 0) && (
                      <text
                        x={c.x}
                        y={chartGeometry.height - 8}
                        textAnchor="middle"
                        fontSize="10"
                        fill="var(--ps-secondary-dark)"
                        fontFamily="var(--ps-font-mono)"
                      >
                        {c.point.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Box */}
            {hoveredPoint && (
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                backgroundColor: 'var(--ps-primary-dark)',
                color: '#FFFFFF',
                borderRadius: 'var(--ps-radius-sm)',
                padding: '0.65rem 0.85rem',
                fontSize: '0.75rem',
                boxShadow: 'var(--ps-shadow-card)',
                pointerEvents: 'none',
                minWidth: '180px'
              }}>
                <div style={{ fontWeight: 700, color: 'var(--ps-accent-light)', marginBottom: '0.25rem' }}>
                  {hoveredPoint.bucket}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>Revenue:</span>
                  <strong>₹{hoveredPoint.revenue.toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>Bookings:</span>
                  <strong>{hoveredPoint.volume}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>Occupancy:</span>
                  <strong>{hoveredPoint.occupancy}%</strong>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =====================================================================
          D. UTILIZATION & CAPACITY HOURLY ANALYSIS
          ===================================================================== */}
      <div className="analytics-chart-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <span className="eyebrow">DIURNAL PATTERNS</span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0.2rem 0 0', color: 'var(--ps-primary-dark)' }}>
              Hourly Activity & Ingress Density
            </h3>
            <p className="metadata" style={{ fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
              Distribution of driver arrival reservations across the 24 hours of the day.
            </p>
          </div>

          {/* Legend */}
          <div className="analytics-chart-legend">
            <div className="analytics-legend-item">
              <span className="analytics-legend-dot" style={{ backgroundColor: '#B2A240', border: '1px solid #F3F456' }} />
              <span>High Volume</span>
            </div>
            <div className="analytics-legend-item">
              <span className="analytics-legend-dot" style={{ backgroundColor: 'var(--ps-primary-dark)' }} />
              <span>Standard Activity</span>
            </div>
            <div className="analytics-legend-item">
              <span className="analytics-legend-dot" style={{ backgroundColor: 'var(--ps-secondary-light)' }} />
              <span>Quiet / Off-Peak</span>
            </div>
          </div>
        </div>

        {/* 24-Hour Timeline Bar Strip */}
        {hourlyBars.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }} className="metadata">
            No hourly distribution records for the selected period.
          </div>
        ) : (
          <div className="analytics-timeline-bars" style={{ overflowX: 'auto', gap: '0.4rem' }}>
            {hourlyBars.map((hb) => {
              const bgClass = hb.isHigh ? 'high-demand' : hb.isLow ? 'low-demand' : 'normal-demand';
              return (
                <div
                  key={hb.hour}
                  className="analytics-bar-col"
                  style={{ minWidth: '28px' }}
                  title={`${hb.label}: ${hb.volume} bookings (${hb.utilPct}% capacity). Avg dwell: ${hb.avgDurationMinutes} mins`}
                >
                  <span className="analytics-bar-count" style={{ fontSize: '0.625rem' }}>
                    {hb.volume > 0 ? hb.volume : ''}
                  </span>
                  <div
                    className={`analytics-bar-fill ${bgClass}`}
                    style={{ height: `${hb.heightPct}%` }}
                  />
                  <span className="analytics-bar-time" style={{ fontSize: '0.625rem' }}>
                    {hb.hour % 3 === 0 ? hb.label : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <p className="metadata" style={{ margin: 0, fontSize: '0.75rem' }}>
            Shows actual driver reservations by ingress hour. Peak periods indicate barrier gate concentration.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem' }}>
            <span className="metadata">Busiest Hour: <strong>{kpis.busiestHour}</strong></span>
            <span className="metadata">Peak Count: <strong>{kpis.peakVolume} bookings</strong></span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          E. OPERATIONAL INSIGHTS: "What needs your attention?"
          ===================================================================== */}
      <div>
        <div style={{ marginBottom: '0.85rem' }}>
          <span className="eyebrow">ACTIONABLE SIGNALS</span>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.15rem 0 0', color: 'var(--ps-primary-dark)' }}>
            What needs your attention?
          </h3>
          <p className="metadata" style={{ fontSize: '0.75rem', margin: '0.15rem 0 0' }}>
            Concise, evidence-based observations computed from current operational telemetry.
          </p>
        </div>

        <div className="analytics-insights-grid">
          {operationalInsights.map((ins) => (
            <div
              key={ins.id}
              className={`analytics-insight-card ${ins.type === 'highlight' ? 'highlight' : ''}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow" style={{
                  color: ins.type === 'highlight' ? 'var(--ps-accent-dark)' : ins.type === 'alert' ? 'var(--ps-state-occupied)' : 'var(--ps-primary-dark)',
                  margin: 0
                }}>
                  {ins.metric}
                </span>
                {ins.type === 'highlight' && <TrendingUp size={14} color="var(--ps-accent-dark)" />}
                {ins.type === 'alert' && <AlertTriangle size={14} color="var(--ps-state-occupied)" />}
                {ins.type === 'positive' && <CheckCircle2 size={14} color="var(--ps-state-available)" />}
                {ins.type === 'opportunity' && <Clock size={14} color="var(--ps-secondary-dark)" />}
              </div>

              <div className="analytics-insight-title">{ins.title}</div>
              <p className="analytics-insight-desc" style={{ marginBottom: '0.5rem' }}>
                {ins.reason}
              </p>

              <div style={{
                backgroundColor: 'var(--ps-primary-light)',
                padding: '0.5rem 0.65rem',
                borderRadius: 'var(--ps-radius-sm)',
                fontSize: '0.75rem',
                color: 'var(--ps-primary-dark)',
                borderLeft: '2px solid var(--ps-accent-dark)'
              }}>
                <strong>Suggested Action:</strong> {ins.action}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* =====================================================================
          F. FACILITY LEVEL & SPOT PERFORMANCE BREAKDOWN
          ===================================================================== */}
      {floorStats.length > 0 && (
        <div className="analytics-facility-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <span className="eyebrow">CAPACITY ALLOCATION</span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.15rem 0 0', color: 'var(--ps-primary-dark)' }}>
                Level Utilization & Space Distribution
              </h3>
            </div>
            <span className="metadata" style={{ fontSize: '0.8125rem' }}>
              Scoped to {facilityName}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {floorStats.map((flItem) => (
              <div key={flItem.id} className="facility-rank-item">
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)' }}>
                    {flItem.name}
                  </div>
                  <div className="metadata" style={{ fontSize: '0.75rem' }}>
                    {flItem.totalSpots} configured spaces · {flItem.bookingsCount} reservations
                  </div>
                </div>

                <div>
                  <div className="facility-rank-meter">
                    <div
                      className="facility-rank-meter-fill"
                      style={{
                        width: `${flItem.utilization}%`,
                        backgroundColor: flItem.utilization >= 75
                          ? 'var(--ps-state-occupied)'
                          : flItem.utilization < 35
                          ? 'var(--ps-accent-dark)'
                          : 'var(--ps-primary-dark)'
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--ps-secondary-dark)', marginTop: '4px' }}>
                    <span>{Math.round(flItem.occupiedHours)} occupied spot-hours</span>
                    <span>{flItem.utilization}% level rate</span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ps-primary-dark)' }}>
                    {flItem.utilization}%
                  </span>
                  <span className="metadata" style={{ fontSize: '0.75rem', display: 'block' }}>utilized</span>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span
                    className={`status-tag ${flItem.badgeClass}`}
                    style={{ fontSize: '0.6875rem', whiteSpace: 'nowrap' }}
                  >
                    {flItem.statusLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
