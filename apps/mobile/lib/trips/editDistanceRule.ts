// Miles on the trip edit screen.
//
// A past shift saved from its totals (Lucian, 19 Oct 2026) is one trip with
// the driver's own miles for the whole shift, often from home back to home.
// Moving one of its places must never put routed miles on screen: a route
// between its two ends is not the shift. The server says which trips these
// are (isTypedTotal on GET /trips and /trips/:id); a trip read from the
// phone's own table has no such field, so its note is the fallback.
//
// Miles typed with "Enter distance manually" while editing were never sent,
// so a correction (48 typed as 84) was silently dropped. They are now sent
// whenever the driver typed a figure that differs from the trip's.
//
// Pure: no React, no database.

/** The end of the note POST /shifts/past writes on a typed total. */
const TYPED_TOTAL_NOTE = /total entered by you$/i;

export function isTypedTotalForEdit(t: { isTypedTotal?: boolean | null; notes?: string | null }): boolean {
  if (typeof t.isTypedTotal === "boolean") return t.isTypedTotal;
  return TYPED_TOTAL_NOTE.test((t.notes ?? "").trim());
}

/** The miles to send with an edit, or undefined to leave the trip's alone. */
export function editedDistanceToSend(args: {
  /** The driver opened "Enter distance manually". */
  typing: boolean;
  distanceMiles: number | null;
  /** The trip's miles when the edit screen loaded it. */
  loadedMiles: number | null;
}): number | undefined {
  const { typing, distanceMiles, loadedMiles } = args;
  if (!typing || distanceMiles == null || !Number.isFinite(distanceMiles) || distanceMiles <= 0) return undefined;
  if (loadedMiles != null && Math.abs(distanceMiles - loadedMiles) < 0.005) return undefined;
  return Math.round(distanceMiles * 100) / 100;
}
