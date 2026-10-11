// Words for a trip MileClear already has, on the add-trip form's "already has
// a trip around then" line and sheet: "Home to Tesco Extra", "08:40 to 09:05",
// "9.3 mi", "Recorded by your phone, saved later". Pure.

import { isSavedLaterTrip } from "@mileclear/shared";
import { clockTime } from "./manualTimeRule";
import { shortPlaceLabel } from "./placeLabel";
import { shortDay } from "../tracking/pauseRule";

export interface DescribableTrip {
  startedAt: string;
  endedAt: string | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  isManualEntry: boolean;
  recordedBy: string | null;
  createdAt: string | null;
}

export interface TripWords {
  route: string;
  times: string;
  miles: string;
  how: string;
  day: string;
}

/** "Home to Tesco Extra", or one end, or "A trip". */
export function routeWords(startAddress: string | null, endAddress: string | null): string {
  const a = shortPlaceLabel(startAddress, 28);
  const b = shortPlaceLabel(endAddress, 28);
  if (a && b) return `${a} to ${b}`;
  if (a) return `From ${a}`;
  if (b) return `To ${b}`;
  return "A trip";
}

export function howRecorded(t: Pick<DescribableTrip, "isManualEntry" | "recordedBy" | "createdAt" | "endedAt">): string {
  switch (t.recordedBy) {
    case "added_by_hand":
      return "Added by hand";
    case "missing_report":
      return "Added from a missing-trip report";
    case "web":
      return "Added on the website";
    case "start_trip":
      return "Recorded with Start Trip";
    case "shift":
      return "Recorded during a shift";
    case "automatic": {
      return isSavedLaterTrip({ recordedBy: "automatic", createdAt: t.createdAt, endedAt: t.endedAt })
        ? "Recorded by your phone, saved later"
        : "Recorded by your phone";
    }
    default:
      return t.isManualEntry ? "Added by hand" : "Recorded by your phone";
  }
}

export function describeKnownTrip(t: DescribableTrip): TripWords {
  const start = new Date(t.startedAt);
  const end = t.endedAt ? new Date(t.endedAt) : null;
  const times = end && end.getTime() > start.getTime() ? `${clockTime(start)} to ${clockTime(end)}` : `from ${clockTime(start)}`;
  const miles = `${(Math.round((t.distanceMiles || 0) * 10) / 10).toFixed(1)} mi`;
  return {
    route: routeWords(t.startAddress, t.endAddress),
    times,
    miles,
    how: howRecorded(t),
    day: shortDay(start),
  };
}
