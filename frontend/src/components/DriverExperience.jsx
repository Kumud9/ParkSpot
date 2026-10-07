import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ParkingMap } from './ParkingMap';
import { VehicleTopDown } from './VehicleTopDown';
import { api, authStorage } from '../services/api';
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
  CheckCircle,
  Download,
  Lock,
  QrCode,
  Wrench
} from 'lucide-react';
import { Logo } from './shared/Logo';
import { MapLoader, PaymentLoader, ActionLoader } from './shared/Loading';
import LocationSearch from './parking/LocationSearch';
import NearbyParkingMap from './parking/NearbyParkingMap';
import NearbyFacilityCard from './parking/NearbyFacilityCard';
import ItinerarySearchBar from './parking/ItinerarySearchBar';
import './parking/driver-discovery.css';
import { locationService } from '../services/locationService';
import { receiptService } from '../services/receiptService';
import { PaymentSuccessAnimation } from './payment/PaymentSuccessAnimation';
import { NavigateToEntranceButton } from './driver/NavigateToEntranceButton';
import { ParkingCountdown } from './driver/ParkingCountdown';
import { FindMyCarModal } from './driver/FindMyCarModal';
import { VehicleManagement } from './driver/VehicleManagement';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function DriverExperience({
  facilities = [],
  bookings = [],
  onAddBooking,
  onCancelBooking,
  activeView,
  setActiveView,
  isLiveConnected = false,
  activeUser = null
}) {
  // -------------------------------------------------------------
  // FACILITY & SPOT SELECTION STATE
  // -------------------------------------------------------------
  const [selectedFacility, setSelectedFacility] = useState(() => facilities[0] || null);
  const [activeFloor, setActiveFloor] = useState('Floor 1');
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [inspectedNonAvailSpot, setInspectedNonAvailSpot] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [isFacilityLoading, setIsFacilityLoading] = useState(false);
  const [conflictNotice, setConflictNotice] = useState(null);

  // -------------------------------------------------------------
  // PHASE 4.4: LOCATION DISCOVERY STATE
  // -------------------------------------------------------------
  const [destination, setDestination] = useState(() => ({
    lat: 23.0734,
    lng: 72.6266,
    name: 'Ahmedabad Airport',
    city: 'Ahmedabad',
    isCurrentLocation: false
  }));
  const [nearbyRadius, setNearbyRadius] = useState(3); // 1, 3, 5, 10 km
  const [nearbySort, setNearbySort] = useState('recommended'); // 'recommended', 'nearest', 'price', 'availability'
  const [nearbyParkingType, setNearbyParkingType] = useState('ALL'); // 'ALL', 'EV', 'ACCESSIBLE', 'STANDARD'
  const [nearbyFacilities, setNearbyFacilities] = useState([]);
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);
  const [highlightedFacility, setHighlightedFacility] = useState(null);
  const [hoveredFacilityId, setHoveredFacilityId] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const routerLocation = useLocation();

  // Sync destination if passed from Landing Page search
  useEffect(() => {
    if (routerLocation.state?.destination) {
      setDestination(routerLocation.state.destination);
    }
  }, [routerLocation.state]);

  // Fetch nearby facilities when destination, radius, sort, or type filter changes
  useEffect(() => {
    let isCancelled = false;
    async function loadNearby() {
      if (!destination?.lat || !destination?.lng) return;
      setIsSearchingNearby(true);
      try {
        const res = await api.getNearbyFacilities({
          lat: destination.lat,
          lng: destination.lng,
          radius: nearbyRadius,
          sortBy: nearbySort,
          parkingType: nearbyParkingType
        });
        if (!isCancelled) {
          const list = res.facilities || [];
          setNearbyFacilities(list);
          if (list.length > 0) {
            setHighlightedFacility((prev) => {
              if (prev && list.some((f) => String(f.id) === String(prev.id))) {
                return prev;
              }
              return list[0];
            });
          } else {
            setHighlightedFacility(null);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[DriverExperience] Live nearby search failed:', err.message);
          // Graceful fallback from facilities prop
          const localList = facilities.map((f) => ({
            ...f,
            distanceFormatted: 'Nearby',
            availableSpots: f.availableSpots ?? 24,
            startingPrice: f.hourlyRate || 40,
            isOpen: true,
            supportedTypes: ['STANDARD', 'EV']
          }));
          setNearbyFacilities(localList);
        }
      } finally {
        if (!isCancelled) {
          setIsSearchingNearby(false);
        }
      }
    }

    loadNearby();
    return () => { isCancelled = true; };
  }, [destination, nearbyRadius, nearbySort, nearbyParkingType, isLiveConnected, refreshNonce]);

  // Periodic silent availability refresh (15 seconds) without resetting map position
  useEffect(() => {
    if (activeView !== 'home' && activeView !== 'search') return;
    if (!destination?.lat || !destination?.lng) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await api.getNearbyFacilities({
          lat: destination.lat,
          lng: destination.lng,
          radius: nearbyRadius,
          sortBy: nearbySort,
          parkingType: nearbyParkingType
        });
        if (res && res.facilities && Array.isArray(res.facilities)) {
          setNearbyFacilities(res.facilities);
        }
      } catch (_err) {
        // Silently continue
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [activeView, destination, nearbyRadius, nearbySort, nearbyParkingType]);

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
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  // Driver vehicle management & booking preselection
  const [driverVehicles, setDriverVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [findMyCarBooking, setFindMyCarBooking] = useState(null);

  // Fetch driver's vehicles and automatically preselect default vehicle
  useEffect(() => {
    let isCancelled = false;
    async function fetchVehicles() {
      if (!activeUser) return;
      try {
        const list = await api.getVehicles();
        if (!isCancelled && Array.isArray(list)) {
          setDriverVehicles(list);
          const defaultV = list.find((v) => v.isDefault) || list[0];
          if (defaultV) {
            setSelectedVehicle((prev) => prev || defaultV);
            setVehiclePlate((prev) => prev || defaultV.registrationNumber);
          }
        }
      } catch (err) {
        console.warn('[DriverExperience] Could not load driver vehicles:', err.message);
      }
    }
    fetchVehicles();
    return () => { isCancelled = true; };
  }, [activeUser]);

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
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [upiMode, setUpiMode] = useState('vpa'); // 'vpa' | 'qr'
  const [upiId, setUpiId] = useState('');
  const [upiError, setUpiError] = useState('');
  const [selectedBank, setSelectedBank] = useState('HDFC Bank');

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
  // ACTIONS: REFRESH & SYNCHRONIZATION
  // -------------------------------------------------------------
  const refreshFacilitySpots = useCallback(async (facilityIdOverride, customWindow) => {
    const targetFacilityId = facilityIdOverride || selectedFacility?.id;
    if (!targetFacilityId || !/^[a-f\d]{24}$/i.test(String(targetFacilityId))) return null;

    let windowParams = customWindow;
    if (!windowParams && bookingDate && bookingStartTime) {
      try {
        const startIso = new Date(`${bookingDate}T${bookingStartTime}:00`).toISOString();
        const endIso = new Date(new Date(`${bookingDate}T${bookingStartTime}:00`).getTime() + bookingDuration * 3600000).toISOString();
        windowParams = { startTime: startIso, endTime: endIso };
      } catch (_e) {}
    }

    try {
      const fresh = await api.getFacility(targetFacilityId, windowParams);
      if (fresh && fresh.spots) {
        setSelectedFacility((prev) => {
          if (!prev) return fresh;
          return {
            ...prev,
            ...fresh,
            spots: fresh.spots
          };
        });
        return fresh;
      }
    } catch (err) {
      console.warn('[DriverExperience] refreshFacilitySpots note:', err.message);
    }
    return null;
  }, [selectedFacility?.id, bookingDate, bookingStartTime, bookingDuration]);

  // Periodic silent availability sync (every 8 seconds) while browsing facility map
  useEffect(() => {
    if (activeView !== 'facility' || !selectedFacility?.id) return;
    refreshFacilitySpots();

    const intervalId = setInterval(() => {
      refreshFacilitySpots();
    }, 8000);

    return () => clearInterval(intervalId);
  }, [activeView, selectedFacility?.id, refreshFacilitySpots]);

  // -------------------------------------------------------------
  // ACTIONS: FACILITY & SPOT
  // -------------------------------------------------------------
  const handleSelectFacility = async (fac) => {
    setSelectedFacility(fac);
    setSelectedSpot(null);
    setInspectedNonAvailSpot(null);
    setConflictNotice(null);
    setActiveView('facility');

    if (isLiveConnected && /^[a-f\d]{24}$/i.test(fac.id)) {
      setIsFacilityLoading(true);
      try {
        await refreshFacilitySpots(fac.id);
      } catch (err) {
        console.info('[ParkSpot] Live facility fetch note:', err.message);
      } finally {
        setIsFacilityLoading(false);
      }
    }
  };

  const handleSpotClick = (spot) => {
    setConflictNotice(null);
    if (spot.status === 'AVAILABLE') {
      setSelectedSpot(spot);
      setInspectedNonAvailSpot(null);
    } else {
      setSelectedSpot(null);
      setInspectedNonAvailSpot(spot);
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

    // Re-check live spot availability for requested window before proceeding
    if (isLiveConnected && selectedFacility?.id && selectedSpot?.id) {
      try {
        const startIso = new Date(`${bookingDate}T${bookingStartTime}:00`).toISOString();
        const endIso = new Date(new Date(`${bookingDate}T${bookingStartTime}:00`).getTime() + bookingDuration * 3600000).toISOString();
        const fresh = await api.getFacility(selectedFacility.id, { startTime: startIso, endTime: endIso });
        if (fresh?.spots) {
          const matchingSpot = fresh.spots.find((s) => s.id === selectedSpot.id || s.number === selectedSpot.number);
          if (matchingSpot && (matchingSpot.status === 'OCCUPIED' || matchingSpot.status === 'RESERVED')) {
            setSelectedSpot(null);
            await refreshFacilitySpots();
            setConflictNotice({
              title: 'This spot was just booked.',
              message: 'Please choose another available spot.'
            });
            setActiveView('facility');
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

    if (paymentMethod === 'UPI' && upiMode === 'vpa') {
      const cleanVpa = upiId.trim();
      if (cleanVpa && !/^[\w.-]+@[\w.-]+$/.test(cleanVpa)) {
        setUpiError('Please enter a valid UPI ID (e.g. mobile@upi or username@okhdfcbank)');
        return;
      }
    }
    setUpiError('');

    setPaymentState('PROCESSING');
    setPaymentError(null);

    const startIso = new Date(`${bookingDate}T${bookingStartTime}:00`).toISOString();
    const endIso = new Date(new Date(`${bookingDate}T${bookingStartTime}:00`).getTime() + bookingDuration * 3600000).toISOString();

    // 1. LIVE BACKEND PAYMENT WORKFLOW
    if (isLiveConnected && selectedSpot?.id && /^[a-f\d]{24}$/i.test(selectedSpot.id)) {
      const currentToken = authStorage.getToken();
      if (!currentToken || !activeUser) {
        setShowCoinAnimation(false);
        setPaymentState('FAILED');
        setPaymentError('Your session has expired. Please sign in again to continue your reservation.');
        return;
      }
      try {
        // Step A: Create booking document on backend
        const bookingDoc = await api.createBooking({
          slotId: selectedSpot.id,
          startTime: startIso,
          endTime: endIso,
          type: bookingDuration >= 24 ? 'DAILY' : 'HOURLY',
          vehicleId: selectedVehicle?.id || null
        });

        const backendBookingId = bookingDoc._id || bookingDoc.id;

        // Step B: Create payment order
        const orderRes = await api.createPaymentOrder(backendBookingId);
        const order = orderRes?.order;
        const isRealRazorpay = Boolean(order?.keyId && !order.keyId.includes('mock'));

        if (isRealRazorpay) {
          await loadRazorpayScript();
          if (typeof window === 'undefined' || !window.Razorpay) {
            setPaymentState('FAILED');
            setShowCoinAnimation(false);
            setPaymentError('Razorpay payment gateway failed to initialize. Please check your internet connection.');
            return;
          }

          const options = {
            key: order.keyId,
            amount: order.amountPaise || Math.round(calculatedCost * 100),
            currency: order.currency || 'INR',
            name: 'ParkSpot',
            description: `Parking Reservation · Spot ${selectedSpot.number} (${selectedFacility.name})`,
            order_id: order.id,
            prefill: {
              name: activeUser?.name || 'ParkSpot Driver',
              email: activeUser?.email || 'driver@parkspot.in',
              contact: activeUser?.phone || '9876543210',
              ...(paymentMethod === 'UPI' && upiMode === 'vpa' && upiId.trim() ? { vpa: upiId.trim() } : {}),
              ...(paymentMethod === 'CARD' ? { method: 'card' } : {}),
              ...(paymentMethod === 'NETBANKING' ? { method: 'netbanking' } : {}),
              ...(paymentMethod === 'UPI' ? { method: 'upi' } : {})
            },
            notes: {
              bookingId: String(backendBookingId),
              facilityName: selectedFacility.name,
              spotNumber: selectedSpot.number
            },
            theme: {
              color: '#25221B'
            },
            modal: {
              ondismiss: () => {
                setPaymentState('FAILED');
                setShowCoinAnimation(false);
                setPaymentError('Payment was cancelled. Your parking spot has not been confirmed. You can try again or select another payment method.');
              }
            },
            handler: async (response) => {
              // Razorpay returned payment info - must verify on backend!
              setPaymentState('PROCESSING');
              try {
                const verifyPayload = {
                  orderId: response.razorpay_order_id,
                  paymentId: response.razorpay_payment_id,
                  signature: simulateFailure ? 'invalid_tampered_signature' : response.razorpay_signature
                };

                const verifyRes = await api.verifyPayment(verifyPayload);

                if (verifyRes?.success) {
                  const newBooking = {
                    id: String(backendBookingId),
                    facilityId: selectedFacility.id,
                    facilityName: selectedFacility.name,
                    facilityAddress: selectedFacility.address,
                    lot: selectedFacility,
                    latitude: selectedFacility.latitude ?? (selectedFacility.location?.coordinates ? selectedFacility.location.coordinates[1] : null),
                    longitude: selectedFacility.longitude ?? (selectedFacility.location?.coordinates ? selectedFacility.location.coordinates[0] : null),
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
                    paymentId: response.razorpay_payment_id || `PAY-${String(backendBookingId).slice(-8).toUpperCase()}`,
                    transactionId: response.razorpay_payment_id,
                    orderId: response.razorpay_order_id,
                    verificationCode: `PS-PASS-${String(backendBookingId).slice(-8).toUpperCase()}-${selectedSpot.number}`,
                    vehicle: selectedVehicle || null,
                    vehiclePlate: vehiclePlate.trim() || selectedVehicle?.registrationNumber || 'DL 01 AB 4920',
                    alreadyPersisted: true
                  };

                  onAddBooking && onAddBooking(newBooking);
                  setConfirmedBooking(newBooking);
                  setPaymentState('SUCCESS');
                  setShowCoinAnimation(true);
                  refreshFacilitySpots();
                } else {
                  setPaymentState('FAILED');
                  setShowCoinAnimation(false);
                  setPaymentError('Payment verification could not be completed.');
                }
              } catch (verifyErr) {
                setPaymentState('FAILED');
                setShowCoinAnimation(false);
                setPaymentError(verifyErr.message || 'Payment signature verification failed. Spot reservation was not confirmed.');
              }
            }
          };

          const rzp = new window.Razorpay(options);
          rzp.on('payment.failed', (errResp) => {
            setPaymentState('FAILED');
            setShowCoinAnimation(false);
            setPaymentError(errResp.error?.description || 'Payment was declined by payment gateway or bank.');
          });
          rzp.open();
          return;
        }

        // Mock fallback mode (only used when MOCK_PAYMENT is enabled or test mode)
        const orderId = order?.id || `ord_${Date.now()}`;
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
            setShowCoinAnimation(false);
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
          lot: selectedFacility,
          latitude: selectedFacility.latitude ?? (selectedFacility.location?.coordinates ? selectedFacility.location.coordinates[1] : null),
          longitude: selectedFacility.longitude ?? (selectedFacility.location?.coordinates ? selectedFacility.location.coordinates[0] : null),
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
          vehicle: selectedVehicle || null,
          vehiclePlate: vehiclePlate.trim() || selectedVehicle?.registrationNumber || 'DL 01 AB 4920',
          alreadyPersisted: true
        };

        onAddBooking && onAddBooking(newBooking);
        setConfirmedBooking(newBooking);
        setPaymentState('SUCCESS');
        setShowCoinAnimation(true);
        refreshFacilitySpots();
      } catch (err) {
        setShowCoinAnimation(false);
        const isConflict =
          err.status === 409 ||
          err.code === 'SPOT_ALREADY_BOOKED' ||
          err.message?.includes('SLOT_UNAVAILABLE') ||
          err.message?.includes('SPOT_ALREADY_BOOKED') ||
          err.message?.toLowerCase().includes('already booked') ||
          err.message?.toLowerCase().includes('unavailable');

        if (isConflict) {
          setSelectedSpot(null);
          await refreshFacilitySpots();
          setActiveView('facility');
          setConflictNotice({
            title: 'This spot was just booked.',
            message: 'Please choose another available spot.'
          });
          setPaymentState('IDLE');
          setPaymentError(null);
          return;
        } else if (
          err.status === 401 ||
          err.code === 'AUTH_REQUIRED' ||
          err.message?.toLowerCase().includes('bearer') ||
          err.message?.toLowerCase().includes('token') ||
          err.message?.toLowerCase().includes('session')
        ) {
          setPaymentState('FAILED');
          setPaymentError('Your session has expired. Please sign in again to continue your reservation.');
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
        setShowCoinAnimation(false);
        setPaymentError('Payment Verification Failed: Gateway declined payment authorization. Please try another payment instrument.');
        return;
      }

      const demoId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
      const newBooking = {
        id: demoId,
        facilityId: selectedFacility?.id || 'fac-demo',
        facilityName: selectedFacility?.name || 'Central Business District Parking',
        facilityAddress: selectedFacility?.address || '14 Connaught Place',
        lot: selectedFacility,
        latitude: selectedFacility?.latitude,
        longitude: selectedFacility?.longitude,
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
        vehicle: selectedVehicle || null,
        vehiclePlate: vehiclePlate.trim() || selectedVehicle?.registrationNumber || 'DL 01 AB 4920',
        isDemo: true
      };

      onAddBooking && onAddBooking(newBooking);
      setConfirmedBooking(newBooking);
      setPaymentState('SUCCESS');
      setShowCoinAnimation(true);
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
      refreshFacilitySpots();
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

  // Helper to render Find My Car modal
  const renderFindMyCarModal = () => {
    if (!findMyCarBooking) return null;
    const fac = facilities.find(
      (f) => f.id === findMyCarBooking.facilityId || f.name === findMyCarBooking.facilityName
    );
    return (
      <FindMyCarModal
        booking={findMyCarBooking}
        facility={fac}
        facilitySpots={fac?.spots || []}
        onClose={() => setFindMyCarBooking(null)}
      />
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
              <span className="metadata">Vehicle</span>
              <div style={{ fontWeight: 600, fontFamily: 'var(--ps-font-mono)' }}>
                {booking.vehicle ? `${booking.vehicle.make} ${booking.vehicle.model}` : (booking.vehiclePlate ? 'Registered' : 'Standard')}
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--ps-font-mono)', color: 'var(--ps-secondary-dark)' }}>
                {booking.vehiclePlate || booking.vehicle?.registrationNumber || 'DL 01 AB 4920'}
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

          {/* Driver Actions: Navigate to Entrance, Find My Car, View Parking Map */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '1rem' }}>
            <NavigateToEntranceButton
              booking={booking}
              facility={facilities.find((f) => f.id === booking.facilityId || f.name === booking.facilityName)}
              showDistance={true}
            />

            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}
                onClick={() => setFindMyCarBooking(booking)}
              >
                <Car size={15} /> Find My Car
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}
                onClick={() => {
                  const fac = facilities.find((f) => f.id === booking.facilityId || f.name === booking.facilityName);
                  if (fac) {
                    setSelectedFacility(fac);
                    setActiveFloor(booking.floor || 'Floor 1');
                    setSelectedSpot(fac.spots?.find((s) => s.number === booking.spotNumber || s.id === booking.spotId) || null);
                    setActiveView('facility');
                    if (onClose) onClose();
                  }
                }}
              >
                <MapPin size={15} /> View Parking Map
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="download-receipt-btn"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => receiptService.downloadReceipt(booking)}
            >
              <Download size={15} />
              <span>Download Receipt</span>
            </button>
            {onClose && (
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                Close Pass
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // =========================================================================
  // MAP-FIRST DRIVER FIND PARKING EXPERIENCE (70-75% MAP, 25-30% SIDEBAR)
  // =========================================================================
  // =========================================================================
  // PARKSPOT — REDESIGNED DRIVER DISCOVERY / FIND PARKING PAGE
  // =========================================================================
  if (activeView === 'home' || activeView === 'search') {
    const currentContextFacility = highlightedFacility || nearbyFacilities[0] || null;

    return (
      <div className="driver-discovery-page">
        {/* 1. TOP COMPACT ITINERARY / SEARCH BAR */}
        <ItinerarySearchBar
          destination={destination}
          onDestinationSelect={(loc) => {
            setDestination(loc);
            setHighlightedFacility(null);
          }}
          bookingDate={bookingDate}
          onDateChange={(d) => setBookingDate(d)}
          bookingStartTime={bookingStartTime}
          onStartTimeChange={(t) => setBookingStartTime(t)}
          bookingDuration={bookingDuration}
          onDurationChange={(dur) => setBookingDuration(dur)}
          radius={nearbyRadius}
          onRadiusChange={(r) => setNearbyRadius(r)}
          onUpdate={() => setRefreshNonce((prev) => prev + 1)}
          isSearching={isSearchingNearby}
        />

        {/* 2. MAIN COMPARISON LAYOUT (LEFT 56-60%, RIGHT 40-44%) */}
        <div className="discovery-main">
          {/* LEFT COLUMN: Results Header + Stacked Facility Cards */}
          <div className="discovery-left-col">
            {/* Results Header Strip */}
            <div className="results-header-strip">
              <div className="results-header-info">
                <h2 className="results-main-heading">
                  {nearbyFacilities.length} Parking {nearbyFacilities.length === 1 ? 'Facility' : 'Facilities'} near {destination?.name || 'Destination'}
                </h2>
                <p className="results-sub-heading">
                  Ranked by walking proximity and real-time bay availability.
                </p>
              </div>

              {/* Sort Selector */}
              <div className="results-sort-container">
                <label htmlFor="facility-sort-select" className="sort-select-label">Sort:</label>
                <select
                  id="facility-sort-select"
                  className="facility-sort-select"
                  value={nearbySort}
                  onChange={(e) => setNearbySort(e.target.value)}
                  aria-label="Sort facilities"
                >
                  <option value="recommended">Recommended</option>
                  <option value="nearest">Nearest</option>
                  <option value="price">Price: Low to High</option>
                  <option value="availability">Most Available</option>
                </select>
              </div>
            </div>

            {/* Parking Type Quick Filter Chips */}
            <div className="results-type-filter-bar">
              {[
                { id: 'ALL', label: 'All Spaces' },
                { id: 'EV', label: '⚡ EV Charging' },
                { id: 'ACCESSIBLE', label: '♿ Accessible' },
                { id: 'STANDARD', label: '🅿️ Standard' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`type-filter-btn ${nearbyParkingType === t.id ? 'is-active' : ''}`}
                  onClick={() => setNearbyParkingType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Facilities Cards Stack or Empty State */}
            {isSearchingNearby && nearbyFacilities.length === 0 ? (
              <div className="discovery-skeleton-list">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="facility-skeleton-card">
                    <div className="skeleton-line title" />
                    <div className="skeleton-line sub" />
                    <div className="skeleton-line row" />
                  </div>
                ))}
              </div>
            ) : nearbyFacilities.length > 0 ? (
              <div className="discovery-cards-stack">
                {nearbyFacilities.map((fac, idx) => (
                  <NearbyFacilityCard
                    key={fac.id}
                    facility={fac}
                    isSelected={highlightedFacility && String(highlightedFacility.id) === String(fac.id)}
                    isRecommended={idx === 0}
                    onSelect={(f) => setHighlightedFacility(f)}
                    onHover={(id) => setHoveredFacilityId(id)}
                    onViewSpaces={handleSelectFacility}
                  />
                ))}
              </div>
            ) : (
              <div className="discovery-empty-state">
                <div className="empty-icon-wrap">
                  <MapPin size={24} />
                </div>
                <h3 className="empty-heading">No ParkSpot facilities found</h3>
                <p className="empty-desc">
                  No active locations found within {nearbyRadius} km of <strong>{destination?.name || 'this location'}</strong>. Try expanding your search radius.
                </p>
                <div className="empty-actions-row">
                  {nearbyRadius < 5 && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setNearbyRadius(5)}
                    >
                      Expand to 5 km
                    </button>
                  )}
                  {nearbyRadius < 10 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setNearbyRadius(10)}
                    >
                      Expand to 10 km
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setDestination({
                        lat: 23.0734,
                        lng: 72.6266,
                        name: 'Ahmedabad Airport',
                        city: 'Ahmedabad',
                        isCurrentLocation: false
                      });
                    }}
                  >
                    Search Ahmedabad Airport
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Map Header + Mapbox Map (320px) + Context Card + Notice */}
          <div className="discovery-right-col">
            {/* Map Header */}
            <div className="map-context-header">
              <div className="map-context-eyebrow">ITINERARY CONTEXT</div>
              <div className="map-context-summary-row">
                <div className="map-context-dest">
                  <MapPin size={13} className="inline-icon" />
                  <span>{destination?.name || 'Selected Destination'}</span>
                </div>
                <div className="map-context-badge">
                  <span className="context-dot" />
                  <span>{nearbyRadius} km radius · {nearbyFacilities.length} {nearbyFacilities.length === 1 ? 'facility' : 'facilities'}</span>
                </div>
              </div>
            </div>

            {/* Mapbox Map (compact height ~320px) */}
            <div className="driver-map-card">
              <NearbyParkingMap
                facilities={nearbyFacilities}
                destination={destination}
                selectedFacility={highlightedFacility}
                hoveredFacilityId={hoveredFacilityId}
                radius={nearbyRadius}
                onSelectFacility={(fac) => setHighlightedFacility(fac)}
                onViewSpaces={handleSelectFacility}
              />
            </div>

            {/* Below-Map Context Card */}
            <div className="driver-context-card">
              <div className="context-card-top">
                <span className="context-card-eyebrow">PARKING CONTEXT</span>
                {currentContextFacility && (
                  <span className="context-bay-pill">
                    ● {currentContextFacility.availableSpots ?? 0} bays available
                  </span>
                )}
              </div>
              {currentContextFacility ? (
                <div className="context-card-details">
                  <h4 className="context-facility-heading">{currentContextFacility.name}</h4>
                  <p className="context-facility-sub">
                    {currentContextFacility.address}{currentContextFacility.city ? `, ${currentContextFacility.city}` : ''}
                  </p>
                  <div className="context-guidance-line">
                    <span className="guidance-dot" />
                    <span>
                      Dedicated pedestrian and vehicular access toward {destination?.name || 'destination'}.
                      {currentContextFacility.distanceFormatted ? ` Estimated ${currentContextFacility.distanceFormatted} away.` : ''}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="context-card-details">
                  <h4 className="context-facility-heading">Search Area</h4>
                  <p className="context-facility-sub">
                    Displaying facilities within {nearbyRadius} km of {destination?.name || 'destination'}. Select any facility to review bay access.
                  </p>
                </div>
              )}
            </div>

            {/* Information Notice */}
            <div className="driver-pricing-notice">
              <p>Availability and pricing are confirmed during reservation.</p>
            </div>
          </div>
        </div>
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

        {/* Conflict Notice Alert */}
        {conflictNotice && (
          <div
            role="alert"
            style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #F87171',
              borderRadius: 'var(--ps-radius-sm)',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertTriangle size={22} color="#DC2626" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, color: '#991B1B', fontSize: '0.9375rem' }}>
                  {conflictNotice.title || 'This spot was just booked.'}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#7F1D1D' }}>
                  {conflictNotice.message || 'Please choose another available spot.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConflictNotice(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#991B1B',
                padding: '4px'
              }}
              aria-label="Dismiss notice"
            >
              <X size={18} />
            </button>
          </div>
        )}

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
                  setInspectedNonAvailSpot(null);
                  setConflictNotice(null);
                  refreshFacilitySpots();
                }}
                spots={currentFloorSpots}
                selectedSpotId={selectedSpot?.id}
                onSelectSpot={handleSpotClick}
                currentUserId={activeUser?.id || activeUser?._id}
                userBookings={bookings}
              />
            )}
          </div>

          {/* SCREEN 5: SPOT DETAILS SIDEBAR / DRAWER */}
          <div>
            {selectedSpot ? (
              <div className="card" style={{ position: 'sticky', top: '80px', border: '2px solid var(--ps-accent-light)' }}>
                <div className="booking-flow-brand-header" style={{ marginBottom: '0.65rem' }}>
                  <Logo variant="full" size="sm" theme="light" />
                  <span className="booking-flow-step-tag">Bay Inspection</span>
                </div>
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
            ) : inspectedNonAvailSpot ? (
              <div className="card" style={{ position: 'sticky', top: '80px', border: '1px solid var(--ps-secondary-light)' }}>
                <div className="booking-flow-brand-header" style={{ marginBottom: '0.65rem' }}>
                  <Logo variant="full" size="sm" theme="light" />
                  <span className="booking-flow-step-tag">Bay Status</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span className={`status-tag ${inspectedNonAvailSpot.status.toLowerCase()}`}>
                    {inspectedNonAvailSpot.status === 'OCCUPIED' ? 'OCCUPIED BY VEHICLE' : inspectedNonAvailSpot.status === 'RESERVED' ? 'RESERVED BAY' : 'UNDER MAINTENANCE'}
                  </span>
                  <button
                    onClick={() => setInspectedNonAvailSpot(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ps-secondary-dark)' }}
                    aria-label="Close inspection"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div style={{
                  backgroundColor: 'var(--ps-asphalt-ground)',
                  borderRadius: 'var(--ps-radius-sm)',
                  padding: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                  minHeight: '130px'
                }}>
                  {inspectedNonAvailSpot.status === 'OCCUPIED' ? (
                    <VehicleTopDown color="#3E444E" status="OCCUPIED" width={48} height={82} />
                  ) : inspectedNonAvailSpot.status === 'RESERVED' ? (
                    <div style={{ textAlign: 'center', color: '#F3F456' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.875rem', letterSpacing: '0.05em' }}>RESERVED PASS</div>
                      <div style={{ fontSize: '0.75rem', color: '#A3A398', marginTop: '4px' }}>Active driver booking assigned</div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#A3A398' }}>
                      <Wrench size={28} strokeWidth={1.5} style={{ margin: '0 auto 6px' }} />
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>ROUTINE MAINTENANCE</div>
                    </div>
                  )}
                </div>

                <h3 style={{ fontSize: '1.35rem', marginBottom: '0.25rem' }}>Space {inspectedNonAvailSpot.number}</h3>
                <p className="metadata" style={{ marginBottom: '1rem' }}>
                  {activeFloor} · {inspectedNonAvailSpot.type || 'Standard'} Bay
                </p>

                <div style={{
                  backgroundColor: 'rgba(0,0,0,0.03)',
                  padding: '0.85rem',
                  borderRadius: 'var(--ps-radius-sm)',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  color: 'var(--ps-secondary-dark)',
                  lineHeight: '1.4'
                }}>
                  {inspectedNonAvailSpot.status === 'OCCUPIED' && 'This bay is currently occupied by a parked vehicle and cannot be reserved for this period.'}
                  {inspectedNonAvailSpot.status === 'RESERVED' && 'This bay is currently reserved by another driver under an active reservation.'}
                  {inspectedNonAvailSpot.status === 'MAINTENANCE' && 'This space is temporarily offline for inductive sensor maintenance.'}
                </div>

                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => setInspectedNonAvailSpot(null)}
                >
                  Select an Available Bay
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
          <div className="booking-flow-brand-header">
            <Logo variant="full" size="sm" theme="light" />
            <span className="booking-flow-step-tag">Step 1 of 3 · Schedule</span>
          </div>
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

          {/* Vehicle Selection Integration */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="form-label" htmlFor="res-vehicle" style={{ margin: 0 }}>Vehicle</label>
              <button
                type="button"
                onClick={() => setActiveView('vehicles')}
                style={{ fontSize: '0.75rem', color: 'var(--ps-secondary-dark)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Manage Vehicles
              </button>
            </div>

            {driverVehicles && driverVehicles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <select
                  id="res-vehicle"
                  className="form-select"
                  value={selectedVehicle?.id || 'manual'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'manual') {
                      setSelectedVehicle(null);
                    } else {
                      const found = driverVehicles.find((v) => v.id === val);
                      if (found) {
                        setSelectedVehicle(found);
                        setVehiclePlate(found.registrationNumber);
                      }
                    }
                  }}
                  style={{ fontFamily: 'var(--ps-font-mono)', fontSize: '0.875rem' }}
                >
                  {driverVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nickname || `${v.make} ${v.model}`} · {v.registrationNumber}{v.isDefault ? ' (Default)' : ''}
                    </option>
                  ))}
                  <option value="manual">+ Enter different vehicle plate...</option>
                </select>

                {(!selectedVehicle || selectedVehicle === 'manual') && (
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter registration number (e.g. DL 01 AB 4920)"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    style={{ textTransform: 'uppercase', fontFamily: 'var(--ps-font-mono)', marginTop: '0.25rem' }}
                  />
                )}
              </div>
            ) : (
              <div>
                <input
                  id="res-plate"
                  type="text"
                  className="form-input"
                  placeholder="e.g. DL 01 AB 4920"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  style={{ textTransform: 'uppercase', fontFamily: 'var(--ps-font-mono)' }}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--ps-secondary-dark)', marginTop: '0.35rem' }}>
                  Tip: Register your vehicle in <strong>My Vehicles</strong> to auto-fill every time.
                </div>
              </div>
            )}
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
          <div className="booking-flow-brand-header">
            <Logo variant="full" size="sm" theme="light" />
            <span className="booking-flow-step-tag">Step 2 of 3 · Verification</span>
          </div>
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
              <span className="metadata">Vehicle</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600 }}>
                  {selectedVehicle ? (selectedVehicle.nickname || `${selectedVehicle.make} ${selectedVehicle.model}`) : 'Standard Vehicle'}
                </div>
                <div style={{ fontFamily: 'var(--ps-font-mono)', fontSize: '0.8125rem', color: 'var(--ps-secondary-dark)' }}>
                  {vehiclePlate || selectedVehicle?.registrationNumber || 'DL 01 AB 4920'}
                </div>
              </div>
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
    // If user is not authenticated, do not show payment form
    if (!activeUser || !authStorage.getToken()) {
      return (
        <div className="container" style={{ maxWidth: '540px', padding: '3rem 1rem', textAlign: 'center' }}>
          <div className="booking-flow-card" style={{ padding: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: '#B2A240' }}>
              <Lock size={44} />
            </div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--ps-primary-dark)' }}>
              Authentication Required
            </h2>
            <p style={{ color: 'var(--ps-secondary-dark)', marginBottom: '1.75rem', fontSize: '0.925rem', lineHeight: 1.55 }}>
              Your session has expired or you are not signed in. Please sign in to continue your reservation for {selectedFacility.name}.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveView('review')}
              >
                Back to Review
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  window.location.href = '/login';
                }}
              >
                Sign In to Continue
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (showCoinAnimation) {
      return (
        <PaymentSuccessAnimation
          amount={calculatedCost}
          facilityName={selectedFacility.name}
          spotNumber={selectedSpot.number}
          onComplete={() => {
            setShowCoinAnimation(false);
            setActiveView('confirmed');
          }}
        />
      );
    }

    if (paymentState === 'FAILED') {
      return (
        <div className="container" style={{ maxWidth: '560px', padding: '2rem 1rem' }}>
          <div className="card text-center" style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
            <div style={{
              width: '56px',
              height: '56px',
              backgroundColor: '#FDE8E8',
              color: '#DC2626',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}>
              <AlertTriangle size={32} />
            </div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--ps-primary-dark)' }}>
              Payment unsuccessful
            </h2>
            <p style={{ color: 'var(--ps-secondary-dark)', marginBottom: '1.25rem', fontSize: '0.95rem' }}>
              Your parking spot has not been confirmed.
            </p>
            {paymentError && (
              <div style={{
                backgroundColor: '#FDE8E8',
                color: '#9B1C1C',
                border: '1px solid #F87171',
                borderRadius: 'var(--ps-radius-sm)',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                  <AlertTriangle size={15} /> Gateway Notice
                </div>
                <span>{paymentError}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setPaymentState('IDLE');
                  setPaymentError(null);
                  setActiveView('review');
                }}
              >
                Back to Review
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => {
                  setPaymentState('IDLE');
                  setPaymentError(null);
                }}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (paymentState === 'CREATING_ORDER' || paymentState === 'PROCESSING') {
      return (
        <div className="container" style={{ maxWidth: '540px', padding: '2rem 1rem' }}>
          <PaymentLoader
            amount={calculatedCost}
            message={paymentState === 'CREATING_ORDER' ? 'Initializing secure Razorpay order...' : 'Verifying payment signature with banking gateway...'}
          />
        </div>
      );
    }

    return (
      <div className="container" style={{ maxWidth: '560px' }}>
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
          {/* Booking Flow Brand Header */}
          <div className="booking-flow-brand-header">
            <Logo variant="full" size="sm" theme="light" />
            <span className="booking-flow-step-tag">Step 3 of 3 · Checkout</span>
          </div>

          <h2 style={{ fontSize: '1.35rem', marginBottom: '0.35rem' }}>Select Payment Method</h2>
          <p className="metadata" style={{ marginBottom: '1.25rem' }}>
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
              {paymentError.includes('sign in') && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: '0.65rem' }}
                  onClick={() => { window.location.href = '/login'; }}
                >
                  Sign In to Continue
                </button>
              )}
              {paymentState === 'CONFLICT' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => setActiveView('facility')}
                >
                  Choose Another Spot
                </button>
              )}
            </div>
          )}

          {/* Payment Method Tabs */}
          <div className="payment-tabs-strip">
            <button
              type="button"
              className={`payment-tab-btn ${paymentMethod === 'UPI' ? 'active' : ''}`}
              onClick={() => { setPaymentMethod('UPI'); setUpiError(''); }}
            >
              <Smartphone size={20} />
              <span>UPI & QR</span>
            </button>
            <button
              type="button"
              className={`payment-tab-btn ${paymentMethod === 'CARD' ? 'active' : ''}`}
              onClick={() => setPaymentMethod('CARD')}
            >
              <CreditCard size={20} />
              <span>Debit / Credit</span>
            </button>
            <button
              type="button"
              className={`payment-tab-btn ${paymentMethod === 'NETBANKING' ? 'active' : ''}`}
              onClick={() => setPaymentMethod('NETBANKING')}
            >
              <Building size={20} />
              <span>Net Banking</span>
            </button>
          </div>

          {/* Payment Method Details Panel */}
          <div className="payment-method-panel">
            {/* UPI Option */}
            {paymentMethod === 'UPI' && (
              <div>
                <div className="upi-sub-switch">
                  <button
                    type="button"
                    className={`upi-switch-btn ${upiMode === 'vpa' ? 'active' : ''}`}
                    onClick={() => { setUpiMode('vpa'); setUpiError(''); }}
                  >
                    UPI ID / VPA
                  </button>
                  <button
                    type="button"
                    className={`upi-switch-btn ${upiMode === 'qr' ? 'active' : ''}`}
                    onClick={() => setUpiMode('qr')}
                  >
                    Dynamic Order QR
                  </button>
                </div>

                {upiMode === 'vpa' ? (
                  <div>
                    <label className="form-label" htmlFor="upi-vpa-input">Enter UPI ID</label>
                    <input
                      id="upi-vpa-input"
                      type="text"
                      className="form-input"
                      placeholder="e.g. mobile@upi or username@okhdfcbank"
                      value={upiId}
                      onChange={(e) => {
                        setUpiId(e.target.value);
                        if (upiError) setUpiError('');
                      }}
                    />
                    {upiError && (
                      <span style={{ color: '#C62828', fontSize: '0.75rem', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                        {upiError}
                      </span>
                    )}

                    <div className="vpa-chips-row">
                      {['@okhdfcbank', '@okaxis', '@ybl', '@ibl', '@paytm', '@upi'].map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          className="vpa-chip"
                          onClick={() => {
                            const prefix = upiId.includes('@') ? upiId.split('@')[0] : upiId || 'driver';
                            setUpiId(`${prefix}${handle}`);
                            setUpiError('');
                          }}
                        >
                          {handle}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="dynamic-qr-box" style={{ padding: '1.25rem', backgroundColor: '#FFFFFF', border: '1px solid var(--ps-secondary-light)', borderRadius: '8px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--ps-primary-light)',
                      color: 'var(--ps-primary-dark)',
                      marginBottom: '0.75rem'
                    }}>
                      <QrCode size={36} />
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--ps-primary-dark)', marginBottom: '0.25rem' }}>
                      Razorpay Dynamic UPI QR
                    </span>
                    <span style={{
                      display: 'inline-block',
                      backgroundColor: '#FEF08A',
                      color: '#854D0E',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      padding: '0.2rem 0.65rem',
                      borderRadius: '4px',
                      marginBottom: '0.5rem'
                    }}>
                      Pay ₹{calculatedCost}
                    </span>
                    <p style={{ fontSize: '0.8125rem', color: '#707371', margin: '0 0 0.75rem', maxWidth: '380px' }}>
                      A real transaction-specific dynamic QR code for exactly <strong>₹{calculatedCost}</strong> will be generated directly via the official Razorpay Checkout gateway.
                    </p>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      {['Google Pay', 'PhonePe', 'Paytm', 'BHIM', 'CRED'].map((app) => (
                        <span key={app} style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: '#F3F4F6',
                          color: '#374151'
                        }}>
                          {app}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.6875rem', color: '#707371' }}>
                      Hold Session Active · Valid for {formatTimer(holdSecondsLeft)}
                    </span>
                  </div>
                )}

                <div className="payment-security-callout">
                  <ShieldCheck size={16} style={{ color: '#10B981', flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    <strong>Zero-Knowledge UPI:</strong> ParkSpot never asks for or stores your UPI PIN. Payment authorization takes place exclusively in your verified UPI app.
                  </span>
                </div>
              </div>
            )}

            {/* Card Option */}
            {paymentMethod === 'CARD' && (
              <div>
                <div className="card-brands-row" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <span className="card-brand-badge">VISA</span>
                  <span className="card-brand-badge">Mastercard</span>
                  <span className="card-brand-badge">RuPay</span>
                  <span className="card-brand-badge">American Express</span>
                  <span className="card-brand-badge">Maestro</span>
                  <span className="card-brand-badge">Diners Club</span>
                </div>

                <div style={{
                  padding: '1.25rem',
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <CreditCard size={20} style={{ color: 'var(--ps-primary-dark)' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--ps-primary-dark)' }}>
                      Razorpay Secure Card Gateway
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#4B5563', lineHeight: 1.5, margin: 0 }}>
                    Enter your card details safely in the official Razorpay PCI-DSS Level 1 compliant checkout interface. Supports all domestic and international Credit and Debit cards.
                  </p>
                </div>

                <div className="payment-security-callout">
                  <Lock size={16} style={{ color: '#10B981', flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    <strong>PCI-DSS Certified Security:</strong> ParkSpot never asks for, sees, or stores your Card Number, CVV, Card PIN, or OTP. All sensitive card processing is handled directly by Razorpay.
                  </span>
                </div>
              </div>
            )}

            {/* Net Banking Option */}
            {paymentMethod === 'NETBANKING' && (
              <div>
                <span className="form-label">Select Your Bank</span>
                <div className="bank-grid-select">
                  {[
                    'HDFC Bank',
                    'State Bank of India',
                    'ICICI Bank',
                    'Axis Bank',
                    'Kotak Mahindra Bank',
                    'Punjab National Bank',
                    'Bank of Baroda',
                    'Canara Bank'
                  ].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      className={`bank-option-pill ${selectedBank === bank ? 'active' : ''}`}
                      onClick={() => setSelectedBank(bank)}
                    >
                      <Building size={14} />
                      <span>{bank}</span>
                    </button>
                  ))}
                </div>

                <label className="form-label" htmlFor="other-banks-select">Or choose from 50+ other supported Indian banks</label>
                <select
                  id="other-banks-select"
                  className="form-select"
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                >
                  <option value="Union Bank of India">Union Bank of India</option>
                  <option value="IndusInd Bank">IndusInd Bank</option>
                  <option value="IDFC FIRST Bank">IDFC FIRST Bank</option>
                  <option value="Federal Bank">Federal Bank</option>
                  <option value="Yes Bank">Yes Bank</option>
                  <option value="RBL Bank">RBL Bank</option>
                  <option value="South Indian Bank">South Indian Bank</option>
                </select>

                <div className="payment-security-callout">
                  <ShieldCheck size={16} style={{ color: '#10B981', flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    <strong>Bank-Grade Redirection:</strong> You will be securely connected to {selectedBank}'s official Net Banking authentication portal via Razorpay. ParkSpot never collects your net banking password or OTP.
                  </span>
                </div>
              </div>
            )}
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
              <span>Simulate Gateway Verification Failure (Rejection test)</span>
            </label>
          </div>

          <button
            className="btn btn-accent btn-block"
            style={{ padding: '0.85rem', fontSize: '1rem', fontWeight: 700 }}
            onClick={handleExecutePayment}
            disabled={paymentState === 'PROCESSING' || paymentState === 'CREATING_ORDER' || isHoldExpired}
          >
            {paymentState === 'PROCESSING' || paymentState === 'CREATING_ORDER' ? (
              <ActionLoader text="Connecting to Razorpay..." />
            ) : (
              `Pay ₹${calculatedCost} via ${paymentMethod === 'UPI' ? (upiMode === 'qr' ? 'Dynamic QR' : 'UPI') : paymentMethod === 'CARD' ? 'Card' : 'Net Banking'} & Confirm Spot`
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

        {/* Download Receipt CTA */}
        <div style={{ marginTop: '1.25rem' }}>
          <button
            type="button"
            className="download-receipt-btn"
            style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontSize: '0.9375rem' }}
            onClick={() => receiptService.downloadReceipt(confirmedBooking)}
          >
            <Download size={18} />
            <span>Download Official Booking Receipt (PDF)</span>
          </button>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setActiveView('home')}>
            Book Another Spot
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setActiveView('bookings')}>
            View My Bookings
          </button>
        </div>

        {/* Find My Car Modal */}
        {renderFindMyCarModal()}
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

        {/* ACTIVE PARKING HERO CARD (Requirement 10) */}
        {(() => {
          const now = new Date();
          const activeBooking = bookings.find((b) => {
            const isConfirmed = b.status === 'CONFIRMED' || b.status === 'ACTIVE';
            const endT = b.endDateTime ? new Date(b.endDateTime) : null;
            return isConfirmed && (!endT || endT > now);
          });

          if (!activeBooking) return null;

          const fac = facilities.find((f) => f.id === activeBooking.facilityId || f.name === activeBooking.facilityName);

          return (
            <div className="active-parking-hero" style={{
              backgroundColor: 'var(--ps-primary-light)',
              border: '2px solid var(--ps-accent-dark)',
              borderRadius: 'var(--ps-radius-md)',
              padding: '1.5rem',
              marginBottom: '1.75rem',
              boxShadow: 'var(--ps-shadow-card)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span className="eyebrow" style={{ color: 'var(--ps-secondary-dark)', letterSpacing: '0.08em' }}>
                    ACTIVE PARKING
                  </span>
                  <h2 style={{ fontSize: '1.35rem', color: 'var(--ps-primary-dark)', margin: '0.15rem 0' }}>
                    {activeBooking.facilityName}
                  </h2>
                  <p className="metadata">{activeBooking.facilityAddress}</p>
                </div>

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setActiveBookingDetail(activeBooking)}
                >
                  <Ticket size={14} /> Digital Pass
                </button>
              </div>

              {/* Real End-Time Countdown with 30m, 10m and Expiry Reminders */}
              <ParkingCountdown booking={activeBooking} />

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ flex: 1, minWidth: '150px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  onClick={() => setFindMyCarBooking(activeBooking)}
                >
                  <Car size={16} /> Find My Car
                </button>

                <div style={{ flex: 1, minWidth: '150px' }}>
                  <NavigateToEntranceButton
                    booking={activeBooking}
                    facility={fac}
                    showDistance={true}
                  />
                </div>
              </div>
            </div>
          );
        })()}

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

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right', marginRight: '0.5rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>₹{b.amount}</div>
                    <div className="metadata">{isCancelled ? 'Refunded' : 'Paid'}</div>
                  </div>

                  {!isCancelled && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => setFindMyCarBooking(b)}
                      title="Find your vehicle and spot in facility"
                    >
                      <Car size={14} /> Find My Car
                    </button>
                  )}

                  {!isCancelled && (
                    <NavigateToEntranceButton
                      booking={b}
                      facility={facilities.find((f) => f.id === b.facilityId || f.name === b.facilityName)}
                      showDistance={false}
                      size="sm"
                    />
                  )}

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setActiveBookingDetail(b)}
                  >
                    <Ticket size={14} /> View Pass
                  </button>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => receiptService.downloadReceipt(b)}
                    title="Download Tax Receipt"
                  >
                    <Download size={14} /> Receipt
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

        {/* Find My Car Modal */}
        {renderFindMyCarModal()}
      </div>
    );
  }

  // =========================================================================
  // SCREEN 11: MY VEHICLES (VEHICLE PROFILES & CRUD)
  // =========================================================================
  if (activeView === 'vehicles') {
    return (
      <VehicleManagement
        activeUser={activeUser}
        vehicles={driverVehicles}
        onVehiclesChange={(updated) => setDriverVehicles(updated)}
        isLiveConnected={isLiveConnected}
      />
    );
  }

  return null;
}
