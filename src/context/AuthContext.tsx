import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, CompanySettings } from '../types/index.ts';
import { api, tokenStorage } from '../api/client.ts';

interface AuthContextType {
  user: User | null;
  token: string | null;
  settings: CompanySettings | null;
  isLoading: boolean;
  isInitialized: boolean;
  darkMode: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshSession: () => Promise<void>;
  toggleDarkMode: () => void;
  checkStatus: () => Promise<void>;
  setSettings: (settings: CompanySettings) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(tokenStorage.get());
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('hcm_dark_mode') === 'true';
  });

  // Apply dark mode class to root html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('hcm_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('hcm_dark_mode', 'false');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const checkStatus = useCallback(async () => {
    try {
      const status = await api.getStatus();
      setIsInitialized(status.isInitialized);
    } catch (err) {
      console.error('Failed to get status:', err);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const storedToken = tokenStorage.get();
    if (!storedToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      await checkStatus();
      return;
    }

    try {
      const data = await api.getMe();
      setUser(data.user);
      setSettings(data.settings);
      setToken(storedToken);
      setIsInitialized(true);
    } catch (err) {
      console.warn('Session expired or invalid, logging out:', err);
      tokenStorage.clear();
      setUser(null);
      setToken(null);
      await checkStatus();
    } finally {
      setIsLoading(false);
    }
  }, [checkStatus]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = (newToken: string, newUser: User) => {
    tokenStorage.set(newToken);
    setToken(newToken);
    setUser(newUser);
    refreshSession();
  };

  const logout = () => {
    tokenStorage.clear();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        settings,
        isLoading,
        isInitialized,
        darkMode,
        login,
        logout,
        refreshSession,
        toggleDarkMode,
        checkStatus,
        setSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
