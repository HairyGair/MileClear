import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import {
  login as authLogin,
  register as authRegister,
  logout as authLogout,
  loginWithApple as authLoginWithApple,
  loginWithGoogle as authLoginWithGoogle,
  sendVerificationCode as authSendVerification,
  verifyEmail as authVerifyEmail,
  forgotPassword as authForgotPassword,
  resetPassword as authResetPassword,
} from "./index";
import { deregisterPushToken } from "../api/notifications";
import { onSessionExpired, REFRESH_TOKEN_KEY } from "../api/index";
import { Alert } from "react-native";

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithApple: (agreedToTerms?: boolean) => Promise<void>;
  loginWithGoogle: (agreedToTerms?: boolean) => Promise<void>;
  register: (email: string, password: string, displayName?: string, agreedToTerms?: boolean) => Promise<void>;
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
    // Check the refresh token (30-day lifetime) rather than the access token
    // (15-min lifetime). The access token will almost always be expired when
    // the app cold-starts, but the session is still valid as long as we can
    // refresh it. Checking the access token caused false "not authenticated"
    // states that cascaded into forced re-logins.
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
      .then((token) => setIsAuthenticated(!!token))
      .finally(() => setIsLoading(false));

    // Auto-logout when any API call detects an expired session.
    // Guard prevents multiple alerts from concurrent 401s during hydration.
    let sessionExpired = false;
    onSessionExpired(() => {
      if (sessionExpired) return;
      sessionExpired = true;
      setIsAuthenticated(false);
      Alert.alert(
        "Session Expired",
        "Please sign in again to continue.",
        [{ text: "OK" }]
      );
    });
    return () => onSessionExpired(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await authLogin(email, password);
    setIsAuthenticated(true);
  }, []);

  const loginWithApple = useCallback(async (agreedToTerms?: boolean) => {
    await authLoginWithApple(agreedToTerms);
    setIsAuthenticated(true);
  }, []);

  const loginWithGoogle = useCallback(async (agreedToTerms?: boolean) => {
    await authLoginWithGoogle(agreedToTerms);
    setIsAuthenticated(true);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string, agreedToTerms?: boolean) => {
    await authRegister(email, password, displayName, agreedToTerms);
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
    // Best-effort deregistration — don't block logout if this fails
    try {
      await deregisterPushToken();
    } catch {
      // Silently ignore — the token will simply expire on the server
    }
    await authLogout();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isLoading, isAuthenticated, login, loginWithApple, loginWithGoogle, register, logout, completeAuth, sendVerificationCode, verifyEmail, forgotPassword, resetPassword }}>
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
