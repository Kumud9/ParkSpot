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
    // If backend requires 2FA challenge, return challenge payload
    if (res?.requiresMfa || res?.status === 'MFA_REQUIRED') {
      return res;
    }
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
    // If backend requires TOTP setup, return pending challenge payload
    if (res?.status === 'PENDING_VERIFICATION' || res?.requiresVerification || res?.requiresMfaSetup) {
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

  const verifyMfaSetup = useCallback(async ({ email, code, setupToken }) => {
    const res = await api.verifyMfaSetup({ email, code, setupToken });
    if (res?.token && res?.user) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
      setUser(res.user);
      return res.user;
    }
    throw new Error(res?.message || 'Verification could not be completed.');
  }, []);

  const verifyMfaLogin = useCallback(async ({ email, code, mfaToken }) => {
    const res = await api.verifyMfaLogin({ email, code, mfaToken });
    if (res?.token && res?.user) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
      setUser(res.user);
      return res.user;
    }
    throw new Error(res?.message || 'Verification code could not be verified.');
  }, []);

  const verifyMfaRecovery = useCallback(async ({ email, recoveryCode, mfaToken }) => {
    const res = await api.verifyMfaRecovery({ email, recoveryCode, mfaToken });
    if (res?.token && res?.user) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
      setUser(res.user);
      return res.user;
    }
    throw new Error(res?.message || 'Recovery code could not be verified.');
  }, []);

  const verifySignup = useCallback(async ({ email, otp, code, token, setupToken }) => {
    const res = await api.verifySignup({ email, otp, code, token, setupToken });
    if (res?.token && res?.user) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
      setUser(res.user);
      return res.user;
    }
    throw new Error(res?.message || 'Verification could not be completed.');
  }, []);

  const resendSignupOtp = useCallback(async ({ email, token, setupToken }) => {
    return api.resendSignupOtp({ email, token, setupToken });
  }, []);

  const logout = useCallback(() => {
    authStorage.clearToken();
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUser) => {
    if (updatedUser) {
      authStorage.setUser(updatedUser);
      setUser(updatedUser);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const liveUser = await api.getMe();
      if (liveUser) {
        authStorage.setUser(liveUser);
        setUser(liveUser);
        return liveUser;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    signup,
    verifyMfaSetup,
    verifyMfaLogin,
    verifyMfaRecovery,
    verifySignup,
    resendSignupOtp,
    logout,
    updateUser,
    refreshProfile
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
