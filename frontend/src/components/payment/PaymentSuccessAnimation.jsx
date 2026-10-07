import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Logo } from '../shared/Logo';

/**
 * Premium ParkSpot Gold Coin Payment Success Animation
 *
 * Sequence (~950ms):
 * 1. Coin launches with forward velocity toward reader terminal (0-550ms)
 * 2. Coin arrives at destination reader with subtle gold impact glow (550-750ms)
 * 3. Verified success badge & checkmark confirms payment (750-950ms)
 * 4. Calls onComplete() to display the confirmed digital pass
 */
export function PaymentSuccessAnimation({
  amount = 40,
  facilityName = 'ParkSpot Facility',
  spotNumber = 'A1',
  onComplete
}) {
  const [phase, setPhase] = useState('travel'); // 'travel' | 'impact' | 'confirmed'
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    // Phase 1 -> 2: Coin travels and impacts terminal at 350ms
    const impactTimer = setTimeout(() => {
      setPhase('impact');
    }, 350);

    // Phase 2 -> 3: Confirmation banner with checkmark appears at 650ms
    const confirmTimer = setTimeout(() => {
      setPhase('confirmed');
    }, 650);

    // Phase 3 -> Pass: Transition to confirmed booking pass view at 1000ms (~1 second total)
    const completeTimer = setTimeout(() => {
      if (onCompleteRef.current) onCompleteRef.current();
    }, 1000);

    return () => {
      clearTimeout(impactTimer);
      clearTimeout(confirmTimer);
      clearTimeout(completeTimer);
    };
  }, []);

  return (
    <div className="coin-anim-overlay" role="status" aria-live="assertive">
      <div className="coin-anim-card">
        {/* Top Branding */}
        <div className="coin-anim-header">
          <Logo variant="full" size={32} theme="dark" />
          <span className="coin-anim-secure-badge">
            <ShieldCheck size={14} /> 256-Bit Gateway Verified
          </span>
        </div>

        {/* Central Animation Stage */}
        <div className="coin-anim-stage">
          {/* Origin: Payment Terminal */}
          <div className="coin-terminal origin-terminal">
            <span className="terminal-lbl">PAID</span>
            <span className="terminal-amount">₹{amount}</span>
          </div>

          {/* Traveling Gold Coin */}
          <div className={`coin-track ${phase}`}>
            <div className="gold-coin">
              <div className="coin-inner">
                <span className="coin-p">P</span>
              </div>
              <div className="coin-glow-trail" />
            </div>
          </div>

          {/* Destination: Verified Space Receiver */}
          <div className={`coin-terminal target-terminal ${phase === 'impact' || phase === 'confirmed' ? 'impacted' : ''}`}>
            <span className="terminal-lbl">SPACE</span>
            <span className="terminal-spot">{spotNumber}</span>
            {phase === 'impact' && <div className="impact-burst-ring" />}
          </div>
        </div>

        {/* Status Message */}
        <div className="coin-anim-status">
          {phase === 'travel' && (
            <p className="coin-status-text travel">
              Securing reservation for Spot <strong>{spotNumber}</strong>...
            </p>
          )}
          {phase === 'impact' && (
            <p className="coin-status-text impact">
              Payment verified with banking gateway
            </p>
          )}
          {phase === 'confirmed' && (
            <div className="coin-confirmed-block">
              <CheckCircle2 size={24} className="coin-check-icon" />
              <div>
                <h3 className="coin-confirmed-title">Payment Successful</h3>
                <p className="coin-confirmed-sub">Issuing digital pass for {facilityName}...</p>
              </div>
            </div>
          )}
        </div>

        {/* 3.6s Sequence Progress Bar */}
        <div className="coin-anim-progress-bar" aria-hidden="true">
          <div className="coin-anim-progress-fill" />
        </div>
      </div>
    </div>
  );
}

export default PaymentSuccessAnimation;
