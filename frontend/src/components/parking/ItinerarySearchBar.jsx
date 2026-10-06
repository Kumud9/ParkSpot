import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Calendar, Clock, ChevronDown, Search, Crosshair, Check } from 'lucide-react';
import { locationService } from '../../services/locationService';

/**
 * Format date & time into a compact driver-friendly string like "Today, 2:30 PM"
 */
function formatArrivalDisplay(dateStr, timeStr) {
  if (!dateStr) return 'Today, 2:30 PM';
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  let dateLabel = 'Today';
  if (dateStr !== todayStr) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    if (dateStr === tomorrowStr) {
      dateLabel = 'Tomorrow';
    } else {
      const d = new Date(dateStr + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
  }

  let timeLabel = '2:30 PM';
  if (timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h)) {
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      timeLabel = `${h12}:${String(m || 0).padStart(2, '0')} ${period}`;
    }
  }

  return `${dateLabel}, ${timeLabel}`;
}

export default function ItinerarySearchBar({
  destination,
  onDestinationSelect,
  bookingDate,
  onDateChange,
  bookingStartTime,
  onStartTimeChange,
  bookingDuration,
  onDurationChange,
  radius,
  onRadiusChange,
  onUpdate,
  isSearching
}) {
  const [isDestOpen, setIsDestOpen] = useState(false);
  const [isArrivalOpen, setIsArrivalOpen] = useState(false);
  const [isDurationOpen, setIsDurationOpen] = useState(false);
  const [isRadiusOpen, setIsRadiusOpen] = useState(false);

  const [destQuery, setDestQuery] = useState(destination?.name || 'Ahmedabad Airport');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const destRef = useRef(null);
  const arrivalRef = useRef(null);
  const durationRef = useRef(null);
  const radiusRef = useRef(null);
  const inputRef = useRef(null);

  // Sync destination query display when external destination changes
  useEffect(() => {
    if (destination?.name) {
      setDestQuery(destination.name);
    }
  }, [destination]);

  // Debounced destination autocomplete
  useEffect(() => {
    if (!destQuery || destQuery.trim().length < 2) {
      setSuggestions([]);
      setIsSearchingSuggestions(false);
      return;
    }

    if (destination?.name && destQuery === destination.name) {
      return;
    }

    setIsSearchingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const results = await locationService.searchDestinations(destQuery);
        setSuggestions(results || []);
      } catch (err) {
        console.warn('Destination search failed:', err.message);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [destQuery, destination]);

  // Handle outside clicks to dismiss dropdowns
  useEffect(() => {
    function handleClickOutside(e) {
      if (destRef.current && !destRef.current.contains(e.target)) {
        setIsDestOpen(false);
      }
      if (arrivalRef.current && !arrivalRef.current.contains(e.target)) {
        setIsArrivalOpen(false);
      }
      if (durationRef.current && !durationRef.current.contains(e.target)) {
        setIsDurationOpen(false);
      }
      if (radiusRef.current && !radiusRef.current.contains(e.target)) {
        setIsRadiusOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectPlace = (place) => {
    setDestQuery(place.name);
    setIsDestOpen(false);
    onDestinationSelect({
      lat: place.lat,
      lng: place.lng,
      name: place.name,
      city: place.city,
      description: place.description,
      isCurrentLocation: false
    });
  };

  const handleCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const pos = await locationService.getCurrentPosition();
      setDestQuery('My Current Location');
      setIsDestOpen(false);
      onDestinationSelect({
        lat: pos.lat,
        lng: pos.lng,
        name: 'My Current Location',
        city: 'Nearby',
        isCurrentLocation: true
      });
    } catch (err) {
      console.warn('Geolocation failed:', err.message);
    } finally {
      setIsLocating(false);
    }
  };

  const quickLandmarks = [
    { name: 'Ahmedabad Airport (AMD)', lat: 23.0734, lng: 72.6266, city: 'Ahmedabad' },
    { name: 'Parul University', lat: 22.2887, lng: 73.3634, city: 'Vadodara' },
    { name: 'Vadodara Station', lat: 22.3107, lng: 73.1812, city: 'Vadodara' },
    { name: 'Connaught Place', lat: 28.6315, lng: 77.2167, city: 'New Delhi' }
  ];

  const durationOptions = [
    { value: 1, label: '1 Hour' },
    { value: 2, label: '2 Hours' },
    { value: 3, label: '3 Hours' },
    { value: 4, label: '4 Hours' },
    { value: 6, label: '6 Hours' },
    { value: 8, label: '8 Hours' },
    { value: 12, label: '12 Hours' },
    { value: 24, label: '24 Hours' }
  ];

  const radiusOptions = [
    { value: 1, label: '1 km' },
    { value: 3, label: '3 km' },
    { value: 5, label: '5 km' },
    { value: 10, label: '10 km' }
  ];

  return (
    <div className="itinerary-search-section">
      <div className="itinerary-eyebrow-row">
        <span className="itinerary-eyebrow">DIRECT ITINERARY &amp; COMPARISON</span>
      </div>

      <div className="itinerary-bar-container">
        {/* SEGMENT 1: DESTINATION */}
        <div className="itinerary-segment dest-segment" ref={destRef}>
          <div className="segment-label">DESTINATION</div>
          <div
            className="segment-value-trigger"
            onClick={() => {
              setIsDestOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
          >
            <MapPin size={15} className="segment-icon" />
            <input
              ref={inputRef}
              type="text"
              className="segment-input"
              value={destQuery}
              placeholder="Search destination or airport..."
              onChange={(e) => {
                setDestQuery(e.target.value);
                setIsDestOpen(true);
              }}
              onFocus={() => setIsDestOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestions.length > 0) {
                    handleSelectPlace(suggestions[0]);
                  }
                }
              }}
            />
          </div>

          {/* Destination Dropdown */}
          {isDestOpen && (
            <div className="itinerary-dropdown dest-dropdown">
              <button
                type="button"
                className="dropdown-action-btn"
                onClick={handleCurrentLocation}
                disabled={isLocating}
              >
                <Crosshair size={14} />
                <span>{isLocating ? 'Detecting GPS position...' : 'Use my current location'}</span>
              </button>

              <div className="dropdown-divider" />

              {/* Suggestions from geocoding */}
              {isSearchingSuggestions && (
                <div className="dropdown-hint">Searching locations...</div>
              )}

              {suggestions.length > 0 ? (
                <div className="dropdown-group">
                  <div className="dropdown-header">Matching Places</div>
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="dropdown-item"
                      onClick={() => handleSelectPlace(item)}
                    >
                      <MapPin size={13} className="item-icon" />
                      <div className="item-text">
                        <div className="item-title">{item.name}</div>
                        <div className="item-sub">{item.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Popular quick landmarks */}
              <div className="dropdown-group">
                <div className="dropdown-header">Popular Destinations</div>
                {quickLandmarks.map((lm) => (
                  <button
                    key={lm.name}
                    type="button"
                    className={`dropdown-item ${destination?.name === lm.name ? 'is-active' : ''}`}
                    onClick={() => handleSelectPlace(lm)}
                  >
                    <span className="landmark-tag">Airport / Station</span>
                    <div className="item-text">
                      <div className="item-title">{lm.name}</div>
                      <div className="item-sub">{lm.city}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="itinerary-divider" />

        {/* SEGMENT 2: ENTRY & ARRIVAL */}
        <div className="itinerary-segment arrival-segment" ref={arrivalRef}>
          <div className="segment-label">ENTRY &amp; ARRIVAL</div>
          <button
            type="button"
            className="segment-btn"
            onClick={() => setIsArrivalOpen(!isArrivalOpen)}
          >
            <Calendar size={15} className="segment-icon" />
            <span className="segment-value-text">
              {formatArrivalDisplay(bookingDate, bookingStartTime)}
            </span>
            <ChevronDown size={14} className="segment-chevron" />
          </button>

          {isArrivalOpen && (
            <div className="itinerary-dropdown arrival-dropdown">
              <div className="dropdown-header">Select Arrival Time</div>
              <div className="arrival-picker-body">
                <div className="arrival-picker-field">
                  <label>Arrival Date</label>
                  <input
                    type="date"
                    className="arrival-input"
                    value={bookingDate || ''}
                    onChange={(e) => {
                      if (e.target.value) onDateChange(e.target.value);
                    }}
                  />
                </div>
                <div className="arrival-picker-field">
                  <label>Arrival Time</label>
                  <input
                    type="time"
                    className="arrival-input"
                    value={bookingStartTime || '14:30'}
                    onChange={(e) => {
                      if (e.target.value) onStartTimeChange(e.target.value);
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                className="dropdown-confirm-btn"
                onClick={() => setIsArrivalOpen(false)}
              >
                Apply Time
              </button>
            </div>
          )}
        </div>

        <div className="itinerary-divider" />

        {/* SEGMENT 3: DURATION */}
        <div className="itinerary-segment duration-segment" ref={durationRef}>
          <div className="segment-label">DURATION</div>
          <button
            type="button"
            className="segment-btn"
            onClick={() => setIsDurationOpen(!isDurationOpen)}
          >
            <Clock size={15} className="segment-icon" />
            <span className="segment-value-text">
              {bookingDuration || 3} {bookingDuration === 1 ? 'Hour' : 'Hours'}
            </span>
            <ChevronDown size={14} className="segment-chevron" />
          </button>

          {isDurationOpen && (
            <div className="itinerary-dropdown select-dropdown">
              <div className="dropdown-header">Parking Duration</div>
              {durationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`dropdown-item ${Number(bookingDuration) === opt.value ? 'is-active' : ''}`}
                  onClick={() => {
                    onDurationChange(opt.value);
                    setIsDurationOpen(false);
                  }}
                >
                  <span>{opt.label}</span>
                  {Number(bookingDuration) === opt.value && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="itinerary-divider" />

        {/* SEGMENT 4: RADIUS */}
        <div className="itinerary-segment radius-segment" ref={radiusRef}>
          <div className="segment-label">RADIUS</div>
          <button
            type="button"
            className="segment-btn"
            onClick={() => setIsRadiusOpen(!isRadiusOpen)}
          >
            <span className="segment-value-text">{radius || 3} km</span>
            <ChevronDown size={14} className="segment-chevron" />
          </button>

          {isRadiusOpen && (
            <div className="itinerary-dropdown select-dropdown">
              <div className="dropdown-header">Search Radius</div>
              {radiusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`dropdown-item ${Number(radius) === opt.value ? 'is-active' : ''}`}
                  onClick={() => {
                    onRadiusChange(opt.value);
                    setIsRadiusOpen(false);
                  }}
                >
                  <span>{opt.label}</span>
                  {Number(radius) === opt.value && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* SEGMENT 5: UPDATE BUTTON */}
        <div className="itinerary-action-segment">
          <button
            type="button"
            className={`itinerary-update-btn ${isSearching ? 'is-loading' : ''}`}
            onClick={onUpdate}
            disabled={isSearching}
          >
            <span>{isSearching ? 'UPDATING...' : 'UPDATE'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
