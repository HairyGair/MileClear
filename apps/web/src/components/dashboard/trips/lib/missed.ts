// Missed journeys: wording and the prefilled Add trip link.
// Mirrors apps/mobile/components/MissedJourneys.tsx and lib/trips/missedJourneyWindow.ts.
import type { MissedProposal } from "./types";
import { formatDay, formatTime } from "../../../../lib/dashboard/dates";
import { londonDay } from "./days";

const ASSUMED_MPH = 20;
const MINUTE = 60_000;

export function isTripStartOffer(p: MissedProposal): boolean {
  return p.source === "trip_start";
}

/** A "gap" offer only knows the drive happened somewhere between two trips. */
export function isGapOffer(p: MissedProposal): boolean {
  return !p.source || p.source === "gap";
}

export function travelMs(estimatedMiles: number, routedSecs?: number | null): number {
  if (routedSecs != null && Number.isFinite(routedSecs) && routedSecs > 0) {
    return Math.max(MINUTE, Math.ceil(routedSecs / 60) * MINUTE);
  }
  const miles = Number.isFinite(estimatedMiles) && estimatedMiles > 0 ? estimatedMiles : 0;
  return Math.max(MINUTE, Math.ceil((miles / ASSUMED_MPH) * 60) * MINUTE);
}

/** Default times for the form. A recorded drive keeps its own; a gap offer starts at the window's start and lasts the length of the drive. */
export function defaultTimes(p: MissedProposal): { startedAt: string; endedAt: string } {
  const dep = new Date(p.departedAt);
  const arr = new Date(p.arrivedAt);
  if (!isGapOffer(p)) return { startedAt: dep.toISOString(), endedAt: arr.toISOString() };
  const end = Math.min(dep.getTime() + travelMs(p.estimatedMiles), arr.getTime());
  return { startedAt: dep.toISOString(), endedAt: new Date(Math.max(end, dep.getTime() + MINUTE)).toISOString() };
}

/** The link that opens the add form filled in for this journey. */
export function addTripHref(p: MissedProposal): string {
  const t = defaultTimes(p);
  const q = new URLSearchParams({
    missedId: p.id,
    fromLat: String(p.fromLat),
    fromLng: String(p.fromLng),
    toLat: String(p.toLat),
    toLng: String(p.toLng),
    start: t.startedAt,
    end: t.endedAt,
    windowStart: p.departedAt,
    windowEnd: p.arrivedAt,
  });
  if (p.fromAddress) q.set("fromAddress", p.fromAddress);
  if (p.toAddress) q.set("toAddress", p.toAddress);
  if (isGapOffer(p)) q.set("gap", "1");
  return `/dashboard/trips/new?${q.toString()}`;
}

/** Why we are asking, for a drive the engine recorded and then dropped. */
export function droppedNote(source: string | undefined): string | null {
  switch (source) {
    case "recorded":
      return "We recorded this one but it was too short to save on its own.";
    case "dropped_walk":
      return "The app thought this was a walk. If you were driving, add it.";
    case "dropped_drive":
      return "This looked like a walk, but it moved at driving speed. Add it if you drove.";
    case "dropped_phantom":
      return "This looked like the phone drifting rather than a drive. Add it if it was real.";
    case "dropped_start_trip":
      return "You recorded this one with Start Trip but it was never saved. Add it back if you want it.";
    default:
      return null;
  }
}

// -- Wording ---------------------------------------------------------------

/** When the journey happened, in words. A gap offer gives its window; a recorded drive gives its own times. */
export function whenLine(p: MissedProposal): string {
  const a = new Date(p.departedAt);
  const b = new Date(p.arrivedAt);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  const sameDay = londonDay(a) === londonDay(b);
  if (isTripStartOffer(p)) return `${formatDay(b)}, ${formatTime(b)}`;
  if (isGapOffer(p)) {
    return sameDay
      ? `Sometime between ${formatTime(a)} and ${formatTime(b)} on ${formatDay(a)}`
      : `Sometime between ${formatTime(a)} on ${formatDay(a)} and ${formatTime(b)} on ${formatDay(b)}`;
  }
  return sameDay
    ? `${formatDay(a)}, ${formatTime(a)} to ${formatTime(b)}`
    : `${formatDay(a)} ${formatTime(a)} to ${formatDay(b)} ${formatTime(b)}`;
}
