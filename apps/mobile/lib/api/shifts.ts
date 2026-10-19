import { apiRequest } from "./index";
import type { Earning, Shift, ShiftScorecard, Trip, Vehicle } from "@mileclear/shared";
import type { PastShiftBody } from "../shifts/pastShiftRule";
import type { PastShiftTotalsBody } from "../shifts/pastShiftTotalsRule";

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

// Add a past shift (Oct 2026): the shift, its trips and an optional earning
// saved together. The Idempotency-Key makes a retry after a lost answer
// return the first save instead of adding the shift twice.
export interface PastShiftResult {
  data: ShiftWithVehicle;
  trips: Trip[];
  earning: Earning | null;
  scorecard: ShiftScorecard | null;
  duplicate?: boolean;
  /** A total only: trips already saved in its hours, marked as possible doubles of it. */
  overlapping?: { trips: number; miles: number };
}

export function createPastShift(body: PastShiftBody | PastShiftTotalsBody, idempotencyKey: string) {
  return apiRequest<PastShiftResult>("/shifts/past", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
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
