import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/shared/Logo';
import { ActionLoader } from '../components/shared/Loading';
import { useAuth } from '../context/AuthContext';
import {
  Car,
  Building2,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Mail,
  RotateCcw
} from 'lucide-react';
import './login.css';

export function LoginPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const { portal } = useParams();
  const { login, signup, verifySignup, resendSignupOtp } = useAuth();

  // Normalize route param: null | 'driver' | 'operator'
  const normalizedPortal = portal === 'driver' || portal === 'operator' ? portal : null;
  const [selectedPortal, setSelectedPortal] = useState(normalizedPortal);

  // Sync state if URL param changes
  useEffect(() => {
    setSelectedPortal(normalizedPortal);
    setError(null);
  }, [normalizedPortal]);

  // Auth form states
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Verification states
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyToken, setVerifyToken] = useState(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendNotice, setResendNotice] = useState(null);
  const [verifySuccess, setVerifySuccess] = useState(false);

  const otpInputRefs = useRef([]);

  // Cooldown countdown timer
  useEffect(() => {
    let timer;
    if (isVerifying && cooldownSeconds > 0) {
      timer = setInterval(() => {
        setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isVerifying, cooldownSeconds]);

  // Auto-focus first OTP digit when entering verification
  useEffect(() => {
    if (isVerifying && otpInputRefs.current[0]) {
      otpInputRefs.current[0].focus();
    }
  }, [isVerifying]);

  const handleSelectPortal = (target) => {
    setSelectedPortal(target);
    setError(null);
    setIsSignUp(false);
    setIsVerifying(false);
    setEmail('');
    setPassword('');
    setName('');
    navigate(`/login/${target}`);
  };

  const handleBackToPortals = () => {
    setSelectedPortal(null);
    setError(null);
    setIsVerifying(false);
    navigate('/login');
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResendNotice(null);

    const portalAccountType = selectedPortal === 'driver' ? 'DRIVER' : 'OPERATOR';

    try {
      if (isSignUp) {
        const signupRes = await signup({
          name: name.trim() || (selectedPortal === 'driver' ? 'Driver' : 'Operator'),
          email: email.trim(),
          password,
          accountType: portalAccountType,
          organizationName: selectedPortal === 'operator' ? `${(name || 'My').trim()}'s Operations` : undefined
        });

        if (signupRes?.status === 'PENDING_VERIFICATION' || signupRes?.requiresVerification) {
          // Transition to dedicated OTP verification step
          setIsVerifying(true);
          setVerifyEmail(email.trim());
          setVerifyToken(signupRes.verificationToken || null);
          setOtpDigits(['', '', '', '', '', '']);
          setCooldownSeconds(60);
          setError(null);
          return;
        }

        // Direct login fallback if auto-verified
        if (signupRes) {
          completeAuth(signupRes);
        }
      } else {
        const authUser = await login(email.trim(), password, portalAccountType);
        if (authUser) {
          completeAuth(authUser);
        } else {
          setError('Login failed. Please verify credentials.');
        }
      }
    } catch (err) {
      if (err.code === 'VERIFICATION_REQUIRED' || err.message?.toLowerCase().includes('verify')) {
        // Unverified user tried logging in: smoothly prompt for OTP
        setIsVerifying(true);
        setVerifyEmail(email.trim());
        setOtpDigits(['', '', '', '', '', '']);
        setCooldownSeconds(60);
        setError('Your account is pending verification. Please enter the 6-digit code sent to your email.');
      } else {
        setError(err.message || 'Authentication error.');
      }
    } finally {
      setLoading(false);
    }
  };

  const completeAuth = (authUser) => {
    onAuthSuccess && onAuthSuccess(authUser);
    const effectiveAccountType =
      authUser.accountType ||
      (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(authUser.role) ? 'OPERATOR' : 'DRIVER');

    if (effectiveAccountType === 'OPERATOR') {
      navigate('/operator', { replace: true });
    } else {
      navigate('/driver', { replace: true });
    }
  };

  // OTP Input handlers
  const handleOtpChange = (index, val) => {
    const clean = val.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (!clean) {
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }

    newDigits[index] = clean.slice(-1);
    setOtpDigits(newDigits);
    setError(null);

    // Auto-advance to next box
    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setOtpDigits(newDigits);
    setError(null);

    const nextIndex = Math.min(pasted.length, 5);
    otpInputRefs.current[nextIndex]?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpCode = otpDigits.join('');
    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    setLoading(true);
    setError(null);
    setResendNotice(null);

    try {
      const verifiedUser = await verifySignup({
        email: verifyEmail,
        otp: otpCode,
        token: verifyToken
      });

      setVerifySuccess(true);
      setTimeout(() => {
        completeAuth(verifiedUser);
      }, 700);
    } catch (err) {
      setError(err.message || 'Invalid verification code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldownSeconds > 0 || resendLoading) return;
    setResendLoading(true);
    setError(null);
    setResendNotice(null);

    try {
      await resendSignupOtp({
        email: verifyEmail,
        token: verifyToken
      });
      setCooldownSeconds(60);
      setOtpDigits(['', '', '', '', '', '']);
      setResendNotice('A new 6-digit verification code has been sent to your email.');
      otpInputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message || 'Could not resend verification code. Please try again later.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="role-selection-wrapper">
      <div className="role-selection-card">
        {/* ParkSpot Official Logo */}
        <div
          style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem', cursor: 'pointer' }}
          onClick={() => navigate('/')}
          title="Return to ParkSpot Home"
        >
          <Logo variant="full" size="lg" theme="light" />
        </div>

        {selectedPortal === null ? (
          /* Step 1: Choose Your Portal Screen */
          <>
            <h1 className="portal-title">Welcome back</h1>
            <p className="portal-subtitle">Choose your portal</p>

            <div className="portal-options-grid">
              {/* DRIVER CARD */}
              <div
                className="portal-option-box"
                onClick={() => handleSelectPortal('driver')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectPortal('driver');
                  }
                }}
              >
                <div>
                  <div className="portal-option-icon">
                    <Car size={26} strokeWidth={1.8} />
                  </div>
                  <div className="portal-option-title">DRIVER</div>
                  <p className="portal-option-desc">Find and manage your parking</p>
                </div>
                <div className="portal-option-action">
                  <span>Continue</span>
                  <ArrowRight size={14} />
                </div>
              </div>

              {/* OPERATOR CARD */}
              <div
                className="portal-option-box"
                onClick={() => handleSelectPortal('operator')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectPortal('operator');
                  }
                }}
              >
                <div>
                  <div className="portal-option-icon">
                    <Building2 size={26} strokeWidth={1.8} />
                  </div>
                  <div className="portal-option-title">OPERATOR</div>
                  <p className="portal-option-desc">Manage parking operations</p>
                </div>
                <div className="portal-option-action">
                  <span>Continue</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>

            <button type="button" className="auth-return-btn" onClick={() => navigate('/')}>
              <ArrowLeft size={14} />
              Return to Public Landing Page
            </button>
          </>
        ) : isVerifying ? (
          /* Step 2-B: Dedicated OTP Verification Step */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  setIsVerifying(false);
                  setError(null);
                }}
                className="portal-back-btn"
              >
                <ArrowLeft size={14} />
                Back to Sign In
              </button>
              <span className="portal-header-badge">
                {selectedPortal} Verification
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0 1rem' }}>
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                backgroundColor: 'var(--ps-primary-light, #F4F2E7)',
                color: 'var(--ps-primary-dark, #25221B)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--ps-secondary-light, #E6DFD1)'
              }}>
                <Mail size={26} />
              </div>
            </div>

            <h2 className="portal-title" style={{ fontSize: '1.45rem' }}>
              Verify your account
            </h2>
            <p className="portal-subtitle" style={{ marginBottom: '1.5rem', lineHeight: 1.5 }}>
              We've sent a 6-digit verification code to <strong style={{ color: 'var(--ps-primary-dark, #25221B)' }}>{verifyEmail}</strong>.
              Enter it below to activate your account.
            </p>

            {error && (
              <div className="auth-error-banner">
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}

            {resendNotice && (
              <div className="auth-success-banner">
                <CheckCircle2 size={16} />
                <span>{resendNotice}</span>
              </div>
            )}

            {verifySuccess && (
              <div className="auth-success-banner">
                <CheckCircle2 size={16} />
                <span>Account verified successfully! Redirecting...</span>
              </div>
            )}

            <form onSubmit={handleVerifyOtp}>
              <div className="otp-inputs-row" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className={`otp-digit-box ${digit ? 'filled' : ''}`}
                    disabled={loading || verifySuccess}
                    aria-label={`Digit ${index + 1} of verification code`}
                  />
                ))}
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || verifySuccess || otpDigits.join('').length !== 6}
                style={{ marginTop: '1rem' }}
              >
                {loading ? (
                  <ActionLoader text="Activating account..." />
                ) : verifySuccess ? (
                  'Account Verified ✓'
                ) : (
                  'Verify & Activate Account'
                )}
              </button>

              <div className="otp-resend-row">
                <span style={{ color: 'var(--ps-secondary-dark, #707371)' }}>
                  Didn't receive the code?
                </span>

                {cooldownSeconds > 0 ? (
                  <span className="otp-cooldown-badge">
                    <Clock size={13} />
                    Resend in 00:{cooldownSeconds < 10 ? `0${cooldownSeconds}` : cooldownSeconds}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="otp-resend-btn"
                    onClick={handleResendOtp}
                    disabled={resendLoading || loading}
                  >
                    {resendLoading ? 'Sending...' : 'Resend Code'}
                  </button>
                )}
              </div>
            </form>
          </>
        ) : (
          /* Step 2-A: Selected Portal Authentication Form */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <button type="button" onClick={handleBackToPortals} className="portal-back-btn">
                <ArrowLeft size={14} />
                Back to portal choice
              </button>
              <span className="portal-header-badge">
                {selectedPortal} Portal
              </span>
            </div>

            <h2 className="portal-title" style={{ fontSize: '1.45rem' }}>
              {isSignUp
                ? `Create ${selectedPortal === 'driver' ? 'Driver' : 'Operator'} Account`
                : selectedPortal === 'driver'
                ? 'Driver Sign In'
                : 'Operator Portal Sign In'}
            </h2>
            <p className="portal-subtitle" style={{ marginBottom: '1.5rem' }}>
              {isSignUp
                ? 'Create your credentials to join the ParkSpot network.'
                : selectedPortal === 'driver'
                ? 'Access your saved vehicles, reservations, and digital parking pass.'
                : 'Manage facility capacity, review pricing surge proposals, and inspect telemetry.'}
            </p>

            {error && (
              <div className="auth-error-banner">
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              {isSignUp && (
                <div className="auth-input-group">
                  <label className="auth-input-label">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Verma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="auth-text-input"
                  />
                </div>
              )}

              <div className="auth-input-group">
                <label className="auth-input-label">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder={selectedPortal === 'driver' ? 'driver@example.com' : 'operator@example.com'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-text-input"
                />
              </div>

              <div className="auth-input-group" style={{ marginBottom: '1.5rem' }}>
                <label className="auth-input-label">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-text-input"
                />
              </div>

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? (
                  <ActionLoader text={isSignUp ? 'Creating account...' : 'Verifying credentials...'} />
                ) : isSignUp ? (
                  `Create ${selectedPortal === 'driver' ? 'Driver' : 'Operator'} Account`
                ) : (
                  `Sign In to ${selectedPortal === 'driver' ? 'Driver App' : 'Operator Portal'}`
                )}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '1.35rem', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--ps-secondary-dark, #707371)' }}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  if (!isSignUp) {
                    setEmail('');
                    setPassword('');
                    setName('');
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ps-primary-dark, #25221B)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  font: 'inherit'
                }}
              >
                {isSignUp ? 'Sign In' : 'Create Account'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
