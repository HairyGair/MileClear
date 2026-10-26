/**
 * What led to a purchase, sent with the store validate call so the server
 * can log it on billing.*_validated. The purchase is validated by the
 * app-wide store listener in app/_layout.tsx, after the Pro screen may have
 * closed, so the Pro screen notes its source here when it opens.
 *
 * Pure (no React Native imports) so it can be unit tested.
 */

/** A Pro screen opened longer ago than this did not lead to the purchase. */
const FRESH_MS = 30 * 60 * 1000;

let last: { source: string; atMs: number } | null = null;

/** Called when the Pro screen opens. No source: the generic Pro screen. */
export function notePaywallSource(source: string | undefined, nowMs: number = Date.now()): void {
  last = { source: source || "pro_screen", atMs: nowMs };
}

/**
 * The Pro screen's source if it opened in the last half hour, else "store":
 * the store delivered a purchase with no Pro screen behind it (a purchase
 * finished on a later launch, or one started in the App Store).
 */
export function purchaseSource(nowMs: number = Date.now()): string {
  return last && nowMs - last.atMs <= FRESH_MS ? last.source : "store";
}

/** After a purchase is validated, so a later store delivery isn't credited to the same screen. */
export function clearPurchaseSource(): void {
  last = null;
}
