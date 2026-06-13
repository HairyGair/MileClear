import { apiRequest } from "./index";
import type { NearbyChargersResponse, ElectricityRate } from "@mileclear/shared";

export function fetchNearbyChargers(lat: number, lng: number, radiusMiles = 5) {
  return apiRequest<NearbyChargersResponse>(
    `/charging/nearby?lat=${lat}&lng=${lng}&radiusMiles=${radiusMiles}`
  );
}

export function fetchElectricityRate() {
  return apiRequest<{ data: ElectricityRate }>("/charging/electricity-rate");
}

export function updateElectricityRate(pencePerKwh: number | null) {
  return apiRequest<{ data: { pencePerKwh: number | null } }>("/charging/electricity-rate", {
    method: "PATCH",
    body: JSON.stringify({ pencePerKwh }),
  });
}
