/**
 * APNs (Apple Push Notification service) client — token-based (.p8) auth.
 *
 * Purpose: send **push-to-start** Live Activity pushes. iOS refuses
 * `Activity.request()` from the background, so the only way to make the
 * Dynamic Island / Live Activity appear on its own when ClearTrack detects a
 * drive (app not foregrounded) is a remote APNs push of type `liveactivity`
 * with `event: "start"`. See docs/SPEC_pushtostart_liveactivity.md.
 *
 * Notes:
 * - APNs requires HTTP/2. Node's global fetch (undici) does not speak HTTP/2,
 *   so we use the built-in `http2` module directly.
 * - Token-based auth: an ES256 JWT signed with the team's APNs Auth Key (.p8),
 *   reusable for ~1h. APNs rejects tokens older than 1h and refuses a brand
 *   new token issued <20min after the last, so we cache and refresh at ~50min.
 * - Configured via env (see .env.example). If the key is missing the module
 *   no-ops (returns null), same graceful pattern as lib/stripe.ts / lib/push.ts,
 *   so local dev and unconfigured environments never crash.
 */

import * as fs from "fs";
import * as http2 from "http2";
import { SignJWT, importPKCS8 } from "jose";

const KEY_ID = process.env.APNS_KEY_ID;
const TEAM_ID = process.env.APNS_TEAM_ID;
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.mileclear.app";
const KEY_PATH = process.env.APNS_KEY_PATH;
// Inline base64 alternative to a file path (parity with APPLE_IAP_PRIVATE_KEY).
const KEY_BASE64 = process.env.APNS_KEY_BASE64;
// Production APNs by default — TestFlight AND App Store both deliver over the
// production environment. Override to api.sandbox.push.apple.com only for
// Xcode debug builds (which we don't push to).
const APNS_HOST = process.env.APNS_HOST || "api.push.apple.com";
const APNS_PORT = 443;

// The Live Activity push topic is the app bundle id with this suffix.
const LIVEACTIVITY_TOPIC = `${BUNDLE_ID}.push-type.liveactivity`;
// Must match the Swift `struct MileClearAttributes: ActivityAttributes`.
const ATTRIBUTES_TYPE = "MileClearAttributes";

export const isApnsConfigured = Boolean(KEY_ID && TEAM_ID && (KEY_PATH || KEY_BASE64));

function loadPrivateKeyPem(): string | null {
  try {
    if (KEY_BASE64) return Buffer.from(KEY_BASE64, "base64").toString("utf8");
    if (KEY_PATH) return fs.readFileSync(KEY_PATH, "utf8");
    return null;
  } catch (err) {
    console.error("[apns] Failed to read APNs auth key:", err);
    return null;
  }
}

// --- Signing key + JWT cache ---------------------------------------------

let cachedKey: CryptoKey | null = null;
let cachedJwt: { token: string; issuedAtMs: number } | null = null;
// In-flight mint, shared by all callers (single-flight). Without this, every
// push that arrives while the cache is stale signs its OWN fresh token, and a
// burst of new tokens presented together is exactly what trips APNs'
// 429 TooManyProviderTokenUpdates (it accepts a new token only ~once/20min).
let signingInFlight: Promise<string | null> | null = null;
// Refresh well inside APNs' 1h ceiling, and comfortably past the 20min floor.
const JWT_TTL_MS = 50 * 60 * 1000;

async function signProviderToken(): Promise<string | null> {
  try {
    if (!cachedKey) {
      const pem = loadPrivateKeyPem();
      if (!pem) return null;
      cachedKey = await importPKCS8(pem, "ES256");
    }

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: KEY_ID! })
      .setIssuer(TEAM_ID!)
      .setIssuedAt()
      .sign(cachedKey);

    cachedJwt = { token, issuedAtMs: Date.now() };
    return token;
  } catch (err) {
    console.error("[apns] Failed to sign provider token:", err);
    return null;
  }
}

async function getProviderToken(): Promise<string | null> {
  if (!isApnsConfigured) return null;

  if (cachedJwt && Date.now() - cachedJwt.issuedAtMs < JWT_TTL_MS) {
    return cachedJwt.token;
  }

  // Coalesce concurrent refreshes into a single mint so we never present a
  // burst of brand-new tokens to APNs at the cache-expiry boundary.
  if (!signingInFlight) {
    signingInFlight = signProviderToken().finally(() => {
      signingInFlight = null;
    });
  }
  return signingInFlight;
}

