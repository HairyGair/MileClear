// Naming a trip's end after the place the driver navigated to
// (PLAN-recording.md section 3). The end PIN stays at the last real fix
// (Anthony's Q3: inventing a position on an HMRC record is wrong); only the
// name could come from Directions, and only when the drive clearly ended
// there:
//   - a Directions session (not off, not a passenger) overlaps the trip;
//   - the trip's last real fix is within 300 m of the chosen place;
//   - the session ended by arriving, or ended within 10 minutes of the
//     trip's end.
// Then the saved place's name, else the searched place's label.
//
// Pure. In this build the answer is only logged and noted on the trip
// (gpsQuality.directions.wouldName); the end address is unchanged.

import type { DriveSession } from "../navigation/driveSessions";
import { sessionCoverEndMs } from "../navigation/driveSessions";
import { metresBetween } from "./directionsOpenRule";

export const NAME_MAX_METRES = 300;
export const NAME_SESSION_END_WINDOW_MS = 10 * 60 * 1000;

export type NameSkipReason = "no_session" | "too_far" | "not_ended_near_trip_end" | "no_name";

export interface NameDecision {
  use: boolean;
  reason: NameSkipReason | null;
  sessionId: string | null;
  name: string | null;
  source: "saved" | "search" | null;
  /** How far the last real fix was from the place, rounded to the metre. */
  metres: number | null;
  /** The same in bands, for events (never the place itself). */
  metresBucket: string | null;
}

export function metresBucket(m: number | null): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  if (m < 50) return "0-50";
  if (m < 100) return "50-100";
  if (m <= NAME_MAX_METRES) return "100-300";
  if (m < 1000) return "300-1000";
  return "1000+";
}

export function directionsNameRule(args: {
  sessions: DriveSession[];
  tripStartMs: number;
  tripEndMs: number;
  lastFix: { lat: number; lng: number };
}): NameDecision {
  const none: NameDecision = { use: false, reason: "no_session", sessionId: null, name: null, source: null, metres: null, metresBucket: null };
  const overlapping = args.sessions.filter(
    (s) => s.mode !== "off" && !s.passenger && s.startedAtMs <= args.tripEndMs && sessionCoverEndMs(s) >= args.tripStartMs
  );
  if (overlapping.length === 0) return none;
  // The latest-started one: the destination the driver was heading for last.
  const s = overlapping.reduce((x, y) => (y.startedAtMs >= x.startedAtMs ? y : x));
  const metres = Math.round(metresBetween(args.lastFix, s.destination));
  const base = { sessionId: s.sessionId, metres, metresBucket: metresBucket(metres) };
  if (metres > NAME_MAX_METRES) return { ...base, use: false, reason: "too_far", name: null, source: null };
  const endedNear =
    s.endReason === "arrived" ||
    (s.endedAtMs != null && Math.abs(s.endedAtMs - args.tripEndMs) <= NAME_SESSION_END_WINDOW_MS);
  if (!endedNear) return { ...base, use: false, reason: "not_ended_near_trip_end", name: null, source: null };
  const saved = s.destination.savedLocationId && s.destination.name?.trim() ? s.destination.name.trim() : null;
  const searched = s.destination.label?.trim() || null;
  const name = saved ?? searched;
  if (!name) return { ...base, use: false, reason: "no_name", name: null, source: null };
  return { ...base, use: true, reason: null, name, source: saved ? "saved" : "search" };
}
