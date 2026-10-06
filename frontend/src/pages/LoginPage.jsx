import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/shared/Logo';
import { ActionLoader } from '../components/shared/Loading';
import { useAuth } from '../context/AuthContext';
import { Car, Building2, ArrowRight, ArrowLeft, ShieldAlert } from 'lucide-react';
import './login.css';

export function LoginPage({ onAuthSuccess }) {
  const navigate = useNavigate();
  const { portal } = useParams();
  const { login, signup } = useAuth();

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

  const handleSelectPortal = (target) => {
    setSelectedPortal(target);
    setError(null);
    setIsSignUp(false);
    setEmail('');
    setPassword('');
    setName('');
    navigate(`/login/${target}`);
  };

  const handleBackToPortals = () => {
    setSelectedPortal(null);
    setError(null);
    navigate('/login');
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const portalAccountType = selectedPortal === 'driver' ? 'DRIVER' : 'OPERATOR';

    try {
      let authUser;
      if (isSignUp) {
        authUser = await signup({
          name: name.trim() || (selectedPortal === 'driver' ? 'Driver' : 'Operator'),
          email: email.trim(),
          password,
          accountType: portalAccountType,
          organizationName: selectedPortal === 'operator' ? `${(name || 'My').trim()}'s Operations` : undefined
        });
      } else {
        authUser = await login(email.trim(), password, portalAccountType);
      }

      if (authUser) {
        onAuthSuccess && onAuthSuccess(authUser);

        // Authoritative backend accountType determines destination!
        const effectiveAccountType = authUser.accountType || (['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'].includes(authUser.role) ? 'OPERATOR' : 'DRIVER');
        if (effectiveAccountType === 'OPERATOR') {
          navigate('/operator', { replace: true });
        } else {
          navigate('/driver', { replace: true });
        }
      } else {
        setError(`${isSignUp ? 'Registration' : 'Login'} failed. Please verify credentials.`);
      }
    } catch (err) {
      setError(err.message || 'Authentication error.');
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
            <h1 className="portal-title">
              Welcome back
            </h1>
            <p className="portal-subtitle">
              Choose your portal
            </p>

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
                  <p className="portal-option-desc">
                    Find and manage your parking
                  </p>
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
                  <p className="portal-option-desc">
                    Manage parking operations
                  </p>
                </div>
                <div className="portal-option-action">
                  <span>Continue</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>

            <button
              type="button"
              className="auth-return-btn"
              onClick={() => navigate('/')}
            >
              <ArrowLeft size={14} />
              Return to Public Landing Page
            </button>
          </>
        ) : (
          /* Step 2: Selected Portal Authentication Form */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <button
                type="button"
                onClick={handleBackToPortals}
                className="portal-back-btn"
              >
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
                  <label className="auth-input-label">
                    Full Name
                  </label>
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
                <label className="auth-input-label">
                  Email Address
                </label>
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
                <label className="auth-input-label">
                  Password
                </label>
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

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <ActionLoader text={isSignUp ? 'Creating account...' : 'Verifying credentials...'} />
                ) : (
                  isSignUp
                    ? `Create ${selectedPortal === 'driver' ? 'Driver' : 'Operator'} Account`
                    : `Sign In to ${selectedPortal === 'driver' ? 'Driver App' : 'Operator Portal'}`
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