// --- HTTP/2 session (reused; reconnect on close/error) -------------------

let session: http2.ClientHttp2Session | null = null;

// Request timeout. APNs normally answers well inside a second; 10s only ever
// elapses when the connection is broken, not when Apple is slow.
const REQUEST_TIMEOUT_MS = 10_000;
// HTTP/2 PING keepalive. APNs drops idle connections, and a connection that
// dies at the network layer (NAT expiry, path change, Apple closing without a
// GOAWAY reaching us) leaves `session` looking perfectly healthy — neither
// `closed` nor `destroyed`. Without a ping we only discover it when a real
// push hangs for the full timeout and the user loses their Live Activity.
const PING_INTERVAL_MS = 60_000;

/**
 * Drop the cached session so the next push reconnects.
 *
 * 2 Aug 2026: `/trips/signal-start` was logging 10,002-10,008ms responses in
 * clusters (three inside 90s) with `reason=timeout` and — decisively — ZERO
 * "HTTP/2 session error" lines. That combination means the socket was silently
 * dead: the old code only reconnected when the session reported itself
 * `closed`/`destroyed`, so a zombie session was reused indefinitely and every
 * subsequent push burned 10s and failed. A timeout is now treated as evidence
 * about the CONNECTION, not just the request.
 */
function destroySession(reason: string): void {
  const dying = session;
  if (!dying) return;
  session = null;
  console.warn(`[apns] tearing down HTTP/2 session: ${reason}`);
  try {
    dying.destroy();
  } catch {
    // already gone
  }
}

