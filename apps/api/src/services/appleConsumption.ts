// Apple App Store Server API — CONSUMPTION_REQUEST handler.
//
// When a user files for a refund, Apple sends a CONSUMPTION_REQUEST
// webhook and gives us 12 hours to reply with consumption data via
// PUT /inApps/v1/transactions/consumption/{originalTransactionId}.
// Silent non-response = Apple defaults to worst-case for us and
// approves the refund. So we always respond, even if we can't find
// the user (orphan transaction → minimal UNDECLARED payload).
//
// The richer the data we provide for an actively-engaged user, the
// stronger our refund-defence posture: refundPreference=PREFER_DECLINE
// is the strongest signal we can send when we believe the refund is
// not warranted.

import { type ConsumptionRequest, APIException } from "@apple/app-store-server-library";
import { prisma } from "../lib/prisma.js";
import {
  getAppleClient,
  getAppleClientForEnv,
  type AppleIapEnvironment,
} from "./appleIap.js";
import { logEvent } from "./appEvents.js";

// Apple library doesn't re-export every enum from its top-level index,
// so we keep numeric literals here rather than reach into deep paths.
// Documented as `enum | number` in the ConsumptionRequest type.
const ConsumptionStatus = {
  UNDECLARED: 0,
  NOT_CONSUMED: 1,
  PARTIALLY_CONSUMED: 2,
  FULLY_CONSUMED: 3,
} as const;
type ConsumptionStatus = typeof ConsumptionStatus[keyof typeof ConsumptionStatus];

const AccountTenure = {
  UNDECLARED: 0,
  ZERO_TO_THREE_DAYS: 1,
  THREE_DAYS_TO_TEN_DAYS: 2,
  TEN_DAYS_TO_THIRTY_DAYS: 3,
  THIRTY_DAYS_TO_NINETY_DAYS: 4,
  NINETY_DAYS_TO_ONE_HUNDRED_EIGHTY_DAYS: 5,
  ONE_HUNDRED_EIGHTY_DAYS_TO_THREE_HUNDRED_SIXTY_FIVE_DAYS: 6,
  GREATER_THAN_THREE_HUNDRED_SIXTY_FIVE_DAYS: 7,
} as const;
type AccountTenure = typeof AccountTenure[keyof typeof AccountTenure];

const PlayTime = {
  UNDECLARED: 0,
  ZERO_TO_FIVE_MINUTES: 1,
  FIVE_TO_SIXTY_MINUTES: 2,
  ONE_TO_SIX_HOURS: 3,
  SIX_HOURS_TO_TWENTY_FOUR_HOURS: 4,
  ONE_DAY_TO_FOUR_DAYS: 5,
  FOUR_DAYS_TO_SIXTEEN_DAYS: 6,
  OVER_SIXTEEN_DAYS: 7,
} as const;
type PlayTime = typeof PlayTime[keyof typeof PlayTime];

const RefundPreference = {
  UNDECLARED: 0,
  PREFER_GRANT: 1,
  PREFER_DECLINE: 2,
  NO_PREFERENCE: 3,
} as const;
type RefundPreference = typeof RefundPreference[keyof typeof RefundPreference];

const UserStatus = {
  UNDECLARED: 0,
  ACTIVE: 1,
  SUSPENDED: 2,
  TERMINATED: 3,
  LIMITED_ACCESS: 4,
} as const;

