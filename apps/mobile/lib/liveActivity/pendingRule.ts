// What to do with a decision the driver made on the Live Activity itself.
//
// The widget process records the tap in App Group UserDefaults (see
// LiveActivityIntents.swift) because the activity it was made on is gone by
// the time the app wakes. This is the pure rule the app applies to it; the
// I/O lives in pending.ts. Kept pure so the edge cases are testable: a tap
// that is hours old, a tap about a trip that has since been classified in
// the app, a "Not Driving" that arrives after the recorder already finished.

export type PendingLiveActivityDecision =
  | { kind: "classified"; classification: "business" | "personal"; atMs: number }
  | { kind: "not_driving"; atMs: number };

export type NewestTrip = {
  id: string;
  classification: string | null;
  endedAtMs: number | null;
};

export type PendingDecisionAction =
  | { action: "none" }
  | { action: "classify"; tripId: string; classification: "business" | "personal" }
  | { action: "cancel_recording" }
  | { action: "clear"; reason: "stale" | "no_trip" | "already_classified" | "superseded" | "no_recording" };

/** A tap older than this is history, not an instruction. */
export const PENDING_DECISION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * The buttons are offered on the activity for the trip that just finished,
 * so the tap answers for the newest trip - unless a newer trip has finished
 * since the tap, in which case the one it was about is no longer newest and
 * the safe move is to drop it rather than label the wrong drive.
 */
const SUPERSEDED_SLACK_MS = 5 * 60 * 1000;

export function parsePendingDecision(raw: unknown): PendingLiveActivityDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const atMs = typeof r.atMs === "number" && Number.isFinite(r.atMs) ? r.atMs : null;
  if (atMs == null) return null;
  if (r.kind === "not_driving") return { kind: "not_driving", atMs };
  if (r.kind === "classified" && (r.classification === "business" || r.classification === "personal")) {
    return { kind: "classified", classification: r.classification, atMs };
  }
  return null;
}

export function decidePendingDecision(input: {
  decision: PendingLiveActivityDecision | null;
  nowMs: number;
  recordingActive: boolean;
  newestTrip: NewestTrip | null;
}): PendingDecisionAction {
  const { decision, nowMs, recordingActive, newestTrip } = input;
  if (!decision) return { action: "none" };
  if (nowMs - decision.atMs > PENDING_DECISION_MAX_AGE_MS) return { action: "clear", reason: "stale" };

  if (decision.kind === "not_driving") {
    return recordingActive ? { action: "cancel_recording" } : { action: "clear", reason: "no_recording" };
  }

  if (!newestTrip) return { action: "clear", reason: "no_trip" };
  if (newestTrip.classification && newestTrip.classification !== "unclassified") {
    return { action: "clear", reason: "already_classified" };
  }
  if (newestTrip.endedAtMs != null && newestTrip.endedAtMs > decision.atMs + SUPERSEDED_SLACK_MS) {
    return { action: "clear", reason: "superseded" };
  }
  return { action: "classify", tripId: newestTrip.id, classification: decision.classification };
}
