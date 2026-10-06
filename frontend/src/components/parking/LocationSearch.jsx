import React, { useState, useEffect, useRef } from 'react';
import { locationService } from '../../services/locationService';

export default function LocationSearch({
  onLocationSelect,
  currentLocation,
  isLoading,
  selectedRadius,
  onRadiusChange
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [isGettingPosition, setIsGettingPosition] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Sync input value if currentLocation changes externally
  useEffect(() => {
    if (currentLocation?.name) {
      setQuery(currentLocation.name);
    }
  }, [currentLocation]);

  // Debounced autocomplete search
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setIsSearchingSuggestions(false);
      return;
    }

    // Don't search suggestions if query matches current selected location exactly
    if (currentLocation?.name && query === currentLocation.name) {
      return;
    }

    setIsSearchingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const results = await locationService.searchDestinations(query);
        setSuggestions(results);
        setShowDropdown(true);
      } catch (err) {
        console.error('Failed to get suggestions:', err);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, currentLocation]);

  // Close dropdown on outside click
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
    setShowDropdown(false);
    setLocationError(null);
    onLocationSelect({
      lat: item.lat,
      lng: item.lng,
      name: item.name,
      city: item.city,
      description: item.description,
      isCurrentLocation: false
    });
  };

  const handleUseCurrentLocation = async () => {
    setLocationError(null);
    setIsGettingPosition(true);
    try {
      const pos = await locationService.getCurrentPosition();
      setQuery('Your Current Location');
      setShowDropdown(false);
      onLocationSelect({
        lat: pos.lat,
        lng: pos.lng,
        name: 'My Current Location',
        city: 'Nearby',
        isCurrentLocation: true
      });
    } catch (err) {
      console.warn('Geolocation error:', err.code, err.message);
      if (err.code === 'PERMISSION_DENIED') {
        setLocationError({
          title: 'Location access is disabled.',
          message: 'Please enable browser location permissions, or search a destination above.'
        });
      } else {
        setLocationError({
          title: 'Could not detect location.',
          message: err.message || 'Please try searching for your destination directly.'
        });
      }
    } finally {
      setIsGettingPosition(false);
    }
  };

  return (
    <div className="location-search-container" ref={dropdownRef}>
      <div className="search-bar-row">
        {/* Search Input Box */}
        <div className="search-input-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search destination, address, or landmark (e.g. Parul University, Akota)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
              if (locationError) setLocationError(null);
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions.length > 0) {
                  handleSelectSuggestion(suggestions[0]);
                } else if (query.trim().length >= 2) {
                  setIsSearchingSuggestions(true);
                  try {
                    const results = await locationService.searchDestinations(query);
                    if (results && results.length > 0) {
                      handleSelectSuggestion(results[0]);
                    } else {
                      setLocationError({
                        title: 'No matching geographic place found',
                        message: `Could not locate "${query}". Try searching a city, airport, landmark, or specific locality.`
                      });
                    }
                  } catch (err) {
                    // ignore
                  } finally {
                    setIsSearchingSuggestions(false);
                  }
                }
              }
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            aria-label="Search destination"
          />
          {query && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setShowDropdown(false);
                inputRef.current?.focus();
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
          {isSearchingSuggestions && (
            <div className="search-inline-spinner" title="Searching..." />
          )}
        </div>

        {/* Use My Location Button */}
        <button
          type="button"
          className={`use-location-btn ${isGettingPosition ? 'loading' : ''}`}
          onClick={handleUseCurrentLocation}
          disabled={isGettingPosition}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          <span>{isGettingPosition ? 'Locating...' : 'Use my location'}</span>
        </button>
      </div>

      {/* Permission Denied / Error Alert */}
      {locationError && (
        <div className="location-alert warning">
          <div className="alert-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <strong>{locationError.title}</strong>
              <p>{locationError.message}</p>
            </div>
          </div>
          <button
            type="button"
            className="alert-action-btn"
            onClick={() => {
              setLocationError(null);
              inputRef.current?.focus();
            }}
          >
            Search destination instead
          </button>
        </div>
      )}

      {/* Autocomplete Suggestions Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="suggestions-dropdown" role="listbox">
          <div className="suggestions-header">Matching Places & Landmarks</div>
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="suggestion-item"
              role="option"
              onClick={() => handleSelectSuggestion(item)}
            >
              <div className="suggestion-icon">
                {item.type === 'airport' ? '✈️' : item.type === 'transit' ? '🚆' : item.type === 'university' ? '🎓' : '📍'}
              </div>
              <div className="suggestion-info">
                <div className="suggestion-name">{item.name}</div>
                <div className="suggestion-desc">{item.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Radius selector pill strip */}
      <div className="radius-selector-row">
        <span className="radius-label">Search radius:</span>
        {[1, 3, 5, 10].map((r) => (
          <button
            key={r}
            type="button"
            className={`radius-pill ${selectedRadius === r ? 'active' : ''}`}
            onClick={() => onRadiusChange(r)}
          >
            {r} km
          </button>
        ))}
      </div>
    </div>
  );
}
