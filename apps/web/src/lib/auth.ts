import { api, setTokens, clearTokens, getRefreshToken } from "./api";
import type { User } from "@mileclear/shared";

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api.post<AuthResponse>("/auth/login", { email, password });
  setTokens(res.accessToken, res.refreshToken);
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
  setTokens(res.accessToken, res.refreshToken);
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
