import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/**
 * Standard Mapbox Style Spec for warm neutral open streets
 * Used seamlessly when VITE_MAPBOX_TOKEN is unset or as instant high-performance style
 */
const OPEN_NEUTRAL_STYLE = {
  version: 8,
  name: 'ParkSpot Warm Neutral Map',
  sources: {
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  },
  layers: [
    {
      id: 'carto-voyager-layer',
      type: 'raster',
      source: 'carto-voyager',
      minzoom: 0,
      maxzoom: 20
    }
  ]
};

/**
 * Helper to compute a true geodesic GeoJSON circle polygon for geographic radius
 */
function createGeoJSONCircle(center, radiusInKm, points = 64) {
  if (!center || typeof center[0] !== 'number' || typeof center[1] !== 'number') {
    return { type: 'FeatureCollection', features: [] };
  }
  const coords = { latitude: center[1], longitude: center[0] };
  const km = Math.max(0.1, radiusInKm || 3);
  const ret = [];
  const distanceX = km / (111.320 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]); // close polygon

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ret]
        },
        properties: { radiusKm: km }
      }
    ]
  };
}

export default function NearbyParkingMap({
  facilities = [],
  destination,
  selectedFacility,
  hoveredFacilityId,
  radius = 3,
  onSelectFacility,
  onViewSpaces
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersMapRef = useRef(new Map()); // id -> { marker, el, popup }
  const destinationMarkerRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activePopupId, setActivePopupId] = useState(null);

  const hasMapboxToken = Boolean(MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.'));

  // Initialize Mapbox GL instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (hasMapboxToken) {
      mapboxgl.accessToken = MAPBOX_TOKEN;
    }

    const initialLat = destination?.lat || 23.0734;
    const initialLng = destination?.lng || 72.6266;

    // Pick style: Mapbox official style if token exists; otherwise high-resolution warm open streets style
    const initialStyle = hasMapboxToken
      ? 'mapbox://styles/mapbox/streets-v12'
      : OPEN_NEUTRAL_STYLE;

    let mapInstance;
    try {
      mapInstance = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: initialStyle,
        center: [initialLng, initialLat],
        zoom: 13.5,
        pitch: 0,
        bearing: 0,
        attributionControl: true
      });

      // Add navigation controls (zoom in, zoom out, compass)
      mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');

      mapInstance.on('load', () => {
        setMapLoaded(true);

        // Add radius circle GeoJSON source & layers
        const initialCircleGeoJSON = createGeoJSONCircle([initialLng, initialLat], radius);
        if (!mapInstance.getSource('radius-circle-source')) {
          mapInstance.addSource('radius-circle-source', {
            type: 'geojson',
            data: initialCircleGeoJSON
          });

          // Soft translucent fill
          mapInstance.addLayer({
            id: 'radius-circle-fill',
            type: 'fill',
            source: 'radius-circle-source',
            paint: {
              'fill-color': '#F3F456',
              'fill-opacity': 0.08
            }
          });

          // Dashed border outline
          mapInstance.addLayer({
            id: 'radius-circle-line',
            type: 'line',
            source: 'radius-circle-source',
            paint: {
              'line-color': '#B2A240',
              'line-width': 1.75,
              'line-dasharray': [3, 2.5],
              'line-opacity': 0.85
            }
          });
        }
      });

      mapInstance.on('error', (e) => {
        // Fallback to open raster style if Mapbox style token errors
        if (hasMapboxToken && e?.error?.status === 401) {
          console.info('[ParkSpot Map] Switching to open styled basemap...');
          try {
            mapInstance.setStyle(OPEN_NEUTRAL_STYLE);
          } catch (_err) {}
        }
      });

      mapRef.current = mapInstance;
    } catch (err) {
      console.warn('[ParkSpot Map] Mapbox initialization fallback:', err);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [hasMapboxToken]);

  // Update Radius Circle GeoJSON when destination or radius changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !destination?.lat || !destination?.lng) return;
    const source = mapRef.current.getSource('radius-circle-source');
    if (source) {
      const geojson = createGeoJSONCircle([destination.lng, destination.lat], radius);
      source.setData(geojson);
    }
  }, [destination, radius, mapLoaded]);

  // Destination Marker
  useEffect(() => {
    if (!mapRef.current || !destination?.lat || !destination?.lng) return;
    const map = mapRef.current;

    if (destinationMarkerRef.current) {
      destinationMarkerRef.current.remove();
      destinationMarkerRef.current = null;
    }

    // Build distinct destination marker element
    const el = document.createElement('div');
    el.className = 'parkspot-destination-marker';
    el.innerHTML = `
      <div class="dest-marker-pulse"></div>
      <div class="dest-marker-pin ${destination.isCurrentLocation ? 'is-user-gps' : ''}">
        <div class="dest-marker-core"></div>
      </div>
      <div class="dest-marker-label">${destination.isCurrentLocation ? 'You are here' : (destination.name || 'Destination')}</div>
    `;

    const popup = new mapboxgl.Popup({ offset: 28, closeButton: false }).setHTML(`
      <div class="dest-popup-card">
        <span class="dest-popup-type">${destination.isCurrentLocation ? '📍 Current Location' : '🎯 Search Destination'}</span>
        <strong class="dest-popup-name">${destination.name || 'Selected Place'}</strong>
        ${destination.city ? `<span class="dest-popup-city">${destination.city}</span>` : ''}
      </div>
    `);

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([destination.lng, destination.lat])
      .setPopup(popup)
      .addTo(map);

    destinationMarkerRef.current = marker;
  }, [destination]);

  // Sync Facility Markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const currentMarkers = markersMapRef.current;

    // Collect IDs of new facilities
    const newFacilityIds = new Set(facilities.map((f) => String(f.id)));

    // Remove markers that are no longer in the list
    for (const [id, entry] of currentMarkers.entries()) {
      if (!newFacilityIds.has(id)) {
        entry.marker.remove();
        currentMarkers.delete(id);
      }
    }

    // Create or update markers for all facilities
    facilities.forEach((fac) => {
      if (typeof fac.latitude !== 'number' || typeof fac.longitude !== 'number') return;
      const id = String(fac.id);
      const isSelected = selectedFacility && String(selectedFacility.id) === id;
      const isHovered = hoveredFacilityId && String(hoveredFacilityId) === id;
      const rate = fac.startingPrice || fac.hourlyRate || 40;
      const spots = fac.availableSpots ?? 12;

      let entry = currentMarkers.get(id);

      if (!entry) {
        // Create custom HTML marker element
        const el = document.createElement('div');
        el.className = `parkspot-facility-marker ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`;
        el.setAttribute('data-facility-id', id);

        el.innerHTML = `
          <div class="facility-marker-badge">
            <span class="marker-price">₹${rate}/hr</span>
            <span class="marker-spots-left">${spots} left</span>
          </div>
          <div class="facility-marker-stem"></div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectFacility && onSelectFacility(fac);
          setActivePopupId(id);
        });

        // Popup with details and View Spaces CTA
        const popup = new mapboxgl.Popup({ offset: [0, -18], closeButton: true, className: 'parkspot-popup' })
          .setHTML(`
            <div class="parkspot-map-popup-content">
              <div class="popup-header-row">
                <span class="popup-name">${fac.name}</span>
              </div>
              <p class="popup-address">${fac.address || ''}, ${fac.city || ''}</p>
              <div class="popup-meta-row">
                <span class="popup-badge spots"><strong>${spots}</strong> available</span>
                <span class="popup-badge price">₹${rate}/hr</span>
                ${fac.distanceFormatted ? `<span class="popup-badge dist">${fac.distanceFormatted}</span>` : ''}
              </div>
              <button id="view-spaces-btn-${id}" class="popup-view-spaces-cta">
                View Spaces →
              </button>
            </div>
          `);

        popup.on('open', () => {
          const btn = document.getElementById(`view-spaces-btn-${id}`);
          if (btn) {
            btn.onclick = () => {
              onViewSpaces && onViewSpaces(fac);
            };
          }
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([fac.longitude, fac.latitude])
          .setPopup(popup)
          .addTo(map);

        currentMarkers.set(id, { marker, el, popup });
      } else {
        // Update existing marker element class & content
        const { el } = entry;
        el.className = `parkspot-facility-marker ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`;

        const priceSpan = el.querySelector('.marker-price');
        const spotsSpan = el.querySelector('.marker-spots-left');
        if (priceSpan) priceSpan.textContent = `₹${rate}/hr`;
        if (spotsSpan) spotsSpan.textContent = `${spots} left`;
      }
    });
  }, [facilities, selectedFacility, hoveredFacilityId, onSelectFacility, onViewSpaces]);

  // Smooth flyTo camera when selected facility changes
  useEffect(() => {
    if (!mapRef.current || !selectedFacility?.latitude || !selectedFacility?.longitude) return;
    mapRef.current.flyTo({
      center: [selectedFacility.longitude, selectedFacility.latitude],
      zoom: 15,
      essential: true,
      duration: 800
    });

    // Open popup for selected facility
    const entry = markersMapRef.current.get(String(selectedFacility.id));
    if (entry && !entry.popup.isOpen()) {
      entry.popup.addTo(mapRef.current);
    }
  }, [selectedFacility]);

  // Recenter map on destination
  const handleRecenter = useCallback(() => {
    if (!mapRef.current || !destination?.lat || !destination?.lng) return;
    mapRef.current.flyTo({
      center: [destination.lng, destination.lat],
      zoom: 14,
      duration: 700
    });
  }, [destination]);

  return (
    <div className="real-mapbox-container" aria-label="Interactive Mapbox Parking Map">
      <div ref={mapContainerRef} className="mapbox-map-surface" />

      {/* Subtle Floating Map Controls */}
      <div className="mapbox-floating-controls">
        <button
          type="button"
          className="map-recenter-btn"
          onClick={handleRecenter}
          title="Recenter map on destination"
        >
          <span>🎯 Recenter</span>
        </button>
      </div>

      {/* Subtle Map Status Pill */}
      <div className="mapbox-info-pill">
        <span className="pill-dot"></span>
        <span className="pill-text">
          {facilities.length} {facilities.length === 1 ? 'facility' : 'facilities'} nearby
        </span>
      </div>
    </div>
  );
}
