// Auth logic: login, register, token management

import * as SecureStore from "expo-secure-store";
import { apiRequest, setTokens, clearTokens, REFRESH_TOKEN_KEY } from "../api/index";
import type { AuthTokens } from "@mileclear/shared";

export async function login(
  email: string,
  password: string
): Promise<void> {
  const res = await apiRequest<{ data: AuthTokens }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  await setTokens(res.data.accessToken, res.data.refreshToken);
}

export async function register(
  email: string,
  password: string,
  displayName?: string
): Promise<void> {
  const res = await apiRequest<{ data: AuthTokens }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  await setTokens(res.data.accessToken, res.data.refreshToken);
}

export async function sendVerificationCode(): Promise<void> {
  await apiRequest("/auth/send-verification", { method: "POST" });
}

export async function verifyEmail(code: string): Promise<void> {
  await apiRequest("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await apiRequest("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  await apiRequest("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, code, newPassword }),
  });
}

export async function logout(): Promise<void> {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      await apiRequest("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    // Best-effort: server call failed, still clear locally
  }
  await clearTokens();
}
