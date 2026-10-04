import React from 'react';
import { Logo } from '../Logo';
import './loading.css';

/**
 * ComponentLoader
 * Used inside cards, dashboards, modals, or smaller sections where content is loading.
 */
export function ComponentLoader({
  message = 'Loading details...',
  size = 'sm',
  variant = 'mark',
  ariaLabel = 'Component content is loading'
}) {
  return (
    <div
      className="ps-loader-component"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="parkspot-loading-logo">
        <Logo variant={variant} size={size} theme="light" />
      </div>

      <div className="parkspot-progress-track" style={{ width: '100px', height: '2px' }} aria-hidden="true">
        <div className="parkspot-progress-bar-inner" />
      </div>

      {message && <p className="parkspot-loading-text" style={{ fontSize: '0.8125rem' }}>{message}</p>}
    </div>
  );
}

export default ComponentLoader;
