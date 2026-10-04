import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Logo } from '../Logo';
import './loading.css';

/**
 * PaymentLoader
 * Used while payment processing and signature verification is occurring.
 * Communicates security, transparency, and trust using the official ParkSpot logo.
 */
export function PaymentLoader({
  amount = null,
  message = 'Securing reservation & verifying with payment gateway...',
  ariaLabel = 'Payment verification in progress'
}) {
  return (
    <div
      className="ps-loader-payment"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <div className="ps-loader-payment-security">
        <ShieldCheck size={14} />
        <span>256-Bit Encrypted Payment Session</span>
      </div>

      <div className="parkspot-loading-logo">
        <Logo size="md" theme="light" />
      </div>

      <div className="parkspot-progress-track" aria-hidden="true" style={{ width: '160px' }}>
        <div className="parkspot-progress-bar-inner" />
      </div>

      <h3 style={{ fontSize: '1.1rem', marginTop: '1rem', marginBottom: '0.25rem' }}>
        {amount ? `Processing ₹${amount}` : 'Authorizing Transaction'}
      </h3>
      <p className="parkspot-loading-text" style={{ marginTop: '0.25rem' }}>
        {message}
      </p>

      <span style={{ fontSize: '0.75rem', color: 'var(--ps-secondary-dark)', marginTop: '0.85rem' }}>
        Please keep this window open while verification finishes.
      </span>
    </div>
  );
}

export default PaymentLoader;
