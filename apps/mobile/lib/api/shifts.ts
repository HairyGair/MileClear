import { apiRequest } from "./index";
import type { Shift, Vehicle } from "@mileclear/shared";

export interface ShiftWithVehicle extends Shift {
  vehicle: Vehicle | null;
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
