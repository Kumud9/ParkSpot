import React from 'react';
import markLogo from '../../../assets/parkspot-mark.png';
import './loading.css';

/**
 * ActionLoader
 * Used inside buttons during active actions such as "Reserve Spot", "Continue to Payment", "Pay", "Cancel Booking".
 * Uses the compact official logo mark with a subtle breathing pulse.
 */
export function ActionLoader({
  text = 'Processing...',
  ariaLabel = 'Action in progress'
}) {
  return (
    <span
      className="ps-loader-action"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <img
        src={markLogo}
        alt=""
        aria-hidden="true"
        className="ps-loader-action-mark"
      />
      <span>{text}</span>
    </span>
  );
}

export default ActionLoader;
