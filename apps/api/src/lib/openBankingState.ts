import crypto from "node:crypto";

// The `state` we hand TrueLayer when a driver starts linking a bank.
//
// It comes back to GET /earnings/open-banking/callback, which is public
// (TrueLayer's redirect carries no Authorization header) and now does the
// code exchange itself. So the state is the ONLY thing that says which
// driver the bank belongs to, and it has to be trustworthy:
//
//   - signed: HMAC-SHA256 under a key derived from JWT_SECRET with its own
//     label, so a state cannot be forged or edited to name another driver,
//     and the key is not the raw JWT signing secret;
//   - short-lived: refused 15 minutes after it was issued;
//   - single use: the random nonce is recorded on first use and any later
//     use is refused, so a state copied out of a log or a browser history
//     cannot link a second bank to the driver's account.
//
// Format: v1.<base64url(JSON payload)>.<base64url(signature)>, where the
// signature covers "v1.<payload part>".
//
// The used-nonce record is in memory. The API runs as one pm2 process, so
// every callback sees the same record. A restart forgets it, which reopens
// replay only for states issued in the 15 minutes before the restart; the
// expiry still applies, so that window cannot grow.

const VERSION = "v1";
const KEY_LABEL = "mileclear:open-banking-state:v1";

/** How long a driver has between tapping Link and the bank sending them back. */
export const STATE_TTL_MS = 15 * 60 * 1000;
/** Clock skew allowed on an issued time that looks to be in the future. */
const FUTURE_SKEW_MS = 60 * 1000;
/** Anything longer is not one of ours; refuse before doing any work on it. */
const MAX_STATE_LENGTH = 512;

export type OpenBankingReturnTo = "app" | "web";

export interface OpenBankingStatePayload {
  userId: string;
  issuedAt: number;
  nonce: string;
  returnTo: OpenBankingReturnTo;
}

export type StateInvalidReason = "missing" | "bad_signature" | "expired" | "replayed";

export type StateCheck =
  | { ok: true; payload: OpenBankingStatePayload }
  | {
      ok: false;
      reason: StateInvalidReason;
      /** Present when the signature was good, so the failure can be attributed. */
      payload?: OpenBankingStatePayload;
    };

function getKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET must be set");
  return crypto.createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function sign(signedPart: string): Buffer {
  return crypto.createHmac("sha256", getKey()).update(signedPart).digest();
}

export function issueOpenBankingState(
  userId: string,
  returnTo: OpenBankingReturnTo,
  now: number = Date.now()
): string {
  const payload = {
    u: userId,
    iat: now,
    n: crypto.randomBytes(16).toString("base64url"),
    r: returnTo,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signedPart = `${VERSION}.${payloadPart}`;
  return `${signedPart}.${sign(signedPart).toString("base64url")}`;
}

/**
 * Check the signature and decode, without expiry or replay checks and
 * without using the state up. For attributing a callback that carries no
 * code (the driver cancelled at the bank), where nothing is exchanged.
 */
export function readOpenBankingState(state: unknown): OpenBankingStatePayload | null {
  if (typeof state !== "string" || state.length === 0 || state.length > MAX_STATE_LENGTH) {
    return null;
  }
  const parts = state.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const expected = sign(`${parts[0]}.${parts[1]}`);
  let given: Buffer;
  try {
    given = Buffer.from(parts[2], "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(given, expected)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { u, iat, n, r } = raw as Record<string, unknown>;
  if (typeof u !== "string" || u.length === 0) return null;
  if (typeof iat !== "number" || !Number.isFinite(iat)) return null;
  if (typeof n !== "string" || n.length < 16) return null;
  if (r !== "app" && r !== "web") return null;
  return { userId: u, issuedAt: iat, nonce: n, returnTo: r };
}

// nonce -> time after which the record is no longer needed (the state has
// expired by then, so the expiry check refuses it on its own).
const usedNonces = new Map<string, number>();

function pruneUsedNonces(now: number): void {
  for (const [nonce, keepUntil] of usedNonces) {
    if (keepUntil <= now) usedNonces.delete(nonce);
  }
}

/**
 * Full check for a callback that is about to exchange a code: signature,
 * age, and single use. A state that passes is used up by this call, before
 * anything is awaited, so two requests racing with the same state cannot
 * both get through.
 */
export function consumeOpenBankingState(
  state: unknown,
  now: number = Date.now()
): StateCheck {
  if (typeof state !== "string" || state.length === 0) {
    return { ok: false, reason: "missing" };
  }
  const payload = readOpenBankingState(state);
  if (!payload) return { ok: false, reason: "bad_signature" };

  if (now - payload.issuedAt > STATE_TTL_MS || payload.issuedAt - now > FUTURE_SKEW_MS) {
    return { ok: false, reason: "expired", payload };
  }

  pruneUsedNonces(now);
  if (usedNonces.has(payload.nonce)) {
    return { ok: false, reason: "replayed", payload };
  }
  usedNonces.set(payload.nonce, payload.issuedAt + STATE_TTL_MS + FUTURE_SKEW_MS);
  return { ok: true, payload };
}

/** Tests only. */
export function _resetUsedOpenBankingStates(): void {
  usedNonces.clear();
}