const Platform = { UNDECLARED: 0, APPLE: 1, NON_APPLE: 2 } as const;
const DeliveryStatus = { DELIVERED_AND_WORKING_PROPERLY: 0 } as const;
const LifetimeDollarsRefunded = { UNDECLARED: 0 } as const;
const LifetimeDollarsPurchased = { UNDECLARED: 0 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function bucketAccountTenure(createdAt: Date | null): AccountTenure {
  if (!createdAt) return AccountTenure.UNDECLARED;
  const days = (Date.now() - createdAt.getTime()) / DAY_MS;
  if (days < 3) return AccountTenure.ZERO_TO_THREE_DAYS;
  if (days < 10) return AccountTenure.THREE_DAYS_TO_TEN_DAYS;
  if (days < 30) return AccountTenure.TEN_DAYS_TO_THIRTY_DAYS;
  if (days < 90) return AccountTenure.THIRTY_DAYS_TO_NINETY_DAYS;
  if (days < 180) return AccountTenure.NINETY_DAYS_TO_ONE_HUNDRED_EIGHTY_DAYS;
  if (days < 365) return AccountTenure.ONE_HUNDRED_EIGHTY_DAYS_TO_THREE_HUNDRED_SIXTY_FIVE_DAYS;
  return AccountTenure.GREATER_THAN_THREE_HUNDRED_SIXTY_FIVE_DAYS;
}

function bucketPlayTime(totalMinutes: number): PlayTime {
  if (totalMinutes <= 0) return PlayTime.UNDECLARED;
  if (totalMinutes < 5) return PlayTime.ZERO_TO_FIVE_MINUTES;
  if (totalMinutes < 60) return PlayTime.FIVE_TO_SIXTY_MINUTES;
  if (totalMinutes < 6 * 60) return PlayTime.ONE_TO_SIX_HOURS;
  if (totalMinutes < 24 * 60) return PlayTime.SIX_HOURS_TO_TWENTY_FOUR_HOURS;
  if (totalMinutes < 4 * 24 * 60) return PlayTime.ONE_DAY_TO_FOUR_DAYS;
  if (totalMinutes < 16 * 24 * 60) return PlayTime.FOUR_DAYS_TO_SIXTEEN_DAYS;
  return PlayTime.OVER_SIXTEEN_DAYS;
}

interface UsageStats {
  tripCount: number;
  totalDriveMinutes: number;
  daysSinceCreated: number;
  hasRecentActivity: boolean; // any trip / app event in last 7 days
}

async function gatherUsageStats(userId: string): Promise<UsageStats | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!user) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);

  const [tripCount, tripDuration, recentTripCount] = await Promise.all([
    prisma.trip.count({ where: { userId, isPhantomTrip: false } }),
    prisma.trip.findMany({
      where: { userId, isPhantomTrip: false, endedAt: { not: null } },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.trip.count({
      where: {
        userId,
        isPhantomTrip: false,
        startedAt: { gte: sevenDaysAgo },
      },
    }),
  ]);

  let totalDriveMinutes = 0;
  for (const t of tripDuration) {
    if (!t.endedAt) continue;
    totalDriveMinutes += (t.endedAt.getTime() - t.startedAt.getTime()) / 60_000;
  }

  return {
    tripCount,
    totalDriveMinutes,
    daysSinceCreated: (Date.now() - user.createdAt.getTime()) / DAY_MS,
    hasRecentActivity: recentTripCount > 0,
  };
}

function pickConsumptionStatus(stats: UsageStats): ConsumptionStatus {
  if (stats.tripCount === 0) return ConsumptionStatus.NOT_CONSUMED;
  if (stats.tripCount < 5) return ConsumptionStatus.PARTIALLY_CONSUMED;
  return ConsumptionStatus.FULLY_CONSUMED;
}

function pickRefundPreference(stats: UsageStats): RefundPreference {
  // Strong signal to decline refund only when we have evidence of real
  // ongoing use. If they barely engaged, let Apple decide — fighting a
  // refund for an unused subscription is bad faith.
  if (stats.tripCount >= 10 && stats.hasRecentActivity) {
    return RefundPreference.PREFER_DECLINE;
  }
  if (stats.tripCount === 0) {
    return RefundPreference.NO_PREFERENCE;
  }
  return RefundPreference.NO_PREFERENCE;
}

/**
 * Submit a CONSUMPTION_REQUEST response to Apple. Returns true on
 * success, false on failure. Never throws — caller decides how to
 * surface the outcome.
 */
export async function respondToConsumptionRequest(args: {
  originalTransactionId: string;
  userId: string | null;
  environment: AppleIapEnvironment | null;
  appAccountToken: string | null;
}): Promise<{ ok: boolean; reason?: string; status?: ConsumptionStatus; preference?: RefundPreference }> {
  const apiClient = getAppleClient();
  if (!apiClient) {
    return { ok: false, reason: "Apple IAP API not configured" };
  }

  let payload: ConsumptionRequest;

  if (args.userId) {
    const stats = await gatherUsageStats(args.userId);
    if (!stats) {
      // user disappeared between webhook and now
      payload = orphanPayload(args.appAccountToken);
    } else {
      const consumptionStatus = pickConsumptionStatus(stats);
      const refundPreference = pickRefundPreference(stats);

      payload = {
        customerConsented: true,
        consumptionStatus,
        platform: Platform.APPLE,
        sampleContentProvided: false,
        deliveryStatus: DeliveryStatus.DELIVERED_AND_WORKING_PROPERLY,
        appAccountToken: args.appAccountToken ?? args.userId,
        accountTenure: bucketAccountTenure(new Date(Date.now() - stats.daysSinceCreated * DAY_MS)),
        playTime: bucketPlayTime(stats.totalDriveMinutes),
        // We don't track lifetime dollars precisely yet — undeclared is honest.
        lifetimeDollarsRefunded: LifetimeDollarsRefunded.UNDECLARED,
        lifetimeDollarsPurchased: LifetimeDollarsPurchased.UNDECLARED,
        userStatus: stats.hasRecentActivity ? UserStatus.ACTIVE : UserStatus.UNDECLARED,
        refundPreference,
      };
    }
  } else {
    payload = orphanPayload(args.appAccountToken);
  }

  // Submission with env fallback. Apple's API rejects with 404 when
  // the transaction lives in a different environment to the client.
  // We try the env hint first, then the other one. Mirrors the
  // fetchTransactionWithEnvFallback pattern that fixed validate +
  // reprocess earlier.
  const tryOrder: AppleIapEnvironment[] = args.environment
    ? [args.environment, args.environment === "production" ? "sandbox" : "production"]
    : ["production", "sandbox"];

  let lastError: { httpStatusCode?: number; apiError?: unknown; message: string } | null = null;
  for (const env of tryOrder) {
    const client = getAppleClientForEnv(env);
    if (!client) continue;
    try {
      await client.sendConsumptionData(args.originalTransactionId, payload);
      logEvent("billing.apple_consumption_responded", args.userId, {
        originalTransactionId: args.originalTransactionId,
        environment: env,
        consumptionStatus: payload.consumptionStatus ?? null,
        refundPreference: payload.refundPreference ?? null,
        orphan: !args.userId,
      });
      return {
        ok: true,
        status: payload.consumptionStatus as ConsumptionStatus | undefined,
        preference: payload.refundPreference as RefundPreference | undefined,
      };
    } catch (err) {
      const apiErr = err instanceof APIException ? err : null;
      lastError = {
        httpStatusCode: apiErr?.httpStatusCode,
        apiError: apiErr?.apiError,
        message:
          apiErr?.errorMessage ??
          (err instanceof Error ? err.message : String(err)) ??
          "unknown",
      };
      // 404 = wrong-env. Continue to try the next env. Anything else
      // (400/401/etc) is a payload or auth problem; bail out so we
      // don't retry pointlessly.
      if (apiErr?.httpStatusCode !== 404) break;
    }
  }

  logEvent("billing.apple_consumption_failed", args.userId, {
    originalTransactionId: args.originalTransactionId,
    httpStatusCode: lastError?.httpStatusCode ?? null,
    apiError: lastError?.apiError ?? null,
    error: lastError?.message ?? "unknown",
  });

  return {
    ok: false,
    reason: lastError
      ? `${lastError.httpStatusCode ?? "?"} ${lastError.message}`
      : "unknown",
  };
}

function orphanPayload(appAccountToken: string | null): ConsumptionRequest {
  // Apple validates appAccountToken as 'a valid UUID or an empty string'.
  // undefined / null both fail validation with apiError 4000033, so we
  // pass empty string when we don't have one.
  return {
    customerConsented: false,
    consumptionStatus: ConsumptionStatus.UNDECLARED,
    platform: Platform.APPLE,
    sampleContentProvided: false,
    deliveryStatus: DeliveryStatus.DELIVERED_AND_WORKING_PROPERLY,
    appAccountToken: appAccountToken ?? "",
    accountTenure: AccountTenure.UNDECLARED,
    playTime: PlayTime.UNDECLARED,
    lifetimeDollarsRefunded: LifetimeDollarsRefunded.UNDECLARED,
    lifetimeDollarsPurchased: LifetimeDollarsPurchased.UNDECLARED,
    userStatus: UserStatus.UNDECLARED,
    refundPreference: RefundPreference.NO_PREFERENCE,
  };
}
