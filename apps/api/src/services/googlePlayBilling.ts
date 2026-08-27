// Google Play Billing — the Android analogue of appleIap.ts.
//
// Two jobs:
//   - Verify a purchase token the app hands us after a Play Billing purchase
//     (purchases.subscriptionsv2.get on the Android Publisher API).
//   - Decode Real-Time Developer Notifications (RTDN), which Google delivers
//     as Pub/Sub push messages rather than signed JWS like Apple.
//
// Auth is a service-account JWT bearer flow: sign a short-lived assertion with
// the service account's private key, swap it for an access token. We sign with
// `jose` (already a dependency for Apple JWKS) rather than pulling in the
// googleapis SDK, which is a very large dependency for two endpoints.
//
// Like appleIap.ts and fuelFinder.ts, every export is null-safe when the
// credentials are absent, so an unconfigured environment degrades to "Google
// Play not configured" instead of throwing at import time.

import { SignJWT, importPKCS8 } from "jose";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || "";
// PEM private key. Stored base64-encoded in env to survive newline mangling,
// exactly as APPLE_IAP_PRIVATE_KEY is.
const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY || "";
const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.mileclear.app";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

const REQUEST_TIMEOUT_MS = 10000;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

// Play product IDs. These are the subscription IDs configured in the Play
// Console and must match the Apple ones conceptually, not literally — Play
// uses a subscription ID plus a base plan ID rather than one ID per duration.
const PRODUCT_ID_PREMIUM = "premium";
const BASE_PLAN_MONTHLY = "monthly";
const BASE_PLAN_ANNUAL = "annual";
const VALID_BASE_PLANS = [BASE_PLAN_MONTHLY, BASE_PLAN_ANNUAL];

interface TokenData {
  accessToken: string;
  expiresAt: number;
}
let cachedToken: TokenData | null = null;

export function isGooglePlayConfigured(): boolean {
  return !!(SERVICE_ACCOUNT_EMAIL && SERVICE_ACCOUNT_KEY_BASE64);
}

/** Invalidate the cached access token so the next call re-authenticates. */
export function clearGooglePlayToken(): void {
  cachedToken = null;
}

async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (!isGooglePlayConfigured()) return null;

  if (
    !forceRefresh &&
    cachedToken &&
    Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedToken.accessToken;
  }
  cachedToken = null;

  const pem = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, "base64").toString("utf8");
  const key = await importPKCS8(pem, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(SERVICE_ACCOUNT_EMAIL)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return cachedToken.accessToken;
  } finally {
    clearTimeout(timeout);
  }
}

async function playApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Google Play billing not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Play API ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    // acknowledge returns 204 with an empty body.
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// --- purchases.subscriptionsv2 ------------------------------------------

/** Subset of SubscriptionPurchaseV2 that we actually consume. */
export interface GooglePlaySubscription {
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    offerDetails?: {
      basePlanId?: string;
      offerId?: string;
      offerTags?: string[];
    };
  }>;
}

/** States in which the user should have premium access. Grace period and
 *  on-hold both keep access while Google retries payment. */
const ACTIVE_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED", // cancelled but not yet expired
]);

export async function fetchSubscription(
  purchaseToken: string,
): Promise<GooglePlaySubscription> {
  return playApi<GooglePlaySubscription>(
    `/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  );
}

/**
 * Acknowledge a purchase. Google auto-refunds any purchase not acknowledged
 * within three days, so this is not optional — it is the step that keeps the
 * money. Safe to call repeatedly; an already-acknowledged purchase is a no-op.
 */
export async function acknowledgeSubscription(
  purchaseToken: string,
  subscriptionId: string = PRODUCT_ID_PREMIUM,
): Promise<void> {
  await playApi<void>(
    `/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function isSubscriptionActive(sub: GooglePlaySubscription): boolean {
  if (!sub.subscriptionState || !ACTIVE_STATES.has(sub.subscriptionState)) return false;
  const expiry = getExpiryDate(sub);
  // A cancelled-but-unexpired subscription still grants access until expiry.
  return !expiry || expiry.getTime() > Date.now();
}

/** Latest expiry across line items — the one that governs access. */
export function getExpiryDate(sub: GooglePlaySubscription): Date | null {
  const times = (sub.lineItems || [])
    .map((li) => li.expiryTime)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!times.length) return null;
  return new Date(Math.max(...times.map((d) => d.getTime())));
}

/**
 * Best-effort free-trial detection. Play does not expose a first-class
 * "this is a trial" boolean on SubscriptionPurchaseV2 the way Apple's
 * offerDiscountType does; the signal is that the active line item carries an
 * offerId (an intro or free-trial offer) rather than the bare base plan.
 * Used only to stamp trialUsedAt, so a false negative costs us nothing worse
 * than a user being offered a trial they already had.
 */
export function isTrialPurchase(sub: GooglePlaySubscription): boolean {
  return (sub.lineItems || []).some((li) => !!li.offerDetails?.offerId);
}

/** Validate that the purchase is for a plan we actually sell. */
export function hasValidBasePlan(sub: GooglePlaySubscription): boolean {
  const plans = (sub.lineItems || [])
    .map((li) => li.offerDetails?.basePlanId)
    .filter((p): p is string => !!p);
  if (!plans.length) return false;
  return plans.some((p) => VALID_BASE_PLANS.includes(p));
}

// --- Real-Time Developer Notifications ----------------------------------

/** RTDN notification types we act on. Google sends these as integers. */
export const RTDN_TYPES = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PRICE_CHANGE_CONFIRMED: 8,
  DEFERRED: 9,
  PAUSED: 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,
  EXPIRED: 13,
  PENDING_PURCHASE_CANCELED: 20,
} as const;

/** Types that mean the user should currently have access. */
export const RTDN_GRANTS_ACCESS = new Set<number>([
  RTDN_TYPES.RECOVERED,
  RTDN_TYPES.RENEWED,
  RTDN_TYPES.PURCHASED,
  RTDN_TYPES.RESTARTED,
  RTDN_TYPES.IN_GRACE_PERIOD,
]);

/** Types that mean access should end now. Note CANCELED is NOT here: a
 *  cancelled subscription runs to the end of its paid period. */
export const RTDN_REVOKES_ACCESS = new Set<number>([
  RTDN_TYPES.REVOKED,
  RTDN_TYPES.EXPIRED,
]);

export interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  voidedPurchaseNotification?: {
    purchaseToken?: string;
    orderId?: string;
    productType?: number;
    refundType?: number;
  };
  testNotification?: { version?: string };
}

/**
 * Decode a Pub/Sub push envelope into a DeveloperNotification.
 *
 * Unlike Apple's JWS payloads, RTDN messages are NOT signed — authenticity
 * comes from the transport (Pub/Sub push with an OIDC token, or a shared
 * secret in the push URL). The caller is responsible for that check; this
 * function only decodes. Returns null when the body isn't a Pub/Sub envelope.
 */
export function decodePubSubMessage(body: unknown): DeveloperNotification | null {
  const envelope = body as { message?: { data?: string } } | null;
  const data = envelope?.message?.data;
  if (!data || typeof data !== "string") return null;
  try {
    const json = Buffer.from(data, "base64").toString("utf8");
    const parsed = JSON.parse(json) as DeveloperNotification;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export {
  PACKAGE_NAME,
  PRODUCT_ID_PREMIUM,
  BASE_PLAN_MONTHLY,
  BASE_PLAN_ANNUAL,
  VALID_BASE_PLANS,
};
