// Miles a driver typed into a box: the past-shift totals form and the trip
// edit screen read them the same way.
//
// Pure.

/**
 * "84", "84.5", "84,5", "1,000", "1,000.5", "84 mi" -> miles; null for
 * anything else or nothing. A comma before exactly three digits groups
 * thousands; any other comma is a decimal point.
 */
export function parseTypedMilesText(text: string): number | null {
  const bare = text.trim().replace(/\s*(mi|miles?)$/i, "");
  const cleaned = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(bare) ? bare.replace(/,/g, "") : bare.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned) && !/^\.\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
