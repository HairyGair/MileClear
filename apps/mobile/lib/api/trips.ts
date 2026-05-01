import { apiRequest } from "./index";
import type {
  Trip,
  TripCoordinate,
  TripInsights,
  TripClassification,
  TripCategory,
  PlatformTag,
  BusinessPurpose,
  Vehicle,
  Shift,
  PaginatedResponse,
} from "@mileclear/shared";

export interface TripWithVehicle extends Trip {
  vehicle: Vehicle | null;
}

export interface TripDetail extends Trip {
  vehicle: Vehicle | null;
  shift: Shift | null;
  coordinates: TripCoordinate[];
  insights: TripInsights | null;
}

export interface CoordinateInput {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
}

export interface CreateTripData {
  shiftId?: string;
  vehicleId?: string;
  startLat: number;
  startLng: number;
  endLat?: number;
  endLng?: number;
  startAddress?: string;
  endAddress?: string;
  distanceMiles?: number;
  startedAt: string;
  endedAt?: string;
  classification?: TripClassification;
  platformTag?: PlatformTag;
  businessPurpose?: BusinessPurpose;
  category?: TripCategory;
  notes?: string;
  coordinates?: CoordinateInput[];
  // Per-trip GPS quality summary computed at finalize time. Stored on the
  // server as a JSON column for admin analysis - see TripQuality in shared.
  gpsQuality?: import("@mileclear/shared").TripQuality;
}

export interface UpdateTripData {
  classification?: TripClassification;
  platformTag?: PlatformTag | null;
  businessPurpose?: BusinessPurpose | null;
  category?: TripCategory | null;
  notes?: string | null;
  endAddress?: string | null;
  endLat?: number | null;
  endLng?: number | null;
  endedAt?: string | null;
  distanceMiles?: number;
  // Classification feedback: set by syncUpdateTrip on the first user
  // classification of an auto-classified trip. API write-once-protects it.
  classificationAutoAccepted?: boolean;
}

export interface ListTripsParams {
  classification?: TripClassification;
  platformTag?: PlatformTag;
  shiftId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function fetchTrips(params?: ListTripsParams) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value));
    });
  }
  const qs = query.toString();
  return apiRequest<PaginatedResponse<TripWithVehicle>>(`/trips${qs ? `?${qs}` : ""}`);
}

export interface TripSummaryParams {
  classification?: TripClassification;
  platformTag?: PlatformTag;
  from?: string;
  to?: string;
}

export interface TripSummary {
  totalTrips: number;
  totalMiles: number;
}

export function fetchTripSummary(params?: TripSummaryParams) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value));
    });
  }
  const qs = query.toString();
  return apiRequest<{ data: TripSummary }>(`/trips/summary${qs ? `?${qs}` : ""}`);
}

export function fetchTrip(id: string) {
  return apiRequest<{ data: TripDetail }>(`/trips/${id}`);
}

export function createTrip(data: CreateTripData) {
  return apiRequest<{ data: TripWithVehicle }>("/trips", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTrip(id: string, data: UpdateTripData) {
  return apiRequest<{ data: TripWithVehicle }>(`/trips/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteTrip(id: string) {
  return apiRequest<{ message: string }>(`/trips/${id}`, {
    method: "DELETE",
  });
}

export function fetchUnclassifiedCount() {
  return apiRequest<{ count: number }>("/trips/unclassified/count");
}

export interface ClassificationSuggestion {
  classification: "business" | "personal";
  platformTag: string | null;
  businessPurpose: string | null;
  category: string | null;
  matchCount: number;
  confidence: number;
}

export function fetchClassificationSuggestion(lat: number, lng: number, type: "start" | "end" = "end") {
  return apiRequest<{ suggestion: ClassificationSuggestion | null }>(
    `/trips/suggest?lat=${lat}&lng=${lng}&type=${type}`
  );
}

export function submitTripAnomaly(
  tripId: string,
  data: { type: string; response: string; customNote?: string | null; lat?: number; lng?: number; placeName?: string | null }
) {
  return apiRequest<{ data: unknown }>(`/trips/${tripId}/anomaly`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface MergeTripsData {
  tripIds: string[];
  classification: TripClassification;
  platformTag?: PlatformTag | null;
  businessPurpose?: BusinessPurpose | null;
  category?: TripCategory | null;
  notes?: string | null;
}

export function mergeTrips(data: MergeTripsData) {
  return apiRequest<{ data: TripWithVehicle }>("/trips/merge", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
