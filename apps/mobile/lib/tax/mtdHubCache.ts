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
}
