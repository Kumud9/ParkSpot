import React, { useState } from 'react';
import { Logo } from '../Logo';
import { ActionLoader } from '../Loading';
import { api, authStorage } from '../../../services/api';
import { X, Lock, Mail, User, ShieldAlert, Check } from 'lucide-react';

export function AuthModal({ isOpen, onClose, onAuthSuccess, defaultRole = 'driver' }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState(defaultRole); // 'driver' | 'operator'
  const [email, setEmail] = useState('user@parkspot.test');
  const [password, setPassword] = useState('Pass@12345');
  const [name, setName] = useState('Priya Sharma');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleRoleToggle = (selectedRole) => {
    setRole(selectedRole);
    if (selectedRole === 'driver') {
      setEmail('user@parkspot.test');
      setPassword('Pass@12345');
      setName('Priya Sharma');
    } else {
      setEmail('admin@urbanpark.test');
      setPassword('Pass@12345');
      setName('UrbanPark Operations Admin');
    }
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.login(email, password);
      if (res?.token) {
        if (role === 'driver') {
          authStorage.setDriverToken(res.token);
        } else {
          authStorage.setOperatorToken(res.token);
        }
        onAuthSuccess && onAuthSuccess(res.user, role);
        onClose();
      } else {
        setError('Login failed. Please verify credentials.');
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

        {/* Role Switcher Pill */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--ps-primary-light, #F4F2E7)',
          padding: '3px',
          borderRadius: 'var(--ps-radius-sm)',
          marginBottom: '1.25rem',
          border: '1px solid var(--ps-secondary-light)'
        }}>
          <button
            type="button"
            className={`btn btn-sm ${role === 'driver' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none' }}
            onClick={() => handleRoleToggle('driver')}
          >
            Driver Portal
          </button>
          <button
            type="button"
            className={`btn btn-sm ${role === 'operator' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, border: 'none' }}
            onClick={() => handleRoleToggle('operator')}
          >
            Operator B2B
          </button>
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
            gap: '0.4rem'
          }}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-name">Full Name</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-name"
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
            style={{ padding: '0.75rem', marginTop: '0.5rem', fontWeight: 600 }}
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
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--ps-primary-dark)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
