import { apiRequest } from "./index";
import type {
  Trip,
  TripCoordinate,
  TripClassification,
  PlatformTag,
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
  notes?: string;
  coordinates?: CoordinateInput[];
}

export interface UpdateTripData {
  classification?: TripClassification;
  platformTag?: PlatformTag | null;
  notes?: string | null;
  endAddress?: string | null;
  endLat?: number | null;
  endLng?: number | null;
  endedAt?: string | null;
}

export interface ListTripsParams {
  classification?: TripClassification;
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
