import { apiRequest } from "./index";
import type { Shift, ShiftScorecard, Vehicle } from "@mileclear/shared";

export interface ShiftWithVehicle extends Shift {
  vehicle: Vehicle | null;
}

// A run of recent trips the server thinks was a work session the driver
// never recorded as a shift. Accepting creates the completed shift and
// grades it; dismissing hides it for good.
export interface ShiftSuggestion {
  id: string;
  startedAt: string;
  endedAt: string;
  tripCount: number;
  totalMiles: number;
  platformTag: string | null;
}

export function fetchShiftSuggestions() {
  return apiRequest<{ suggestions: ShiftSuggestion[] }>("/shifts/suggestions");
}

export function resolveShiftSuggestion(id: string, action: "accept" | "dismiss") {
  return apiRequest<{
    ok: boolean;
    skipped?: "already_handled";
    shiftId?: string;
    scorecard?: ShiftScorecard | null;
  }>(`/shifts/suggestions/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function fetchShifts(status?: "active" | "completed") {
  const query = status ? `?status=${status}` : "";
  return apiRequest<{ data: ShiftWithVehicle[] }>(`/shifts${query}`);
}

export function fetchActiveShift() {
  return apiRequest<{ data: ShiftWithVehicle[] }>("/shifts?status=active");
}

export function startShift(data?: { vehicleId?: string }) {
  return apiRequest<{ data: ShiftWithVehicle }>("/shifts", {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
}

export function endShift(id: string) {
  return apiRequest<{ data: ShiftWithVehicle }>(`/shifts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed" }),
  });
}
