import { apiRequest } from "./index";
import type { Earning, PaginatedResponse } from "@mileclear/shared";

export interface CreateEarningData {
  platform: string;
  amountPence: number;
  periodStart: string;
  periodEnd: string;
}

export interface UpdateEarningData {
  platform?: string;
  amountPence?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface ListEarningsParams {
  platform?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function fetchEarnings(params?: ListEarningsParams) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value));
    });
  }
  const qs = query.toString();
  return apiRequest<PaginatedResponse<Earning>>(`/earnings${qs ? `?${qs}` : ""}`);
}

export function fetchEarning(id: string) {
  return apiRequest<{ data: Earning }>(`/earnings/${id}`);
}

export function createEarning(data: CreateEarningData) {
  return apiRequest<{ data: Earning }>("/earnings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateEarning(id: string, data: UpdateEarningData) {
  return apiRequest<{ data: Earning }>(`/earnings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteEarning(id: string) {
  return apiRequest<{ message: string }>(`/earnings/${id}`, {
    method: "DELETE",
  });
}
