import { apiRequest } from "./index";
import type {
  AdminAnalytics,
  AdminUserSummary,
  AdminUserDetail,
  AdminHealthStatus,
  PaginatedResponse,
} from "@mileclear/shared";

export function fetchAdminAnalytics() {
  return apiRequest<{ data: AdminAnalytics }>("/admin/analytics");
}

export function fetchAdminUsers(params?: { q?: string; page?: number; pageSize?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set("q", params.q);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
  const qs = searchParams.toString();
  return apiRequest<PaginatedResponse<AdminUserSummary>>(`/admin/users${qs ? `?${qs}` : ""}`);
}

export function fetchAdminUserDetail(userId: string) {
  return apiRequest<{ data: AdminUserDetail }>(`/admin/users/${userId}`);
}

export function toggleUserPremium(userId: string, isPremium: boolean) {
  return apiRequest<{ data: { id: string; email: string; isPremium: boolean } }>(
    `/admin/users/${userId}/premium`,
    { method: "PATCH", body: JSON.stringify({ isPremium }) }
  );
}

export function deleteAdminUser(userId: string) {
  return apiRequest<{ message: string }>(`/admin/users/${userId}`, { method: "DELETE" });
}

export function fetchAdminHealth() {
  return apiRequest<{ data: AdminHealthStatus }>("/admin/health");
}
