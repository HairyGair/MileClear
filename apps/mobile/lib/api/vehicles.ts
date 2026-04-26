import { apiRequest } from "./index";
import type {
  Vehicle,
  FuelType,
  VehicleType,
  VehicleLookupResult,
  MotHistoryResult,
} from "@mileclear/shared";

export interface CreateVehicleData {
  make: string;
  model: string;
  year?: number;
  fuelType: FuelType;
  vehicleType: VehicleType;
  registrationPlate?: string;
  bluetoothName?: string;
  estimatedMpg?: number;
  isPrimary?: boolean;
}

export interface UpdateVehicleData {
  make?: string;
  model?: string;
  year?: number | null;
  fuelType?: FuelType;
  vehicleType?: VehicleType;
  registrationPlate?: string | null;
  bluetoothName?: string | null;
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

export function lookupVehicle(registrationNumber: string) {
  return apiRequest<{ data: VehicleLookupResult }>("/vehicles/lookup", {
    method: "POST",
    body: JSON.stringify({ registrationNumber }),
  });
}

// MOT history from DVSA. Returns null if the vehicle has no MOT records yet
// (brand new car). Cached server-side for 24h per registration plate.
export function fetchMotHistory(vehicleId: string) {
  return apiRequest<{ data: MotHistoryResult | null }>(
    `/vehicles/${vehicleId}/mot-history`
  );
}
