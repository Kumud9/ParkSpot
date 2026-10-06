import React from 'react';
import fullLogo from '../../../assets/parkspot-logo.png';
import markLogo from '../../../assets/parkspot-mark.png';
import './logo.css';

/**
 * ParkSpot Official Logo Component
 *
 * Supports:
 * - variant: 'full' (car, pin, and ParkSpot wordmark) | 'mark' (car and pin mark only)
 * - size: 'xs' (22px), 'sm' (32px), 'md' (48px), 'lg' (72px), 'xl' (96px) or number in px
 * - theme: 'light' (on light backgrounds) | 'dark' (on dark UI surfaces like header)
 * - preserve original proportions and colors without distortion
 */
export function Logo({
  variant = 'full',
  size = 'md',
  theme = 'light',
  className = '',
  onClick = null,
  alt = 'ParkSpot — Smart Infrastructure Parking',
  style = {}
}) {
  const isMark = variant === 'mark';
  const logoSrc = isMark ? markLogo : fullLogo;

  const sizeClass = typeof size === 'string' ? `size-${size}` : '';
  const customHeight = typeof size === 'number' ? `${size}px` : undefined;

  const isWhite = variant === 'white' || theme === 'white';
  const containerClasses = [
    'parkspot-logo-container',
    sizeClass,
    `variant-${variant}`,
    isWhite ? 'white-treatment' : (theme === 'dark' ? 'on-dark' : 'on-light'),
    onClick ? 'clickable' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div
      className={containerClasses}
      onClick={onClick}
      style={style}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <img
        src={logoSrc}
        alt={alt}
        className="parkspot-logo-img"
        style={customHeight ? { height: customHeight } : undefined}
        loading="eager"
      />
    </div>
  );
}

export default Logo;
