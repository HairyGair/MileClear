import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import {
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  sendVerificationCode as authSendVerification,
  verifyEmail as authVerifyEmail,
  forgotPassword as authForgotPassword,
  resetPassword as authResetPassword,
} from "./index";

const ACCESS_TOKEN_KEY = "mileclear_access_token";

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  completeAuth: () => void;
  sendVerificationCode: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
      .then((token) => setIsAuthenticated(!!token))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await authLogin(email, password);
    setIsAuthenticated(true);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    await authRegister(email, password, displayName);
    // Don't set isAuthenticated — user stays in auth group for verify screen
  }, []);

  const completeAuth = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const sendVerificationCode = useCallback(async () => {
    await authSendVerification();
  }, []);

  const verifyEmail = useCallback(async (code: string) => {
    await authVerifyEmail(code);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await authForgotPassword(email);
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    await authResetPassword(email, code, newPassword);
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isLoading, isAuthenticated, login, register, logout, completeAuth, sendVerificationCode, verifyEmail, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
