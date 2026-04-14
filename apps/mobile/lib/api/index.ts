// API client for communicating with the Fastify backend

import * as SecureStore from "expo-secure-store";
import { syncTokenToSiri, clearSiriToken } from "../siri/index";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.mileclear.com";
const ACCESS_TOKEN_KEY = "mileclear_access_token";
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
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
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
      // SecureStore blocked — can't refresh without the token
      return null;
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

  const makeRequest = async (accessToken: string | null) => {
    const headers: Record<string, string> = {
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

  // If 401 on a protected endpoint, try refreshing the token
  if (res.status === 401 && !isAuthEndpoint) {
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
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}
