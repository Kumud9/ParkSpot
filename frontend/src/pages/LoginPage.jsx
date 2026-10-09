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
  ShieldCheck,
  CheckCircle2,
  Key,
  Copy,
  Check,
  Smartphone,
  Lock
} from 'lucide-react';
import './login.css';

export function LoginPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const { portal } = useParams();
  const { login, signup, verifyMfaSetup, verifyMfaLogin, verifyMfaRecovery } = useAuth();

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

  // 2FA / TOTP states
  // mfaMode: null | 'SETUP' | 'LOGIN' | 'RECOVERY'
  const [mfaMode, setMfaMode] = useState(null);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [setupToken, setSetupToken] = useState(null);
  const [mfaToken, setMfaToken] = useState(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);
  const [manualSetupKey, setManualSetupKey] = useState(null);
  const [showManualKey, setShowManualKey] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [copiedKey, setCopiedKey] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [verifySuccess, setVerifySuccess] = useState(false);

  const otpInputRefs = useRef([]);

  // Auto-focus first digit when entering MFA
  useEffect(() => {
    if ((mfaMode === 'SETUP' || mfaMode === 'LOGIN') && otpInputRefs.current[0]) {
      otpInputRefs.current[0].focus();
    }
  }, [mfaMode]);

  const handleSelectPortal = (target) => {
    setSelectedPortal(target);
    setError(null);
    setIsSignUp(false);
    setMfaMode(null);
    setEmail('');
    setPassword('');
    setName('');
    navigate(`/login/${target}`);
  };

  const handleBackToPortals = () => {
    setSelectedPortal(null);
    setError(null);
    setMfaMode(null);
    navigate('/login');
  };

  const handleCopyKey = () => {
    if (!manualSetupKey) return;
    navigator.clipboard.writeText(manualSetupKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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

        if (signupRes?.status === 'PENDING_VERIFICATION' || signupRes?.requiresMfaSetup || signupRes?.requiresVerification) {
          // Transition to TOTP Authenticator enrollment
          setMfaMode('SETUP');
          setVerifyEmail(email.trim());
          setSetupToken(signupRes.setupToken || signupRes.verificationToken || null);
          setQrCodeDataUrl(signupRes.qrCodeDataUrl || null);
          setManualSetupKey(signupRes.manualSetupKey || null);
          setRecoveryCodes(signupRes.recoveryCodes || []);
          setShowManualKey(false);
          setOtpDigits(['', '', '', '', '', '']);
          setError(null);
          return;
        }

        // Direct login fallback if auto-verified
        if (signupRes) {
          completeAuth(signupRes);
        }
      } else {
        const authRes = await login(email.trim(), password, portalAccountType);

        if (authRes?.requiresMfa || authRes?.status === 'MFA_REQUIRED') {
          // Transition to Login 2-Step Verification
          setMfaMode('LOGIN');
          setVerifyEmail(email.trim());
          setMfaToken(authRes.mfaToken);
          setOtpDigits(['', '', '', '', '', '']);
          setError(null);
          return;
        }

        if (authRes?.id || authRes?.email) {
          completeAuth(authRes);
        } else {
          setError('Login failed. Please verify credentials.');
        }
      }
    } catch (err) {
      if (err.code === 'VERIFICATION_REQUIRED' || err.message?.toLowerCase().includes('verify')) {
        setError('Please complete two-factor authentication setup to activate your account.');
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
      if (!authUser.facilityId && !authUser.facility) {
        navigate('/operator/onboarding', { replace: true });
      } else {
        navigate('/operator', { replace: true });
      }
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

  // Setup TOTP Verification Handler
  const handleVerifySetupTotp = async (e) => {
    e.preventDefault();
    const enteredCode = otpDigits.join('');
    if (enteredCode.length !== 6) {
      setError('Please enter all 6 digits of your authenticator code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const verifiedUser = await verifyMfaSetup({
        email: verifyEmail,
        code: enteredCode,
        setupToken
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

  // Login TOTP Verification Handler
  const handleVerifyLoginTotp = async (e) => {
    e.preventDefault();
    const enteredCode = otpDigits.join('');
    if (enteredCode.length !== 6) {
      setError('Please enter all 6 digits from your authenticator app.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const verifiedUser = await verifyMfaLogin({
        email: verifyEmail,
        code: enteredCode,
        mfaToken
      });

      setVerifySuccess(true);
      setTimeout(() => {
        completeAuth(verifiedUser);
      }, 700);
    } catch (err) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Login Backup Recovery Code Handler
  const handleVerifyRecoveryCode = async (e) => {
    e.preventDefault();
    if (!recoveryCodeInput.trim()) {
      setError('Please enter your backup recovery code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const verifiedUser = await verifyMfaRecovery({
        email: verifyEmail,
        recoveryCode: recoveryCodeInput.trim(),
        mfaToken
      });

      setVerifySuccess(true);
      setTimeout(() => {
        completeAuth(verifiedUser);
      }, 700);
    } catch (err) {
      setError(err.message || 'Invalid or already used recovery code.');
    } finally {
      setLoading(false);
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
        ) : mfaMode === 'SETUP' ? (
          /* ------------------------------------------------------------- */
          /* Step 2-B: TOTP Authenticator Enrollment Screen (Signup 2FA)   */
          /* ------------------------------------------------------------- */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  setMfaMode(null);
                  setError(null);
                }}
                className="portal-back-btn"
              >
                <ArrowLeft size={14} />
                Back to Sign In
              </button>
              <span className="portal-header-badge">
                2-Step Verification
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.25rem 0 0.75rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--ps-primary-light, #F4F2E7)',
                color: 'var(--ps-primary-dark, #25221B)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--ps-secondary-light, #E6DFD1)'
              }}>
                <Smartphone size={24} />
              </div>
            </div>

            <h2 className="portal-title" style={{ fontSize: '1.45rem' }}>
              Set up 2-step verification
            </h2>
            <p className="portal-subtitle" style={{ marginBottom: '1rem', lineHeight: 1.45 }}>
              Protect your ParkSpot account with an authenticator app.
            </p>

            {error && (
              <div className="auth-error-banner">
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}

            {verifySuccess && (
              <div className="auth-success-banner">
                <CheckCircle2 size={16} />
                <span>Account verified and 2-step verification enabled! Redirecting...</span>
              </div>
            )}

            {/* REAL TOTP QR CODE */}
            {qrCodeDataUrl ? (
              <div className="totp-qr-container">
                <img
                  src={qrCodeDataUrl}
                  alt="Scan with Google Authenticator or Microsoft Authenticator"
                  className="totp-qr-image"
                />
              </div>
            ) : null}

            <p className="totp-instruction-text">
              Scan this QR code using Google Authenticator, Microsoft Authenticator, or another compatible authenticator app.
            </p>

            {/* MANUAL SETUP KEY TOGGLE */}
            {manualSetupKey && (
              <div className="totp-manual-toggle">
                <button
                  type="button"
                  onClick={() => setShowManualKey(!showManualKey)}
                  className="totp-text-link"
                >
                  {showManualKey ? "Hide manual setup key" : "Can't scan the QR code? Enter setup key manually"}
                </button>
                {showManualKey && (
                  <div className="totp-manual-box">
                    <code className="totp-key-code">{manualSetupKey}</code>
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className="totp-copy-btn"
                      title="Copy setup key"
                    >
                      {copiedKey ? <Check size={13} /> : <Copy size={13} />}
                      {copiedKey ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* BACKUP RECOVERY CODES DISPLAY */}
            {recoveryCodes && recoveryCodes.length > 0 && (
              <div className="totp-recovery-box">
                <div className="totp-recovery-header">
                  <strong>Save these recovery codes somewhere safe.</strong>
                  <span className="totp-recovery-sub">Each recovery code can only be used once if you lose access to your authenticator.</span>
                </div>
                <div className="totp-recovery-grid">
                  {recoveryCodes.map((code, idx) => (
                    <code key={idx} className="totp-recovery-item">{code}</code>
                  ))}
                </div>
              </div>
            )}

            {/* 6-DIGIT CODE INPUT */}
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ps-primary-dark, #25221B)', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
              Enter the 6-digit code generated by your authenticator app
            </p>

            <form onSubmit={handleVerifySetupTotp}>
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
                  'Account Activated ✓'
                ) : (
                  'Verify & Activate Account'
                )}
              </button>
            </form>
          </>
        ) : mfaMode === 'LOGIN' ? (
          /* ------------------------------------------------------------- */
          /* Step 2-C: Login 2-Step Verification Screen                    */
          /* ------------------------------------------------------------- */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  setMfaMode(null);
                  setError(null);
                }}
                className="portal-back-btn"
              >
                <ArrowLeft size={14} />
                Back to Sign In
              </button>
              <span className="portal-header-badge">
                Security Check
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0 1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--ps-primary-light, #F4F2E7)',
                color: 'var(--ps-primary-dark, #25221B)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--ps-secondary-light, #E6DFD1)'
              }}>
                <ShieldCheck size={24} />
              </div>
            </div>

            <h2 className="portal-title" style={{ fontSize: '1.45rem' }}>
              Two-step verification
            </h2>
            <p className="portal-subtitle" style={{ marginBottom: '1.5rem', lineHeight: 1.45 }}>
              Enter the 6-digit code from your authenticator app.
            </p>

            {error && (
              <div className="auth-error-banner">
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}

            {verifySuccess && (
              <div className="auth-success-banner">
                <CheckCircle2 size={16} />
                <span>Verification successful! Signing in...</span>
              </div>
            )}

            <form onSubmit={handleVerifyLoginTotp}>
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
                  <ActionLoader text="Verifying code..." />
                ) : verifySuccess ? (
                  'Verified ✓'
                ) : (
                  'Verify & Continue'
                )}
              </button>

              <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setMfaMode('RECOVERY');
                    setError(null);
                  }}
                  className="totp-text-link"
                >
                  Use a recovery code
                </button>
              </div>
            </form>
          </>
        ) : mfaMode === 'RECOVERY' ? (
          /* ------------------------------------------------------------- */
          /* Step 2-D: Backup Recovery Code Verification Screen             */
          /* ------------------------------------------------------------- */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  setMfaMode('LOGIN');
                  setError(null);
                }}
                className="portal-back-btn"
              >
                <ArrowLeft size={14} />
                Back to Authenticator
              </button>
              <span className="portal-header-badge">
                Account Recovery
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0 1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--ps-primary-light, #F4F2E7)',
                color: 'var(--ps-primary-dark, #25221B)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--ps-secondary-light, #E6DFD1)'
              }}>
                <Key size={24} />
              </div>
            </div>

            <h2 className="portal-title" style={{ fontSize: '1.45rem' }}>
              Use backup recovery code
            </h2>
            <p className="portal-subtitle" style={{ marginBottom: '1.5rem', lineHeight: 1.45 }}>
              Enter one of the 8-character backup codes you saved during 2-step verification setup.
            </p>

            {error && (
              <div className="auth-error-banner">
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}

            {verifySuccess && (
              <div className="auth-success-banner">
                <CheckCircle2 size={16} />
                <span>Recovery code accepted! Signing in...</span>
              </div>
            )}

            <form onSubmit={handleVerifyRecoveryCode}>
              <div className="auth-input-group" style={{ marginBottom: '1.25rem' }}>
                <label className="auth-input-label">Backup Recovery Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 7F3A-9C2E"
                  value={recoveryCodeInput}
                  onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                  className="auth-text-input"
                  style={{ fontFamily: 'var(--ps-font-mono, monospace)', letterSpacing: '0.1em', textAlign: 'center', fontSize: '1.1rem' }}
                  disabled={loading || verifySuccess}
                />
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || verifySuccess || !recoveryCodeInput.trim()}
              >
                {loading ? (
                  <ActionLoader text="Validating code..." />
                ) : verifySuccess ? (
                  'Verified ✓'
                ) : (
                  'Verify & Continue'
                )}
              </button>

              <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setMfaMode('LOGIN');
                    setError(null);
                  }}
                  className="totp-text-link"
                >
                  Enter code from authenticator app instead
                </button>
              </div>
            </form>
          </>
        ) : (
          /* ------------------------------------------------------------- */
          /* Step 2-A: Selected Portal Authentication Form (Email/Password) */
          /* ------------------------------------------------------------- */
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
