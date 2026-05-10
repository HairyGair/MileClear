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

/** Result from /trips/route-distance — provenance + sanity ratio included. */
export interface RouteDistanceResult {
  distanceMiles: number;
  durationSecs: number;
  /** Where the number came from: cached / our self-hosted GraphHopper /
   *  Google Maps Routes API fallback. Surfaced to the user via a small
   *  badge so the figure is auditable. */
  source: "cache" | "graphhopper" | "google";
  /** Distance / haversine ratio. Real routes are typically 1.1-1.6×;
   *  values <0.95 or >5 should be reviewed. */
  routeToHaversineRatio: number;
}

/**
 * Server-side road-distance lookup. Replaces the previous direct-to-
 * public-OSRM call which silently fell back to haversine on rate-limit
 * / timeout (Laura Joyce report 10 May 2026). The server caches results
 * permanently, so identical address pairs return identical mileage —
 * structurally, not by luck.
 *
 * Returns null only on routing-unavailable (503). Caller should show
 * a "couldn't calculate, enter manually" message rather than inventing
 * a crow-flies fallback.
 */
export async function fetchServerRouteDistance(args: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}): Promise<RouteDistanceResult | null> {
  const params = new URLSearchParams({
    startLat: String(args.startLat),
    startLng: String(args.startLng),
    endLat: String(args.endLat),
    endLng: String(args.endLng),
  });
  try {
    const res = await apiRequest<{ data: RouteDistanceResult }>(
      `/trips/route-distance?${params.toString()}`
    );
    return res.data;
  } catch {
    return null;
  }
}

export interface TripWithVehicle extends Trip {
  vehicle: Vehicle | null;
}

export interface TripDetail extends Trip {
  vehicle: Vehicle | null;
  shift: Shift | null;
  coordinates: TripCoordinate[];
  insights: TripInsights | null;
  /** Server-computed road-snapped polyline. Map widgets prefer this
   *  over `coordinates` when present — cleaner visual, snapped to
   *  actual roads. Null for trips that haven't been map-matched yet
   *  (older trips, GraphHopper unavailable at create time, or fewer
   *  than 10 breadcrumbs). */
  matchedCoordinates?: { lat: number; lng: number }[] | null;
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
  /** Trip count matching the active filters (incl. classification). */
  totalTrips: number;
  /** Miles for the same set of trips as totalTrips. */
  totalMiles: number;
  /** Per-classification splits, NOT scoped to the classification filter
   *  so the stats card can show "Total / Business / Personal" together
   *  even while the list itself is filtered to one of them. */
  businessTrips: number;
  businessMiles: number;
  personalTrips: number;
  personalMiles: number;
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

/**
 * Pair-based pattern learning. Higher-confidence than the single-point
 * suggestion because it requires BOTH endpoints to match the user's
 * historical trips. Use this in the trip-form when both start and end
 * are set; falls back to the single-point endpoint when only one end
 * is known.
 */
export function fetchClassificationSuggestionForPair(args: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}) {
  const params = new URLSearchParams({
    startLat: String(args.startLat),
    startLng: String(args.startLng),
    endLat: String(args.endLat),
    endLng: String(args.endLng),
  });
  return apiRequest<{ suggestion: ClassificationSuggestion | null }>(
    `/trips/suggest-pair?${params.toString()}`
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
