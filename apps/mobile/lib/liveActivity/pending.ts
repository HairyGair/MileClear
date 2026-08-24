// Apply a decision the driver made on the Live Activity itself.
//
// LiveActivityIntent runs in the WIDGET process, which owns none of the app's
// state - no SQLite, no API client, no sync queue. So the intents record the
// choice in the activity's `phase` and the main app applies it at its next
// poll. That contract already existed for "End Trip" (phase "saving"); this
// extends it to the kerbside decisions, and deliberately reuses `phase` and
// getLiveActivityPhase() rather than adding a native method, so nothing new
// has to cross the bridge.
//
// Called from the three places the app already checks the phase: launch,
// foreground, and every background location callback.

import {
  getLiveActivityPhase,
  markLiveActivityClassified,
  endLiveActivity,
} from "./index";

export type PendingLiveActivityAction =
  | { kind: "classified"; classification: "business" | "personal"; tripId: string }
  | { kind: "add_short_trip" }
  | null;

/**
 * Resolve and apply anything the driver tapped on the activity.
 *
 * Classification is applied to their most recent trip: the ended activity
 * describes the drive that just finished, and the intent only offers the
 * buttons while `needsClassification` is set on that same activity, so the
 * newest trip is the one being answered about. Guarded anyway - if the newest
 * trip is already classified we do nothing rather than overwrite a decision
 * the user made somewhere else.
 */
export async function applyPendingLiveActivityAction(): Promise<PendingLiveActivityAction> {
  const phase = await getLiveActivityPhase().catch(() => null);
  if (!phase) return null;

  if (phase === "classified_business" || phase === "classified_personal") {
    const classification = phase === "classified_business" ? "business" : "personal";
    try {
      const { getDatabase } = await import("../db/index");
      const db = await getDatabase();
      const trip = await db.getFirstAsync<{ id: string; classification: string | null }>(
        "SELECT id, classification FROM trips ORDER BY started_at DESC LIMIT 1"
      );
      if (!trip) {
        await endLiveActivity();
        return null;
      }
      if (trip.classification && trip.classification !== "unclassified") {
        // Already decided elsewhere; just clear the activity.
        await markLiveActivityClassified().catch(() => {});
        await endLiveActivity();
        return null;
      }
      const { syncUpdateTrip } = await import("../sync/actions");
      await syncUpdateTrip(trip.id, { classification });
      await markLiveActivityClassified().catch(() => {});
      await endLiveActivity();
      return { kind: "classified", classification, tripId: trip.id };
    } catch {
      // Leave the phase in place; the next poll tries again rather than
      // silently losing the user's tap.
      return null;
    }
  }

  if (phase === "too_short_add") {
    // The app has to own this one - it needs the manual-entry form. The
    // caller decides whether it can navigate (foreground) or should leave
    // the phase for the next launch (background task).
    return { kind: "add_short_trip" };
  }

  return null;
}
