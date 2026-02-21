// Auth logic: login, register, token management

import * as SecureStore from "expo-secure-store";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { Platform } from "react-native";
import { apiRequest, setTokens, clearTokens, REFRESH_TOKEN_KEY } from "../api/index";
import type { AuthTokens } from "@mileclear/shared";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

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

export async function loginWithApple(): Promise<void> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple Sign-In is only available on iOS");
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple Sign-In failed — no identity token");
  }

  const res = await apiRequest<{ data: AuthTokens }>("/auth/apple", {
    method: "POST",
    body: JSON.stringify({
      identityToken: credential.identityToken,
      fullName: credential.fullName
        ? {
            givenName: credential.fullName.givenName,
            familyName: credential.fullName.familyName,
          }
        : undefined,
    }),
  });
  await setTokens(res.data.accessToken, res.data.refreshToken);
}

export async function loginWithGoogle(): Promise<void> {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  if (!response.data?.idToken) {
    throw new Error("Google Sign-In failed — no ID token");
  }

  const res = await apiRequest<{ data: AuthTokens }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken: response.data.idToken }),
  });
  await setTokens(res.data.accessToken, res.data.refreshToken);
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
