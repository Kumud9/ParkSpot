import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DriverExperience } from './components/DriverExperience';
import { OperatorExperience } from './components/OperatorExperience';
import { Logo } from './components/shared/Logo';
import { FullScreenLoader } from './components/shared/Loading';
import { Footer } from './components/shared/Footer/Footer';
import { AuthModal } from './components/shared/AuthModal/AuthModal';
import {
  INITIAL_FACILITIES,
  INITIAL_BOOKINGS,
  INITIAL_EVENTS,
  INITIAL_AUDIT_LOGS,
  generateFloorSpots
} from './data/mockData';
import { api, authStorage } from './services/api';
import './styles.css';

function App() {
  // Mode: 'driver' | 'operator'
  const [currentMode, setCurrentMode] = useState('driver');
  const [driverView, setDriverView] = useState('home'); // home | search | facility | date-time | review | payment | confirmed | bookings

  // Backend Connectivity & Auth State
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [activeUser, setActiveUser] = useState(null);
  const [isAppInitializing, setIsAppInitializing] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Core application state initialized with robust mock data
  const [facilities, setFacilities] = useState(() => {
    return INITIAL_FACILITIES.map((fac) => ({
      ...fac,
      spots: generateFloorSpots(fac.id, 'Floor 1')
    }));
  });

  const [bookings, setBookings] = useState(INITIAL_BOOKINGS);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);

  // Progressive API Synchronization on Mount
  useEffect(() => {
    let isMounted = true;

    async function syncWithBackend() {
      try {
        const isHealthy = await api.checkHealth();
        if (!isMounted) return;
        setIsLiveConnected(isHealthy);

        if (!isHealthy) return;

        // Auto-authenticate default sessions for local demo & full API access
        try {
          const driverAuth = await api.login('user@parkspot.test', 'Pass@12345');
          if (driverAuth?.token) {
            authStorage.setDriverToken(driverAuth.token);
            setActiveUser(driverAuth.user);
          }
        } catch (e) {
          console.info('[ParkSpot] Driver auto-login demo skipped:', e.message);
        }

        try {
          const operatorAuth = await api.login('admin@urbanpark.test', 'Pass@12345');
          if (operatorAuth?.token) {
            authStorage.setOperatorToken(operatorAuth.token);
          }
        } catch (e) {
          console.info('[ParkSpot] Operator auto-login demo skipped:', e.message);
        }

        // Fetch live facilities
        try {
          const liveFacilities = await api.getFacilities();
          if (isMounted && liveFacilities && liveFacilities.length > 0) {
            // Enrich with spots from backend or generate floor spots if slots array is sparse
            const enriched = await Promise.all(
              liveFacilities.map(async (fac) => {
                if (fac.spots && fac.spots.length > 0) {
                  return fac;
                }
                try {
                  const detailed = await api.getFacility(fac.id);
                  if (detailed && detailed.spots && detailed.spots.length > 0) {
                    return detailed;
                  }
                } catch {
                  // Fallback to generated layout for this facility
                }
                return {
                  ...fac,
                  spots: generateFloorSpots(fac.id, 'Floor 1')
                };
              })
            );
            if (isMounted) setFacilities(enriched);
          }
        } catch (e) {
          console.info('[ParkSpot] Live facilities sync skipped:', e.message);
        }

        // Fetch live bookings
        try {
          const liveBookings = await api.getBookings();
          if (isMounted && liveBookings && liveBookings.length > 0) {
            const formatted = liveBookings.map((b) => ({
              id: b.id || b._id,
              facilityName: b.lot?.name || b.lotId?.name || 'Central Business District Parking',
              facilityAddress: b.lot?.address || b.lotId?.address || '14 Connaught Place',
              floor: b.slot?.level || b.slotId?.level || 'Floor 1',
              spotNumber: b.slot?.number || b.slotId?.number || 'A1',
              startTime: new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              endTime: new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              startDateTime: b.startTime,
              endDateTime: b.endTime,
              duration: `${Math.round((new Date(b.endTime) - new Date(b.startTime)) / 3600000)} hours`,
              status: b.status,
              amount: b.totalAmount || 120,
              qrCode: `PARK-${b.id || b._id}-CONFIRMED`,
              verificationCode: `PS-PASS-${String(b.id || b._id).slice(-8).toUpperCase()}-${b.slot?.number || b.slotId?.number || 'A1'}`,
              vehiclePlate: b.vehiclePlate || 'DL 01 AB 4920'
            }));
            // Pure live data: do not mix mock bookings into live backend mode
            setBookings(formatted);
          }
        } catch (e) {
          console.info('[ParkSpot] Live bookings sync skipped:', e.message);
        }

        // Fetch live audit logs for operator view
        try {
          const liveLogs = await api.getAuditLogs({ limit: 20 });
          if (isMounted && liveLogs && liveLogs.length > 0) {
            const formattedLogs = liveLogs.map((log) => ({
              id: log._id || `AUD-${Math.random()}`,
              timestamp: new Date(log.createdAt).toISOString().replace('T', ' ').slice(0, 19),
              action: log.action,
              entity: log.entityType ? `${log.entityType} #${log.entityId}` : `Entity #${log.entityId}`,
              user: log.actorEmail || 'system',
              source: log.source || 'Operational Activity',
              status: 'SUCCESS'
            }));
            setAuditLogs(formattedLogs);
          }
        } catch (e) {
          console.info('[ParkSpot] Live audit logs sync skipped:', e.message);
        }
      } catch (err) {
        if (isMounted) setIsLiveConnected(false);
      } finally {
        if (isMounted) {
          setTimeout(() => setIsAppInitializing(false), 450);
        }
      }
    }

    syncWithBackend();

    return () => {
      isMounted = false;
    };
  }, []);

  // Driver creates new reservation
  const handleAddBooking = useCallback(async (newBooking) => {
    // 1. Update Local State
    setBookings((prev) => [newBooking, ...prev.filter((b) => b.id !== newBooking.id)]);

    setFacilities((prev) =>
      prev.map((f) => {
        if (f.name === newBooking.facilityName || f.id === newBooking.facilityId) {
          const updatedSpots = (f.spots || []).map((s) =>
            s.number === newBooking.spotNumber || s.id === newBooking.spotId
              ? { ...s, status: 'RESERVED' }
              : s
          );
          return {
            ...f,
            availableSpots: Math.max(0, f.availableSpots - 1),
            reservedSpots: (f.reservedSpots || 0) + 1,
            spots: updatedSpots
          };
        }
        return f;
      })
    );

    // 2. Append operational event & audit log
    const nowStr = new Date().toLocaleTimeString();
    setEvents((prev) => [
      {
        id: `EVT-${Date.now()}`,
        timestamp: `Just now (${nowStr})`,
        type: 'SPOT_RESERVED',
        spotNumber: newBooking.spotNumber,
        floor: newBooking.floor,
        source: 'Driver Mobile App',
        vehicleDetected: false
      },
      ...prev
    ]);

    setAuditLogs((prev) => [
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        action: 'BOOKING_CONFIRMED',
        entity: `Booking #${newBooking.id}`,
        user: activeUser?.email || 'driver@parkspot.test',
        source: 'Razorpay Payment Gateway',
        status: 'SUCCESS'
      },
      ...prev
    ]);

    // 3. Progressive Backend Sync (if live, not already persisted by payment service, and spot has MongoDB ObjectId)
    if (!newBooking.alreadyPersisted && isLiveConnected && newBooking.spotId && /^[a-f\d]{24}$/i.test(newBooking.spotId)) {
      try {
        const start = newBooking.startDateTime ? new Date(newBooking.startDateTime) : new Date();
        const end = newBooking.endDateTime ? new Date(newBooking.endDateTime) : new Date(start.getTime() + 2 * 3600000);
        await api.createBooking({
          slotId: newBooking.spotId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          type: 'HOURLY'
        });
      } catch (err) {
        console.warn('[ParkSpot] Background booking persist notice:', err.message);
      }
    }
  }, [isLiveConnected, activeUser]);

  // Driver cancels booking
  const handleCancelBooking = useCallback(async (bookingId) => {
    let result = null;
    if (isLiveConnected && /^[a-f\d]{24}$/i.test(bookingId)) {
      try {
        result = await api.cancelBooking(bookingId);
      } catch (err) {
        console.warn('[ParkSpot] Background booking cancel notice:', err.message);
        throw err;
      }
    }

    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: 'CANCELED' } : b))
    );

    return result;
  }, [isLiveConnected]);

  // Operator manually overrides spot state
  const handleUpdateSpotStatus = useCallback(async (facilityId, floor, spotId, newStatus) => {
    // 1. Optimistic Local State Update
    setFacilities((prev) =>
      prev.map((fac) => {
        if (fac.id === facilityId) {
          const updatedSpots = (fac.spots || []).map((s) =>
            s.id === spotId ? { ...s, status: newStatus } : s
          );
          return { ...fac, spots: updatedSpots };
        }
        return fac;
      })
    );

    // 2. Append Audit Log
    setAuditLogs((prev) => [
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        action: `SPOT_STATUS_${newStatus}`,
        entity: `Spot #${spotId}`,
        user: 'admin@urbanpark.test',
        source: 'B2B Admin Console',
        status: 'SUCCESS'
      },
      ...prev
    ]);

    // 3. Progressive Backend Sync (if live & facility has MongoDB ObjectId)
    if (isLiveConnected && /^[a-f\d]{24}$/i.test(facilityId) && /^[a-f\d]{24}$/i.test(spotId)) {
      try {
        await api.ingestEvent(facilityId, {
          spotId,
          eventType: newStatus,
          source: 'OPERATOR',
          metadata: { reason: `Operator manual override to ${newStatus}` }
        });
      } catch (err) {
        console.warn('[ParkSpot] Background event ingestion notice:', err.message);
      }
    }
  }, [isLiveConnected]);

  // Show branded FullScreenLoader during initial load
  if (isAppInitializing) {
    return (
      <FullScreenLoader
        message="Initializing ParkSpot Smart Infrastructure..."
        subtext="Connecting to live parking telemetry network"
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top Application Header */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div
            className="brand"
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            onClick={() => {
              setCurrentMode('driver');
              setDriverView('home');
            }}
          >
            <Logo variant="full" size="sm" theme="dark" />
          </div>

          {currentMode === 'driver' && (
            <nav className="nav-links">
              <button
                className={`nav-link ${driverView === 'home' || driverView === 'search' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setDriverView('home')}
              >
                Find Parking
              </button>
              <button
                className={`nav-link ${driverView === 'bookings' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setDriverView('bookings')}
              >
                My Bookings ({bookings.length})
              </button>
            </nav>
          )}
        </div>

        {/* Global Controls & Mode Switcher Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Connection Status Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.6875rem',
              fontWeight: 600,
              backgroundColor: isLiveConnected ? 'var(--ps-state-available-bg)' : 'rgba(217, 119, 6, 0.12)',
              color: isLiveConnected ? 'var(--ps-state-available)' : 'var(--ps-state-reserved)',
              border: `1px solid ${isLiveConnected ? 'rgba(46, 125, 50, 0.25)' : 'rgba(217, 119, 6, 0.25)'}`
            }}
            title={isLiveConnected ? 'Connected to live Express + MongoDB backend' : 'Running in local progressive demo mode'}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isLiveConnected ? 'var(--ps-state-available)' : 'var(--ps-state-reserved)'
              }}
            />
            <span>{isLiveConnected ? 'Live API' : 'Demo Mode'}</span>
          </div>

          {/* Account / Sign In Trigger */}
          <button
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
            onClick={() => setIsAuthModalOpen(true)}
          >
            {activeUser ? activeUser.name?.split(' ')[0] : 'Sign In'}
          </button>

          <div className="mode-pill">
            <button
              className={`mode-btn ${currentMode === 'driver' ? 'active' : ''}`}
              onClick={() => {
                setCurrentMode('driver');
                setDriverView('home');
              }}
            >
              Driver View
            </button>
            <button
              className={`mode-btn ${currentMode === 'operator' ? 'active' : ''}`}
              onClick={() => setCurrentMode('operator')}
            >
              Operator B2B
            </button>
          </div>
        </div>
      </header>

      {/* Main Experience View */}
      <main style={{ flex: 1, padding: '1rem 0 3rem' }}>
        {currentMode === 'driver' ? (
          <DriverExperience
            facilities={facilities}
            bookings={bookings}
            onAddBooking={handleAddBooking}
            onCancelBooking={handleCancelBooking}
            activeView={driverView}
            setActiveView={setDriverView}
            isLiveConnected={isLiveConnected}
          />
        ) : (
          <OperatorExperience
            facilities={facilities}
            events={events}
            auditLogs={auditLogs}
            onUpdateSpotStatus={handleUpdateSpotStatus}
          />
        )}
      </main>

      {/* Official Brand Footer */}
      <Footer
        onNavigate={(mode, view) => {
          setCurrentMode(mode);
          if (view) setDriverView(view);
        }}
      />

      {/* Login & Signup Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultRole={currentMode}
        onAuthSuccess={(user, role) => {
          setActiveUser(user);
          if (role === 'operator') setCurrentMode('operator');
          else setCurrentMode('driver');
        }}
      />
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
