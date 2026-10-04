import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ParkingMap } from './ParkingMap';
import { VehicleTopDown } from './VehicleTopDown';
import { api } from '../services/api';
import {
  MapPin,
  Clock,
  CircleDollarSign,
  Star,
  Search,
  ArrowRight,
  CheckCircle2,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  Car,
  ChevronLeft,
  X,
  CreditCard,
  Smartphone,
  Building,
  AlertTriangle,
  RotateCcw,
  Check,
  Ticket,
  Info,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { Logo } from './shared/Logo';
import { MapLoader, PaymentLoader, ActionLoader } from './shared/Loading';

export function DriverExperience({
  facilities = [],
  bookings = [],
  onAddBooking,
  onCancelBooking,
  activeView,
  setActiveView,
  isLiveConnected = false
}) {
  // -------------------------------------------------------------
  // FACILITY & SPOT SELECTION STATE
  // -------------------------------------------------------------
  const [selectedFacility, setSelectedFacility] = useState(() => facilities[0] || null);
  const [activeFloor, setActiveFloor] = useState('Floor 1');
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [isFacilityLoading, setIsFacilityLoading] = useState(false);

  // Sync selected facility if facilities list updates and none was selected
  useEffect(() => {
    if (!selectedFacility && facilities.length > 0) {
      setSelectedFacility(facilities[0]);
    }
  }, [facilities, selectedFacility]);

  // Derive distinct floors for the selected facility
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

  // Keep active floor aligned with facility floors
  useEffect(() => {
    if (facilityFloors.length > 0 && !facilityFloors.includes(activeFloor)) {
      setActiveFloor(facilityFloors[0]);
    }
  }, [facilityFloors, activeFloor]);

  // Filter spots on current active floor
  const currentFloorSpots = useMemo(() => {
    if (!selectedFacility?.spots) return [];
    const matched = selectedFacility.spots.filter((s) => s.floor === activeFloor);
    return matched.length > 0 ? matched : selectedFacility.spots;
  }, [selectedFacility, activeFloor]);

  // -------------------------------------------------------------
  // DATE & TIME SELECTION STATE
  // -------------------------------------------------------------
  const getTodayDateStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getNextHourStr = () => {
    const d = new Date();
    const h = (d.getHours() + 1) % 24;
    return `${String(h).padStart(2, '0')}:00`;
  };

  const [bookingDate, setBookingDate] = useState(getTodayDateStr);
  const [bookingStartTime, setBookingStartTime] = useState(getNextHourStr);
  const [bookingDuration, setBookingDuration] = useState(2); // hours
  const [vehiclePlate, setVehiclePlate] = useState('DL 01 AB 4920');
  const [validationErrors, setValidationErrors] = useState({});

  // Compute calculated end time
  const computedEndTime = useMemo(() => {
    if (!bookingStartTime) return '16:00';
    const [h, m] = bookingStartTime.split(':').map(Number);
    const endH = (h + Number(bookingDuration)) % 24;
    return `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
  }, [bookingStartTime, bookingDuration]);

  // Rate & Cost calculation
  const calculatedCost = useMemo(() => {
    const rate = selectedSpot?.rate || selectedFacility?.hourlyRate || 50;
    return rate * Number(bookingDuration);
  }, [selectedSpot, selectedFacility, bookingDuration]);

  // -------------------------------------------------------------
  // TEMPORARY HOLD TIMER (10:00 minutes)
  // -------------------------------------------------------------
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(600);
  const [isHoldExpired, setIsHoldExpired] = useState(false);

  // Hold timer countdown
  useEffect(() => {
    if (activeView === 'date-time' || activeView === 'review' || activeView === 'payment') {
      if (holdSecondsLeft <= 0) {
        setIsHoldExpired(true);
        setSelectedSpot(null);
        return;
      }
      const interval = setInterval(() => {
        setHoldSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsHoldExpired(true);
            setSelectedSpot(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activeView, holdSecondsLeft]);

  const resetHold = useCallback(() => {
    setHoldSecondsLeft(600);
    setIsHoldExpired(false);
  }, []);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // -------------------------------------------------------------
  // PAYMENT & CONFIRMATION STATE
  // -------------------------------------------------------------
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentState, setPaymentState] = useState('IDLE'); // 'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CONFLICT' | 'TIMEOUT'
  const [paymentError, setPaymentError] = useState(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // -------------------------------------------------------------
  // MY BOOKINGS & CANCELLATION STATE
  // -------------------------------------------------------------
  const [bookingsFilter, setBookingsFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  const [activeBookingDetail, setActiveBookingDetail] = useState(null);
  const [cancelModalBooking, setCancelModalBooking] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelNotification, setCancelNotification] = useState(null);

  // Filter facilities
  const filteredFacilities = useMemo(() => {
    return facilities.filter((f) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (f.name && f.name.toLowerCase().includes(q)) ||
        (f.city && f.city.toLowerCase().includes(q)) ||
        (f.address && f.address.toLowerCase().includes(q));
      if (!matchesSearch) return false;
      if (selectedFilter === 'OPEN') return f.availableSpots > 0;
      if (selectedFilter === 'LOW_PRICE') return f.hourlyRate <= 50;
      return true;
    });
  }, [facilities, searchQuery, selectedFilter]);

  // -------------------------------------------------------------
  // ACTIONS: FACILITY & SPOT
  // -------------------------------------------------------------
  const handleSelectFacility = async (fac) => {
    setSelectedFacility(fac);
    setSelectedSpot(null);
    setActiveView('facility');

    if (isLiveConnected && /^[a-f\d]{24}$/i.test(fac.id)) {
      setIsFacilityLoading(true);
      try {
        const fresh = await api.getFacility(fac.id);
        if (fresh && fresh.spots) {
          setSelectedFacility(fresh);
        }
      } catch (err) {
        console.info('[ParkSpot] Live facility fetch note:', err.message);
      } finally {
        setIsFacilityLoading(false);
      }
    }
  };

  const handleSpotClick = (spot) => {
    if (spot.status === 'AVAILABLE') {
      setSelectedSpot(spot);
    }
  };

  const handleProceedToDateTime = () => {
    if (!selectedSpot) return;
    resetHold();
    setValidationErrors({});
    setActiveView('date-time');
  };

  // -------------------------------------------------------------
  // ACTIONS: DATE & TIME VALIDATION
  // -------------------------------------------------------------
  const validateDateTime = () => {
    const errors = {};
    const today = getTodayDateStr();

    if (!bookingDate) {
      errors.date = 'Reservation date is required.';
    } else if (bookingDate < today) {
      errors.date = 'Reservation date cannot be in the past.';
    }

    if (!bookingStartTime) {
      errors.time = 'Start time is required.';
    }

    const durationNum = Number(bookingDuration);
    if (!durationNum || durationNum < 1 || durationNum > 48) {
      errors.duration = 'Please choose a valid reservation duration (1 to 48 hours).';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProceedToReview = async () => {
    if (!validateDateTime()) return;
    if (isHoldExpired || holdSecondsLeft <= 0) {
      setIsHoldExpired(true);
      return;
    }

    // If live connected, do a quick window check for conflict
    if (isLiveConnected && selectedFacility?.id && selectedSpot?.id) {
      try {
        const startIso = new Date(`${bookingDate}T${bookingStartTime}:00`).toISOString();
        const endIso = new Date(new Date(`${bookingDate}T${bookingStartTime}:00`).getTime() + bookingDuration * 3600000).toISOString();
        const fresh = await api.getFacility(selectedFacility.id, { startTime: startIso, endTime: endIso });
        if (fresh?.spots) {
          const matchingSpot = fresh.spots.find((s) => s.id === selectedSpot.id || s.number === selectedSpot.number);
          if (matchingSpot && (matchingSpot.status === 'OCCUPIED' || matchingSpot.status === 'RESERVED')) {
            setValidationErrors({ general: `Spot ${selectedSpot.number} has just been reserved for this time window. Please pick another spot.` });
            return;
          }
        }
      } catch (err) {
        console.info('[ParkSpot] Live conflict check note:', err.message);
      }
    }

    setActiveView('review');
  };

  // -------------------------------------------------------------
  // ACTIONS: PAYMENT & CONFIRMATION
  // -------------------------------------------------------------
  const handleExecutePayment = async () => {
    if (isHoldExpired || holdSecondsLeft <= 0) {
      setPaymentState('TIMEOUT');
      return;
    }

    setPaymentState('PROCESSING');
    setPaymentError(null);

    const startIso = new Date(`${bookingDate}T${bookingStartTime}:00`).toISOString();
    const endIso = new Date(new Date(`${bookingDate}T${bookingStartTime}:00`).getTime() + bookingDuration * 3600000).toISOString();

    // 1. LIVE BACKEND PAYMENT WORKFLOW
    if (isLiveConnected && selectedSpot?.id && /^[a-f\d]{24}$/i.test(selectedSpot.id)) {
      try {
        // Step A: Create booking document on backend
        const bookingDoc = await api.createBooking({
          slotId: selectedSpot.id,
          startTime: startIso,
          endTime: endIso,
          type: bookingDuration >= 24 ? 'DAILY' : 'HOURLY'
        });

        const backendBookingId = bookingDoc._id || bookingDoc.id;

        // Step B: Create payment order
        const orderRes = await api.createPaymentOrder(backendBookingId);
        const orderId = orderRes?.order?.id || `ord_${Date.now()}`;

        // Step C: Verify payment with signature
        if (simulateFailure) {
          // Intentional failure trigger
          try {
            await api.verifyPayment({
              orderId,
              paymentId: `pay_err_${Date.now()}`,
              signature: 'invalid_mock_signature'
            });
          } catch (verifyErr) {
            setPaymentState('FAILED');
            setPaymentError(verifyErr.message || 'Payment signature verification failed.');
            return;
          }
        } else {
          // Valid verification
          await api.verifyPayment({
            orderId,
            paymentId: `pay_live_${Date.now()}`,
            signature: 'mock_valid_signature'
          });
        }

        // Backend confirmed payment and booking
        const newBooking = {
          id: String(backendBookingId),
          facilityId: selectedFacility.id,
          facilityName: selectedFacility.name,
          facilityAddress: selectedFacility.address,
          floor: selectedSpot.floor || activeFloor,
          spotNumber: selectedSpot.number,
          spotId: selectedSpot.id,
          startTime: `${bookingDate}, ${bookingStartTime}`,
          endTime: `${bookingDate}, ${computedEndTime}`,
          startDateTime: startIso,
          endDateTime: endIso,
          duration: `${bookingDuration} ${bookingDuration === 1 ? 'hour' : 'hours'}`,
          status: 'CONFIRMED',
          amount: calculatedCost,
          paymentMethod,
          paymentId: `PAY-${String(backendBookingId).slice(-8).toUpperCase()}`,
          verificationCode: `PS-PASS-${String(backendBookingId).slice(-8).toUpperCase()}-${selectedSpot.number}`,
          vehiclePlate: vehiclePlate.trim() || 'DL 01 AB 4920',
          alreadyPersisted: true
        };

        onAddBooking && onAddBooking(newBooking);
        setConfirmedBooking(newBooking);
        setPaymentState('SUCCESS');
        setActiveView('confirmed');
      } catch (err) {
        if (err.status === 409 || err.message?.includes('SLOT_UNAVAILABLE') || err.message?.includes('available')) {
          setPaymentState('CONFLICT');
          setPaymentError(`Spot ${selectedSpot.number} was just booked or is unavailable for this time window. Please select another spot.`);
        } else {
          setPaymentState('FAILED');
          setPaymentError(err.message || 'Payment session could not be completed.');
        }
      }
      return;
    }

    // 2. DEMO MODE PAYMENT WORKFLOW (Backend offline / mock data)
    setTimeout(() => {
      if (simulateFailure) {
        setPaymentState('FAILED');
        setPaymentError('Demo Mode: Simulated card issuer decline. Payment was not authorized.');
        return;
      }

      const demoId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
      const newBooking = {
        id: demoId,
        facilityId: selectedFacility?.id || 'fac-demo',
        facilityName: selectedFacility?.name || 'Central Business District Parking',
        facilityAddress: selectedFacility?.address || '14 Connaught Place',
        floor: selectedSpot?.floor || activeFloor,
        spotNumber: selectedSpot?.number || 'A1',
        spotId: selectedSpot?.id || null,
        startTime: `${bookingDate}, ${bookingStartTime}`,
        endTime: `${bookingDate}, ${computedEndTime}`,
        startDateTime: startIso,
        endDateTime: endIso,
        duration: `${bookingDuration} ${bookingDuration === 1 ? 'hour' : 'hours'}`,
        status: 'CONFIRMED',
        amount: calculatedCost,
        paymentMethod,
        paymentId: `DEMO-PAY-${Date.now().toString().slice(-6)}`,
        verificationCode: `PS-PASS-DEMO-${selectedSpot?.number || 'A1'}`,
        vehiclePlate: vehiclePlate.trim() || 'DL 01 AB 4920',
        isDemo: true
      };

      onAddBooking && onAddBooking(newBooking);
      setConfirmedBooking(newBooking);
      setPaymentState('SUCCESS');
      setActiveView('confirmed');
    }, 600);
  };

  // -------------------------------------------------------------
  // ACTIONS: CANCELLATION
  // -------------------------------------------------------------
  const handleConfirmCancel = async () => {
    if (!cancelModalBooking) return;
    setCancelLoading(true);
    setCancelNotification(null);

    try {
      if (onCancelBooking) {
        await onCancelBooking(cancelModalBooking.id);
      }
      setCancelNotification({
        type: 'success',
        message: `Reservation #${cancelModalBooking.id} for Spot ${cancelModalBooking.spotNumber} has been successfully cancelled.`
      });
      setCancelModalBooking(null);
    } catch (err) {
      setCancelNotification({
        type: 'error',
        message: err.message || 'Failed to cancel reservation.'
      });
    } finally {
      setCancelLoading(false);
    }
  };

  // -------------------------------------------------------------
  // FILTERED BOOKINGS LIST
  // -------------------------------------------------------------
  const displayedBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (bookingsFilter === 'ALL') return true;
      if (bookingsFilter === 'ACTIVE') return b.status === 'CONFIRMED' || b.status === 'ACTIVE';
      if (bookingsFilter === 'COMPLETED') return b.status === 'COMPLETED';
      if (bookingsFilter === 'CANCELLED') return b.status === 'CANCELLED' || b.status === 'CANCELED';
      return true;
    });
  }, [bookings, bookingsFilter]);

  // =========================================================================
  // EXPIRED HOLD MODAL (Halts payment and clears invalid spot)
  // =========================================================================
  const renderHoldExpiredModal = () => {
    if (!isHoldExpired) return null;
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="hold-expired-title">
        <div className="modal-content" style={{ maxWidth: '440px', textAlign: 'center', padding: '2rem 1.5rem' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'rgba(217, 119, 6, 0.15)',
            color: 'var(--ps-state-reserved)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <Clock size={32} />
          </div>
          <h2 id="hold-expired-title" style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>Temporary Hold Expired</h2>
          <p className="metadata" style={{ marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Your 10-minute hold on the selected parking bay has elapsed. Spaces are released back into the live network to maintain fair availability for all drivers.
          </p>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              resetHold();
              setSelectedSpot(null);
              setActiveView('facility');
            }}
          >
            <RotateCcw size={16} /> Return to Parking Map
          </button>
        </div>
      </div>
    );
  };

  // =========================================================================
  // DIGITAL PARKING PASS COMPONENT (Reusable for Confirmation & Modal)
  // =========================================================================
  const renderDigitalPass = (booking, onClose = null) => {
    const isCancelled = booking.status === 'CANCELLED' || booking.status === 'CANCELED';
    return (
      <div className="digital-pass-card" style={{ maxWidth: '520px', margin: '0 auto' }}>
        {/* Pass Top Banner */}
        <div className="pass-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Logo variant="mark" size={32} theme="dark" />
            <div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, letterSpacing: '0.04em' }}>PARKSPOT</div>
              <div style={{ fontSize: '0.6875rem', color: 'rgba(244, 242, 231, 0.65)', letterSpacing: '0.08em' }}>DIGITAL PARKING PASS</div>
            </div>
          </div>
          <span className={`status-tag ${isCancelled ? 'blocked' : 'available'}`} style={{ textTransform: 'uppercase' }}>
            {isCancelled ? 'CANCELLED' : 'VALID PASS'}
          </span>
        </div>

        {/* Pass Content Body */}
        <div className="pass-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ flex: 1, paddingRight: '1rem' }}>
              <span className="eyebrow">FACILITY LOCATION</span>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--ps-primary-dark)', marginBottom: '0.2rem' }}>
                {booking.facilityName}
              </h3>
              <p className="metadata" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPin size={13} /> {booking.facilityAddress}
              </p>
            </div>

            {/* High-visibility Space Badge */}
            <div style={{
              backgroundColor: isCancelled ? '#8E9296' : 'var(--ps-primary-dark)',
              color: 'var(--ps-accent-light)',
              padding: '0.6rem 0.9rem',
              borderRadius: 'var(--ps-radius-sm)',
              textAlign: 'center',
              minWidth: '88px',
              border: '1px solid rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(244, 242, 231, 0.75)' }}>SPACE</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--ps-font-mono)', lineHeight: 1.1 }}>
                {booking.spotNumber}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'rgba(244, 242, 231, 0.85)', marginTop: '2px' }}>
                {booking.floor}
              </div>
            </div>
          </div>

          <hr className="pass-divider" />

          {/* Key Booking Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem', fontSize: '0.8125rem' }}>
            <div>
              <span className="metadata">Entry Time</span>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)' }}>
                {booking.startTime}
              </div>
            </div>
            <div>
              <span className="metadata">Exit Time</span>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)' }}>
                {booking.endTime}
              </div>
            </div>
            <div>
              <span className="metadata">Vehicle Registration</span>
              <div style={{ fontWeight: 600, fontFamily: 'var(--ps-font-mono)' }}>
                {booking.vehiclePlate || 'DL 01 AB 4920'}
              </div>
            </div>
            <div>
              <span className="metadata">Dwell Duration</span>
              <div style={{ fontWeight: 600 }}>
                {booking.duration}
              </div>
            </div>
          </div>

          {/* Software Digital Credential Token */}
          <div className="pass-credential-strip">
            <div>
              <span className="eyebrow" style={{ marginBottom: '2px' }}>CREDENTIAL TOKEN</span>
              <div style={{ fontFamily: 'var(--ps-font-mono)', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--ps-primary-dark)' }}>
                {booking.verificationCode || `PS-PASS-${booking.id}-${booking.spotNumber}`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="metadata">Booking ID</span>
              <div style={{ fontFamily: 'var(--ps-font-mono)', fontSize: '0.8125rem', fontWeight: 600 }}>
                #{booking.id}
              </div>
            </div>
          </div>

          <p className="metadata" style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: 'var(--ps-secondary-dark)', textAlign: 'center' }}>
            Software-based digital access credential. Present to facility staff or check-in attendant upon entry.
          </p>

          {onClose && (
            <button className="btn btn-secondary btn-block" style={{ marginTop: '1.25rem' }} onClick={onClose}>
              Close Pass
            </button>
          )}
        </div>
      </div>
    );
  };

  // =========================================================================
  // SCREEN 1: FIND PARKING & SCREEN 2: SEARCH FACILITIES
  // =========================================================================
  if (activeView === 'home' || activeView === 'search') {
    return (
      <div className="container">
        {/* Connection status banner for transparency */}
        {!isLiveConnected && (
          <div style={{
            backgroundColor: 'rgba(217, 119, 6, 0.1)',
            border: '1px solid rgba(217, 119, 6, 0.3)',
            borderRadius: 'var(--ps-radius-sm)',
            padding: '0.5rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8125rem',
            color: 'var(--ps-primary-dark)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Info size={16} color="var(--ps-state-reserved)" />
            <span><strong>Demo Mode Active:</strong> Operating with local simulated parking network. Connect backend API to interact with live facilities.</span>
          </div>
        )}

        {/* Discovery Hero */}
        <section style={{ marginBottom: '2rem', textAlign: 'center', padding: '1.5rem 1rem' }}>
          <span className="eyebrow">SMART INFRASTRUCTURE PARKING</span>
          <h1 className="display-title" style={{ marginBottom: '0.75rem' }}>
            Find your parking spot.
          </h1>
          <p style={{ maxWidth: '580px', margin: '0 auto 1.5rem', color: 'var(--ps-secondary-dark)' }}>
            Real-time top-down parking space availability. Browse facilities, inspect live layout bays, and reserve your exact space before arrival.
          </p>

          {/* Search Box */}
          <div style={{
            maxWidth: '640px',
            margin: '0 auto',
            display: 'flex',
            gap: '0.5rem',
            backgroundColor: '#FFFFFF',
            padding: '0.5rem',
            borderRadius: 'var(--ps-radius-sm)',
            border: '1px solid var(--ps-secondary-light)',
            boxShadow: 'var(--ps-shadow-card)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', color: 'var(--ps-secondary-dark)' }}>
              <Search size={20} />
            </div>
            <input
              type="text"
              placeholder="Search by facility name, city, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search parking facilities"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '0.9375rem',
                fontFamily: 'var(--ps-font-sans)',
                color: 'var(--ps-primary-dark)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ps-secondary-dark)', padding: '0 0.5rem' }}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
            <button className="btn btn-accent" onClick={() => setActiveView('search')}>
              Find Parking
            </button>
          </div>

          {/* Popular Destination Quick Pills */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {['Connaught Place', 'City Mall', 'Aerocity', 'Metro Central'].map((item) => (
              <button
                key={item}
                onClick={() => { setSearchQuery(item); setActiveView('search'); }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem' }}
              >
                <MapPin size={12} /> {item}
              </button>
            ))}
          </div>
        </section>

        {/* Filter Control Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 className="section-title">Parking Facilities</h2>
            <p className="metadata">{filteredFacilities.length} locations available</p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${selectedFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedFilter('ALL')}
            >
              All Facilities
            </button>
            <button
              className={`btn btn-sm ${selectedFilter === 'OPEN' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedFilter('OPEN')}
            >
              Available Now
            </button>
            <button
              className={`btn btn-sm ${selectedFilter === 'LOW_PRICE' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSelectedFilter('LOW_PRICE')}
            >
              Under ₹50/hr
            </button>
          </div>
        </div>

        {/* Facilities List Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredFacilities.map((fac) => (
            <div key={fac.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <span className={`status-tag ${fac.availableSpots > 0 ? 'available' : 'occupied'}`}>
                    {fac.availableSpots > 0 ? `${fac.availableSpots} SPOTS OPEN` : 'FACILITY FULL'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', fontWeight: 600 }}>
                    <Star size={14} fill="#F3F456" stroke="#B2A240" />
                    <span>{fac.rating || 4.8}</span>
                    <span className="metadata">({fac.reviewsCount || 120})</span>
                  </div>
                </div>

                <h3 style={{ fontSize: '1.125rem', marginBottom: '0.35rem' }}>{fac.name}</h3>
                <p className="metadata" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem' }}>
                  <MapPin size={14} /> {fac.address} · {fac.distance || fac.city}
                </p>

                <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem 0', borderTop: '1px solid var(--ps-secondary-light)', borderBottom: '1px solid var(--ps-secondary-light)', marginBottom: '1rem' }}>
                  <div>
                    <div className="metadata">Standard Rate</div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>₹{fac.hourlyRate}<span style={{ fontSize: '0.75rem', fontWeight: 400 }}>/hr</span></div>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--ps-secondary-light)', paddingLeft: '1rem' }}>
                    <div className="metadata">Operating Hours</div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{fac.openingHours || '24 Hours'}</div>
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-block"
                onClick={() => handleSelectFacility(fac)}
              >
                View Parking Map <ArrowRight size={16} />
              </button>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {filteredFacilities.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>No parking facilities match your search</h3>
            <p className="metadata" style={{ marginBottom: '1rem' }}>Try clearing your search query or selecting a different filter.</p>
            <button className="btn btn-secondary" onClick={() => { setSearchQuery(''); setSelectedFilter('ALL'); }}>
              Reset Search & Filters
            </button>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // SCREEN 3 & 4: FACILITY DETAILS & INTERACTIVE PARKING MAP
  // SCREEN 5: SPOT DETAILS INTERACTION
  // =========================================================================
  if (activeView === 'facility' && selectedFacility) {
    return (
      <div className="container">
        {renderHoldExpiredModal()}

        {/* Breadcrumb Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setActiveView('home')}>
            <ChevronLeft size={16} /> All Facilities
          </button>
          <span className="metadata">/ {selectedFacility.city || 'Delhi'} / {selectedFacility.name}</span>
        </div>

        {/* Facility Header Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 className="page-title">{selectedFacility.name}</h1>
            <p className="metadata" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
              <MapPin size={15} /> {selectedFacility.address} · {selectedFacility.type || 'Multi-level Parking'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="card" style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
              <div className="metadata">Total Spaces</div>
              <div style={{ fontWeight: 700, fontSize: '1.25rem' }}>{selectedFacility.totalSpots}</div>
            </div>
            <div className="card" style={{ padding: '0.6rem 1rem', textAlign: 'center', backgroundColor: 'var(--ps-state-available-bg)' }}>
              <div className="metadata" style={{ color: 'var(--ps-state-available)' }}>Available</div>
              <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ps-state-available)' }}>{selectedFacility.availableSpots}</div>
            </div>
            <div className="card" style={{ padding: '0.6rem 1rem', textAlign: 'center', backgroundColor: 'var(--ps-state-occupied-bg)' }}>
              <div className="metadata" style={{ color: 'var(--ps-state-occupied)' }}>Occupied</div>
              <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ps-state-occupied)' }}>{selectedFacility.occupiedSpots}</div>
            </div>
          </div>
        </div>

        {/* Content Layout: Interactive Map + Selection Sidebar */}
        <div className="content-grid content-grid-split">
          {/* Main Map Visualization Area */}
          <div>
            {isFacilityLoading ? (
              <MapLoader facilityName={selectedFacility.name} />
            ) : (
              <ParkingMap
                floors={facilityFloors}
                activeFloor={activeFloor}
                onSelectFloor={(fl) => {
                  setActiveFloor(fl);
                  setSelectedSpot(null);
                }}
                spots={currentFloorSpots}
                selectedSpotId={selectedSpot?.id}
                onSelectSpot={handleSpotClick}
              />
            )}
          </div>

          {/* SCREEN 5: SPOT DETAILS SIDEBAR / DRAWER */}
          <div>
            {selectedSpot ? (
              <div className="card" style={{ position: 'sticky', top: '80px', border: '2px solid var(--ps-accent-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span className="status-tag selected">SPOT SELECTED</span>
                  <button
                    onClick={() => setSelectedSpot(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ps-secondary-dark)' }}
                    aria-label="Deselect spot"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Top-Down Spot Preview */}
                <div style={{
                  backgroundColor: 'var(--ps-asphalt-ground)',
                  borderRadius: 'var(--ps-radius-sm)',
                  padding: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{
                    width: '80px',
                    height: '120px',
                    borderLeft: '2px solid var(--ps-accent-light)',
                    borderRight: '2px solid var(--ps-accent-light)',
                    borderBottom: '4px solid #4A463B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    <VehicleTopDown color="#25221B" isSelected={true} width={48} height={82} />
                  </div>
                </div>

                <h3 style={{ fontSize: '1.35rem', marginBottom: '0.25rem' }}>Space {selectedSpot.number}</h3>
                <p className="metadata" style={{ marginBottom: '1rem' }}>
                  {activeFloor} · {selectedSpot.type === 'EV' ? 'Electric Vehicle (EV Charging)' : selectedSpot.type === 'ACCESSIBLE' ? 'Accessible Parking Bay' : 'Standard Parking Bay'}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--ps-secondary-light)', borderBottom: '1px solid var(--ps-secondary-light)', marginBottom: '1.25rem' }}>
                  <div>
                    <span className="metadata">Hourly Rate</span>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>₹{selectedSpot.rate || selectedFacility.hourlyRate}/hr</div>
                  </div>
                  <div>
                    <span className="metadata">Availability</span>
                    <div style={{ color: 'var(--ps-state-available)', fontWeight: 600 }}>Ready to Reserve</div>
                  </div>
                </div>

                <button
                  className="btn btn-accent btn-block"
                  style={{ padding: '0.75rem 1rem', fontSize: '1rem' }}
                  onClick={handleProceedToDateTime}
                >
                  Continue to Reservation <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div className="card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                <Car size={36} strokeWidth={1.5} style={{ color: 'var(--ps-secondary-dark)', margin: '0 auto 0.75rem' }} />
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>Choose your parking spot</h3>
                <p className="metadata">
                  Click any available green parking bay on the map to inspect space details and reserve your bay.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 6: DATE & TIME SELECTION
  // =========================================================================
  if (activeView === 'date-time' && selectedFacility && selectedSpot) {
    return (
      <div className="container" style={{ maxWidth: '640px' }}>
        {renderHoldExpiredModal()}

        <button className="btn btn-secondary btn-sm" onClick={() => setActiveView('facility')} style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={16} /> Back to Parking Map
        </button>

        {/* Temporary Hold Countdown Bar */}
        <div className={`hold-timer-bar ${holdSecondsLeft < 120 ? 'urgent' : ''}`} role="timer" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} />
            <span>Spot {selectedSpot.number} held for you</span>
          </div>
          <span style={{ fontFamily: 'var(--ps-font-mono)', fontWeight: 700, fontSize: '0.9375rem' }}>
            {formatTimer(holdSecondsLeft)}
          </span>
        </div>

        <div className="card">
          <span className="eyebrow">STEP 1 OF 3</span>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '0.35rem' }}>Select Date & Duration</h2>
          <p className="metadata" style={{ marginBottom: '1.5rem' }}>
            {selectedFacility.name} · {activeFloor}, Spot {selectedSpot.number}
          </p>

          {validationErrors.general && (
            <div style={{
              backgroundColor: '#FDE8E8',
              color: '#9B1C1C',
              padding: '0.75rem',
              borderRadius: 'var(--ps-radius-sm)',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              {validationErrors.general}
            </div>
          )}

          {/* Date Field */}
          <div className="form-group">
            <label className="form-label" htmlFor="res-date">Reservation Date</label>
            <input
              id="res-date"
              type="date"
              className="form-input"
              value={bookingDate}
              min={getTodayDateStr()}
              onChange={(e) => setBookingDate(e.target.value)}
            />
            {validationErrors.date && (
              <span style={{ color: 'var(--ps-state-occupied)', fontSize: '0.75rem', marginTop: '2px', display: 'block' }}>
                {validationErrors.date}
              </span>
            )}
          </div>

          {/* Time & Duration Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="res-time">Arrival Time</label>
              <input
                id="res-time"
                type="time"
                className="form-input"
                value={bookingStartTime}
                onChange={(e) => setBookingStartTime(e.target.value)}
              />
              {validationErrors.time && (
                <span style={{ color: 'var(--ps-state-occupied)', fontSize: '0.75rem', marginTop: '2px', display: 'block' }}>
                  {validationErrors.time}
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="res-duration">Dwell Duration</label>
              <select
                id="res-duration"
                className="form-select"
                value={bookingDuration}
                onChange={(e) => setBookingDuration(parseInt(e.target.value, 10))}
              >
                <option value={1}>1 hour</option>
                <option value={2}>2 hours</option>
                <option value={3}>3 hours</option>
                <option value={4}>4 hours</option>
                <option value={8}>8 hours (Full Work Day)</option>
                <option value={24}>24 hours (Full Day)</option>
              </select>
            </div>
          </div>

          {/* Vehicle License Plate */}
          <div className="form-group">
            <label className="form-label" htmlFor="res-plate">Vehicle License Plate (Optional)</label>
            <input
              id="res-plate"
              type="text"
              className="form-input"
              placeholder="e.g. DL 01 AB 4920"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              style={{ textTransform: 'uppercase', fontFamily: 'var(--ps-font-mono)' }}
            />
          </div>

          {/* Dwell summary */}
          <div style={{
            backgroundColor: 'var(--ps-primary-light)',
            border: '1px solid var(--ps-secondary-light)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--ps-radius-sm)',
            margin: '1rem 0',
            fontSize: '0.8125rem',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <div>
              <span className="metadata">Reservation Window:</span>
              <div style={{ fontWeight: 600 }}>{bookingStartTime} – {computedEndTime}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="metadata">Total Duration:</span>
              <div style={{ fontWeight: 600 }}>{bookingDuration} {bookingDuration === 1 ? 'hour' : 'hours'}</div>
            </div>
          </div>

          {/* Price Calculation Banner */}
          <div style={{
            backgroundColor: 'var(--ps-secondary-light)',
            padding: '1rem',
            borderRadius: 'var(--ps-radius-sm)',
            margin: '1.25rem 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div className="metadata">Estimated Price</div>
              <div style={{ fontSize: '0.8125rem' }}>₹{selectedSpot.rate || selectedFacility.hourlyRate} × {bookingDuration} hours</div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{calculatedCost}</div>
          </div>

          <button className="btn btn-primary btn-block" onClick={handleProceedToReview}>
            Continue to Booking Review <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 7: BOOKING REVIEW
  // =========================================================================
  if (activeView === 'review' && selectedFacility && selectedSpot) {
    return (
      <div className="container" style={{ maxWidth: '600px' }}>
        {renderHoldExpiredModal()}

        <button className="btn btn-secondary btn-sm" onClick={() => setActiveView('date-time')} style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={16} /> Change Date & Time
        </button>

        {/* Hold Bar */}
        <div className={`hold-timer-bar ${holdSecondsLeft < 120 ? 'urgent' : ''}`} role="timer" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} />
            <span>Spot {selectedSpot.number} held for you</span>
          </div>
          <span style={{ fontFamily: 'var(--ps-font-mono)', fontWeight: 700 }}>{formatTimer(holdSecondsLeft)}</span>
        </div>

        <div className="card">
          <span className="eyebrow">STEP 2 OF 3</span>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '1.25rem' }}>Review Booking Details</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ps-secondary-light)' }}>
              <span className="metadata">Facility</span>
              <strong style={{ textAlign: 'right' }}>{selectedFacility.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ps-secondary-light)' }}>
              <span className="metadata">Assigned Space</span>
              <strong>{activeFloor} · Spot {selectedSpot.number}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ps-secondary-light)' }}>
              <span className="metadata">Spot Type</span>
              <span>{selectedSpot.type === 'EV' ? 'Electric Vehicle (EV)' : selectedSpot.type === 'ACCESSIBLE' ? 'Accessible' : 'Standard Bay'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ps-secondary-light)' }}>
              <span className="metadata">Date</span>
              <span>{bookingDate}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ps-secondary-light)' }}>
              <span className="metadata">Time Window</span>
              <span>{bookingStartTime} to {computedEndTime}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ps-secondary-light)' }}>
              <span className="metadata">Duration</span>
              <span>{bookingDuration} {bookingDuration === 1 ? 'hour' : 'hours'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ps-secondary-light)' }}>
              <span className="metadata">Vehicle Registration</span>
              <span style={{ fontFamily: 'var(--ps-font-mono)' }}>{vehiclePlate || 'DL 01 AB 4920'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', fontSize: '1.2rem' }}>
              <strong>Total Amount</strong>
              <strong style={{ color: 'var(--ps-primary-dark)' }}>₹{calculatedCost}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setActiveView('facility')}>
              Change Spot
            </button>
            <button className="btn btn-accent" style={{ flex: 2 }} onClick={() => setActiveView('payment')}>
              Confirm & Proceed to Payment <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 8: PAYMENT SCREEN
  // =========================================================================
  if (activeView === 'payment' && selectedFacility && selectedSpot) {
    if (paymentState === 'PROCESSING') {
      return (
        <div className="container" style={{ maxWidth: '540px', padding: '2rem 1rem' }}>
          <PaymentLoader amount={calculatedCost} message="Connecting to secure banking gateway..." />
        </div>
      );
    }

    return (
      <div className="container" style={{ maxWidth: '540px' }}>
        {renderHoldExpiredModal()}

        <button className="btn btn-secondary btn-sm" onClick={() => setActiveView('review')} style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={16} /> Back to Review
        </button>

        {/* Secured Session Bar with Hold Countdown */}
        <div className={`hold-timer-bar ${holdSecondsLeft < 120 ? 'urgent' : ''}`} role="timer" aria-live="polite">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={16} /> <span>Secured 256-bit Payment Session</span>
          </div>
          <span style={{ fontFamily: 'var(--ps-font-mono)', fontWeight: 700 }}>{formatTimer(holdSecondsLeft)}</span>
        </div>

        <div className="card">
          <span className="eyebrow">STEP 3 OF 3</span>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>Select Payment Method</h2>
          <p className="metadata" style={{ marginBottom: '1.5rem' }}>
            Pay ₹{calculatedCost} to complete reservation for {selectedFacility.name} (Spot {selectedSpot.number}).
          </p>

          {/* Payment Error / Conflict State */}
          {paymentError && (
            <div style={{
              backgroundColor: '#FDE8E8',
              color: '#9B1C1C',
              border: '1px solid #F87171',
              borderRadius: 'var(--ps-radius-sm)',
              padding: '0.85rem',
              marginBottom: '1.25rem',
              fontSize: '0.875rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                <AlertTriangle size={16} /> Payment Notice
              </div>
              <p>{paymentError}</p>
              {paymentState === 'CONFLICT' && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setActiveView('facility')}
                >
                  Choose Another Spot
                </button>
              )}
            </div>
          )}

          {/* Payment Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              { id: 'UPI', label: 'UPI / Google Pay / PhonePe / QR', icon: <Smartphone size={18} /> },
              { id: 'CARD', label: 'Credit or Debit Card', icon: <CreditCard size={18} /> },
              { id: 'NETBANKING', label: 'Net Banking (All Indian Banks)', icon: <Building size={18} /> }
            ].map((method) => (
              <label
                key={method.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.85rem',
                  border: paymentMethod === method.id ? '2px solid var(--ps-primary-dark)' : '1px solid rgba(112, 115, 113, 0.3)',
                  borderRadius: 'var(--ps-radius-sm)',
                  backgroundColor: paymentMethod === method.id ? 'var(--ps-secondary-light)' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'var(--ps-transition)'
                }}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === method.id}
                  onChange={() => setPaymentMethod(method.id)}
                />
                {method.icon}
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{method.label}</span>
              </label>
            ))}
          </div>

          {/* Edge-case developer verification toggle */}
          <div style={{
            backgroundColor: 'var(--ps-primary-light)',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--ps-radius-sm)',
            border: '1px dashed var(--ps-secondary-dark)',
            marginBottom: '1.25rem',
            fontSize: '0.75rem'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
              />
              <span>Simulate Payment Gateway Failure (Verification rejection test)</span>
            </label>
          </div>

          <button
            className="btn btn-accent btn-block"
            style={{ padding: '0.85rem', fontSize: '1rem', fontWeight: 700 }}
            onClick={handleExecutePayment}
            disabled={paymentState === 'PROCESSING' || isHoldExpired}
          >
            {paymentState === 'PROCESSING' ? (
              <ActionLoader text="Verifying Payment with Gateway..." />
            ) : (
              `Pay ₹${calculatedCost} & Confirm Spot`
            )}
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 9: BOOKING CONFIRMATION & DIGITAL PARKING PASS
  // =========================================================================
  if (activeView === 'confirmed' && confirmedBooking) {
    return (
      <div className="container" style={{ maxWidth: '640px', textAlign: 'center' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            width: '56px',
            height: '56px',
            backgroundColor: 'var(--ps-state-available-bg)',
            color: 'var(--ps-state-available)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <CheckCircle2 size={32} />
          </div>

          <h1 className="page-title" style={{ marginBottom: '0.35rem' }}>Your parking spot is confirmed.</h1>
          <p className="metadata">
            Confirmation #{confirmedBooking.id} · A digital parking pass has been generated.
          </p>
        </div>

        {/* Digital Parking Pass */}
        {renderDigitalPass(confirmedBooking)}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setActiveView('home')}>
            Book Another Spot
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setActiveView('bookings')}>
            View My Bookings
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 10: MY BOOKINGS & PASS VIEWER / CANCELLATION
  // =========================================================================
  if (activeView === 'bookings') {
    return (
      <div className="container" style={{ maxWidth: '840px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">My Bookings</h1>
            <p className="metadata">Manage your active, completed, and upcoming reservations</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setActiveView('home')}>
            + Find & Book Parking
          </button>
        </div>

        {/* Feedback Notifications */}
        {cancelNotification && (
          <div style={{
            backgroundColor: cancelNotification.type === 'success' ? 'var(--ps-state-available-bg)' : '#FDE8E8',
            color: cancelNotification.type === 'success' ? 'var(--ps-state-available)' : '#9B1C1C',
            border: `1px solid ${cancelNotification.type === 'success' ? 'rgba(46, 125, 50, 0.3)' : '#F87171'}`,
            borderRadius: 'var(--ps-radius-sm)',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{cancelNotification.message}</span>
            <button
              onClick={() => setCancelNotification(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
          {[
            { id: 'ALL', label: `All (${bookings.length})` },
            { id: 'ACTIVE', label: 'Active & Upcoming' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'CANCELLED', label: 'Cancelled' }
          ].map((tab) => (
            <button
              key={tab.id}
              className={`btn btn-sm ${bookingsFilter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setBookingsFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Bookings List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {displayedBookings.map((b) => {
            const isCancelled = b.status === 'CANCELLED' || b.status === 'CANCELED';
            const canCancel = !isCancelled && (b.status === 'CONFIRMED' || b.status === 'ACTIVE');

            return (
              <div key={b.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span className={`status-tag ${isCancelled ? 'blocked' : 'available'}`}>
                      {isCancelled ? 'CANCELLED' : b.status || 'CONFIRMED'}
                    </span>
                    <span className="metadata" style={{ fontFamily: 'var(--ps-font-mono)' }}>#{b.id}</span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>{b.facilityName}</h3>
                  <p className="metadata" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MapPin size={13} /> {b.facilityAddress}
                  </p>
                  <p className="metadata" style={{ marginTop: '0.25rem' }}>
                    <strong>{b.floor} · Spot {b.spotNumber}</strong> · {b.startTime} ({b.duration})
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right', marginRight: '0.5rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>₹{b.amount}</div>
                    <div className="metadata">{isCancelled ? 'Refunded' : 'Paid'}</div>
                  </div>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setActiveBookingDetail(b)}
                  >
                    <Ticket size={14} /> View Pass
                  </button>

                  {canCancel && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCancelModalBooking(b)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {displayedBookings.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
              <Car size={36} strokeWidth={1.5} style={{ color: 'var(--ps-secondary-dark)', margin: '0 auto 0.75rem' }} />
              <h3 style={{ marginBottom: '0.35rem' }}>No reservations found</h3>
              <p className="metadata" style={{ marginBottom: '1.25rem' }}>
                {bookingsFilter === 'ALL'
                  ? 'You have not reserved any parking bays yet.'
                  : `No ${bookingsFilter.toLowerCase()} reservations in this view.`}
              </p>
              <button className="btn btn-primary" onClick={() => setActiveView('home')}>
                Find Parking Now
              </button>
            </div>
          )}
        </div>

        {/* PASS VIEWER MODAL */}
        {activeBookingDetail && (
          <div className="modal-backdrop" onClick={() => setActiveBookingDetail(null)} role="dialog" aria-modal="true">
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px', padding: 0, overflow: 'hidden' }}>
              {renderDigitalPass(activeBookingDetail, () => setActiveBookingDetail(null))}
            </div>
          </div>
        )}

        {/* CANCELLATION CONFIRMATION MODAL */}
        {cancelModalBooking && (
          <div className="modal-backdrop" onClick={() => !cancelLoading && setCancelModalBooking(null)} role="dialog" aria-modal="true">
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--ps-primary-dark)' }}>Cancel Reservation?</h3>
                <button
                  onClick={() => setCancelModalBooking(null)}
                  disabled={cancelLoading}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ps-secondary-dark)' }}
                >
                  <X size={18} />
                </button>
              </div>

              <p className="metadata" style={{ marginBottom: '1.25rem', lineHeight: 1.5 }}>
                Are you sure you want to cancel booking <strong>#{cancelModalBooking.id}</strong> for Space <strong>{cancelModalBooking.spotNumber}</strong> at <strong>{cancelModalBooking.facilityName}</strong>?
              </p>

              <div style={{
                backgroundColor: 'var(--ps-primary-light)',
                border: '1px solid var(--ps-secondary-light)',
                borderRadius: 'var(--ps-radius-sm)',
                padding: '0.75rem',
                fontSize: '0.8125rem',
                marginBottom: '1.25rem'
              }}>
                <div>Time: {cancelModalBooking.startTime}</div>
                <div>Amount: ₹{cancelModalBooking.amount}</div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setCancelModalBooking(null)}
                  disabled={cancelLoading}
                >
                  Keep Booking
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, backgroundColor: 'var(--ps-state-occupied)', borderColor: 'var(--ps-state-occupied)' }}
                  onClick={handleConfirmCancel}
                  disabled={cancelLoading}
                >
                  {cancelLoading ? <ActionLoader text="Cancelling..." /> : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
