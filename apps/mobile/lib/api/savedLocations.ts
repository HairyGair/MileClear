import { apiRequest } from "./index";
import type { SavedLocation, LocationType } from "@mileclear/shared";

export interface CreateSavedLocationData {
  name: string;
  locationType: LocationType;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  geofenceEnabled?: boolean;
}

export interface UpdateSavedLocationData {
  name?: string;
  locationType?: LocationType;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  geofenceEnabled?: boolean;
}

export function fetchSavedLocations() {
  return apiRequest<{ data: SavedLocation[] }>("/saved-locations");
}

export function fetchSavedLocation(id: string) {
  return apiRequest<{ data: SavedLocation }>(`/saved-locations/${id}`);
}

export function createSavedLocation(data: CreateSavedLocationData) {
  return apiRequest<{ data: SavedLocation }>("/saved-locations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateSavedLocation(id: string, data: UpdateSavedLocationData) {
  return apiRequest<{ data: SavedLocation }>(`/saved-locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteSavedLocation(id: string) {
  return apiRequest<{ message: string }>(`/saved-locations/${id}`, {
    method: "DELETE",
  });
}
