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

/** What the driver pays on public rapid chargers (p/kWh). Null clears it
 *  back to the default (Zapmap's published average). */
export function updatePublicChargeRate(pencePerKwh: number | null) {
  return apiRequest<{ data: { pencePerKwh: number | null } }>("/charging/public-rate", {
    method: "PATCH",
    body: JSON.stringify({ pencePerKwh }),
  });
}

export function updateElectricityRate(pencePerKwh: number | null) {
  return apiRequest<{ data: { pencePerKwh: number | null } }>("/charging/electricity-rate", {
    method: "PATCH",
    body: JSON.stringify({ pencePerKwh }),
  });
}
