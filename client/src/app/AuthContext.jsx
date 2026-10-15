import React, { createContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Checks session and restores authentication state
  const checkAuth = useCallback(async () => {
    try {
      // 1. Fetch CSRF token cookie first if not set
      await authService.getCsrfToken().catch(() => {});

      // 2. Fetch authenticated user profile
      const response = await authService.getMe();
      if (response.data?.success && response.data.user) {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Login handler
  const login = async (email, password, rememberMe = false) => {
    // Ensure CSRF token is present before posting login
    await authService.getCsrfToken().catch(() => {});
    const response = await authService.login({ email, password, rememberMe });
    if (response.data?.success && response.data.user) {
      setUser(response.data.user);
      return response.data.user;
    }
    throw new Error('Login failed');
  };

  // Logout handler
  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    login,
    logout,
    checkAuth
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
