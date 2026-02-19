// Client-side auth helpers for the web dashboard.
// Tokens are stored in HttpOnly cookies set by the API.

import { api } from "./api";

export async function login(email: string, password: string) {
  return api.post("/auth/login", { email, password });
}

export async function register(
  email: string,
  password: string,
  displayName?: string
) {
  return api.post("/auth/register", { email, password, displayName });
}

export async function logout() {
  // TODO: call API to invalidate refresh token
}
