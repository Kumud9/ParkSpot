import React from 'react';
import { Logo } from '../Logo';
import './loading.css';

/**
 * MapLoader
 * Used while parking facility / occupancy data is loading for the signature interactive map.
 */
export function MapLoader({
  message = 'Loading interactive parking layout & real-time telemetry...',
  ariaLabel = 'Parking map is loading'
}) {
  return (
    <div
      className="ps-loader-map"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="parkspot-loading-logo">
        <Logo size="md" theme="dark" />
      </div>

      <div className="parkspot-progress-track" aria-hidden="true">
        <div className="parkspot-progress-bar-inner" />
      </div>

      <p className="parkspot-loading-text">{message}</p>
    </div>
  );
}

export default MapLoader;
