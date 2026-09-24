/**
 * Merging pages of the trips list without repeating a trip.
 *
 * The list pages by offset (page 2 = trips 21-40, newest first). When a new
 * trip lands on the server between loading page 1 and page 2, every trip
 * slides down one place, so the last trip of page 1 comes back again as the
 * first trip of page 2. Appending the page blindly put the same trip id in
 * the list twice.
 *
 * Two rows with one key are worse than a visible duplicate: React cannot
 * tell them apart, so on each later re-render it leaves an old copy of the
 * card mounted and never removes it. Chris Saunders (24 Sep 2026) saw one
 * 22 Sep drive 13 times, the extra copies stranded under the "Yesterday"
 * heading; the server and the phone's database held it once. His drive was
 * exactly 20th newest, the last row of page 1, when a new trip synced.
 *
 * Pure: no React.
 */

export interface HasId {
  id: string;
}

/**
 * Append a freshly loaded page to the trips already on screen. A trip that
 * is already on screen keeps its place and takes the fresher copy from the
 * page (its classification or times may have changed since); only trips not
 * yet on screen are appended, in page order.
 */
export function mergeTripPage<T extends HasId>(current: readonly T[], page: readonly T[]): T[] {
  const incoming = new Map<string, T>();
  for (const t of page) if (!incoming.has(t.id)) incoming.set(t.id, t);

  const seen = new Set<string>();
  const merged: T[] = [];
  for (const t of current) {
    if (seen.has(t.id)) continue; // heal a list that already repeats a trip
    seen.add(t.id);
    merged.push(incoming.get(t.id) ?? t);
  }
  for (const t of page) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }
  return merged;
}

/** Drop repeat ids, keeping the first occurrence and the order. */
export function uniqueById<T extends HasId>(trips: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of trips) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}
