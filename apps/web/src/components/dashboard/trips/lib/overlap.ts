// "MileClear already has a trip around then" on the website's Add a trip
// (add-trip PROPOSALS decision L: the web form keeps its layout and gains
// only this check). The rule is the shared one the app and the server use
// (@mileclear/shared tripOverlap); the trips come from GET /trips/around.

import { firstOverlappingTrip, overlapLookupWindow } from "@mileclear/shared";
import { api } from "../../../../lib/api";
import { formatDay, formatRange, formatTime } from "../../../../lib/dashboard";
import { shortPlaceLabel } from "./placeLabel";

export interface AroundTrip {
  id: string;
  startedAt: string;
  endedAt: string | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  isManualEntry: boolean;
  recordedBy: string | null;
}

/** The trip the driver already has around [start, end], or null. Never throws. */
export async function findTripAround(start: Date, end: Date | null): Promise<AroundTrip | null> {
  try {
    const w = overlapLookupWindow(start, end);
    const res = await api.get<{ data: { trips: AroundTrip[] } }>(
      `/trips/around?from=${encodeURIComponent(w.from.toISOString())}&to=${encodeURIComponent(w.to.toISOString())}`
    );
    return firstOverlappingTrip(res.data?.trips ?? [], start, end);
  } catch {
    return null;
  }
}

/** "Home to Tesco Extra, Sat 3 Oct, 08:40 to 09:05, 9.3 mi" */
export function aroundTripWords(t: AroundTrip): string {
  const a = shortPlaceLabel(t.startAddress);
  const b = shortPlaceLabel(t.endAddress);
  const route = a && b ? `${a} to ${b}` : a ? `From ${a}` : b ? `To ${b}` : "A trip";
  const times = t.endedAt ? formatRange(t.startedAt, t.endedAt) : `from ${formatTime(t.startedAt)}`;
  const how = t.isManualEntry ? "added by hand" : "recorded by your phone";
  return `${route}, ${formatDay(t.startedAt)}, ${times}, ${(Math.round(t.distanceMiles * 10) / 10).toFixed(1)} mi (${how})`;
}
