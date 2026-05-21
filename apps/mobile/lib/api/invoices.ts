// Sole-trader invoice tracker API client.
// Laura Joyce feature, 10 May 2026 (1.2.0).
// Linked-earning anti-double-count flow added 21 May 2026 — see
// `linkInvoiceToEarning` / `unlinkInvoiceFromEarning` plus the
// PotentialEarningMatch type returned on mark-paid responses.

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

/** Returned alongside a paid invoice when the server thinks the user
 *  may have already logged the same money as a manual earning. The
 *  client shows a link-or-keep sheet when matches.length > 0. */
export interface PotentialEarningMatch {
  id: string;
  platform: string;
  amountPence: number;
  /** ISO date (YYYY-MM-DD). */
  periodStart: string;
  notes: string | null;
  /** Signed: negative = earning is before the invoice's paidAt date. */
  daysFromAnchor: number;
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

/** Response shape for create + update — matches may be empty. */
export interface InvoiceMutationResponse {
  data: Invoice;
  potentialEarningMatches?: PotentialEarningMatch[];
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
  return apiRequest<InvoiceMutationResponse>("/invoices", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateInvoice(id: string, data: UpdateInvoiceInput) {
  return apiRequest<InvoiceMutationResponse>(`/invoices/${id}`, {
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

/** Link one (or many) manual earnings to a paid invoice. After this,
 *  the Tax Readiness card counts the invoice and skips the earnings,
 *  preventing the double-count. Many-to-one: a single invoice can be
 *  the replacement for any number of earnings (e.g. 7 daily £57.14
 *  entries rolled up into a single £400 invoice). */
export function linkInvoiceToEarning(invoiceId: string, earningId: string) {
  return apiRequest<{ data: { invoiceId: string; linkedEarningIds: string[] } }>(
    `/invoices/${invoiceId}/link-earning`,
    {
      method: "POST",
      body: JSON.stringify({ earningId }),
    }
  );
}

export function linkInvoiceToEarnings(invoiceId: string, earningIds: string[]) {
  return apiRequest<{ data: { invoiceId: string; linkedEarningIds: string[] } }>(
    `/invoices/${invoiceId}/link-earning`,
    {
      method: "POST",
      body: JSON.stringify({ earningIds }),
    }
  );
}

/** Clear earning links from an invoice. Without an earningId, clears
 *  every earning that points at this invoice. With one, only that one. */
export function unlinkInvoiceFromEarning(invoiceId: string, earningId?: string) {
  return apiRequest<{ data: { invoiceId: string; cleared: number } }>(
    `/invoices/${invoiceId}/unlink-earning`,
    {
      method: "POST",
      body: earningId ? JSON.stringify({ earningId }) : JSON.stringify({}),
    }
  );
}
