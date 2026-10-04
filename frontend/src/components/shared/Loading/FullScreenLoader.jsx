import React from 'react';
import { Logo } from '../Logo';
import './loading.css';

/**
 * FullScreenLoader
 * Used during initial application booting, global synchronization, or full screen initialization.
 * Uses the Primary Light (#F4F2E7) background with the official ParkSpot logo as the focal point.
 */
export function FullScreenLoader({
  message = 'Initializing ParkSpot Smart Infrastructure...',
  subtext = 'Connecting to live parking telemetry network',
  ariaLabel = 'ParkSpot is loading'
}) {
  return (
    <div
      className="ps-loader-fullscreen"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="parkspot-loading-logo">
        <Logo size="lg" theme="light" />
      </div>

      <div className="parkspot-progress-track" aria-hidden="true">
        <div className="parkspot-progress-bar-inner" />
      </div>

      <p className="parkspot-loading-text">{message}</p>
      {subtext && (
        <span style={{ fontSize: '0.75rem', color: 'var(--ps-secondary-dark)', marginTop: '0.25rem' }}>
          {subtext}
        </span>
      )}
    </div>
  );
}

export default FullScreenLoader;
