import { apiRequest } from "./index";
import type { FuelLogWithVehicle, PaginatedResponse } from "@mileclear/shared";

export interface CreateFuelLogData {
  vehicleId?: string;
  litres: number;
  costPence: number;
  stationName?: string;
  odometerReading?: number;
  loggedAt?: string;
}

export interface UpdateFuelLogData {
  vehicleId?: string | null;
  litres?: number;
  costPence?: number;
  stationName?: string | null;
  odometerReading?: number | null;
  loggedAt?: string;
}

export interface ListFuelLogsParams {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function fetchFuelLogs(params?: ListFuelLogsParams) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value));
    });
  }
  const qs = query.toString();
  return apiRequest<PaginatedResponse<FuelLogWithVehicle>>(`/fuel/logs${qs ? `?${qs}` : ""}`);
}

export function createFuelLog(data: CreateFuelLogData) {
  return apiRequest<{ data: FuelLogWithVehicle }>("/fuel/logs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateFuelLog(id: string, data: UpdateFuelLogData) {
  return apiRequest<{ data: FuelLogWithVehicle }>(`/fuel/logs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteFuelLog(id: string) {
  return apiRequest<{ message: string }>(`/fuel/logs/${id}`, {
    method: "DELETE",
  });
}
