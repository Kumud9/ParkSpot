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
import { OperatorOnboardingPage } from './pages/OperatorOnboardingPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  INITIAL_FACILITIES,
  INITIAL_EVENTS,
  INITIAL_AUDIT_LOGS,
  generateFloorSpots
} from './data/mockData';
import { api, normalizeFacility } from './services/api';
import { ShieldAlert, Building2, CheckCircle2, ArrowRight } from 'lucide-react';
import './styles.css';
import './components/landing/landing.css';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, isLoading, logout, updateUser, refreshProfile } = useAuth();

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
      if (!user) {
        if (isMounted) setBookings([]);
        return;
      }

      if (user.accountType === 'DRIVER') {
        try {
          const liveBookings = await api.getBookings();
          if (isMounted && liveBookings && Array.isArray(liveBookings)) {
            const formatted = liveBookings.map((b) => ({
              id: b.id || b._id,
              facilityId: b.lotId || b.lot?.id || b.lot?._id,
              facilityName: b.lot?.name || b.lotId?.name || 'Central Business District Parking',
              facilityAddress: b.lot?.address || b.lotId?.address || '14 Connaught Place',
              floor: b.floor?.name || b.slot?.level || b.slotId?.level || 'Floor 1',
              spotNumber: b.slot?.number || b.slotId?.number || 'A1',
              spotId: b.slot?.id || b.slot?._id || b.slotId,
              lot: b.lot || null,
              latitude: b.lot?.latitude ?? (b.lot?.location?.coordinates ? b.lot.location.coordinates[1] : null),
              longitude: b.lot?.longitude ?? (b.lot?.location?.coordinates ? b.lot.location.coordinates[0] : null),
              vehicle: b.vehicle || null,
              startTime: new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              endTime: new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              startDateTime: b.startTime,
              endDateTime: b.endTime,
              duration: `${Math.round((new Date(b.endTime) - new Date(b.startTime)) / 3600000)} hours`,
              status: b.status,
              amount: b.totalAmount || 120,
              qrCode: `PARK-${b.id || b._id}-CONFIRMED`,
              verificationCode: `PS-PASS-${String(b.id || b._id).slice(-8).toUpperCase()}-${b.slot?.number || b.slotId?.number || 'A1'}`,
              vehiclePlate: b.vehicle?.registrationNumber || b.vehiclePlate || ''
            }));
            setBookings(formatted);
          } else if (isMounted) {
            setBookings([]);
          }
        } catch (e) {
          if (isMounted) setBookings([]);
        }
      } else if (user.accountType === 'OPERATOR') {
        try {
          const facId = user.facilityId || user.facility?.id || user.facility?._id;
          if (facId && isLiveConnected) {
            const facBookings = await api.getFacilityBookings(facId);
            if (isMounted && Array.isArray(facBookings)) {
              setBookings(facBookings);
            }
          }
        } catch (e) {
          console.info('[ParkSpot] Operator facility bookings sync notice:', e.message);
        }
      }
    }

    syncUserBookings();

    return () => {
      isMounted = false;
    };
  }, [user, facilities, isLiveConnected]);

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
              {user && (
                <button
                  className={`nav-link ${driverView === 'vehicles' ? 'active' : ''}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setDriverView('vehicles')}
                >
                  My Vehicles
                </button>
              )}
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

    // CORE RULE: ONE OPERATOR ACCOUNT = ONE PARKING FACILITY/LOT.
    // Everything in the Operator Console must be scoped to their assigned facility.
    const operatorFacility =
      (user.facility ? normalizeFacility(user.facility) : null) ||
      facilities.find((f) => f.id === user.facilityId || f._id === user.facilityId);

    // If operator has not completed facility onboarding yet, render setup checklist
    if (!operatorFacility) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--ps-background-primary)' }}>
          <header className="app-header" style={{ padding: '0.75rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Logo variant="full" size="nav" theme="dark" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ps-primary-light)' }}>{user.name}</div>
                <div style={{ fontSize: '0.6875rem', color: 'rgba(244, 242, 231, 0.65)' }}>Operator Account</div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                Sign Out
              </button>
            </div>
          </header>

          <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div className="card" style={{ maxWidth: '580px', width: '100%', padding: '2.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ width: 44, height: 44, borderRadius: '10px', backgroundColor: 'rgba(178, 162, 64, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ps-accent-dark)' }}>
                  <Building2 size={24} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--ps-primary-dark)' }}>
                    Complete Facility Registration
                  </h2>
                  <p className="metadata" style={{ margin: 0 }}>
                    Register your parking facility to unlock live operations and telemetry
                  </p>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--ps-primary-light)', borderRadius: 'var(--ps-radius-md)', padding: '1.25rem', marginBottom: '1.75rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ps-secondary-dark)', marginBottom: '0.75rem' }}>
                  Setup Checklist
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--ps-accent-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ps-accent-dark)' }}>1</div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--ps-primary-dark)' }}>Facility location, address & verified map pin</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--ps-accent-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ps-accent-dark)' }}>2</div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--ps-primary-dark)' }}>Floors, spot counts & unique parking bay identifiers</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--ps-accent-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ps-accent-dark)' }}>3</div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--ps-primary-dark)' }}>Live parking operations, driver discovery & telemetry</span>
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-block"
                style={{ padding: '0.85rem', fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                onClick={() => navigate('/operator/onboarding')}
              >
                <span>Complete Facility Setup</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </main>
        </div>
      );
    }

    const operatorFacilities = operatorFacility ? [operatorFacility] : [];

    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <OperatorExperience
          facilities={operatorFacilities}
          events={events}
          auditLogs={auditLogs}
          bookings={bookings}
          onUpdateSpotStatus={handleUpdateSpotStatus}
          onAddSpot={handleAddSpot}
          isLiveConnected={isLiveConnected}
          activeUser={user}
          activeTab={operatorTab}
          onTabChange={setOperatorTab}
          onSignOut={() => {
            logout();
            navigate('/login');
          }}
        />
      </div>
    );
  };

  // =========================================================================
  // OPERATOR ONBOARDING VIEW
  // =========================================================================
  const renderOperatorOnboardingView = () => {
    // ROUTE GUARD: Unauthenticated users go to login
    if (!user) {
      return <Navigate to="/login" replace />;
    }

    // ROUTE GUARD: Drivers must never access operator onboarding
    if (user.accountType === 'DRIVER') {
      return <Navigate to="/driver" replace />;
    }

    // ROUTE GUARD: If operator already has a facility, open dashboard
    if (user.facilityId || user.facility) {
      return <Navigate to="/operator" replace />;
    }

    return (
      <OperatorOnboardingPage
        onOnboarded={(result) => {
          if (result?.facility) {
            const normalized = normalizeFacility(result.facility);
            setFacilities((prev) => [normalized, ...prev.filter((f) => f.id !== normalized.id)]);
          }
          if (result?.user) {
            updateUser(result.user);
          } else {
            refreshProfile();
          }
          navigate('/operator');
        }}
      />
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
      <Route
        path="/operator/onboarding"
        element={renderOperatorOnboardingView()}
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
