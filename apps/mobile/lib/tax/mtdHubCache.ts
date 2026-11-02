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

/**
 * Forget the cached read. Call after a send, a connect or disconnect, a
 * National Insurance number change, or a failed hub load. Leaves "Your tax so
 * far" alone: see invalidateTaxSoFarCache.
 */
export function invalidateHubCache(): void {
  entry = null;
}

// ── "Your tax so far" ───────────────────────────────────────────────

/**
 * HMRC's calculation only changes when an update is sent, so it is kept
 * longer than the rest of the hub and shared by every hub screen, for the
 * same driver and tax year. A send, a connect or disconnect and a National
 * Insurance number change clear it (invalidateTaxSoFarCache).
 */
export const TAX_SO_FAR_CACHE_MS = 15 * 60_000;
/** A fallback (newest calculation not finished) or "none yet" is kept briefly. */
export const TAX_SO_FAR_SHORT_CACHE_MS = 2 * 60_000;

export interface TaxSoFarCacheEntry<T> {
  userId: string | null;
  taxYear: string;
  at: number;
  ttl: number;
  value: T;
  /** Newest calculation HMRC listed when this was read. */
  newestId: string | null;
}

let taxSoFar: TaxSoFarCacheEntry<unknown> | null = null;

/** The entry for this driver and year, fresh or not. Null for another driver or year. */
export function peekTaxSoFarCache<T>(userId: string | null, taxYear: string): TaxSoFarCacheEntry<T> | null {
  if (!taxSoFar || taxSoFar.userId !== userId || taxSoFar.taxYear !== taxYear) return null;
  return taxSoFar as TaxSoFarCacheEntry<T>;
}

/** The entry if it is still fresh. */
export function readTaxSoFarCache<T>(
  userId: string | null,
  taxYear: string,
  now: number = Date.now(),
): TaxSoFarCacheEntry<T> | null {
  const e = peekTaxSoFarCache<T>(userId, taxYear);
  if (!e || now - e.at >= e.ttl) return null;
  return e;
}

export function writeTaxSoFarCache<T>(
  userId: string | null,
  taxYear: string,
  value: T,
  opts: { ttl?: number; newestId?: string | null } = {},
  now: number = Date.now(),
): void {
  taxSoFar = { userId, taxYear, at: now, ttl: opts.ttl ?? TAX_SO_FAR_CACHE_MS, value, newestId: opts.newestId ?? null };
}

/** Forget HMRC's estimate. Call after a send, a connect or disconnect, or a National Insurance number change. */
export function invalidateTaxSoFarCache(): void {
  taxSoFar = null;
}
