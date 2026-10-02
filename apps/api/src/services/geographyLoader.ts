// Loads the rows behind GET /admin/geography and assigns every user a home
// area (services/geography.ts holds the pure rules).
//
// Cost: five reads, none per-user.
//   - users (all, ~12 narrow columns)
//   - saved "home" locations
//   - latest "How did you hear" answer per user (app_events)
//   - Apple sandbox transaction ids (subscriptionTruth)
//   - ONE raw pass over trips: each user's most recent 200 non-phantom trips
//     (ROW_NUMBER over (userId, startedAt), which the [userId, startedAt]
//     index serves), selecting only userId/startAddress/startLat/startLng/
//     startedAt, plus a window MAX giving each user's latest AUTOMATIC trip
//     across ALL their trips (activation + "active in 7 days") in the same
//     scan. The cap keeps a 5,000-trip courier from dominating memory and
//     makes the home district reflect where they drive NOW; 200 trips is far
//     more than the mode of a district needs.
//
// The result does not depend on the request's filters, so it is memoised
// for 5 minutes (one in-flight promise shared by concurrent requests) and
// every filter combination is rolled up from the same base.

import { prisma } from "../lib/prisma.js";
import { classifyProSource, loadSandboxTxnIds } from "./subscriptionTruth.js";
import {
  assignHomeArea,
  parseSignupLocation,
  type GeoPlatform,
  type GeoUser,
  type TripLite,
} from "./geography.js";

export const TRIPS_PER_USER_CAP = 200;
const BASE_TTL_MS = 5 * 60 * 1000;

export interface GeographyBase {
  users: GeoUser[];
  tripsScanned: number;
  loadedAt: Date;
}

/** "ios" | "android" | "both" | "web" from platformsSeen, falling back to signupPlatform. */
export function platformOf(seen: string | null, signup: string | null): GeoPlatform | null {
  const set = new Set((seen ?? "").split(",").map((v) => v.trim()).filter(Boolean));
  if (set.has("ios") && set.has("android")) return "both";
  if (set.has("ios")) return "ios";
  if (set.has("android")) return "android";
  if (set.has("web")) return "web";
  if (signup === "ios" || signup === "android" || signup === "web") return signup;
  return null;
}

interface TripRow {
  userId: string;
  startAddress: string | null;
  startLat: number | null;
  startLng: number | null;
  startedAt: Date;
  lastAutoAt: Date | null;
}

async function load(): Promise<GeographyBase> {
  const now = new Date();
  const [users, homes, answers, sandboxTxns, trips] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        createdAt: true,
        platformsSeen: true,
        signupPlatform: true,
        signupLocation: true,
        isPremium: true,
        premiumExpiresAt: true,
        stripeSubscriptionId: true,
        appleOriginalTransactionId: true,
        googlePlayPurchaseToken: true,
        referralProUntil: true,
      },
    }),
    prisma.savedLocation.findMany({
      where: { locationType: "home" },
      select: { userId: true, latitude: true, longitude: true, updatedAt: true },
    }),
    prisma.appEvent.findMany({
      where: { type: "user.acquisition_source" },
      select: { userId: true, createdAt: true, metadata: true },
    }),
    loadSandboxTxnIds(),
    prisma.$queryRaw<TripRow[]>`
      SELECT /*+ MAX_EXECUTION_TIME(30000) */ userId, startAddress, startLat, startLng, startedAt, lastAutoAt
      FROM (
        SELECT userId, startAddress, startLat, startLng, startedAt,
          ROW_NUMBER() OVER (PARTITION BY userId ORDER BY startedAt DESC) AS rn,
          MAX(CASE WHEN isManualEntry = 0 THEN startedAt END) OVER (PARTITION BY userId) AS lastAutoAt
        FROM trips
        WHERE isPhantomTrip = 0
      ) ranked
      WHERE rn <= ${TRIPS_PER_USER_CAP}
    `,
  ]);

  const homeBy = new Map<string, { lat: number; lng: number; at: number }>();
  for (const h of homes) {
    const prev = homeBy.get(h.userId);
    if (!prev || prev.at < h.updatedAt.getTime()) {
      homeBy.set(h.userId, { lat: h.latitude, lng: h.longitude, at: h.updatedAt.getTime() });
    }
  }

  const sourceBy = new Map<string, { source: string; at: number }>();
  for (const a of answers) {
    if (!a.userId) continue;
    const source = (a.metadata as { source?: unknown } | null)?.source;
    if (typeof source !== "string") continue;
    const prev = sourceBy.get(a.userId);
    if (!prev || prev.at < a.createdAt.getTime()) sourceBy.set(a.userId, { source, at: a.createdAt.getTime() });
  }

  const tripsBy = new Map<string, TripLite[]>();
  const lastAutoBy = new Map<string, Date>();
  for (const t of trips) {
    const list = tripsBy.get(t.userId) ?? [];
    list.push({
      startAddress: t.startAddress,
      startLat: t.startLat == null ? null : Number(t.startLat),
      startLng: t.startLng == null ? null : Number(t.startLng),
      startedAt: new Date(t.startedAt),
    });
    tripsBy.set(t.userId, list);
    if (t.lastAutoAt) lastAutoBy.set(t.userId, new Date(t.lastAutoAt));
  }

  const geoUsers: GeoUser[] = users.map((u) => {
    const source = classifyProSource(u, sandboxTxns, now);
    const home = homeBy.get(u.id);
    return {
      id: u.id,
      createdAt: u.createdAt,
      platform: platformOf(u.platformsSeen, u.signupPlatform),
      source: sourceBy.get(u.id)?.source ?? null,
      home: assignHomeArea({
        trips: tripsBy.get(u.id) ?? [],
        savedHome: home ? { lat: home.lat, lng: home.lng } : null,
        signupLocation: u.signupLocation,
      }),
      ip: parseSignupLocation(u.signupLocation),
      lastAutoTripAt: lastAutoBy.get(u.id) ?? null,
      paying: source === "paying",
      pro: source !== null && source !== "sandbox",
    };
  });

  return { users: geoUsers, tripsScanned: trips.length, loadedAt: now };
}

let memo: { at: number; promise: Promise<GeographyBase> } | null = null;

export function loadGeographyBase(): Promise<GeographyBase> {
  if (memo && Date.now() - memo.at < BASE_TTL_MS) return memo.promise;
  const promise = load();
  memo = { at: Date.now(), promise };
  // A failed load must not be served for five minutes.
  promise.catch(() => {
    if (memo?.promise === promise) memo = null;
  });
  return promise;
}
