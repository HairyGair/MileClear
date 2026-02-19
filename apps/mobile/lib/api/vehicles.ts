import { apiRequest } from "./index";
import type { Vehicle, FuelType, VehicleType } from "@mileclear/shared";

export interface CreateVehicleData {
  make: string;
  model: string;
  year?: number;
  fuelType: FuelType;
  vehicleType: VehicleType;
  estimatedMpg?: number;
  isPrimary?: boolean;
}

export interface UpdateVehicleData {
  make?: string;
  model?: string;
  year?: number | null;
  fuelType?: FuelType;
  vehicleType?: VehicleType;
  estimatedMpg?: number | null;
  isPrimary?: boolean;
}

export function fetchVehicles() {
  return apiRequest<{ data: Vehicle[] }>("/vehicles");
}

export function createVehicle(data: CreateVehicleData) {
  return apiRequest<{ data: Vehicle }>("/vehicles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateVehicle(id: string, data: UpdateVehicleData) {
  return apiRequest<{ data: Vehicle }>(`/vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteVehicle(id: string) {
  return apiRequest<{ message: string }>(`/vehicles/${id}`, {
    method: "DELETE",
  });
}
