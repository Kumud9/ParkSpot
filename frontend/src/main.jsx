import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { DriverExperience } from './components/DriverExperience';
import { OperatorExperience } from './components/OperatorExperience';
import { Logo } from './components/shared/Logo';
import { FullScreenLoader } from './components/shared/Loading';
import { Footer } from './components/shared/Footer/Footer';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  INITIAL_FACILITIES,
  INITIAL_EVENTS,
  INITIAL_AUDIT_LOGS,
  generateFloorSpots
} from './data/mockData';
import { api } from './services/api';
import { ShieldAlert } from 'lucide-react';
import './styles.css';
import './components/landing/landing.css';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  const [driverView, setDriverView] = useState('home'); // home | search | facility | date-time | review | payment | confirmed | bookings
  const [operatorTab, setOperatorTab] = useState('dashboard');

  // Backend Connectivity (internal networking flag, no user-facing badge)
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Facilities state initialized with geographic facilities
  const [facilities, setFacilities] = useState(() => {
    return INITIAL_FACILITIES.map((fac) => ({
      ...fac,
      spots: generateFloorSpots(fac.id, 'Floor 1')
    }));
  });

  // User-scoped bookings: starts empty to guarantee complete isolation across user accounts
  const [bookings, setBookings] = useState([]);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);

  // Sync facilities with backend
  useEffect(() => {
    let isMounted = true;

    async function syncFacilities() {
      try {
        const isHealthy = await api.checkHealth();
        if (!isMounted) return;
        setIsLiveConnected(isHealthy);

        if (!isHealthy) return;

        const liveFacilities = await api.getFacilities();
        if (isMounted && liveFacilities && liveFacilities.length > 0) {
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
        console.info('[ParkSpot] Facilities sync skipped:', e.message);
      }
    }

    syncFacilities();

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch user-scoped bookings whenever driver user logs in / changes
  useEffect(() => {
    let isMounted = true;

    async function syncUserBookings() {
      if (!user || user.accountType !== 'DRIVER') {
        if (isMounted) setBookings([]);
        return;
      }

      try {
        const liveBookings = await api.getBookings();
        if (isMounted && liveBookings && Array.isArray(liveBookings)) {
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
            vehiclePlate: b.vehiclePlate || ''
          }));
          setBookings(formatted);
        } else if (isMounted) {
          setBookings([]);
        }
      } catch (e) {
        if (isMounted) setBookings([]);
      }
    }

    syncUserBookings();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // Sync audit logs for operator view
  useEffect(() => {
    let isMounted = true;

    async function syncOperatorLogs() {
      if (!user || user.accountType !== 'OPERATOR') return;

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
    }

    syncOperatorLogs();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // Driver creates new reservation
  const handleAddBooking = useCallback(async (newBooking) => {
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
        user: user?.email || 'driver@parkspot',
        source: 'Razorpay Payment Gateway',
        status: 'SUCCESS'
      },
      ...prev
    ]);

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
  }, [isLiveConnected, user]);

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

    setAuditLogs((prev) => [
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        action: `SPOT_STATUS_${newStatus}`,
        entity: `Spot #${spotId}`,
        user: user?.email || 'operator@parkspot',
        source: 'B2B Admin Console',
        status: 'SUCCESS'
      },
      ...prev
    ]);

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
  }, [isLiveConnected, user]);

  // Operator adds a new parking spot
  const handleAddSpot = useCallback(async (facilityId, newSpot) => {
    setFacilities((prev) =>
      prev.map((fac) => {
        if (fac.id === facilityId) {
          const currentSpots = fac.spots || [];
          const updatedSpots = [...currentSpots, newSpot];
          const newFloors = fac.floors && fac.floors.includes(newSpot.floor)
            ? fac.floors
            : [...(fac.floors || ['Floor 1']), newSpot.floor];
          return {
            ...fac,
            spots: updatedSpots,
            totalSpots: (fac.totalSpots || currentSpots.length) + 1,
            availableSpots: newSpot.status === 'AVAILABLE' ? (fac.availableSpots || 0) + 1 : fac.availableSpots,
            floors: newFloors
          };
        }
        return fac;
      })
    );

    setAuditLogs((prev) => [
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        action: 'SPOT_CREATED',
        entity: `Spot #${newSpot.number} (${newSpot.floor})`,
        user: user?.email || 'operator@parkspot',
        source: 'B2B Admin Console',
        status: 'SUCCESS'
      },
      ...prev
    ]);
  }, [user]);

  // Show loading during authentication resolution
  if (isLoading) {
    return (
      <FullScreenLoader
        message="Loading ParkSpot..."
        subtext="Resolving secure account session"
      />
    );
  }

  // =========================================================================
  // DRIVER EXPERIENCE VIEW & HEADER (REQUIREMENT 19 & 21)
  // =========================================================================
  const renderDriverView = () => {
    // ROUTE GUARD: Operator cannot access Driver experience
    if (user && user.accountType === 'OPERATOR') {
      return <Navigate to="/operator" replace />;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div
              className="brand"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              onClick={() => {
                if (user) setDriverView('home');
                else navigate('/');
              }}
              title="ParkSpot"
            >
              <Logo variant="full" size="nav" theme="dark" />
            </div>

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
                My Bookings {user && `(${bookings.length})`}
              </button>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ps-primary-light)' }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'rgba(244, 242, 231, 0.65)' }}>
                    Account: Driver
                  </div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                  onClick={() => {
                    logout();
                    setBookings([]);
                    navigate('/login');
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                onClick={() => navigate('/login')}
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        <main style={{ flex: 1, padding: (driverView === 'home' || driverView === 'search') ? 0 : '1rem 0 3rem', display: 'flex', flexDirection: 'column' }}>
          <DriverExperience
            facilities={facilities}
            bookings={bookings}
            onAddBooking={handleAddBooking}
            onCancelBooking={handleCancelBooking}
            activeView={driverView}
            setActiveView={setDriverView}
            isLiveConnected={isLiveConnected}
            activeUser={user}
          />
        </main>

        {!(driverView === 'home' || driverView === 'search') && (
          <Footer
            onNavigate={(targetMode, view) => {
              if (targetMode === 'operator') {
                navigate('/operator');
              } else {
                navigate('/driver');
                if (view) setDriverView(view);
              }
            }}
          />
        )}
      </div>
    );
  };

  // =========================================================================
  // OPERATOR EXPERIENCE VIEW & HEADER (REQUIREMENT 20 & 21)
  // =========================================================================
  const renderOperatorView = () => {
    // ROUTE GUARD: Operator routes require authenticated Operator
    if (!user) {
      return <Navigate to="/login" replace />;
    }

    // ROUTE GUARD: Driver is blocked from Operator view
    if (user.accountType === 'DRIVER') {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', backgroundColor: 'var(--ps-background-primary)' }}>
          <div className="card" style={{ maxWidth: '480px', textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ marginBottom: '1rem', color: '#DC2626' }}>
              <ShieldAlert size={48} style={{ margin: '0 auto' }} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem' }}>Access Restricted</h2>
            <p style={{ color: 'var(--ps-secondary-dark)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Your account is registered as a <strong>DRIVER</strong>. The Operator Portal is strictly restricted to facility operator accounts.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/driver')}
            >
              Return to Driver Application
            </button>
          </div>
        </div>
      );
    }

    const internalRoleDisplay = user.internalRole || (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(user.role) ? user.role : 'Manager');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div
              className="brand"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              onClick={() => navigate('/operator')}
              title="ParkSpot Operator"
            >
              <Logo variant="full" size="nav" theme="dark" />
            </div>

            <nav className="nav-links" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                className={`nav-link ${operatorTab === 'dashboard' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setOperatorTab('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={`nav-link ${operatorTab === 'live-parking' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setOperatorTab('live-parking')}
              >
                Live Parking
              </button>
              <button
                className={`nav-link ${operatorTab === 'bookings' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setOperatorTab('bookings')}
              >
                Bookings
              </button>
              <button
                className={`nav-link ${operatorTab === 'facilities' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setOperatorTab('facilities')}
              >
                Facilities
              </button>
              <button
                className={`nav-link ${operatorTab === 'analytics' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setOperatorTab('analytics')}
              >
                Analytics
              </button>
              <button
                className={`nav-link ${operatorTab === 'optimization' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setOperatorTab('optimization')}
              >
                Optimization
              </button>
              <button
                className={`nav-link ${operatorTab === 'assistant' || operatorTab === 'copilot' ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setOperatorTab('copilot')}
              >
                ParkSpot Copilot
              </button>
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ps-primary-light)' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'rgba(244, 242, 231, 0.65)' }}>
                Role: {internalRoleDisplay} · {user.organizationName || 'ParkSpot Operations'}
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              Sign Out
            </button>
          </div>
        </header>

        <main style={{ flex: 1 }}>
          <OperatorExperience
            facilities={facilities}
            events={events}
            auditLogs={auditLogs}
            bookings={bookings}
            onUpdateSpotStatus={handleUpdateSpotStatus}
            onAddSpot={handleAddSpot}
            isLiveConnected={isLiveConnected}
            activeUser={user}
            activeTab={operatorTab}
            onTabChange={setOperatorTab}
          />
        </main>

        <Footer
          onNavigate={(targetMode, view) => {
            if (targetMode === 'operator') {
              navigate('/operator');
            } else {
              navigate('/driver');
              if (view) setDriverView(view);
            }
          }}
        />
      </div>
    );
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LandingPage
            activeUser={user}
          />
        }
      />
      <Route
        path="/login"
        element={
          <LoginPage />
        }
      />
      <Route
        path="/login/:portal"
        element={
          <LoginPage />
        }
      />
      <Route
        path="/driver"
        element={renderDriverView()}
      />
      <Route
        path="/operator"
        element={renderOperatorView()}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
