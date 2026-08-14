// Auth logic: login, register, token management

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { apiRequest, setTokens, clearTokens, REFRESH_TOKEN_KEY } from "../api/index";
import type { AuthTokens } from "@mileclear/shared";

// ── Local-data ownership on sign-in (GDPR, 14 Aug 2026) ─────────────────
//
// Establishes who the local database belongs to, so a second person
// signing in on the same handset cannot inherit the first person's trips,
// breadcrumbs and home/work pins. See `claimLocalDataFor` in lib/db for
// why the wipe is keyed on a user CHANGE rather than on logout.
//
// The user id comes from the access token we were just handed. Decoding
// it locally keeps this off the network: no added latency on the login
// path, and no failure mode where a flaky request could be mistaken for
// a different user. The token is not being trusted for authorisation
// here, only read for identity, so an unverified decode is appropriate.

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64UrlDecode(input: string): string {
  const normalised = input.replace(/-/g, "+").replace(/_/g, "/");
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const ch of normalised) {
    if (ch === "=") break;
    const idx = B64_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function userIdFromAccessToken(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(base64UrlDecode(payload)) as { userId?: unknown };
    return typeof claims.userId === "string" && claims.userId ? claims.userId : null;
  } catch {
    return null;
  }
}

/**
 * Store tokens, then hand the local database to whoever just signed in.
 * Every authenticated entry point goes through here so no login path can
 * silently skip the ownership check.
 *
 * Runs BEFORE the caller flips `isAuthenticated`, which is what starts
 * hydration — so a wipe can never land on top of freshly hydrated rows.
 */
async function setTokensAndClaimLocalData(tokens: AuthTokens): Promise<void> {
  await setTokens(tokens.accessToken, tokens.refreshToken);
  try {
    const { claimLocalDataFor } = await import("../db/index");
    await claimLocalDataFor(userIdFromAccessToken(tokens.accessToken));
  } catch {
    // Never block a sign-in on housekeeping. Worst case the owner is not
    // recorded and the next sign-in adopts rather than wipes.
  }
}

// Lazy imports for native-only modules (not available in Expo Go)
let AppleAuthentication: typeof import("expo-apple-authentication") | null = null;
let GoogleSignin: typeof import("@react-native-google-signin/google-signin").GoogleSignin | null = null;

try {
  AppleAuthentication = require("expo-apple-authentication");
} catch {}

try {
  const google = require("@react-native-google-signin/google-signin");
  GoogleSignin = google.GoogleSignin;
  GoogleSignin?.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
} catch {}

export async function login(
  email: string,
  password: string
): Promise<void> {
  const res = await apiRequest<{ data: AuthTokens }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  await setTokensAndClaimLocalData(res.data);
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
  agreedToTerms?: boolean,
  referralCode?: string
): Promise<void> {
  const res = await apiRequest<{ data: AuthTokens }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName, agreedToTerms, referralCode }),
  });
  await setTokensAndClaimLocalData(res.data);
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

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await apiRequest<{ data: AuthTokens }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  await setTokensAndClaimLocalData(res.data);
}

export async function loginWithApple(agreedToTerms?: boolean): Promise<void> {
  if (Platform.OS !== "ios") {
    throw new Error("Apple Sign-In is only available on iOS");
  }
  if (!AppleAuthentication) {
    throw new Error("Apple Sign-In requires a development build");
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
      agreedToTerms,
    }),
  });
  await setTokensAndClaimLocalData(res.data);
}

export async function loginWithGoogle(agreedToTerms?: boolean): Promise<void> {
  if (!GoogleSignin) {
    throw new Error("Google Sign-In requires a development build");
  }
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  if (!response.data?.idToken) {
    throw new Error("Google Sign-In failed — no ID token");
  }

  const res = await apiRequest<{ data: AuthTokens }>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken: response.data.idToken, agreedToTerms }),
  });
  await setTokensAndClaimLocalData(res.data);
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

  // Tear down trip detection — a logged-out device must not keep tracking
  // (pre-existing gap found 10 Jun 2026: the engine survived logout). The
  // logged_out flag also stops bootNativeEngineOnLaunch resurrecting the
  // engine on the next JS boot; it's cleared on the next authenticated
  // session (_layout startup effect).
  try {
    const { getDatabase } = await import("../db/index");
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('logged_out', '1')"
    );
  } catch {}
  try {
    const { stopDriveDetection } = await import("../tracking/detection");
    await stopDriveDetection();
  } catch {}
  try {
    const { stopNativeLocationEngine } = await import("../tracking/nativeLocation");
    await stopNativeLocationEngine();
  } catch {}
  try {
    const { stopGeofencing } = await import("../geofencing/index");
    await stopGeofencing();
  } catch {}
}
