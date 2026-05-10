// Per-trip confidence scoring.
//
// Every trip gets a single high/medium/low badge plus an array of
// human-readable reasons explaining how we got there. Surfaced on the
// mobile trip-detail screen so users (and HMRC, if it ever comes to a
// review) can see the quality of evidence behind a claimed mileage.
//
// Signals we have today:
//   - isManualEntry: flat bool. Manual trips have no breadcrumb evidence.
//   - coordinateCount: how many GPS samples landed during the trip.
//   - hasMatchedPolyline: did GraphHopper /match successfully match the
//     breadcrumbs to road segments? Strong evidence the route was real.
//   - distanceMiles / duration: avg speed sanity check. Nonsensical
//     speeds (≤0.5 mph or ≥120 mph) downgrade confidence.
//   - gpsQuality: optional JSON blob with avg accuracy, outliers etc.
//     When present, factors into the score.
//
// Conservative grading:
//   "high"   — tracked trip with map-matched polyline + ≥20 breadcrumbs
//              + sane avg speed
//   "medium" — tracked trip without a match OR manual trip with road-
//              routed distance OR small-sample tracked trip
//   "low"    — manual trip without an end coord OR weird avg speed OR
//              insufficient data to corroborate

export type TripConfidenceLevel = "high" | "medium" | "low";

export interface TripConfidence {
  level: TripConfidenceLevel;
  /** Human-readable reasons, ordered most → least important. */
  reasons: string[];
}

export interface TripConfidenceInput {
  isManualEntry: boolean;
  coordinateCount: number;
  hasMatchedPolyline: boolean;
  distanceMiles: number;
  durationSecs: number | null;
  hasEndCoords: boolean;
  /** Optional gpsQuality blob captured at trip-save time, if present. */
  gpsQuality?: {
    avgAccuracyMeters?: number;
    rawCount?: number;
    keptCount?: number;
  } | null;
}

const MIN_TRACKED_BREADCRUMBS_FOR_HIGH = 20;
const MIN_AVG_SPEED_MPH = 0.5;
const MAX_AVG_SPEED_MPH = 120;
const MAX_TRUSTED_AVG_ACCURACY_M = 35;

export function computeTripConfidence(input: TripConfidenceInput): TripConfidence {
  const reasons: string[] = [];
  let level: TripConfidenceLevel = "medium";

  // Speed sanity — applies to both tracked + manual trips when duration
  // is known.
  let avgSpeedMph: number | null = null;
  if (input.durationSecs && input.durationSecs > 0) {
    avgSpeedMph = input.distanceMiles / (input.durationSecs / 3600);
  }

  // Manual trips
  if (input.isManualEntry) {
    if (!input.hasEndCoords) {
      reasons.push("No end location — distance can't be verified.");
      return { level: "low", reasons };
    }
    reasons.push("Distance calculated by road-routing engine.");
    if (avgSpeedMph !== null) {
      if (avgSpeedMph < MIN_AVG_SPEED_MPH || avgSpeedMph > MAX_AVG_SPEED_MPH) {
        reasons.push(`Average speed ${avgSpeedMph.toFixed(0)} mph looks unusual — review.`);
        return { level: "low", reasons };
      }
    }
    return { level: "medium", reasons };
  }

  // Tracked trips
  if (input.coordinateCount >= MIN_TRACKED_BREADCRUMBS_FOR_HIGH) {
    reasons.push(`${input.coordinateCount} GPS samples recorded.`);
    if (input.hasMatchedPolyline) {
      reasons.push("Route confirmed by map-matching against road network.");
      level = "high";
    } else {
      reasons.push("No road-network match — using raw GPS trail.");
      level = "medium";
    }
  } else if (input.coordinateCount > 0) {
    reasons.push(`Only ${input.coordinateCount} GPS samples — sparse trail.`);
    level = input.hasMatchedPolyline ? "medium" : "low";
    if (input.hasMatchedPolyline) {
      reasons.push("Route still confirmed by map-matching.");
    }
  } else {
    reasons.push("No GPS samples captured.");
    level = "low";
  }

  if (avgSpeedMph !== null) {
    if (avgSpeedMph < MIN_AVG_SPEED_MPH) {
      reasons.push(`Average speed ${avgSpeedMph.toFixed(1)} mph is below driving range.`);
      level = "low";
    } else if (avgSpeedMph > MAX_AVG_SPEED_MPH) {
      reasons.push(`Average speed ${avgSpeedMph.toFixed(0)} mph is unrealistically high.`);
      level = "low";
    }
  }

  // GPS accuracy downgrade — if available
  if (input.gpsQuality?.avgAccuracyMeters != null) {
    const acc = input.gpsQuality.avgAccuracyMeters;
    if (acc > MAX_TRUSTED_AVG_ACCURACY_M) {
      reasons.push(`Average GPS accuracy ${Math.round(acc)} m — lower precision than ideal.`);
      if (level === "high") level = "medium";
    }
  }

  return { level, reasons };
}
