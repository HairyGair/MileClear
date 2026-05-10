// Sole-trader invoice tracker API client.
// Laura Joyce feature, 10 May 2026 (1.2.0).

import { apiRequest } from "./index";

export type InvoiceStatus = "sent" | "paid" | "overdue" | "written_off";

export interface Invoice {
  id: string;
  userId: string;
  company: string;
  reference: string | null;
  amountPence: number;
  /** ISO date (YYYY-MM-DD) */
  sentAt: string;
  /** ISO date (YYYY-MM-DD). Defaults to sentAt + 30 days. */
  dueAt: string;
  /** ISO date or null until marked paid. */
  paidAt: string | null;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceListResponse {
  data: Invoice[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: Record<InvoiceStatus, { count: number; totalPence: number }>;
}

export interface CreateInvoiceInput {
  company: string;
  reference?: string | null;
  amountPence: number;
  sentAt: string; // YYYY-MM-DD
  dueAt?: string;
  paidAt?: string | null;
  notes?: string | null;
}

export interface UpdateInvoiceInput {
  company?: string;
  reference?: string | null;
  amountPence?: number;
  sentAt?: string;
  dueAt?: string;
  paidAt?: string | null;
  notes?: string | null;
  writeOff?: boolean;
}

export function fetchInvoices(args: { status?: InvoiceStatus; page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams();
  if (args.status) params.set("status", args.status);
  if (args.page) params.set("page", String(args.page));
  if (args.pageSize) params.set("pageSize", String(args.pageSize));
  const qs = params.toString();
  return apiRequest<InvoiceListResponse>(`/invoices${qs ? `?${qs}` : ""}`);
}

export function fetchInvoice(id: string) {
  return apiRequest<{ data: Invoice }>(`/invoices/${id}`);
}

export function createInvoice(data: CreateInvoiceInput) {
  return apiRequest<{ data: Invoice }>("/invoices", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateInvoice(id: string, data: UpdateInvoiceInput) {
  return apiRequest<{ data: Invoice }>(`/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function markInvoicePaid(id: string, paidAt: string) {
  return updateInvoice(id, { paidAt });
}

export function deleteInvoice(id: string) {
  return apiRequest<{ data: { deleted: boolean } }>(`/invoices/${id}`, {
    method: "DELETE",
  });
}
