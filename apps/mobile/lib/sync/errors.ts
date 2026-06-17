// Shared error classifiers for the offline sync layer.
//
// BOTH the write wrappers (actions.ts) and the queue engine (index.ts) must
// agree on what "the network failed" vs "the server rejected this" means.
// They used to each carry their own inline check, and both only knew React
// Native's raw `TypeError: Network request failed` - missing the messages
// apiRequest() itself throws ("Network error" on a 401-refresh-network-fail,
// "REFRESH_NETWORK_ERROR", "Session expired"). That gap caused captured trips
// to be deleted (actions.ts) and queued trips to burn their retries on every
// offline pass until they were parked as permanently_failed (index.ts) - the
// weeks-stuck / never-appears sync bug. One source of truth, used by both.

import { ApiError } from "../api/apiError";

/** The network was unreachable - either RN's raw fetch failure, or one of the
 *  messages apiRequest() throws when it (or a token refresh inside it) can't
 *  reach the server. On any of these the queued item must be PRESERVED and
 *  retried later, never counted as a failed attempt. */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (msg.includes("Network request failed")) return true; // RN raw fetch
  if (msg.includes("Network error")) return true; // apiRequest 401-refresh path
  if (msg.includes("REFRESH_NETWORK_ERROR")) return true;
  if (msg.includes("Failed to fetch")) return true;
  if (msg.includes("timed out") || msg.includes("timeout")) return true;
  return false;
}

/** Errors that happened before the API was reached - SecureStore blocked by
 *  iOS in the background, token-storage crashes, refresh-network failures,
 *  expired sessions. Like a network error, these are transient-and-preserve:
 *  retry later, don't burn an attempt. Kept as a superset (includes the
 *  session/refresh strings) so the create handlers that gate on
 *  `isNetworkError || isLocalSystemError` preserve exactly what they did before
 *  this was centralised. */
export function isLocalSystemError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes("User interaction is not allowed") ||
    msg.includes("getValueWithKeyAsync") ||
    msg.includes("setValueWithKeyAsync") ||
    msg.includes("SecureStore") ||
    msg.includes("Session expired") ||
    msg.includes("REFRESH_NETWORK_ERROR")
  );
}

/** The session expired (refresh token rejected by the server). The user must
 *  re-authenticate; the queued item should be preserved untouched so it syncs
 *  after the next login. */
export function isSessionExpired(err: unknown): boolean {
  return err instanceof Error && /Session expired/.test(err.message);
}

/** A recoverable auth/authorisation failure (HTTP 401/403) that reached the
 *  sync engine. A 401 can survive a *successful* token refresh (clock skew, a
 *  momentary auth hiccup, the locked-keychain background path); a 403 can clear
 *  once a subscription/permission re-syncs. The bearer token is shared across
 *  the whole batch, so if one item 401s every item will - preserve-and-STOP
 *  (like a network/session error), never burn a retry. Routing these through
 *  the transient retry-count branch would re-create the data-loss bug: an auth
 *  outage would increment retry_count on every batch item until they all parked
 *  as permanently_failed (16 Jun 2026). */
export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && (err.statusCode === 401 || err.statusCode === 403);
}

/** The server is asking us to back off (HTTP 429). Transient - preserve and
 *  retry later, don't treat as a permanent rejection. */
export function isRateLimited(err: unknown): boolean {
  return err instanceof ApiError && err.statusCode === 429;
}

/** The ONLY safe reason to stop retrying an item / discard a captured row:
 *  the server definitively rejected the payload as malformed (a 4xx client
 *  error, excluding 429 and the auth codes below). Anything else - network
 *  blips, token-refresh failures, 5xx, timeouts, unknown errors - is preserved
 *  and retried. Losing real data is far worse than a duplicate or a stuck item.
 *
 *  401/403 are explicitly NOT permanent. A 401 can survive a *successful* token
 *  refresh (clock skew, a momentary auth hiccup, the locked-keychain background
 *  path) and a 403 can clear once a subscription/permission re-syncs - these are
 *  recoverable AUTH problems, not malformed data. Parking either as
 *  permanently_failed destroyed real trips the user could never recover (the
 *  data-loss bug, 16 Jun 2026). Treat them like a network error: preserve and
 *  retry. Only genuine payload rejections (400/409/422 etc.) are permanent. */
export function isDefiniteClientRejection(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.statusCode === 401 || err.statusCode === 403) return false;
    return err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 429;
  }
  return false;
}
