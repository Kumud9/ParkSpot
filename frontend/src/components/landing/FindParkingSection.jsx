import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, MapPin, Crosshair, Check, Compass } from 'lucide-react';
import { locationService } from '../../services/locationService';

export function FindParkingSection() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationAlert, setLocationAlert] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const dropdownRef = useRef(null);

  // Debounced search suggestions
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    if (selectedDestination?.name && query === selectedDestination.name) {
      return;
    }

    setIsSearchingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const results = await locationService.searchDestinations(query);
        setSuggestions(results);
        setShowDropdown(true);
      } catch (err) {
        console.warn('Geocoding suggestions error:', err);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, selectedDestination]);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (item) => {
    setQuery(item.name);
    setSelectedDestination(item);
    setShowDropdown(false);
    setLocationAlert(null);
  };

  const handleUseLocation = async () => {
    setIsLocating(true);
    setLocationAlert(null);
    try {
      const pos = await locationService.getCurrentPosition();
      const locObj = {
        name: 'My Current Location',
        city: 'Nearby',
        lat: pos.lat,
        lng: pos.lng,
        isCurrentLocation: true
      };
      setQuery('Your Current Location');
      setSelectedDestination(locObj);
      navigate('/driver', { state: { destination: locObj } });
    } catch (err) {
      setLocationAlert(
        err.code === 'PERMISSION_DENIED'
          ? 'Location access is disabled. Please search a destination instead.'
          : 'Could not detect location. Please search a destination.'
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleFindParkingSubmit = (e) => {
    if (e) e.preventDefault();
    if (selectedDestination) {
      navigate('/driver', { state: { destination: selectedDestination } });
    } else if (query.trim()) {
      navigate('/driver', { state: { query: query.trim() } });
    } else {
      navigate('/driver');
    }
  };

  return (
    <section className="editorial-section find-parking-section" id="find-parking">
      <div className="editorial-container">
        {/* Asymmetric Section Header */}
        <div className="editorial-section-header">
          <span className="editorial-eyebrow">FIND PARKING EASILY</span>
          <h2 className="editorial-section-heading">
            Parking that works around you.
          </h2>
          <p className="editorial-section-sub">
            Search any destination, verify live bay occupancy, and reserve your space before you drive.
          </p>
        </div>

        {/* Asymmetric Two-Column Editorial Layout */}
        <div className="find-parking-grid">
          {/* Left Column: Interactive Search & Popular Destinations */}
          <div className="find-parking-tool-col" ref={dropdownRef}>
            <form onSubmit={handleFindParkingSubmit} className="find-parking-search-box">
              <label htmlFor="destination-search-input" className="search-box-label">
                Where do you want to park?
              </label>

              <div className="search-box-input-group">
                <div className="search-box-input-wrap">
                  <Search size={18} className="search-box-icon" />
                  <input
                    id="destination-search-input"
                    type="text"
                    className="search-box-input"
                    placeholder="Search a place, landmark, or transit hub..."
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setShowDropdown(true);
                      if (locationAlert) setLocationAlert(null);
                    }}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowDropdown(true);
                    }}
                    aria-label="Search destination"
                  />
                  {query && (
                    <button
                      type="button"
                      className="search-box-clear"
                      onClick={() => {
                        setQuery('');
                        setSelectedDestination(null);
                        setSuggestions([]);
                        setShowDropdown(false);
                      }}
                      aria-label="Clear destination search"
                    >
                      ✕
                    </button>
                  )}
                  {isSearchingSuggestions && (
                    <span className="search-field-spinner" />
                  )}

                  {/* Autocomplete Suggestions Dropdown */}
                  {showDropdown && suggestions.length > 0 && (
                    <div className="editorial-suggestions-list" role="listbox">
                      <div className="suggestions-category-title">Destinations & Landmarks</div>
                      {suggestions.map((item) => (
                        <div
                          key={item.id}
                          className="editorial-suggestion-item"
                          onClick={() => handleSelectSuggestion(item)}
                          role="option"
                          tabIndex={0}
                        >
                          <span className="suggestion-badge">
                            {item.type === 'airport' ? '✈️' : item.type === 'transit' ? '🚆' : item.type === 'university' ? '🎓' : '📍'}
                          </span>
                          <div className="suggestion-texts">
                            <div className="suggestion-primary">{item.name}</div>
                            <div className="suggestion-secondary">{item.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="search-box-actions-row">
                  <button
                    type="button"
                    className={`search-box-loc-btn ${isLocating ? 'locating' : ''}`}
                    onClick={handleUseLocation}
                    disabled={isLocating}
                    title="Use your current GPS coordinates"
                  >
                    <Crosshair size={16} />
                    <span>{isLocating ? 'Locating...' : 'Use my location'}</span>
                  </button>

                  <button
                    type="submit"
                    className="search-box-submit-btn"
                  >
                    <span>Find Parking</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              {locationAlert && (
                <div className="editorial-search-alert">
                  <span>{locationAlert}</span>
                </div>
              )}

              {/* Popular destinations */}
              <div className="popular-destinations-strip">
                <span className="popular-dest-label">Popular destinations:</span>
                <div className="popular-dest-chips">
                  {[
                    { name: 'Ahmedabad Airport', lat: 23.0734, lng: 72.6266, city: 'Ahmedabad' },
                    { name: 'Parul University', lat: 22.2887, lng: 73.3634, city: 'Vadodara' },
                    { name: 'Vadodara Railway Station', lat: 22.3107, lng: 73.1812, city: 'Vadodara' },
                    { name: 'Sayajigunj', lat: 22.3115, lng: 73.1825, city: 'Vadodara' },
                    { name: 'Manjalpur', lat: 22.2685, lng: 73.1942, city: 'Vadodara' }
                  ].map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className="popular-dest-chip"
                      onClick={() => {
                        setQuery(item.name);
                        setSelectedDestination(item);
                        navigate('/driver', { state: { destination: item } });
                      }}
                    >
                      <MapPin size={12} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>

          {/* Right Column: Editorial Photographic Narrative */}
          <div className="find-parking-visual-col">
            <div className="find-parking-photo-frame">
              <img
                src="/assets/driver-parking.webp"
                alt="Driver parking experience with verified reservation"
                className="find-parking-photo"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = '/assets/parking-residential.webp';
                }}
              />
              <div className="find-parking-photo-badge">
                <Compass size={14} />
                <span>Verified Bay Guarantee</span>
              </div>
            </div>

            <div className="find-parking-points">
              <div className="find-parking-point">
                <div className="point-icon-box"><Check size={16} strokeWidth={2.5} /></div>
                <div className="point-info">
                  <h3 className="point-headline">Guaranteed Space Allocation</h3>
                  <p className="point-description">
                    Eliminate circular driving and congested search patterns. Your exact parking bay is reserved before you depart.
                  </p>
                </div>
              </div>

              <div className="find-parking-point">
                <div className="point-icon-box"><Check size={16} strokeWidth={2.5} /></div>
                <div className="point-info">
                  <h3 className="point-headline">Top-Down Facility Visibility</h3>
                  <p className="point-description">
                    Inspect accurate driving lanes, floor levels, EV chargers, and accessible spaces on interactive spatial maps.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default FindParkingSection;
