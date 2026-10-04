import React, { useState, useEffect } from 'react';
import { ParkingMap } from './ParkingMap';
import { api } from '../services/api';
import {
  LayoutDashboard,
  Layers,
  SlidersHorizontal,
  Activity,
  FileText,
  Building2,
  DollarSign,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  BrainCircuit,
  Wrench,
  ShieldAlert,
  ChevronRight
} from 'lucide-react';
import { Logo } from './shared/Logo';

export function OperatorExperience({
  facilities,
  events,
  auditLogs,
  onUpdateSpotStatus
}) {
  const [operatorTab, setOperatorTab] = useState('dashboard'); // dashboard | occupancy | spots | events | audit | pricing | facility | settings
  const [selectedFacility, setSelectedFacility] = useState(facilities[0]);
  const [activeFloor, setActiveFloor] = useState('Floor 1');
  const [selectedSpotForAction, setSelectedSpotForAction] = useState(null);
  const [actionConfirmDialog, setActionConfirmDialog] = useState(null);

  // Recommendations state
  const [recommendations, setRecommendations] = useState([
    {
      id: 'REC-301',
      type: 'PRICING_SURGE',
      title: 'Peak Surge Recommendation: 11:00 – 14:00',
      description: 'Demand forecast projects 88% occupancy tomorrow between 11:00 and 14:00. Algorithmic pricing recommends a +25% peak rate.',
      currentRate: 40,
      proposedRate: 50,
      confidence: '91% (Gradient Boosting ML)',
      status: 'PENDING'
    }
  ]);

  // Progressive API sync for recommendations
  useEffect(() => {
    let active = true;
    async function fetchRecs() {
      if (!selectedFacility?.id || !/^[a-f\d]{24}$/i.test(selectedFacility.id)) return;
      try {
        const liveRecs = await api.getRecommendations(selectedFacility.id);
        if (active && liveRecs && liveRecs.length > 0) {
          const formatted = liveRecs.map((r) => ({
            id: r._id,
            type: r.type,
            title: `${r.type.replace('_', ' ')}: ${r.reason || 'Demand forecast recommendation'}`,
            description: r.proposedAction?.summary || `Algorithmic model proposed multiplier: ${r.proposedAction?.multiplier || '1.25x'}`,
            currentRate: selectedFacility.hourlyRate || 40,
            proposedRate: Math.round((selectedFacility.hourlyRate || 40) * (r.proposedAction?.multiplier || 1.25)),
            confidence: r.confidence ? `${Math.round(r.confidence * 100)}% (Gradient Boosting ML)` : '89% (ML Forecast)',
            status: r.status
          }));
          setRecommendations(formatted);
        }
      } catch {
        // Fallback to initial recommendation
      }
    }
    fetchRecs();
    return () => { active = false; };
  }, [selectedFacility?.id]);

  const handleAcceptRecommendation = async (recId) => {
    setRecommendations((prev) => prev.map((r) => r.id === recId ? { ...r, status: 'ACCEPTED' } : r));
    if (/^[a-f\d]{24}$/i.test(recId)) {
      try {
        await api.acceptRecommendation(recId);
      } catch (e) {
        console.warn('Accept recommendation API notice:', e.message);
      }
    }
  };

  const handleRejectRecommendation = async (recId) => {
    setRecommendations((prev) => prev.map((r) => r.id === recId ? { ...r, status: 'REJECTED' } : r));
    if (/^[a-f\d]{24}$/i.test(recId)) {
      try {
        await api.rejectRecommendation(recId);
      } catch (e) {
        console.warn('Reject recommendation API notice:', e.message);
      }
    }
  };

  const currentSpots = selectedFacility.spots || [];
  const totalBays = currentSpots.length;
  const occupiedBays = currentSpots.filter((s) => s.status === 'OCCUPIED').length;
  const reservedBays = currentSpots.filter((s) => s.status === 'RESERVED').length;
  const availableBays = currentSpots.filter((s) => s.status === 'AVAILABLE').length;
  const maintenanceBays = currentSpots.filter((s) => s.status === 'MAINTENANCE').length;
  const blockedBays = currentSpots.filter((s) => s.status === 'BLOCKED').length;

  const occupancyPercent = totalBays > 0 ? Math.round(((occupiedBays + reservedBays) / totalBays) * 100) : 68;

  const handleApplySpotAction = (status) => {
    if (selectedSpotForAction) {
      onUpdateSpotStatus && onUpdateSpotStatus(selectedFacility.id, activeFloor, selectedSpotForAction.id, status);
      setSelectedSpotForAction(null);
      setActionConfirmDialog(null);
    }
  };

  return (
    <div className="container">
      {/* Sub-navigation for B2B Operator Workspace */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--ps-secondary-light)',
        paddingBottom: '0.85rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Logo variant="mark" size={24} />
          <strong style={{ fontSize: '1rem' }}>B2B Operator Portal</strong>
          <span className="metadata">· {selectedFacility.name}</span>
        </div>

        {/* Tab Pills */}
        <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', maxWidth: '100%' }}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
            { id: 'occupancy', label: 'Occupancy', icon: <Layers size={14} /> },
            { id: 'spots', label: 'Spot Controls', icon: <SlidersHorizontal size={14} /> },
            { id: 'events', label: 'Events', icon: <Activity size={14} /> },
            { id: 'audit', label: 'Audit Logs', icon: <FileText size={14} /> },
            { id: 'pricing', label: 'Pricing & ML', icon: <DollarSign size={14} /> },
            { id: 'settings', label: 'Settings', icon: <Settings size={14} /> }
          ].map((tab) => (
            <button
              key={tab.id}
              className={`btn btn-sm ${operatorTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setOperatorTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* =========================================================================
          SCREEN 12: OPERATOR DASHBOARD
          ========================================================================= */}
      {operatorTab === 'dashboard' && (
        <div>
          {/* Top KPI Metrics Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <span className="metadata">Total Capacity</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{totalBays} Bays</div>
              <div className="metadata">Multi-level Indoor</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--ps-state-available)' }}>
              <span className="metadata">Available Bays</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ps-state-available)' }}>{availableBays}</div>
              <div className="metadata">Ready for ingress</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--ps-state-occupied)' }}>
              <span className="metadata">Active Occupied</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ps-state-occupied)' }}>{occupiedBays}</div>
              <div className="metadata">Actively parked vehicles</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--ps-state-reserved)' }}>
              <span className="metadata">Pending Reservations</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ps-state-reserved)' }}>{reservedBays}</div>
              <div className="metadata">En-route drivers</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--ps-accent-dark)' }}>
              <span className="metadata">Occupancy Rate</span>
              <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{occupancyPercent}%</div>
              <div className="metadata">Calculated utilization</div>
            </div>
          </div>

          {/* Main Visual: LIVE PARKING LAYOUT */}
          <div className="content-grid content-grid-split">
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 className="section-title">Live Facility Layout</h2>
                <span className="metadata">Click any bay to trigger operator overrides</span>
              </div>
              <ParkingMap
                floors={['Floor 1', 'Floor 2', 'Floor 3']}
                activeFloor={activeFloor}
                onSelectFloor={setActiveFloor}
                spots={currentSpots}
                selectedSpotId={selectedSpotForAction?.id}
                onSelectSpot={(spot) => setSelectedSpotForAction(spot)}
                isOperator={true}
              />
            </div>

            {/* Operator Quick Action Panel */}
            <div>
              {selectedSpotForAction ? (
                <div className="card" style={{ border: '2px solid var(--ps-primary-dark)' }}>
                  <span className="eyebrow">SPOT OVERRIDE CONTROL</span>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
                    Space {selectedSpotForAction.number}
                  </h3>
                  <p className="metadata" style={{ marginBottom: '1.25rem' }}>
                    {activeFloor} · Current State: <strong style={{ textTransform: 'uppercase' }}>{selectedSpotForAction.status}</strong>
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySpotAction('AVAILABLE')}
                    >
                      <CheckCircle size={14} color="var(--ps-state-available)" /> Mark Available (Vacate)
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySpotAction('OCCUPIED')}
                    >
                      <Car size={14} color="var(--ps-state-occupied)" /> Mark Occupied (Vehicle Parked)
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySpotAction('MAINTENANCE')}
                    >
                      <Wrench size={14} /> Place Under Maintenance
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleApplySpotAction('BLOCKED')}
                    >
                      <ShieldAlert size={14} /> Block Space (Staff / VIP)
                    </button>
                  </div>

                  <button
                    className="btn btn-outline btn-sm btn-block"
                    onClick={() => setSelectedSpotForAction(null)}
                  >
                    Cancel Selection
                  </button>
                </div>
              ) : (
                <div className="card">
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Operational Systems</h3>
                  <p className="metadata" style={{ marginBottom: '1rem' }}>
                    Software-driven occupancy tracking, booking lifecycles, and event logging active.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'var(--ps-primary-light)', borderRadius: 'var(--ps-radius-sm)' }}>
                      <span>Booking Lifecycle Worker</span>
                      <strong style={{ color: 'var(--ps-state-available)' }}>ACTIVE (60s)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'var(--ps-primary-light)', borderRadius: 'var(--ps-radius-sm)' }}>
                      <span>Active Overstays</span>
                      <strong>0 Flagged</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'var(--ps-primary-light)', borderRadius: 'var(--ps-radius-sm)' }}>
                      <span>Operational Ingress Stream</span>
                      <strong>System Logging</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 13: LIVE OCCUPANCY & BREAKDOWN
          ========================================================================= */}
      {operatorTab === 'occupancy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 className="section-title">Floor-by-Floor Live Occupancy</h2>
            <p className="metadata">Continuous real-time operational data across multi-level infrastructure</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {[
              { floor: 'Floor 1 (Ground)', total: 24, occupied: 17, reserved: 2, percent: 79, evSpots: 2 },
              { floor: 'Floor 2 (Mezzanine)', total: 24, occupied: 14, reserved: 1, percent: 62, evSpots: 4 },
              { floor: 'Floor 3 (Rooftop Deck)', total: 24, occupied: 20, reserved: 2, percent: 91, evSpots: 0 }
            ].map((f) => (
              <div key={f.floor} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.05rem' }}>{f.floor}</h3>
                  <span className={`status-tag ${f.percent > 85 ? 'occupied' : 'available'}`}>
                    {f.percent}% Full
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ height: '8px', backgroundColor: 'var(--ps-secondary-light)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                  <div style={{
                    width: `${f.percent}%`,
                    height: '100%',
                    backgroundColor: f.percent > 85 ? 'var(--ps-state-occupied)' : 'var(--ps-primary-dark)'
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span className="metadata">Occupied / Reserved</span>
                  <strong>{f.occupied + f.reserved} / {f.total} bays</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginTop: '0.35rem' }}>
                  <span className="metadata">EV Chargers</span>
                  <span>{f.evSpots} dedicated</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 14: PARKING SPOT MANAGEMENT TABLE
          ========================================================================= */}
      {operatorTab === 'spots' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 className="section-title">Parking Bay Registry</h2>
              <p className="metadata">{currentSpots.length} configured bays on {activeFloor}</p>
            </div>
            <div className="floor-pill-group">
              {['Floor 1', 'Floor 2', 'Floor 3'].map((fl) => (
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

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bay ID</th>
                  <th>Floor</th>
                  <th>Classification</th>
                  <th>State</th>
                  <th>Standard Rate</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentSpots.map((spot) => (
                  <tr key={spot.id}>
                    <td><strong style={{ fontFamily: 'var(--ps-font-mono)' }}>{spot.number}</strong></td>
                    <td>{spot.floor}</td>
                    <td><span className="metadata">{spot.type}</span></td>
                    <td>
                      <span className={`status-tag ${spot.status.toLowerCase()}`}>
                        {spot.status}
                      </span>
                    </td>
                    <td>₹{spot.rate}/hr</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {spot.status !== 'AVAILABLE' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              onUpdateSpotStatus && onUpdateSpotStatus(selectedFacility.id, activeFloor, spot.id, 'AVAILABLE');
                            }}
                          >
                            Set Available
                          </button>
                        )}
                        {spot.status !== 'MAINTENANCE' && (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => {
                              onUpdateSpotStatus && onUpdateSpotStatus(selectedFacility.id, activeFloor, spot.id, 'MAINTENANCE');
                            }}
                          >
                            Maintenance
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 15: OPERATIONAL EVENTS STREAM
          ========================================================================= */}
      {operatorTab === 'events' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 className="section-title">Operational Events & Activity Feed</h2>
            <p className="metadata">Real-time stream of software bookings, departures, and operator state changes</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {events.map((evt) => (
              <div key={evt.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
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
                      {evt.type.replace('_', ' ')} — Bay {evt.spotNumber}
                    </div>
                    <div className="metadata">Source: {evt.source} · {evt.floor}</div>
                  </div>
                </div>
                <div className="metadata" style={{ fontFamily: 'var(--ps-font-mono)' }}>
                  {evt.timestamp}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 16: AUDIT LOGS
          ========================================================================= */}
      {operatorTab === 'audit' && (
        <div>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 className="section-title">Enterprise Audit Trail</h2>
            <p className="metadata">Immutable record of transactional, pricing, and administrative events</p>
          </div>

          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor / User</th>
                  <th>Source</th>
                  <th>Result</th>
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
        </div>
      )}

      {/* =========================================================================
          SCREEN 18: DYNAMIC PRICING & ML FORECASTING
          ========================================================================= */}
      {operatorTab === 'pricing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h2 className="section-title">Dynamic Optimization & Machine Learning Engine</h2>
            <p className="metadata">Phase 3.2 Gradient Boosting ML demand forecasts & algorithmic pricing recommendations</p>
          </div>

          {/* AI Recommendation Card */}
          {recommendations.map((rec) => (
            <div key={rec.id} className="card" style={{ border: '2px solid var(--ps-accent-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BrainCircuit size={20} color="var(--ps-accent-dark)" />
                  <span className="eyebrow" style={{ color: 'var(--ps-accent-dark)' }}>ALGORITHMIC PRICING SIGNAL</span>
                </div>
                <span className="status-tag selected">{rec.status}</span>
              </div>

              <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>{rec.title}</h3>
              <p className="metadata" style={{ marginBottom: '1.25rem' }}>{rec.description}</p>

              <div style={{ display: 'flex', gap: '2rem', padding: '1rem 0', borderTop: '1px solid var(--ps-secondary-light)', borderBottom: '1px solid var(--ps-secondary-light)', marginBottom: '1.25rem' }}>
                <div>
                  <div className="metadata">Current Rate</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>₹{rec.currentRate}/hr</div>
                </div>
                <div>
                  <div className="metadata">Proposed Rate</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ps-primary-dark)' }}>₹{rec.proposedRate}/hr</div>
                </div>
                <div>
                  <div className="metadata">Model Confidence</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ps-state-available)' }}>{rec.confidence}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  className="btn btn-accent"
                  onClick={() => handleAcceptRecommendation(rec.id)}
                  disabled={rec.status === 'ACCEPTED'}
                >
                  {rec.status === 'ACCEPTED' ? 'Rule Activated' : 'Accept & Apply Rule'}
                </button>
                {rec.status !== 'ACCEPTED' && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleRejectRecommendation(rec.id)}
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* =========================================================================
          SCREEN 19: SETTINGS & RBAC
          ========================================================================= */}
      {operatorTab === 'settings' && (
        <div style={{ maxWidth: '640px' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 className="section-title">Facility Organization & Access Controls</h2>
            <p className="metadata">Tenant parameters and operational boundaries</p>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Organization Name</label>
              <input type="text" className="form-input" defaultValue="Metro Infrastructure Operations Ltd" readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Facility Identifier</label>
              <input type="text" className="form-input" defaultValue="fac-metro-central-01" readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Forecasting Engine Mode</label>
              <input type="text" className="form-input" defaultValue="auto (Phase 3.2 Gradient Boosting ML with fallback)" readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Assigned Role</label>
              <input type="text" className="form-input" defaultValue="ADMIN (Full Tenant Privileges)" readOnly />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
