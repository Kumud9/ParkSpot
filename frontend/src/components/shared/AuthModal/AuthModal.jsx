import React, { useState } from 'react';
import { Logo } from '../Logo';
import { ActionLoader } from '../Loading';
import { useAuth } from '../../../context/AuthContext';
import { X, ShieldAlert, KeyRound } from 'lucide-react';

export function AuthModal({ isOpen, onClose, onAuthSuccess, defaultRole = 'driver' }) {
  const { login, signup } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [role] = useState(defaultRole); // 'driver' | 'operator'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    // Client-side validations
    if (isSignUp) {
      if (!trimmedName || trimmedName.length < 2) {
        setError('Please enter your full name (at least 2 characters).');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
        setError('Please enter a valid email address with a domain (e.g. kumud@gmail.com).');
        return;
      }
      if (!password || password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
    } else {
      if (!trimmedEmail) {
        setError('Please enter your email address.');
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }
    }

    setLoading(true);

    const targetAccountType = role === 'driver' ? 'DRIVER' : 'OPERATOR';

    try {
      let authUser;
      if (isSignUp) {
        authUser = await signup({
          name: trimmedName,
          email: trimmedEmail,
          password,
          accountType: targetAccountType,
          organizationName: role === 'operator' ? `${trimmedName}'s Operations` : undefined
        });
      } else {
        authUser = await login(trimmedEmail, password, targetAccountType);
      }

      if (authUser) {
        const resolvedRole = (authUser.accountType || '').toUpperCase() === 'OPERATOR' ? 'operator' : 'driver';
        onAuthSuccess && onAuthSuccess(authUser, resolvedRole);
        onClose();
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
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', padding: '2rem' }}>
        {/* Close Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ps-secondary-dark)' }}
            aria-label="Close authentication modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Official ParkSpot Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <Logo size="md" theme="light" />
          </div>
          <h2 id="auth-modal-title" style={{ fontSize: '1.35rem', marginBottom: '0.25rem' }}>
            {isSignUp ? 'Create your ParkSpot Account' : 'Welcome to ParkSpot'}
          </h2>
          <p className="metadata">
            {isSignUp
              ? 'Join the intelligent urban parking network'
              : 'Sign in to access your bookings and parking pass'}
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#FDE8E8',
            color: '#9B1C1C',
            border: '1px solid #F87171',
            borderRadius: 'var(--ps-radius-sm)',
            padding: '0.65rem 0.85rem',
            marginBottom: '1rem',
            fontSize: '0.8125rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            textAlign: 'left'
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                type="text"
                className="form-input"
                placeholder="e.g. Kumud Chouhan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="auth-email">Email Address</label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleUseDemo}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--ps-accent-dark, #8A7A00)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: 0
                  }}
                >
                  <KeyRound size={12} /> Fill demo account
                </button>
              )}
            </div>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              placeholder="e.g. kumud@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="form-input"
              minLength={8}
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {isSignUp && (
              <span className="metadata" style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                Must be at least 8 characters long.
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
            style={{ padding: '0.75rem', fontWeight: 600 }}
          >
            {loading ? (
              <ActionLoader text={isSignUp ? 'Creating account...' : 'Signing in...'} />
            ) : (
              isSignUp ? 'Sign Up' : 'Sign In'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.8125rem' }}>
          <span className="metadata">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setEmail('');
              setPassword('');
              setName('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ps-primary-dark)',
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
              font: 'inherit'
            }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
