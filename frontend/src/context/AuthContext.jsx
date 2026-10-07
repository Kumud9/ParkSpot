import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, authStorage } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authStorage.getUser());
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from token on mount
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      const token = authStorage.getToken();
      if (!token) {
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const liveUser = await api.getMe();
        if (isMounted) {
          if (liveUser) {
            setUser(liveUser);
            authStorage.setUser(liveUser);
          } else {
            // Token was invalid or expired
            authStorage.clearToken();
            setUser(null);
          }
        }
      } catch (_e) {
        if (isMounted) {
          authStorage.clearToken();
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email, password, accountType = null) => {
    const res = await api.login(email, password, accountType);
    if (res?.token && res?.user) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
      setUser(res.user);
      return res.user;
    }
    throw new Error('Invalid authentication response.');
  }, []);

  const signup = useCallback(async ({ name, email, password, accountType, organizationName }) => {
    const res = await api.register({
      name,
      email,
      password,
      accountType,
      organizationName
    });
    // If backend requires OTP verification, return pending verification payload
    if (res?.status === 'PENDING_VERIFICATION' || res?.requiresVerification) {
      return res;
    }
    // Fallback if auto-verified
    if (res?.token && res?.user) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
      setUser(res.user);
      return res.user;
    }
    throw new Error('Invalid registration response.');
  }, []);

  const verifySignup = useCallback(async ({ email, otp, token }) => {
    const res = await api.verifySignup({ email, otp, token });
    if (res?.token && res?.user) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
      setUser(res.user);
      return res.user;
    }
    throw new Error(res?.message || 'Verification could not be completed.');
  }, []);

  const resendSignupOtp = useCallback(async ({ email, token }) => {
    return api.resendSignupOtp({ email, token });
  }, []);

  const logout = useCallback(() => {
    authStorage.clearToken();
    setUser(null);
  }, []);

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    signup,
    verifySignup,
    resendSignupOtp,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