function getSession(): http2.ClientHttp2Session {
  if (session && !session.closed && !session.destroyed) return session;
  const sess = http2.connect(`https://${APNS_HOST}:${APNS_PORT}`);
  session = sess;

  sess.on("error", (err) => {
    console.error("[apns] HTTP/2 session error:", err.message);
    if (session === sess) destroySession("session error");
  });
  // APNs sends GOAWAY before a graceful close. Honour it immediately rather
  // than letting in-flight pushes race the shutdown.
  sess.on("goaway", () => {
    if (session === sess) destroySession("GOAWAY from APNs");
  });

  const keepAlive = setInterval(() => {
    if (session !== sess || sess.closed || sess.destroyed) return;
    try {
      sess.ping((err) => {
        if (err && session === sess) destroySession(`ping failed: ${err.message}`);
      });
    } catch (err) {
      if (session === sess) {
        destroySession(`ping threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, PING_INTERVAL_MS);
  // Never hold the process open for the sake of a keepalive.
  keepAlive.unref?.();

  sess.on("close", () => {
    clearInterval(keepAlive);
    if (session === sess) session = null;
  });

  return sess;
}

export interface ApnsResult {
  ok: boolean;
  status: number;
  /** APNs `reason` from the error body (e.g. "BadDeviceToken"), if any. */
  reason?: string;
  /** APNs unique id for the notification, for log correlation. */
  apnsId?: string;
}

/**
 * Low-level POST to /3/device/{token}. Returns the APNs status + reason.
 * Never throws; failures resolve to { ok:false }.
 */
async function postToApns(
  deviceToken: string,
  headers: Record<string, string>,
  body: unknown
): Promise<ApnsResult> {
  const jwt = await getProviderToken();
  if (!jwt) {
    return { ok: false, status: 0, reason: "not_configured" };
  }

  let sess: http2.ClientHttp2Session;
  try {
    sess = getSession();
  } catch (err) {
    console.error("[apns] connect failed:", err);
    return { ok: false, status: 0, reason: "connect_failed" };
  }

  const payload = Buffer.from(JSON.stringify(body));

  return new Promise((resolve) => {
    const req = sess.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": LIVEACTIVITY_TOPIC,
      "content-type": "application/json",
      "content-length": payload.length,
      ...headers,
    });

    let status = 0;
    let apnsId: string | undefined;
    const chunks: Buffer[] = [];

    req.on("response", (h) => {
      status = Number(h[":status"]) || 0;
      const id = h["apns-id"];
      apnsId = Array.isArray(id) ? id[0] : id;
    });
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let reason: string | undefined;
      if (status !== 200 && chunks.length) {
        try {
          reason = JSON.parse(Buffer.concat(chunks).toString()).reason;
        } catch {
          /* non-JSON error body */
        }
      }
      resolve({ ok: status === 200, status, reason, apnsId });
    });
    req.on("error", (err) => {
      console.error("[apns] request error:", err.message);
      // A stream-level error usually means the session underneath is unusable.
      destroySession(`request error: ${err.message}`);
      resolve({ ok: false, status: 0, reason: "request_error" });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.close(http2.constants.NGHTTP2_CANCEL);
      // The connection, not just this push, is the problem — see
      // destroySession's note. Without this the next push reuses the same dead
      // session and also waits the full timeout, which is exactly how the
      // failures arrived in clusters.
      destroySession("request timeout");
      resolve({ ok: false, status: 0, reason: "timeout" });
    });

    req.end(payload);
  });
}

// --- Date encoding -------------------------------------------------------
//
// ActivityKit decodes Date fields in the push `content-state`/`attributes`
// as a number of seconds since the Unix epoch (1970). This is the encoding
// confirmed working for ActivityKit remote pushes. (If on-device testing ever
// shows dates landing ~31 years off, ActivityKit would be using the 2001
// reference date instead — subtract 978307200. Verify on the first real
// build-1.3.1 device test; this is the single most fiddly part of the payload.)
function toApnsDate(d: Date | number): number {
  const ms = typeof d === "number" ? d : d.getTime();
  return Math.floor(ms / 1000);
}

// Mirrors MileClearAttributes (Swift). Dates are passed as ms-epoch numbers
// or Date and encoded by toApnsDate.
export interface LiveActivityStartAttributes {
  activityType: "trip" | "shift";
  startedAt: Date | number;
  vehicleName: string;
  isBusinessMode: boolean;
  tripContextLabel?: string;
}

// Mirrors MileClearAttributes.ContentState (Swift). Only the always-present
// fields are required; the rest default on the Swift side.
export interface LiveActivityStartContentState {
  distanceMiles: number;
  speedMph: number;
  tripCount: number;
  startDate: Date | number;
  phase?: string;
  dailyTotalMiles?: number;
}

export interface LiveActivityStartOptions {
  /** The device's push-to-start token (per-device, from pushStartTokenUpdates). */
  pushToStartToken: string;
  attributes: LiveActivityStartAttributes;
  contentState: LiveActivityStartContentState;
  /** Optional subtle banner shown alongside the activity start. */
  alert?: { title: string; body: string };
  /** Auto-dismiss the activity at this time if the app never ends it. */
  staleDate?: Date | number;
}

/**
 * Send a push-to-start Live Activity push. Starts the activity on the device
 * (~2-5s) with the given attributes + initial content. Returns the APNs result.
 */
export async function sendLiveActivityStartPush(
  opts: LiveActivityStartOptions
): Promise<ApnsResult> {
  if (!isApnsConfigured) {
    return { ok: false, status: 0, reason: "not_configured" };
  }

  const attrs = opts.attributes;
  const cs = opts.contentState;

  const aps: Record<string, unknown> = {
    timestamp: Math.floor(Date.now() / 1000),
    event: "start",
    "attributes-type": ATTRIBUTES_TYPE,
    attributes: {
      activityType: attrs.activityType,
      startedAt: toApnsDate(attrs.startedAt),
      vehicleName: attrs.vehicleName,
      isBusinessMode: attrs.isBusinessMode,
      tripContextLabel: attrs.tripContextLabel ?? "",
    },
    "content-state": {
      distanceMiles: cs.distanceMiles,
      speedMph: cs.speedMph,
      tripCount: cs.tripCount,
      startDate: toApnsDate(cs.startDate),
      phase: cs.phase ?? "active",
      dailyTotalMiles: cs.dailyTotalMiles ?? 0,
    },
  };

  if (opts.staleDate) aps["stale-date"] = toApnsDate(opts.staleDate);
  if (opts.alert) {
    aps.alert = { title: opts.alert.title, body: opts.alert.body };
  }

  const result = await postToApns(
    opts.pushToStartToken,
    {
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
    },
    { aps }
  );

  if (!result.ok) {
    console.error(
      `[apns] push-to-start failed: status=${result.status} reason=${result.reason ?? "?"}`
    );
  }
  return result;
}
