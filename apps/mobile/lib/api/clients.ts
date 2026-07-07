// Client book API (Get Paid, Jul 2026). Free-tier — the paywall bites
// at invoice generation, not at organising who you work for.

import { apiRequest } from "./index";

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  _count?: { invoices: number };
}

export interface ClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  notes?: string | null;
}

export function fetchClients(includeArchived = false) {
  const qs = includeArchived ? "?includeArchived=true" : "";
  return apiRequest<{ data: Client[] }>(`/clients${qs}`);
}

export function fetchClient(id: string) {
  return apiRequest<{ data: Client }>(`/clients/${id}`);
}

export function createClient(input: ClientInput) {
  return apiRequest<{ data: Client }>("/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateClient(id: string, input: Partial<ClientInput>) {
  return apiRequest<{ data: Client }>(`/clients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Archives when the client has invoices; hard-deletes otherwise. */
export function deleteClient(id: string) {
  return apiRequest<{ data: { archived: boolean; deleted: boolean } }>(
    `/clients/${id}`,
    { method: "DELETE" }
  );
}
