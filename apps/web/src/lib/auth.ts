import { api, setTokens, clearTokens, getRefreshToken } from "./api";
import type { User } from "@mileclear/shared";

interface AuthResponse {
  data: {
    accessToken: string;
    refreshToken: string;
  };
}

function handleTokens(res: AuthResponse) {
  setTokens(res.data.accessToken, res.data.refreshToken);
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api.post<AuthResponse>("/auth/login", { email, password });
  handleTokens(res);
  return fetchProfile();
}

export async function register(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const res = await api.post<AuthResponse>("/auth/register", {
    email,
    password,
    displayName,
  });
  handleTokens(res);
  return fetchProfile();
}

export async function loginWithGoogle(idToken: string): Promise<User> {
  const res = await api.post<AuthResponse>("/auth/google", { idToken });
  handleTokens(res);
  return fetchProfile();
}

export async function loginWithApple(
  identityToken: string,
  fullName?: { givenName?: string | null; familyName?: string | null }
): Promise<User> {
  const res = await api.post<AuthResponse>("/auth/apple", {
    identityToken,
    fullName,
  });
  handleTokens(res);
  return fetchProfile();
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await api.post("/auth/logout", { refreshToken });
    }
  } catch {
    // Ignore errors — we're clearing tokens regardless
  }
  clearTokens();
}

export async function fetchProfile(): Promise<User> {
  const res = await api.get<User>("/user/profile");
  return res;
}
