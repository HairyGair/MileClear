"use client";

// Miles or kilometres, the driver's choice from the app (More > Settings >
// Distances, 23 Oct 2026). Display only: stored distances are miles, and tax
// figures, Miles by project and downloads stay in miles because HMRC rates
// are per mile, so those pages keep formatMiles.
import { distanceUnitOf, formatDistance, type DistanceUnit } from "@mileclear/shared";
import { useAuth } from "../auth-context";

export interface WebDistanceUnit {
  unit: DistanceUnit;
  /** Miles in, "12.3 mi" or "19.8 km" out (same shape as formatMiles). */
  fmt: (miles: number) => string;
  /** "Miles" or "Km", for a figure's label. */
  Label: string;
}

export function useDistanceUnit(): WebDistanceUnit {
  const { user } = useAuth();
  const unit = distanceUnitOf(user?.distanceUnit);
  return {
    unit,
    fmt: (miles) => formatDistance(miles, unit),
    Label: unit === "km" ? "Km" : "Miles",
  };
}
