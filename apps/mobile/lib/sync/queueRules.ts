// Small decisions the sync queue makes about one item, kept pure so they can
// be tested without SQLite or the network (index.ts pulls in React Native).

/** Queue status for an item the server refused for a reason that is neither
 *  the payload nor the network: a free account's third saved place (HTTP 403).
 *  Not pending (it would retry every minute and hold back the queue), not
 *  permanently_failed (nothing is broken and nothing is lost: the place still
 *  works on the phone). Retried once per app start, so it uploads by itself
 *  the day the driver goes Pro. */
export const HELD_STATUS = "held";

/**
 * The server answered 400 because the change is already in place. Ending a
 * shift twice is the one we see: an end queued offline, then the same end sent
 * again after the first one landed ("Shift is already completed", 8 in the ten
 * days to 28 Sep 2026). The driver's intent is done; parking it as a failure
 * lights the red badge for nothing.
 */
export function isAlreadyApplied(entityType: string, action: string, statusCode: number | null, message: string): boolean {
  return entityType === "shift" && action === "update" && statusCode === 400 && /already completed/i.test(message);
}

export type ParkedItemAction = "drop" | "hold" | "revive" | "rebuild";

export interface ParkedItemInput {
  entityType: string;
  action: string;
  /** The row the item refers to still exists in local SQLite. */
  localRowExists: boolean;
  /** ...and the server has confirmed it (synced_at set). */
  localRowSynced: boolean;
  lastError: string | null;
  /** The queued body, parsed; null when absent or unreadable. */
  payload: Record<string, unknown> | null;
}

/**
 * What to do with a row parked as permanently_failed, on the one pass per
 * revision that looks at them again (see PARKED_REVIVAL_REVISION in index.ts).
 *
 * Why the pass exists: 55 of 753 drivers seen in the fortnight to 28 Sep 2026
 * had parked rows, and their phones' recent trips were all on the server. The
 * rows were leftovers of paths since fixed (an edit turned into a broken
 * create by the old missing-target rule, a trip rejected for a shift id the
 * server now ignores) plus things with nothing left to send. Each lit a red
 * "Sync issues" badge and a push telling the driver trips had failed.
 *
 *   create, nothing left on the phone, or already on the server -> drop
 *   create of a trip whose body is not a trip (a converted edit)  -> rebuild
 *                                                    from the phone's own row
 *   create of a shift whose body is an edit ({status})            -> drop:
 *                              POST /shifts would START a shift, not end one
 *   saved place refused on the free plan                          -> hold
 *   edit of a row the phone no longer has                         -> drop
 *   anything else                                                 -> revive:
 *                              one more honest try; if the server still
 *                              refuses it, it parks again and stays counted
 */
export function parkedItemAction(input: ParkedItemInput): ParkedItemAction {
  const { entityType, action, localRowExists, localRowSynced, lastError, payload } = input;
  if (entityType === "saved_location" && action === "create" && /limit|upgrade|pro\b|403/i.test(lastError ?? "")) {
    return "hold";
  }
  if (action === "create") {
    if (!localRowExists || localRowSynced) return "drop";
    if (entityType === "shift" && payload && "status" in payload) return "drop";
    if (entityType === "trip" && !isTripCreateBody(payload)) return "rebuild";
    return "revive";
  }
  if (action === "update") return localRowExists ? "revive" : "drop";
  return "revive";
}

/** A body POST /trips can accept at all: a start time and a start point. */
export function isTripCreateBody(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  return (
    typeof payload.startedAt === "string" &&
    typeof payload.startLat === "number" &&
    typeof payload.startLng === "number"
  );
}
