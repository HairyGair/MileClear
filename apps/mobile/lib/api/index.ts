// API client for communicating with the Fastify backend

import * as SecureStore from "expo-secure-store";
import { syncTokenToSiri, clearSiriToken } from "../siri/index";
import { parseApiError } from "./apiError";
import { getClientContextHeaders } from "./clientContext";

export { ApiError, isApiError } from "./apiError";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.mileclear.com";
export const ACCESS_TOKEN_KEY = "mileclear_access_token";
export const REFRESH_TOKEN_KEY = "mileclear_refresh_token";

// In-memory token cache — SecureStore can throw "User interaction is not
// allowed" when iOS blocks keychain access during background-to-foreground
// transitions. The cache means background finalize paths (auto-trip save)
// never need to hit the keychain at all, preventing trip loss.
let cachedAccessToken: string | null = null;

// Global session expiry listener — AuthContext subscribes to this
// so that any 401 from any screen automatically triggers logout
type SessionExpiredListener = () => void;
let sessionExpiredListener: SessionExpiredListener | null = null;

export function onSessionExpired(listener: SessionExpiredListener | null) {
  sessionExpiredListener = listener;
}

if (!__DEV__ && API_URL.startsWith("http://")) {
  console.warn("WARNING: API_URL is not using HTTPS in production:", API_URL);
}

async function getAccessToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (token) cachedAccessToken = token;
    return token;
  } catch {
    // SecureStore can throw "User interaction is not allowed" in background
    // contexts on iOS. Fall back to the in-memory cached token.
    return cachedAccessToken;
  }
}

export async function setTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  cachedAccessToken = accessToken;
  // CRITICAL: keychainAccessible AFTER_FIRST_UNLOCK so background tasks (the
  // native location engine, sync queue, finalize) can READ the tokens while the
  // phone is LOCKED — the normal case during a drive. The SecureStore default
  // (WHEN_UNLOCKED) makes them unreadable when locked, so a background refresh
  // failed, the session was cleared, and the user was logged out (Anthony: 293
  // re-login sessions). THIS_DEVICE_ONLY keeps them out of iCloud keychain/backup.
  const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken, opts);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, opts);
  // Keep App Group UserDefaults in sync so Siri App Intents can authenticate
  syncTokenToSiri(accessToken).catch(() => {});
}

export async function clearTokens(): Promise<void> {
  cachedAccessToken = null;
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  // Remove the Siri token so intents stop making authenticated API calls
  clearSiriToken().catch(() => {});
}

// Deduplicate concurrent refresh attempts — prevents race condition
// where multiple 401s trigger parallel refreshes and token rotation
// invalidates all but the first
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    let refreshToken: string | null = null;
    try {
      refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // SecureStore blocked (device locked, e.g. a token still stored with the
      // old WHEN_UNLOCKED accessibility). Do NOT return null — the caller treats
      // null as a rejected session and clears the tokens, forcing a re-login.
      // Throw so apiRequest treats it as transient (like a network error) and
      // leaves the session intact; it'll refresh fine once unlocked.
      throw new Error("REFRESH_SECURESTORE_BLOCKED");
    }
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return null; // Server rejected token — session truly expired

      const data = await res.json();
      await setTokens(data.data.accessToken, data.data.refreshToken);
      return data.data.accessToken;
    } catch {
      // Network error — throw so caller can distinguish from a genuine
      // token rejection. The session may still be valid; the server was
      // just unreachable. We must NOT clear tokens for this case.
      throw new Error("REFRESH_NETWORK_ERROR");
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let token = await getAccessToken();

  // Capture fraud-prevention context headers in parallel with token
  // refresh — both async, both cheap, no inter-dependency. Throwing here
  // would block every API call, so we swallow errors and let the request
  // go through with whatever subset of headers we built.
  const clientContextHeaders = await getClientContextHeaders().catch(() => ({}));

  const makeRequest = async (accessToken: string | null) => {
    const headers: Record<string, string> = {
      ...clientContextHeaders,
      ...(options.headers as Record<string, string>),
    };
    // Only set Content-Type for requests that have a body — Fastify rejects
    // empty bodies with Content-Type: application/json (400 Bad Request)
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    return fetch(`${API_URL}${path}`, { ...options, headers });
  };

  let res = await makeRequest(token);

  // Skip token refresh for auth endpoints — they return 401 for invalid credentials,
  // not expired tokens, so refreshing makes no sense and masks the real error
  const isAuthEndpoint = path.startsWith("/auth/");

  // If 401 on a protected endpoint, try refreshing the token. EXCEPTION:
  // HMRC-specific 401s (code: HMRC_REAUTH_REQUIRED) mean the user's HMRC
  // OAuth tokens were revoked at HMRC's end — the MileClear access token
  // is fine, refreshing it won't help. Surface the error directly so the
  // calling screen can prompt for HMRC re-OAuth.
  if (res.status === 401 && !isAuthEndpoint) {
    const peek = await peekErrorCode(res);
    if (peek?.code === "HMRC_REAUTH_REQUIRED") {
      throw parseApiError(peek.body, res.status);
    }

    try {
      token = await refreshAccessToken();
    } catch {
      // Network error during refresh — don't clear the session.
      // The refresh token is probably still valid; the server was
      // just unreachable. Clearing tokens here would force re-login
      // every time the app opens without connectivity.
      throw new Error("Network error");
    }

    if (token) {
      res = await makeRequest(token);
    } else {
      // Server explicitly rejected the refresh token — session truly expired
      await clearTokens();
      sessionExpiredListener?.();
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw parseApiError(body, res.status);
  }

  return res.json();
}

/**
 * Peek at a 401 response body without consuming the original Response.
 * Returns the parsed body + extracted error code, or null if the body
 * isn't JSON. Used to short-circuit the access-token refresh loop when
 * the 401 is HMRC-specific.
 */
async function peekErrorCode(
  res: Response
): Promise<{ code: string | null; body: unknown } | null> {
  try {
    const body = (await res.clone().json()) as unknown;
    if (typeof body === "object" && body !== null && "error" in body) {
      const errorField = (body as { error: unknown }).error;
      if (
        typeof errorField === "object" &&
        errorField !== null &&
        "code" in errorField &&
        typeof (errorField as { code: unknown }).code === "string"
      ) {
        return { code: (errorField as { code: string }).code, body };
      }
    }
    return { code: null, body };
  } catch {
    return null;
  }
}
