// Sole-trader invoice tracker API client.
// Laura Joyce feature, 10 May 2026 (1.2.0).
// Linked-earning anti-double-count flow added 21 May 2026 — see
// `linkInvoiceToEarning` / `unlinkInvoiceFromEarning` plus the
// PotentialEarningMatch type returned on mark-paid responses.

import { apiRequest } from "./index";

export type InvoiceStatus = "sent" | "paid" | "overdue" | "written_off";

export interface InvoiceLineItem {
  id: string;
  position: number;
  description: string;
  /** Prisma Decimal serialises as a string over JSON. */
  quantity: string | number;
  unitPricePence: number;
  totalPence: number;
}

export interface Invoice {
  id: string;
  userId: string;
  company: string;
  clientId: string | null;
  /** Optional — pre-addresses the late-payment chase email draft. */
  clientEmail: string | null;
  reference: string | null;
  /** Per-user sequence (format with formatInvoiceNumber). Null on legacy rows. */
  invoiceNumber: number | null;
  amountPence: number;
  /** Net total when the invoice was built with lines or VAT; null = legacy. */
  subtotalPence: number | null;
  vatRate: number | null;
  vatPence: number | null;
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

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPricePence: number;
}

/** Totals contract (server recomputes, never trusts the client):
 *  lineItems present → totals from lines; no lines + vatRate → amountPence
 *  is the NET subtotal and VAT is added; neither → legacy gross amount. */
export interface CreateInvoiceInput {
  company?: string;
  clientId?: string | null;
  clientEmail?: string | null;
  reference?: string | null;
  amountPence?: number;
  lineItems?: LineItemInput[];
  vatRate?: 20 | 5 | 0 | null;
  sentAt: string; // YYYY-MM-DD
  dueAt?: string;
  paidAt?: string | null;
  notes?: string | null;
}

export interface UpdateInvoiceInput {
  company?: string;
  clientId?: string | null;
  clientEmail?: string | null;
  reference?: string | null;
  amountPence?: number;
  /** Replace-all: send the full array. Empty array clears builder data. */
  lineItems?: LineItemInput[];
  vatRate?: 20 | 5 | 0 | null;
  sentAt?: string;
  dueAt?: string;
  paidAt?: string | null;
  notes?: string | null;
  writeOff?: boolean;
}

/** Detail response includes ordered line items. */
export function fetchInvoiceWithLines(id: string) {
  return apiRequest<{ data: Invoice & { lineItems: InvoiceLineItem[] } }>(
    `/invoices/${id}`
  );
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

// ── Send + email history (Get Paid Milestone D) ──────────────────────

export interface InvoiceEmailRecord {
  id: string;
  kind: string;
  toEmail: string;
  subject: string;
  status: "sent" | "failed";
  createdAt: string;
}

/** Emails the branded PDF to the client (Pro). 409 = cooldown. */
export function sendInvoiceToClient(id: string) {
  return apiRequest<{ data: { sent: boolean; toEmail: string; emailedAt: string } }>(
    `/invoices/${id}/send`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export function fetchInvoiceEmails(id: string) {
  return apiRequest<{ data: InvoiceEmailRecord[] }>(`/invoices/${id}/emails`);
}
