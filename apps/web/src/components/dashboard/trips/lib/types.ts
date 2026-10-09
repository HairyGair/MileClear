// Shapes returned by the trips API (apps/api/src/routes/trips/index.ts).
// The shared Trip type predates several columns, so the dashboard keeps its own.

export type Classification = "business" | "personal" | "unclassified";

export interface TripConfidence {
  level: "high" | "medium" | "low";
  reasons: string[];
}

export interface TripSuggestion {
  classification: string;
  platformTag: string | null;
  businessPurpose: string | null;
  category: string | null;
  confidence: number;
  matchCount: number;
}

export interface TripItem {
  id: string;
  vehicleId: string | null;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  startedAt: string;
  endedAt: string | null;
  isManualEntry: boolean;
  classification: Classification;
  platformTag: string | null;
  businessPurpose: string | null;
  category: string | null;
  notes: string | null;
  projectLabel?: string | null;
  odometerStart?: number | null;
  odometerEnd?: number | null;
  autoClassifiedAt?: string | null;
  classificationSource?: string | null;
  possibleDuplicateOfId?: string | null;
  coordinateCount?: number;
  confidence?: TripConfidence | null;
  suggestion?: TripSuggestion | null;
}

export interface TripCoordinateItem {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
}

export interface CazCharge {
  zoneId: string;
  name: string;
  city: string;
  chargePence: number;
  url: string;
}

export interface TripDetailData extends TripItem {
  coordinates: TripCoordinateItem[];
  matchedCoordinates: { lat: number; lng: number }[] | null;
  vehicle?: { id: string; make: string; model: string; registrationPlate?: string | null } | null;
  mergeSuggestion?: {
    otherTripId: string;
    direction: "before" | "after";
    gapMinutes: number;
    gapMeters: number;
  } | null;
  cleanAirZones?: { compliant: boolean; confidence: string; charges: CazCharge[] } | null;
  diversion?: { streetName: string | null; town: string | null; usualMiles: number; extraMiles: number } | null;
}

export interface MissedProposal {
  id: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  fromAddress: string | null;
  toAddress: string | null;
  departedAt: string;
  arrivedAt: string;
  estimatedMiles: number;
  source?: string;
  recordedMiles?: number | null;
}

export interface PagedTrips {
  data: TripItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const CLASSIFICATION_WORD: Record<Classification, string> = {
  business: "Business",
  personal: "Personal",
  unclassified: "Not sorted",
};
