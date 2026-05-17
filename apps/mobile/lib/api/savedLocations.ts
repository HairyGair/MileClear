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

/**
 * Endpoint clusters from the user's recent trips that aren't already saved.
 * Drives the "places you visit often" review screen + dashboard nudge.
 * Returns empty when the user has <3 trips or every cluster is already
 * covered by an existing saved location.
 */
export interface SuggestedSavedLocation {
  id: string;
  centroidLat: number;
  centroidLng: number;
  visitCount: number;
  firstVisitedAt: string;
  lastVisitedAt: string;
  suggestedType: "home" | "work" | "other";
  inferredName: string | null;
}

export function fetchSavedLocationSuggestions() {
  return apiRequest<{ data: SuggestedSavedLocation[] }>(
    "/saved-locations/suggestions"
  );
}
