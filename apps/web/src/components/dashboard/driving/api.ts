// Calls and shapes used by the driving pages (vehicles, odometer, fuel, places, shifts, tools).
// Every path was checked against apps/api/src/routes on 9 Oct 2026.

import type {
  CazAssessment,
  MotHistoryResult,
  OdometerDayWithVehicle,
  OdometerReadingCreated,
  OdometerListSummary,
  Vehicle,
  VehicleOdometerResponse,
} from "@mileclear/shared";
import { api, fetchWithAuth, isApiError } from "../../../lib/api";

export type VehicleRow = Vehicle & {
  cleanAirZones?: CazAssessment;
  odometer?: OdometerListSummary | null;
  createdAt?: string;
  motExpiryDate?: string | null;
  taxDueDate?: string | null;
  euroStatus?: string | null;
  firstRegistration?: string | null;
};

export function vehicleName(v: Pick<Vehicle, "make" | "model">): string {
  return [v.make, v.model].filter(Boolean).join(" ");
}

export async function fetchVehicles(): Promise<VehicleRow[]> {
  const res = await api.get<{ data: VehicleRow[] }>("/vehicles");
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchVehicleOdometer(id: string): Promise<VehicleOdometerResponse> {
  const res = await api.get<{ data: VehicleOdometerResponse }>(`/vehicles/${id}/odometer`);
  return res.data;
}

export async function fetchMotHistory(id: string): Promise<MotHistoryResult | null> {
  try {
    const res = await api.get<{ data: MotHistoryResult | null }>(`/vehicles/${id}/mot-history`);
    return res.data ?? null;
  } catch (e) {
    // No DVSA record for the plate comes back as 404 or 502: that is "no history", not a failure.
    if (isApiError(e) && (e.statusCode === 404 || e.statusCode === 502)) return null;
    throw e;
  }
}

export async function fetchOdometerDays(params: { vehicleId?: string; from: string; to: string }) {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.vehicleId) q.set("vehicleId", params.vehicleId);
  const res = await api.get<{ data: OdometerDayWithVehicle[] }>(`/odometer/days?${q.toString()}`);
  return res.data ?? [];
}

export function deleteOdometerReading(vehicleId: string, readingId: string) {
  return api.delete<{ message?: string }>(`/vehicles/${vehicleId}/odometer-readings/${readingId}`);
}

/** The API refused a reading with a 409. `code` says which rule; `message` is the API's own sentence. */
export class ReadingConflictError extends Error {
  readonly code: "LOWER_THAN_EARLIER" | "HIGHER_THAN_LATER" | string;
  readonly other: { readingMiles: number; readAt: string } | null;
  constructor(code: string, message: string, other: { readingMiles: number; readAt: string } | null) {
    super(message);
    this.name = "ReadingConflictError";
    this.code = code;
    this.other = other;
  }
}

/**
 * POST /vehicles/:id/odometer-readings. Read with fetchWithAuth so the 409 body
 * (code, earlier, later) is kept; api.post would reduce it to a message.
 */
export async function addOdometerReading(
  vehicleId: string,
  body: { readingMiles: number; readAt?: string }
): Promise<OdometerReadingCreated> {
  const res = await fetchWithAuth(`/vehicles/${vehicleId}/odometer-readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: OdometerReadingCreated;
    code?: string;
    error?: string | { message?: string };
    earlier?: { readingMiles: number; readAt: string };
    later?: { readingMiles: number; readAt: string };
  };
  const message = typeof json.error === "string" ? json.error : json.error?.message ?? "Couldn't save that. Try again in a moment.";
  if (res.status === 409) {
    throw new ReadingConflictError(json.code ?? "CONFLICT", message, json.earlier ?? json.later ?? null);
  }
  if (!res.ok || !json.data) throw new Error(message);
  return json.data;
}

/** Saves a blob the API sent as a download. Returns the API's sentence when it refused (400). */
export async function downloadFile(path: string, fallbackName: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetchWithAuth(path);
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string | { message?: string } };
    const message = typeof json.error === "string" ? json.error : json.error?.message ?? "Couldn't download that. Try again.";
    return { ok: false, message };
  }
  const blob = await res.blob();
  const named = /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = named ? decodeURIComponent(named) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}

/** Local YYYY-MM-DD and HH:MM for date and time inputs. */
export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function toTimeInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromInputs(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

/** The API sometimes sends sentences with an em dash (badge text). The site shows none. */
export function noDashes(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ", ");
}
