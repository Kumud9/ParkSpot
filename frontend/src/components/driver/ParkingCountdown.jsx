import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertCircle, Bell, BellRing, CheckCircle, ShieldAlert } from 'lucide-react';

/**
 * Formats seconds into HH:MM:SS
 */
function formatRemaining(totalSec) {
  if (totalSec <= 0) return '00:00:00';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formats ISO date into human 12-hour clock (e.g. 5:30 PM)
 */
function formatEndTime(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return String(dateValue);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ParkingCountdown({
  booking,
  onExpire = null,
  compact = false,
  className = ''
}) {
  const bookingId = booking?.id || booking?._id;
  const rawEnd = booking?.endDateTime || booking?.endTime;
  const endTimestamp = rawEnd ? new Date(rawEnd).getTime() : 0;

  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!endTimestamp) return 0;
    return Math.max(0, Math.floor((endTimestamp - Date.now()) / 1000));
  });

  const [inAppAlert, setInAppAlert] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });

  const hasExpiredRef = useRef(false);

  // Helper to send notification and in-app reminder deduplicated
  const triggerReminder = (key, message) => {
    if (!bookingId) return;
    const storageKey = `ps_reminders_${bookingId}`;
    let sent = [];
    try {
      sent = JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      sent = [];
    }

    if (sent.includes(key)) return; // Already reminded for this milestone

    sent.push(key);
    try {
      localStorage.setItem(storageKey, JSON.stringify(sent));
    } catch {}

    // In-app alert
    setInAppAlert({ key, message });

    // Browser notification (if supported & granted)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('ParkSpot Parking Reminder', {
          body: message,
          icon: '/parkspot-mark.png'
        });
      } catch (err) {
        console.info('[ParkSpot] Browser notification notice:', err.message);
      }
    }
  };

  useEffect(() => {
    if (!endTimestamp) return;

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTimestamp - now) / 1000));
      setSecondsLeft(remaining);

      // Reminder thresholds:
      // 1. 30 minutes (<= 1800s and > 600s)
      if (remaining <= 1800 && remaining > 600) {
        triggerReminder('30min', 'Your parking session ends in 30 minutes.');
      }
      // 2. 10 minutes (<= 600s and > 0s)
      else if (remaining <= 600 && remaining > 0) {
        triggerReminder('10min', 'Your parking session ends in 10 minutes.');
      }
      // 3. Expired (=== 0)
      else if (remaining === 0) {
        triggerReminder('expired', 'Your parking session has ended.');
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          if (onExpire) onExpire(booking);
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endTimestamp, bookingId]);

  // Request browser notification politely
  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
      } catch {}
    }
  };

  const isExpired = secondsLeft <= 0;
  const isUrgent = secondsLeft > 0 && secondsLeft <= 600; // Under 10 mins

  const spotLabel = booking?.spotNumber || 'Spot';
  const floorLabel = booking?.floor || 'Floor 1';
  const endsAtText = formatEndTime(rawEnd);

  if (compact) {
    return (
      <div className={`countdown-compact ${className}`} style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.35rem 0.65rem',
        borderRadius: 'var(--ps-radius-sm)',
        backgroundColor: isExpired ? 'rgba(198, 40, 40, 0.12)' : isUrgent ? 'rgba(217, 119, 6, 0.15)' : 'rgba(37, 34, 27, 0.08)',
        color: isExpired ? '#C62828' : isUrgent ? '#B2A240' : 'var(--ps-primary-dark)',
        fontFamily: 'var(--ps-font-mono)',
        fontSize: '0.8125rem',
        fontWeight: 700
      }}>
        <Clock size={14} />
        <span>{isExpired ? 'Session Ended' : `${formatRemaining(secondsLeft)} left`}</span>
      </div>
    );
  }

  return (
    <div className={`parking-countdown-card ${className}`} style={{
      backgroundColor: 'var(--ps-primary-light)',
      border: `2px solid ${isExpired ? '#C62828' : isUrgent ? 'var(--ps-accent-dark)' : 'var(--ps-secondary-light)'}`,
      borderRadius: 'var(--ps-radius-md)',
      padding: '1.25rem',
      position: 'relative'
    }}>
      {/* In-app reminder toast/banner */}
      {inAppAlert && (
        <div style={{
          backgroundColor: inAppAlert.key === 'expired' ? '#FDE8E8' : '#FEF3C7',
          color: inAppAlert.key === 'expired' ? '#9B1C1C' : '#92400E',
          border: `1px solid ${inAppAlert.key === 'expired' ? '#F87171' : '#FCD34D'}`,
          borderRadius: 'var(--ps-radius-sm)',
          padding: '0.65rem 0.85rem',
          marginBottom: '1rem',
          fontSize: '0.8125rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <AlertCircle size={16} />
            <strong>{inAppAlert.message}</strong>
          </div>
          <button
            type="button"
            onClick={() => setInAppAlert(null)}
            style={{ fontSize: '0.75rem', textDecoration: 'underline', color: 'inherit' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <span className="eyebrow" style={{ color: 'var(--ps-secondary-dark)', letterSpacing: '0.08em' }}>
            PARKING SESSION
          </span>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ps-primary-dark)' }}>
            {spotLabel} · {floorLabel}
          </div>
        </div>

        {/* Status Pill */}
        <span
          className={`status-tag ${isExpired ? 'occupied' : isUrgent ? 'reserved' : 'available'}`}
          style={{ textTransform: 'uppercase', fontSize: '0.6875rem' }}
        >
          {isExpired ? 'Ended' : isUrgent ? 'Ending Soon' : 'Active'}
        </span>
      </div>

      {/* Timer Display */}
      <div style={{
        textAlign: 'center',
        padding: '0.85rem 0',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        borderRadius: 'var(--ps-radius-sm)',
        marginBottom: '0.85rem',
        border: '1px solid rgba(0,0,0,0.05)'
      }}>
        <div style={{
          fontSize: '2.25rem',
          fontWeight: 800,
          fontFamily: 'var(--ps-font-mono)',
          color: isExpired ? '#C62828' : isUrgent ? 'var(--ps-accent-dark)' : 'var(--ps-primary-dark)',
          lineHeight: 1.1,
          letterSpacing: '-0.02em'
        }}>
          {isExpired ? '00:00:00' : formatRemaining(secondsLeft)}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--ps-secondary-dark)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginTop: '0.25rem'
        }}>
          {isExpired ? 'Parking session ended' : 'remaining'}
        </div>
      </div>

      {/* Ends At & Notification toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem' }}>
        <div style={{ color: 'var(--ps-secondary-dark)' }}>
          {isExpired ? (
            <span>Ended at <strong>{endsAtText}</strong></span>
          ) : (
            <span>Ends at <strong>{endsAtText}</strong></span>
          )}
        </div>

        {notificationPermission === 'default' && !isExpired && (
          <button
            type="button"
            onClick={requestNotificationPermission}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.6875rem',
              color: 'var(--ps-secondary-dark)',
              padding: '0.2rem 0.5rem',
              borderRadius: 'var(--ps-radius-sm)',
              border: '1px solid var(--ps-secondary-light)',
              cursor: 'pointer'
            }}
            title="Enable browser alerts for 30m, 10m and expiry"
          >
            <Bell size={12} />
            <span>Enable alerts</span>
          </button>
        )}

        {notificationPermission === 'granted' && !isExpired && (
          <span style={{ fontSize: '0.6875rem', color: 'var(--ps-state-available)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <BellRing size={12} /> Alerts On
          </span>
        )}
      </div>
    </div>
  );
}

export default ParkingCountdown;
