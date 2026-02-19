import { apiRequest } from "./index";
import type { User } from "@mileclear/shared";

export interface UpdateProfileData {
  displayName?: string | null;
  email?: string;
  currentPassword?: string;
}

export function fetchProfile() {
  return apiRequest<{ data: User }>("/user/profile");
}

export function updateProfile(data: UpdateProfileData) {
  return apiRequest<{ data: User }>("/user/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function exportUserData() {
  return apiRequest<Record<string, unknown>>("/user/export");
}

export function deleteAccount(password: string) {
  return apiRequest<{ message: string }>("/user/account", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}
