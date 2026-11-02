/**
 * The hub's short-lived cache. A hub screen may reuse its own last read for a
 * minute when it is refocused. A freshly opened hub (for example after "Done"
 * on the sent screen replaces it) never reuses another instance's read, so a
 * quarter that was just sent can't show as still due.
 */
export const HUB_CACHE_MS = 60_000;

export interface HubCacheEntry<T> {
  userId: string | null;
  /** Which hub screen instance wrote it. */
  owner: number;
  at: number;
  value: T;
}

let entry: HubCacheEntry<unknown> | null = null;
let nextOwner = 1;

/** A new id for each hub screen instance. */
export function newHubOwner(): number {
  return nextOwner++;
}

/** The cached read if this same instance wrote it, for this user, less than a minute ago. */
export function readHubCache<T>(userId: string | null, owner: number, now: number = Date.now()): T | null {
  if (!entry) return null;
  if (entry.userId !== userId || entry.owner !== owner) return null;
  if (now - entry.at >= HUB_CACHE_MS) return null;
  return entry.value as T;
}

export function writeHubCache<T>(userId: string | null, owner: number, value: T, now: number = Date.now()): void {
  entry = { userId, owner, at: now, value };
}

/** Forget the cached read. Call after a send, a connect or disconnect, or a National Insurance number change. */
export function invalidateHubCache(): void {
  entry = null;
  taxSoFar = null;
}

/**
 * "Your tax so far" keeps HMRC's calculation longer than the rest of the hub:
 * it only changes when an update is sent, and a send clears it (above). Any
 * hub screen may reuse it, for the same driver and tax year.
 */
export const TAX_SO_FAR_CACHE_MS = 15 * 60_000;

let taxSoFar: { userId: string | null; taxYear: string; at: number; value: unknown } | null = null;

export function readTaxSoFarCache<T>(userId: string | null, taxYear: string, now: number = Date.now()): T | null {
  if (!taxSoFar) return null;
  if (taxSoFar.userId !== userId || taxSoFar.taxYear !== taxYear) return null;
  if (now - taxSoFar.at >= TAX_SO_FAR_CACHE_MS) return null;
  return taxSoFar.value as T;
}

export function writeTaxSoFarCache<T>(userId: string | null, taxYear: string, value: T, now: number = Date.now()): void {
  taxSoFar = { userId, taxYear, at: now, value };
}
