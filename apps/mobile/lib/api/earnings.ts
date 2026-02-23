import { apiRequest } from "./index";
import type {
  Earning,
  PaginatedResponse,
  CsvParsePreview,
  CsvEarningRow,
  CsvImportResult,
  PlaidConnection,
} from "@mileclear/shared";

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

// ── CSV Import ──────────────────────────────────────────────────────

export function uploadCsvPreview(csvContent: string, platform?: string) {
  return apiRequest<{ data: CsvParsePreview }>("/earnings/csv/preview", {
    method: "POST",
    body: JSON.stringify({ csvContent, platform }),
  });
}

export function confirmCsvImport(rows: CsvEarningRow[], filename?: string) {
  return apiRequest<{ data: CsvImportResult }>("/earnings/csv/confirm", {
    method: "POST",
    body: JSON.stringify({ rows, filename }),
  });
}

// ── Open Banking (Plaid) ────────────────────────────────────────────

export function createPlaidLinkToken() {
  return apiRequest<{ data: { linkToken: string } }>(
    "/earnings/open-banking/link-token",
    { method: "POST" }
  );
}

export function fetchPlaidConnections() {
  return apiRequest<{ data: PlaidConnection[] }>(
    "/earnings/open-banking/connections"
  );
}

export function syncPlaidConnection(
  connectionId: string,
  fromDate?: string,
  toDate?: string
) {
  return apiRequest<{
    data: { imported: number; skipped: number; unmatched: number };
  }>("/earnings/open-banking/sync", {
    method: "POST",
    body: JSON.stringify({ connectionId, fromDate, toDate }),
  });
}

export function disconnectPlaidConnection(connectionId: string) {
  return apiRequest<{ message: string }>(
    `/earnings/open-banking/connections/${connectionId}`,
    { method: "DELETE" }
  );
}
