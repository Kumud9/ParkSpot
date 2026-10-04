import React from 'react';
import { Logo } from '../Logo';
import './loading.css';

/**
 * PageLoader
 * Used when an entire page or main tab is waiting for primary API data.
 */
export function PageLoader({
  message = 'Loading parking facilities...',
  ariaLabel = 'Page content is loading'
}) {
  return (
    <div
      className="ps-loader-page"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="parkspot-loading-logo">
        <Logo size="md" theme="light" />
      </div>

      <div className="parkspot-progress-track" aria-hidden="true">
        <div className="parkspot-progress-bar-inner" />
      </div>

      <p className="parkspot-loading-text">{message}</p>
    </div>
  );
}

export default PageLoader;
