import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Fire-and-forget event logger. Writes to the app_events table.
 * Never throws - errors are logged to console only.
 */
export function logEvent(
  type: string,
  userId?: string | null,
  metadata?: Record<string, unknown>
): void {
  prisma.appEvent
    .create({
      data: {
        type,
        userId: userId ?? null,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    })
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
