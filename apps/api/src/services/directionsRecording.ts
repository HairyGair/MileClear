// "A Directions drive is always recorded properly" (1.4.x, plan:
// docs/navigation-1.4.0/PLAN-recording.md). The phone does the work: it can
// open a recording when guidance starts, fill a GPS gap from the route the
// driver was following, and name the end after the chosen place. The server
// only carries the switch and keeps the phone's note of what it did.
//
// DIRECTIONS_RECORDING = off | log | on (default off). Only meaningful for a
// driver who has Directions (navigationEnabled). In "log" the phone works out
// every decision and changes nothing about the trip; "on" lets it act. The
// first app build to read this treats "on" exactly like "log".

export type DirectionsRecordingMode = "off" | "log" | "on";

export function directionsRecordingMode(env: NodeJS.ProcessEnv = process.env): DirectionsRecordingMode {
  const v = env.DIRECTIONS_RECORDING;
  return v === "log" || v === "on" ? v : "off";
}

/** What GET /user/profile says: "off" unless this driver has Directions. */
export function directionsRecordingFor(navigationEnabled: boolean, env: NodeJS.ProcessEnv = process.env): DirectionsRecordingMode {
  return navigationEnabled ? directionsRecordingMode(env) : "off";
}

/** gpsQuality.directions is the phone's own key. It is kept small: a gap
 *  list longer than this is cut, and a note bigger than the byte cap is
 *  replaced by a marker that says so. */
export const DIRECTIONS_MAX_GAPS = 20;
export const DIRECTIONS_MAX_BYTES = 4096;

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A client's gpsQuality with its directions note held to size. Never throws
 * (it runs inside the create schema, and a 400 there deletes the phone's copy
 * of the trip): on anything odd the note is dropped and the rest is kept.
 */
export function capDirectionsGpsQuality<T extends Record<string, unknown> | undefined>(gq: T): T {
  if (!gq || !("directions" in gq)) return gq;
  const out: Record<string, unknown> = { ...gq };
  try {
    const d = out.directions;
    if (!isObject(d)) {
      delete out.directions;
      return out as T;
    }
    const note: Record<string, unknown> = { ...d };
    for (const key of ["fill", "wouldFill"]) {
      const f = note[key];
      if (isObject(f) && Array.isArray(f.gaps) && f.gaps.length > DIRECTIONS_MAX_GAPS) {
        note[key] = { ...f, gaps: f.gaps.slice(0, DIRECTIONS_MAX_GAPS), gapsCut: f.gaps.length - DIRECTIONS_MAX_GAPS };
      }
    }
    const size = JSON.stringify(note).length;
    out.directions =
      size > DIRECTIONS_MAX_BYTES
        ? {
            tooLarge: true,
            bytes: size,
            sessionId: typeof note.sessionId === "string" ? note.sessionId.slice(0, 64) : null,
            mode: typeof note.mode === "string" ? note.mode.slice(0, 8) : null,
          }
        : note;
  } catch {
    delete out.directions;
  }
  return out as T;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Directions fields for the trip.created event: counts only, never a place.
 * Empty when the trip carries no directions note, so every other trip's event
 * is exactly as before.
 */
export function directionsEventFields(gpsQuality: unknown): Record<string, unknown> {
  if (!isObject(gpsQuality) || !isObject(gpsQuality.directions)) return {};
  const d = gpsQuality.directions;
  const fill = isObject(d.fill) ? d.fill : null;
  const wouldFill = isObject(d.wouldFill) ? d.wouldFill : null;
  const wouldName = isObject(d.wouldName) ? d.wouldName : null;
  const gaps = (f: Record<string, unknown> | null) =>
    f ? num(f.gapCount) ?? (Array.isArray(f.gaps) ? f.gaps.length : null) : null;
  return {
    directionsMode: typeof d.mode === "string" ? d.mode.slice(0, 8) : null,
    directionsOpened: typeof d.opened === "boolean" ? d.opened : null,
    directionsFilledMiles: fill ? num(fill.miles) : null,
    directionsFilledGaps: gaps(fill),
    directionsWouldFillMiles: wouldFill ? num(wouldFill.miles) : null,
    directionsWouldFillGaps: gaps(wouldFill),
    directionsNamed: typeof d.named === "boolean" ? d.named : null,
    directionsWouldName: wouldName && typeof wouldName.use === "boolean" ? wouldName.use : null,
  };
}
