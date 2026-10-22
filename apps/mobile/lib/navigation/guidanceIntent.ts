// How Directions tell the trip recorder that guidance started, saw movement
// or ended (PLAN-recording.md section 2). The one bridge from navigation to
// recording, and it only carries news: the recorder decides everything, in
// lib/tracking/directionsDrive.ts, the only handler. Directions can never
// stop, end, split, pause or re-power anything through this.
//
// - No handler (every app before the recorder registers one): a no-op.
// - The handler runs on a later tick, so guidance is never held up by it.
// - announceGuidance() never throws and never rejects, whatever the handler does.
//
// The dependency stays tracking -> navigation: this file imports nothing from
// lib/tracking.

import type { DirectionsRecordingMode, DriveEndReason } from "./driveSessions";

export type GuidanceIntentKind = "started" | "moving" | "ended";

export interface GuidanceIntentFix {
  lat: number;
  lng: number;
  speedMps: number | null;
  accuracyM: number | null;
  atMs: number;
}

export interface GuidanceIntent {
  kind: GuidanceIntentKind;
  sessionId: string;
  mode: DirectionsRecordingMode;
  passenger: boolean;
  /** The newest fix guidance has, or null. */
  fix: GuidanceIntentFix | null;
  atMs: number;
  /** On "ended": arrived, End tapped, or the screen closed mid-guidance. */
  reason?: DriveEndReason;
}

export type GuidanceHandler = (intent: GuidanceIntent) => Promise<void> | void;

let handler: GuidanceHandler | null = null;

/** Register the recorder's handler. One only: a later call replaces it. */
export function setGuidanceHandler(h: GuidanceHandler | null): void {
  handler = h;
}

/** Tell the recorder. Resolves once the handler has run (or failed). */
export function announceGuidance(intent: GuidanceIntent): Promise<void> {
  const h = handler;
  if (!h) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        Promise.resolve(h(intent)).then(
          () => resolve(),
          () => resolve()
        );
      } catch {
        resolve();
      }
    }, 0);
  });
}
