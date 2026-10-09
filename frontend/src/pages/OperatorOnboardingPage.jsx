import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import locationService from '../services/locationService';
import { Logo } from '../components/shared/Logo';
import { ActionLoader } from '../components/shared/Loading';
import {
  Building2,
  MapPin,
  Clock,
  Layers,
  Car,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  Sparkles,
  ShieldCheck,
  DollarSign,
  Info,
  LogOut,
  Navigation
} from 'lucide-react';
import './onboarding.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const SPOT_TYPES = [
  { value: 'STANDARD', label: 'Standard', color: '#1B4D3E' },
  { value: 'EV', label: 'EV Charging', color: '#0284C7' },
  { value: 'ACCESSIBLE', label: 'Accessible', color: '#7C3AED' },
  { value: 'COMPACT', label: 'Compact', color: '#D97706' }
];

export function OperatorOnboardingPage({ onOnboarded }) {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();

  // Guard: Not logged in
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
    } else if (user.accountType === 'DRIVER') {
      navigate('/driver', { replace: true });
    } else if (user.facilityId || user.facility) {
      navigate('/operator', { replace: true });
    }
  }, [user, navigate]);

  // Step flow: 1 (Location & Details) -> 2 (Floors & Spots) -> 3 (Review & Launch)
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Facility Details & Location
  const [facilityName, setFacilityName] = useState(
    user?.name ? `${user.name.split(' ')[0]}'s Parking Facility` : 'City Center Parking'
  );
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Vadodara');
  const [postalCode, setPostalCode] = useState('');
  const [description, setDescription] = useState('');
  const [hourlyRate, setHourlyRate] = useState(50);
  const [dailyRate, setDailyRate] = useState(300);
  const [is24Hours, setIs24Hours] = useState(true);
  const [openingTime, setOpeningTime] = useState('00:00');
  const [closingTime, setClosingTime] = useState('23:59');

  // Geographic Coordinates (default to Vadodara central coordinates)
  const [latitude, setLatitude] = useState(22.3105);
  const [longitude, setLongitude] = useState(73.1814);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [mapInitialized, setMapInitialized] = useState(false);

  // Step 2: Floors & Spots Configuration
  const [floors, setFloors] = useState([
    {
      id: 'fl-1',
      name: 'Ground Floor',
      floorNumber: 1,
      prefix: 'G',
      spotsCount: 8,
      spots: [
        { id: 'sp-1', number: 'G-01', type: 'EV' },
        { id: 'sp-2', number: 'G-02', type: 'ACCESSIBLE' },
        { id: 'sp-3', number: 'G-03', type: 'STANDARD' },
        { id: 'sp-4', number: 'G-04', type: 'STANDARD' },
        { id: 'sp-5', number: 'G-05', type: 'STANDARD' },
        { id: 'sp-6', number: 'G-06', type: 'STANDARD' },
        { id: 'sp-7', number: 'G-07', type: 'COMPACT' },
        { id: 'sp-8', number: 'G-08', type: 'COMPACT' }
      ]
    },
    {
      id: 'fl-2',
      name: 'Upper Deck Level 1',
      floorNumber: 2,
      prefix: 'U',
      spotsCount: 6,
      spots: [
        { id: 'sp-9', number: 'U-01', type: 'STANDARD' },
        { id: 'sp-10', number: 'U-02', type: 'STANDARD' },
        { id: 'sp-11', number: 'U-03', type: 'STANDARD' },
        { id: 'sp-12', number: 'U-04', type: 'STANDARD' },
        { id: 'sp-13', number: 'U-05', type: 'STANDARD' },
        { id: 'sp-14', number: 'U-06', type: 'COMPACT' }
      ]
    }
  ]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Mapbox container & marker refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // ---------------------------------------------------------------------------
  // MAPBOX GL JS INITIALIZATION
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (currentStep !== 1 || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.resize();
      return;
    }

    const hasToken = Boolean(MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.'));
    if (hasToken) {
      mapboxgl.accessToken = MAPBOX_TOKEN;
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: hasToken ? 'mapbox://styles/mapbox/streets-v12' : {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }]
      },
      center: [longitude, latitude],
      zoom: 14,
      pitch: 0
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

    // Create customized draggable marker
    const markerEl = document.createElement('div');
    markerEl.className = 'onboarding-map-marker';
    markerEl.innerHTML = `
      <div class="marker-pulse"></div>
      <div class="marker-pin">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" fill="#1B4D3E" stroke="#ffffff"/>
          <circle cx="12" cy="10" r="3" fill="#ffffff"/>
        </svg>
      </div>
    `;

    const marker = new mapboxgl.Marker({
      element: markerEl,
      draggable: true
    })
      .setLngLat([longitude, latitude])
      .addTo(map);

    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      const newLat = parseFloat(lngLat.lat.toFixed(6));
      const newLng = parseFloat(lngLat.lng.toFixed(6));
      setLatitude(newLat);
      setLongitude(newLng);
    });

    map.on('click', (e) => {
      const newLat = parseFloat(e.lngLat.lat.toFixed(6));
      const newLng = parseFloat(e.lngLat.lng.toFixed(6));
      setLatitude(newLat);
      setLongitude(newLng);
      marker.setLngLat([newLng, newLat]);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    setMapInitialized(true);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [currentStep]);

  // Update map marker when latitude or longitude changes programmatically
  const updateMapPosition = (lat, lng, zoom = 15) => {
    setLatitude(lat);
    setLongitude(lng);
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo({ center: [lng, lat], zoom, essential: true });
    }
  };

  // Location search autocomplete
  const handleLocationSearch = async (val) => {
    setLocationSearchQuery(val);
    if (!val || val.trim().length < 2) {
      setLocationSuggestions([]);
      return;
    }

    setIsSearchingLocation(true);
    try {
      const results = await locationService.searchDestinations(val.trim());
      setLocationSuggestions(results || []);
    } catch {
      setLocationSuggestions([]);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const handleSelectSuggestion = (place) => {
    setLocationSearchQuery(place.name || place.description);
    setLocationSuggestions([]);
    if (place.description && !address) {
      setAddress(place.description);
    }
    if (place.city) {
      setCity(place.city);
    }
    updateMapPosition(place.lat, place.lng, 16);
  };

  // ---------------------------------------------------------------------------
  // FLOOR & SPOT CONFIGURATION LOGIC
  // ---------------------------------------------------------------------------
  const handleAddFloor = () => {
    const nextNum = floors.length + 1;
    const defaultPrefix = String.fromCharCode(64 + nextNum); // C, D, E...
    const initialSpots = Array.from({ length: 6 }, (_, i) => ({
      id: `sp-${Date.now()}-${i}`,
      number: `${defaultPrefix}-${String(i + 1).padStart(2, '0')}`,
      type: i === 0 ? 'ACCESSIBLE' : 'STANDARD'
    }));

    setFloors((prev) => [
      ...prev,
      {
        id: `fl-${Date.now()}`,
        name: `Level ${nextNum}`,
        floorNumber: nextNum,
        prefix: defaultPrefix,
        spotsCount: 6,
        spots: initialSpots
      }
    ]);
  };

  const handleRemoveFloor = (floorId) => {
    if (floors.length <= 1) return;
    setFloors((prev) => prev.filter((f) => f.id !== floorId));
  };

  const handleFloorChange = (floorId, field, val) => {
    setFloors((prev) =>
      prev.map((fl) => (fl.id === floorId ? { ...fl, [field]: val } : fl))
    );
  };

  const handleGenerateSpotsForFloor = (floorId, count, prefix) => {
    const targetFloor = floors.find((f) => f.id === floorId);
    if (!targetFloor) return;

    const safeCount = Math.min(60, Math.max(1, Number(count) || 1));
    const safePrefix = (prefix || targetFloor.prefix || 'A').trim().toUpperCase();

    const newSpots = Array.from({ length: safeCount }, (_, i) => ({
      id: `sp-${floorId}-${i + 1}`,
      number: `${safePrefix}-${String(i + 1).padStart(2, '0')}`,
      type: i === 0 && safeCount >= 4 ? 'EV' : i === 1 && safeCount >= 6 ? 'ACCESSIBLE' : 'STANDARD'
    }));

    setFloors((prev) =>
      prev.map((fl) =>
        fl.id === floorId
          ? { ...fl, spotsCount: safeCount, prefix: safePrefix, spots: newSpots }
          : fl
      )
    );
  };

  const handleSpotNumberChange = (floorId, spotId, newNumber) => {
    setFloors((prev) =>
      prev.map((fl) => {
        if (fl.id !== floorId) return fl;
        return {
          ...fl,
          spots: fl.spots.map((sp) =>
            sp.id === spotId ? { ...sp, number: newNumber.toUpperCase().trim() } : sp
          )
        };
      })
    );
  };

  const handleSpotTypeChange = (floorId, spotId, newType) => {
    setFloors((prev) =>
      prev.map((fl) => {
        if (fl.id !== floorId) return fl;
        return {
          ...fl,
          spots: fl.spots.map((sp) => (sp.id === spotId ? { ...sp, type: newType } : sp))
        };
      })
    );
  };

  const handleAddSpotToFloor = (floorId) => {
    setFloors((prev) =>
      prev.map((fl) => {
        if (fl.id !== floorId) return fl;
        const newSpotNumber = `${fl.prefix || 'A'}-${String(fl.spots.length + 1).padStart(2, '0')}`;
        return {
          ...fl,
          spotsCount: fl.spots.length + 1,
          spots: [
            ...fl.spots,
            { id: `sp-${Date.now()}`, number: newSpotNumber, type: 'STANDARD' }
          ]
        };
      })
    );
  };

  const handleRemoveSpotFromFloor = (floorId, spotId) => {
    setFloors((prev) =>
      prev.map((fl) => {
        if (fl.id !== floorId) return fl;
        if (fl.spots.length <= 1) return fl;
        const remaining = fl.spots.filter((s) => s.id !== spotId);
        return {
          ...fl,
          spotsCount: remaining.length,
          spots: remaining
        };
      })
    );
  };

  // ---------------------------------------------------------------------------
  // VALIDATION & TOTAL CAPACITY METRICS
  // ---------------------------------------------------------------------------
  const totalFacilitySpots = useMemo(() => {
    return floors.reduce((acc, fl) => acc + (fl.spots?.length || 0), 0);
  }, [floors]);

  const spotCountsByType = useMemo(() => {
    const counts = { STANDARD: 0, EV: 0, ACCESSIBLE: 0, COMPACT: 0 };
    floors.forEach((fl) => {
      (fl.spots || []).forEach((s) => {
        counts[s.type] = (counts[s.type] || 0) + 1;
      });
    });
    return counts;
  }, [floors]);

  // Check for duplicate spot numbers across the entire facility
  const duplicateSpotNumbers = useMemo(() => {
    const seen = new Set();
    const dups = new Set();
    floors.forEach((fl) => {
      (fl.spots || []).forEach((s) => {
        const num = (s.number || '').trim().toUpperCase();
        if (num) {
          if (seen.has(num)) {
            dups.add(num);
          } else {
            seen.add(num);
          }
        }
      });
    });
    return Array.from(dups);
  }, [floors]);

  // Validate step 1
  const isStep1Valid = Boolean(
    facilityName.trim().length >= 2 &&
    address.trim().length >= 5 &&
    city.trim().length >= 2 &&
    typeof latitude === 'number' && !isNaN(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === 'number' && !isNaN(longitude) && longitude >= -180 && longitude <= 180 &&
    Number(hourlyRate) > 0 &&
    Number(dailyRate) > 0
  );

  // Validate step 2
  const isStep2Valid = Boolean(
    floors.length >= 1 &&
    floors.every((fl) => fl.name.trim().length >= 1 && fl.spots.length >= 1) &&
    duplicateSpotNumbers.length === 0 &&
    totalFacilitySpots >= 1
  );

  // ---------------------------------------------------------------------------
  // SUBMISSION TO BACKEND
  // ---------------------------------------------------------------------------
  const handleCompleteOnboarding = async () => {
    setErrorMessage(null);

    if (!isStep1Valid) {
      setErrorMessage('Please provide complete facility details and valid geographic location.');
      setCurrentStep(1);
      return;
    }

    if (!isStep2Valid) {
      setErrorMessage(
        duplicateSpotNumbers.length > 0
          ? `Duplicate spot identifiers detected: ${duplicateSpotNumbers.join(', ')}. All spot numbers must be unique.`
          : 'Please configure at least 1 floor with parking spots.'
      );
      setCurrentStep(2);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: facilityName.trim(),
        address: address.trim(),
        city: city.trim(),
        postalCode: postalCode.trim() || undefined,
        description: description.trim() || undefined,
        hourlyRate: Number(hourlyRate),
        dailyRate: Number(dailyRate),
        openingTime: is24Hours ? '00:00' : openingTime,
        closingTime: is24Hours ? '23:59' : closingTime,
        latitude: Number(latitude),
        longitude: Number(longitude),
        active: true,
        floors: floors.map((fl) => ({
          name: fl.name.trim(),
          floorNumber: Number(fl.floorNumber),
          spots: fl.spots.map((s, idx) => ({
            number: s.number.trim().toUpperCase(),
            type: s.type || 'STANDARD',
            coordinates: {
              x: (idx % 8) * 3,
              y: Math.floor(idx / 8) * 6,
              width: 2.5,
              height: 5.0,
              rotation: 0
            }
          }))
        }))
      };

      const result = await api.onboardFacility(payload);

      if (result?.user) {
        updateUser(result.user);
      }

      if (onOnboarded && result?.facility) {
        onOnboarded(result.facility);
      }

      // Smooth transition to Operator dashboard
      navigate('/operator', { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'Facility registration failed. Please review the details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="onboarding-page-container">
      {/* Top Header */}
      <header className="onboarding-navbar">
        <div className="onboarding-navbar-inner">
          <div className="onboarding-brand">
            <Logo />
            <span className="onboarding-badge">Operator Onboarding</span>
          </div>

          <div className="onboarding-user-info">
            <div className="onboarding-user-meta">
              <span className="onboarding-user-name">{user?.name || 'Operator'}</span>
              <span className="onboarding-user-email">{user?.email}</span>
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Sign Out"
            >
              <LogOut size={14} style={{ marginRight: '0.35rem' }} /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Wizard Content */}
      <main className="onboarding-main">
        <div className="onboarding-card">
          {/* Progress Stepper */}
          <div className="onboarding-stepper">
            <div className={`step-item ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}>
              <div className="step-circle">{currentStep > 1 ? <CheckCircle2 size={16} /> : 1}</div>
              <div className="step-label">Facility & Location</div>
            </div>
            <div className="step-connector" />
            <div className={`step-item ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}>
              <div className="step-circle">{currentStep > 2 ? <CheckCircle2 size={16} /> : 2}</div>
              <div className="step-label">Floors & Spaces</div>
            </div>
            <div className="step-connector" />
            <div className={`step-item ${currentStep === 3 ? 'active' : ''}`}>
              <div className="step-circle">3</div>
              <div className="step-label">Review & Launch</div>
            </div>
          </div>

          {/* Feedback & Error Banner */}
          {errorMessage && (
            <div className="onboarding-error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 1: FACILITY DETAILS & MAPBOX LOCATION SELECTION */}
          {/* ================================================================= */}
          {currentStep === 1 && (
            <div className="onboarding-step-content">
              <div className="step-heading">
                <h2>1. Register Your Parking Facility</h2>
                <p className="metadata">
                  ParkSpot enforces <strong>One Operator = One Facility</strong>. Configure your facility's real-world address, coordinates, and operating hours.
                </p>
              </div>

              <div className="onboarding-form-grid">
                {/* Left Column: Details & Hours */}
                <div className="form-column">
                  <div className="form-group">
                    <label className="form-label" htmlFor="facilityName">Facility / Parking Lot Name *</label>
                    <input
                      id="facilityName"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Metro Grand Parking Plaza"
                      value={facilityName}
                      onChange={(e) => setFacilityName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="fullAddress">Full Street Address *</label>
                    <input
                      id="fullAddress"
                      type="text"
                      className="form-input"
                      placeholder="e.g. 14 Sayajigunj Main Station Road"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row-2">
                    <div className="form-group">
                      <label className="form-label" htmlFor="city">City *</label>
                      <input
                        id="city"
                        type="text"
                        className="form-input"
                        placeholder="e.g. Vadodara"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="postalCode">Postal Code</label>
                      <input
                        id="postalCode"
                        type="text"
                        className="form-input"
                        placeholder="e.g. 390002"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Pricing Details */}
                  <div className="form-row-2">
                    <div className="form-group">
                      <label className="form-label" htmlFor="hourlyRate">Hourly Rate (₹) *</label>
                      <input
                        id="hourlyRate"
                        type="number"
                        min="1"
                        className="form-input"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="dailyRate">Daily Rate (₹) *</label>
                      <input
                        id="dailyRate"
                        type="number"
                        min="1"
                        className="form-input"
                        value={dailyRate}
                        onChange={(e) => setDailyRate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Operating Hours */}
                  <div className="form-group" style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label className="form-label" style={{ margin: 0 }}>Operating Schedule</label>
                      <label className="toggle-switch-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={is24Hours}
                          onChange={(e) => setIs24Hours(e.target.checked)}
                        />
                        <span>Open 24/7 (Non-stop)</span>
                      </label>
                    </div>

                    {!is24Hours && (
                      <div className="form-row-2" style={{ marginTop: '0.5rem' }}>
                        <div>
                          <label className="form-sublabel">Opening Time</label>
                          <input
                            type="time"
                            className="form-input"
                            value={openingTime}
                            onChange={(e) => setOpeningTime(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="form-sublabel">Closing Time (Overnight supported)</label>
                          <input
                            type="time"
                            className="form-input"
                            value={closingTime}
                            onChange={(e) => setClosingTime(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Mapbox Geocoding & Interactive Pin Selection */}
                <div className="form-column">
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label className="form-label">
                      <MapPin size={15} style={{ verticalAlign: 'middle', marginRight: '0.35rem', color: 'var(--ps-accent-dark)' }} />
                      Search Location & Place Map Pin *
                    </label>
                    <div className="search-input-wrapper">
                      <Search size={16} className="search-icon" />
                      <input
                        type="text"
                        className="form-input search-input"
                        placeholder="Search landmark, address, or station..."
                        value={locationSearchQuery}
                        onChange={(e) => handleLocationSearch(e.target.value)}
                      />
                    </div>

                    {/* Autocomplete Suggestions Dropdown */}
                    {locationSuggestions.length > 0 && (
                      <div className="suggestions-dropdown">
                        {locationSuggestions.map((place) => (
                          <div
                            key={place.id}
                            className="suggestion-item"
                            onClick={() => handleSelectSuggestion(place)}
                          >
                            <MapPin size={14} className="suggestion-icon" />
                            <div>
                              <div className="suggestion-name">{place.name}</div>
                              <div className="suggestion-desc">{place.description}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Interactive Mapbox Surface */}
                  <div className="map-picker-container">
                    <div ref={mapContainerRef} className="map-picker-surface" />
                    <div className="map-instructions-pill">
                      <span>Click map or drag the pin to set exact facility entrance</span>
                    </div>
                  </div>

                  {/* Confirmed Coordinates Display */}
                  <div className="coordinates-bar">
                    <div>
                      <span className="coord-label">Latitude:</span>
                      <span className="coord-value">{latitude}</span>
                    </div>
                    <div>
                      <span className="coord-label">Longitude:</span>
                      <span className="coord-value">{longitude}</span>
                    </div>
                    <span className="coord-badge">✓ Verified Point</span>
                  </div>
                </div>
              </div>

              {/* Wizard Actions */}
              <div className="wizard-action-bar">
                <div className="metadata">
                  Step 1 of 3: Facility coordinates will be used for real Driver Mapbox search.
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isStep1Valid}
                  onClick={() => {
                    setErrorMessage(null);
                    setCurrentStep(2);
                  }}
                >
                  Configure Floors & Spaces <ArrowRight size={16} style={{ marginLeft: '0.4rem' }} />
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 2: FLOOR & PARKING SPOT CONFIGURATION */}
          {/* ================================================================= */}
          {currentStep === 2 && (
            <div className="onboarding-step-content">
              <div className="step-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2>2. Configure Floors and Parking Bays</h2>
                  <p className="metadata">
                    Configure floor levels, spot identifiers, and supported space types. All spots will start in the <strong>AVAILABLE</strong> state.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddFloor}
                >
                  <Plus size={15} style={{ marginRight: '0.35rem' }} /> Add Another Floor
                </button>
              </div>

              {/* Duplicate spot warning if detected */}
              {duplicateSpotNumbers.length > 0 && (
                <div className="onboarding-error-banner" role="alert">
                  <AlertCircle size={18} />
                  <span>
                    Duplicate spot identifiers detected: <strong>{duplicateSpotNumbers.join(', ')}</strong>. Every bay within the facility must have a unique identifier.
                  </span>
                </div>
              )}

              {/* Floors Container */}
              <div className="floors-container">
                {floors.map((floor, floorIdx) => (
                  <div key={floor.id} className="floor-card">
                    <div className="floor-card-header">
                      <div className="floor-title-group">
                        <Layers size={18} style={{ color: 'var(--ps-accent-dark)' }} />
                        <input
                          type="text"
                          className="floor-name-input"
                          value={floor.name}
                          onChange={(e) => handleFloorChange(floor.id, 'name', e.target.value)}
                          placeholder="Floor Name"
                        />
                        <span className="metadata">(Floor #{floor.floorNumber})</span>
                      </div>

                      <div className="floor-actions">
                        {floors.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm delete-floor-btn"
                            onClick={() => handleRemoveFloor(floor.id)}
                            title="Remove Floor"
                          >
                            <Trash2 size={14} /> Remove Floor
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick Spot Generator Row */}
                    <div className="quick-generator-row">
                      <span className="metadata" style={{ fontWeight: 600 }}>Quick Bay Generator:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="metadata">Prefix:</span>
                        <input
                          type="text"
                          className="form-input form-input-sm prefix-input"
                          value={floor.prefix}
                          maxLength={3}
                          onChange={(e) => handleFloorChange(floor.id, 'prefix', e.target.value.toUpperCase())}
                        />
                        <span className="metadata">Total Bays:</span>
                        <input
                          type="number"
                          min="1"
                          max="60"
                          className="form-input form-input-sm count-input"
                          value={floor.spotsCount}
                          onChange={(e) => handleFloorChange(floor.id, 'spotsCount', e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleGenerateSpotsForFloor(floor.id, floor.spotsCount, floor.prefix)}
                        >
                          Generate Sequence
                        </button>
                      </div>
                    </div>

                    {/* Spot Pills Grid */}
                    <div className="spots-grid">
                      {floor.spots.map((spot) => (
                        <div key={spot.id} className="spot-item-card">
                          <div className="spot-item-top">
                            <input
                              type="text"
                              className="spot-number-input"
                              value={spot.number}
                              onChange={(e) => handleSpotNumberChange(floor.id, spot.id, e.target.value)}
                              placeholder="Bay ID"
                            />
                            {floor.spots.length > 1 && (
                              <button
                                type="button"
                                className="spot-delete-btn"
                                onClick={() => handleRemoveSpotFromFloor(floor.id, spot.id)}
                                title="Remove bay"
                              >
                                ×
                              </button>
                            )}
                          </div>
                          <select
                            className="spot-type-select"
                            value={spot.type}
                            onChange={(e) => handleSpotTypeChange(floor.id, spot.id, e.target.value)}
                          >
                            {SPOT_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}

                      {/* Add Individual Spot Button */}
                      <button
                        type="button"
                        className="add-spot-pill-btn"
                        onClick={() => handleAddSpotToFloor(floor.id)}
                      >
                        <Plus size={16} /> Add Bay
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Wizard Actions */}
              <div className="wizard-action-bar">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCurrentStep(1)}
                >
                  <ArrowLeft size={16} style={{ marginRight: '0.4rem' }} /> Back to Location
                </button>

                <div className="capacity-pill-summary">
                  <span>Total Capacity: <strong>{totalFacilitySpots} Bays</strong> across {floors.length} Floors</span>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isStep2Valid}
                  onClick={() => {
                    setErrorMessage(null);
                    setCurrentStep(3);
                  }}
                >
                  Review Configuration <ArrowRight size={16} style={{ marginLeft: '0.4rem' }} />
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3: PRE-FLIGHT SUMMARY & LAUNCH CONFIRMATION */}
          {/* ================================================================= */}
          {currentStep === 3 && (
            <div className="onboarding-step-content">
              <div className="step-heading">
                <h2>3. Review Facility Configuration & Launch</h2>
                <p className="metadata">
                  Confirm your facility configuration before saving. Once launched, this facility becomes the authoritative data source for all ParkSpot operational systems.
                </p>
              </div>

              <div className="review-cards-grid">
                {/* Facility Details Review Card */}
                <div className="review-card">
                  <div className="review-card-header">
                    <Building2 size={18} style={{ color: 'var(--ps-accent-dark)' }} />
                    <h3>Facility Information</h3>
                  </div>
                  <div className="review-list">
                    <div className="review-row">
                      <span className="review-key">Facility Name:</span>
                      <span className="review-val"><strong>{facilityName}</strong></span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">Address:</span>
                      <span className="review-val">{address}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">City / Postal Code:</span>
                      <span className="review-val">{city} {postalCode ? `(${postalCode})` : ''}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">Coordinates:</span>
                      <span className="review-val">{latitude}, {longitude}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">Operating Window:</span>
                      <span className="review-val">{is24Hours ? 'Open 24/7' : `${openingTime} – ${closingTime}`}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">Base Rates:</span>
                      <span className="review-val">₹{hourlyRate}/hr · ₹{dailyRate}/day</span>
                    </div>
                  </div>
                </div>

                {/* Capacity & Spaces Review Card */}
                <div className="review-card">
                  <div className="review-card-header">
                    <Car size={18} style={{ color: 'var(--ps-accent-dark)' }} />
                    <h3>Capacity & Bay Distribution</h3>
                  </div>
                  <div className="review-list">
                    <div className="review-row">
                      <span className="review-key">Total Capacity:</span>
                      <span className="review-val" style={{ fontSize: '1.25rem', color: 'var(--ps-accent-dark)', fontWeight: 800 }}>
                        {totalFacilitySpots} Bays
                      </span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">Levels Configured:</span>
                      <span className="review-val">{floors.length} Floors ({floors.map((f) => f.name).join(', ')})</span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">Standard Bays:</span>
                      <span className="review-val">{spotCountsByType.STANDARD}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">EV Charging Bays:</span>
                      <span className="review-val">{spotCountsByType.EV}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">Accessible Bays:</span>
                      <span className="review-val">{spotCountsByType.ACCESSIBLE}</span>
                    </div>
                    <div className="review-row">
                      <span className="review-key">Compact Bays:</span>
                      <span className="review-val">{spotCountsByType.COMPACT}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Authoritative Data Source Notice */}
              <div className="onboarding-notice-box">
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <ShieldCheck size={24} style={{ color: 'var(--ps-state-available)', flexShrink: 0, marginTop: '0.1rem' }} />
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.9375rem', fontWeight: 700 }}>
                      Operational Readiness Guarantee
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--ps-secondary-dark)' }}>
                      • <strong>100% Available starting state:</strong> All {totalFacilitySpots} spots will start in the AVAILABLE state. No fake bookings or synthetic revenue are generated.
                      <br />
                      • <strong>Public Driver Discovery:</strong> Once saved, your facility will immediately be discoverable by drivers using the ParkSpot Driver map and booking service.
                      <br />
                      • <strong>Tenant Scoping:</strong> All operations and telemetry will be strictly bound to your Operator credentials.
                    </p>
                  </div>
                </div>
              </div>

              {/* Wizard Actions */}
              <div className="wizard-action-bar">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={isSubmitting}
                  onClick={() => setCurrentStep(2)}
                >
                  <ArrowLeft size={16} style={{ marginRight: '0.4rem' }} /> Back to Layout
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  onClick={handleCompleteOnboarding}
                  style={{ minWidth: '220px' }}
                >
                  {isSubmitting ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                      <ActionLoader size="sm" />
                      <span>Creating Facility...</span>
                    </div>
                  ) : (
                    <>
                      <Sparkles size={16} style={{ marginRight: '0.4rem' }} /> Launch Parking Facility
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default OperatorOnboardingPage;
