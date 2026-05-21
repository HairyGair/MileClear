import { apiRequest } from "./index";
import type { Expense, PaginatedResponse } from "@mileclear/shared";

export interface CreateExpenseData {
  category: string;
  amountPence: number;
  date: string;
  vehicleId?: string;
  description?: string;
  vendor?: string;
  notes?: string;
  projectLabel?: string;
}

export interface UpdateExpenseData {
  category?: string;
  amountPence?: number;
  date?: string;
  vehicleId?: string | null;
  description?: string;
  vendor?: string;
  notes?: string;
  projectLabel?: string | null;
}

export interface ListExpensesParams {
  category?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ExpenseSummaryRow {
  category: string;
  totalPence: number;
  count: number;
  deductibleWithMileage: boolean;
}

export function fetchExpenses(params?: ListExpensesParams) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value));
    });
  }
  const qs = query.toString();
  return apiRequest<PaginatedResponse<Expense>>(
    `/expenses${qs ? `?${qs}` : ""}`
  );
}

export function createExpense(data: CreateExpenseData) {
  return apiRequest<{ data: Expense }>("/expenses", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateExpense(id: string, data: UpdateExpenseData) {
  return apiRequest<{ data: Expense }>(`/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteExpense(id: string) {
  return apiRequest<{ message: string }>(`/expenses/${id}`, {
    method: "DELETE",
  });
}

export function fetchExpenseSummary(taxYear?: string) {
  const qs = taxYear ? `?taxYear=${encodeURIComponent(taxYear)}` : "";
  return apiRequest<{ data: ExpenseSummaryRow[]; taxYear: string }>(
    `/expenses/summary${qs}`
  );
}
