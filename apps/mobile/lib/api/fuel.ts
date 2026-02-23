import { apiRequest } from "./index";
import type { FuelLogWithVehicle, NearbyPricesResponse, PaginatedResponse } from "@mileclear/shared";

export interface CreateFuelLogData {
  vehicleId?: string;
  litres: number;
  costPence: number;
  stationName?: string;
  odometerReading?: number;
  latitude?: number;
  longitude?: number;
  loggedAt?: string;
}

export interface UpdateFuelLogData {
  vehicleId?: string | null;
  litres?: number;
  costPence?: number;
  stationName?: string | null;
  odometerReading?: number | null;
  latitude?: number | null;
  longitude?: number | null;
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

export function fetchFuelLog(id: string) {
  return apiRequest<{ data: FuelLogWithVehicle }>(`/fuel/logs/${id}`);
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

export function fetchNearbyPrices(params: {
  lat: number;
  lng: number;
  radiusMiles?: number;
}) {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
  });
  if (params.radiusMiles !== undefined) {
    query.set("radiusMiles", String(params.radiusMiles));
  }
  return apiRequest<NearbyPricesResponse>(`/fuel/prices?${query.toString()}`);
}
