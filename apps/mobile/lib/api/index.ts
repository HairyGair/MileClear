// API client for communicating with the Fastify backend

import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.mileclear.com";
const ACCESS_TOKEN_KEY = "mileclear_access_token";
export const REFRESH_TOKEN_KEY = "mileclear_refresh_token";

if (!__DEV__ && API_URL.startsWith("http://")) {
  console.warn("WARNING: API_URL is not using HTTPS in production:", API_URL);
}

async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function setTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// Deduplicate concurrent refresh attempts — prevents race condition
// where multiple 401s trigger parallel refreshes and token rotation
// invalidates all but the first
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      await setTokens(data.data.accessToken, data.data.refreshToken);
      return data.data.accessToken;
    } catch {
      return null;
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
    token = await refreshAccessToken();
    if (token) {
      res = await makeRequest(token);
    } else {
      await clearTokens();
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}
