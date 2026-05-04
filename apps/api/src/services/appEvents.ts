import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// Cache user → {appVersion, buildNumber} for a short window so we don't
// hit the DB once per event. Heartbeat build values change infrequently
// (~once per app launch); a 60s cache is plenty for batched event bursts
// without serving stale data after an upgrade.
const buildCache = new Map<
  string,
  { appVersion: string | null; buildNumber: string | null; cachedAt: number }
>();
const BUILD_CACHE_TTL_MS = 60_000;

async function lookupBuild(userId: string): Promise<{
  appVersion: string | null;
  buildNumber: string | null;
}> {
  const cached = buildCache.get(userId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < BUILD_CACHE_TTL_MS) {
    return { appVersion: cached.appVersion, buildNumber: cached.buildNumber };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appVersion: true, buildNumber: true },
  });
  const result = {
    appVersion: user?.appVersion ?? null,
    buildNumber: user?.buildNumber ?? null,
  };
  buildCache.set(userId, { ...result, cachedAt: now });
  return result;
}

/**
 * Fire-and-forget event logger. Writes to the app_events table.
 * Never throws - errors are logged to console only.
 *
 * If userId is provided, the event row is enriched with the user's most
 * recent heartbeat appVersion + buildNumber so per-build regression
 * detection can attribute incidents back to the build that produced them.
 * The lookup is async + cached so it doesn't slow the calling request.
 */
export function logEvent(
  type: string,
  userId?: string | null,
  metadata?: Record<string, unknown>
): void {
  const baseData = {
    type,
    userId: userId ?? null,
    metadata: metadata
      ? (metadata as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  };

  if (!userId) {
    prisma.appEvent.create({ data: baseData }).catch((err: Error) => {
      console.error(`[appEvent] Failed to log "${type}":`, err?.message ?? err);
    });
    return;
  }

  // Async enrichment path. We don't await this from the caller (logEvent is
  // declared void / fire-and-forget), so the response isn't held up.
  lookupBuild(userId)
    .then((build) =>
      prisma.appEvent.create({
        data: { ...baseData, ...build },
      })
    )
    .catch((err: Error) => {
      console.error(`[appEvent] Failed to log "${type}":`, err?.message ?? err);
    });
}

// ── Error threshold alerting ──────────────────────────────────────────

const errorTimestamps: number[] = [];
const ERROR_THRESHOLD = 10;
const ERROR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
let lastAlertSentAt = 0;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between alerts

/**
 * Track a 500 error for threshold alerting.
 * If errors exceed ERROR_THRESHOLD in the last hour, sends an email alert.
 */
export function trackErrorForAlert(): void {
  const now = Date.now();
  errorTimestamps.push(now);

  // Prune old timestamps
  const cutoff = now - ERROR_WINDOW_MS;
  while (errorTimestamps.length > 0 && errorTimestamps[0] < cutoff) {
    errorTimestamps.shift();
  }

  // Check threshold
  if (
    errorTimestamps.length >= ERROR_THRESHOLD &&
    now - lastAlertSentAt > ALERT_COOLDOWN_MS
  ) {
    lastAlertSentAt = now;
    // Dynamic import to avoid circular dependency
    import("./email.js").then(({ sendErrorAlertEmail }) => {
      sendErrorAlertEmail(errorTimestamps.length).catch((err) =>
        console.error("[appEvent] Failed to send error alert:", err)
      );
    });
  }
}
