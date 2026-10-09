import type {
  OdometerDayWithVehicle,
  OdometerReadingCreated,
  VehicleOdometerResponse,
} from "@mileclear/shared";
import { apiRequest } from "./index";

// Running odometer client (SPEC-UX 6.2). Types come from @mileclear/shared.

export type {
  OdometerCurrent,
  OdometerDayWithVehicle as OdometerDay,
  OdometerReadingEntry as OdometerReadingRow,
  OdometerListSummary as VehicleListOdometer,
  VehicleOdometerResponse as VehicleOdometer,
  OdometerReadingCreated,
  OdometerAnchorSource as OdometerReadingSource,
} from "@mileclear/shared";

export interface AddReadingBody {
  readingMiles: number;
  /** ISO datetime; the server defaults to now. */
  readAt?: string;
}

/**
 * Thrown by addOdometerReading on a 409. The server sends either
 * LOWER_THAN_EARLIER or HIGHER_THAN_LATER, but apiRequest drops the body, so
 * callers tell them apart with classifyConflict() on a fresh readings list.
 * `serverMessage` is the server's own copy, if it came through.
 */
export class ReadingConflictError extends Error {
  readonly serverMessage: string | null;
  constructor(serverMessage: string | null) {
    super("READING_CONFLICT");
    this.name = "ReadingConflictError";
    this.serverMessage = serverMessage;
  }
}

export function fetchVehicleOdometer(vehicleId: string) {
  return apiRequest<{ data: VehicleOdometerResponse }>(`/vehicles/${vehicleId}/odometer`);
}

export async function addOdometerReading(vehicleId: string, body: AddReadingBody) {
  try {
    return await apiRequest<{ data: OdometerReadingCreated }>(
      `/vehicles/${vehicleId}/odometer-readings`,
      { method: "POST", body: JSON.stringify(body) }
    );
  } catch (err) {
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e?.statusCode === 409 || e?.code === "LOWER_THAN_EARLIER" || e?.code === "HIGHER_THAN_LATER") {
      throw new ReadingConflictError(typeof e.message === "string" ? e.message : null);
    }
    throw err;
  }
}

export function deleteOdometerReading(vehicleId: string, readingId: string) {
  return apiRequest<{ message?: string }>(
    `/vehicles/${vehicleId}/odometer-readings/${readingId}`,
    { method: "DELETE" }
  );
}

/** Days with driving or a reading. Omit vehicleId for every vehicle's days. */
export function fetchOdometerDays(params: { vehicleId?: string; from: string; to: string }) {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.vehicleId) q.set("vehicleId", params.vehicleId);
  return apiRequest<{ data: OdometerDayWithVehicle[] }>(`/odometer/days?${q.toString()}`);
}

/** Path for downloadAndShareExport (Pro). */
export function odometerLogCsvPath(params: { vehicleId?: string; from: string; to: string }) {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.vehicleId) q.set("vehicleId", params.vehicleId);
  return `/exports/odometer-log?${q.toString()}`;
}
