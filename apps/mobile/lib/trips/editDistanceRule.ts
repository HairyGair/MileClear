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
// whenever the driver typed a figure that differs from the trip's, and only
// then: never a routed figure.
//
// Pure: no React, no database.

/** The end of the note POST /shifts/past writes on a typed total. */
const TYPED_TOTAL_NOTE = /total entered by you$/i;

export function isTypedTotalForEdit(t: { isTypedTotal?: boolean | null; notes?: string | null }): boolean {
  if (typeof t.isTypedTotal === "boolean") return t.isTypedTotal;
  return TYPED_TOTAL_NOTE.test((t.notes ?? "").trim());
}

/** "48", "48.25", "48,25", "48 mi" -> miles; null for anything else. */
export function parseTypedMiles(text: string): number | null {
  const cleaned = text.trim().replace(/\s*(mi|miles?)$/i, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned) && !/^\.\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The miles to send with an edit, or undefined to leave the trip's alone.
 * Only what the driver typed counts, read from the box itself: a figure the
 * route lookup put on screen (a pin moved while the box was open) is never
 * sent, so it can't replace a recording's trail miles. A figure that is the
 * trip's own to one decimal place (the box opens prefilled with it) sends
 * nothing either.
 */
export function editedDistanceToSend(args: {
  /** The driver typed in a miles box. */
  typed: boolean;
  /** What the box holds. */
  text: string;
  /** The trip's miles when the edit screen loaded it. */
  loadedMiles: number | null;
}): number | undefined {
  if (!args.typed) return undefined;
  const n = parseTypedMiles(args.text);
  if (n == null) return undefined;
  if (args.loadedMiles != null && round1(n) === round1(args.loadedMiles)) return undefined;
  return Math.round(n * 100) / 100;
}
