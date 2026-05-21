import { apiRequest } from "./index";

export interface BankTransaction {
  id: string;
  userId: string;
  plaidConnectionId: string;
  externalId: string;
  merchant: string;
  descriptionRaw: string | null;
  /** Signed pence: positive = CREDIT (money in), negative = DEBIT (money out). */
  amountPence: number;
  currency: string;
  transactionDate: string;
  status: "pending" | "accepted" | "ignored" | "consumed" | "duplicate";
  suggestedKind: "earning" | "expense" | "unknown" | null;
  suggestedCategory: string | null;
  suggestedConfidence: number | null;
  resolvedEarningId: string | null;
  resolvedExpenseId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface InboxListResponse {
  data: BankTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AcceptAsEarningPayload {
  kind: "earning";
  platform: string;
  amountPenceOverride?: number;
  notes?: string;
}

export interface AcceptAsExpensePayload {
  kind: "expense";
  category: string;
  amountPenceOverride?: number;
  description?: string;
  notes?: string;
  vehicleId?: string;
}

export type AcceptPayload = AcceptAsEarningPayload | AcceptAsExpensePayload;

export function fetchInbox(page = 1, pageSize = 30) {
  return apiRequest<InboxListResponse>(
    `/inbox?page=${page}&pageSize=${pageSize}`
  );
}

export function fetchInboxCount() {
  return apiRequest<{ data: { count: number } }>("/inbox/count");
}

export function acceptInboxTransaction(id: string, payload: AcceptPayload) {
  return apiRequest<{ data: { ok: true; earningId?: string; expenseId?: string } }>(
    `/inbox/${id}/accept`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function ignoreInboxTransaction(id: string) {
  return apiRequest<{ data: { ok: true } }>(`/inbox/${id}/ignore`, {
    method: "POST",
  });
}
