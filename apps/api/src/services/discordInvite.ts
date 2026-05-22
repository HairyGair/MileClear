// One-shot Discord invite blast (22 May 2026).
//
// We just opened a Discord community for MileClear users. This service
// sends a single targeted push notification to each eligible user
// inviting them in. Used by scripts/send-discord-invite.mjs as a
// manual broadcast rather than a recurring cron — once a user has
// been pinged (logged via the `discord_invite_sent` appEvent), they
// never get pinged again, so re-running the script is safe.
//
// Eligibility:
//   - Has an Expo push token (can actually receive notifications)
//   - Has NOT already linked their Discord account (discordUserId null)
//   - Has NOT already been sent the invite push (no prior
//     discord_invite_sent appEvent)
//   - Has marketingEmailsEnabled = true. PECR soft-opt-in covers the
//     legal angle, but this respects users who've explicitly opted out
//     of all non-essential outreach.
//
// Rate limiting:
//   - Batches of 50, then sleep 1 second between batches
//   - Caps the daily blast at 500 users so unattended runs can't
//     accidentally spam the entire base in one go
//   - Runs only between 11:00-19:00 UK local time unless `force=true`
//     is passed. Push notifications outside daylight hours generate
//     disproportionate unsubscribes.

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { logEvent } from "./appEvents.js";

const NOTIFICATION_TITLE = "I just opened a Discord";
const NOTIFICATION_BODY =
  "A space for MileClear drivers to swap tax tips, fuel deals, and HMRC questions. Quiet for now - help me fill it with the right people.";
const NOTIFICATION_ACTION = "open_community";

const BATCH_SIZE = 50;
const SLEEP_BETWEEN_BATCHES_MS = 1000;
const DEFAULT_DAILY_CAP = 500;

const DAYLIGHT_START_HOUR_UK = 11;
const DAYLIGHT_END_HOUR_UK = 19;

export interface DiscordInviteResult {
  attempted: number;
  sent: number;
  failed: number;
  skippedAlreadySent: number;
  remainingEligible: number;
  startedAt: string;
  finishedAt: string;
}

interface RunArgs {
  /** Skip the daylight-hours guard. Use only for testing. */
  force?: boolean;
  /** Override the per-run cap. Defaults to 500. */
  maxUsers?: number;
  /** Dry-run: count eligible users + don't actually send pushes. */
  dryRun?: boolean;
}

function isWithinUkDaylightWindow(): boolean {
  const ukHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/London",
    }).format(new Date())
  );
  return ukHour >= DAYLIGHT_START_HOUR_UK && ukHour < DAYLIGHT_END_HOUR_UK;
}

/**
 * Send the Discord invite push to every eligible user (subject to the
 * cap + dedup). Idempotent — re-running is safe because we log
 * `discord_invite_sent` per user and skip them next time.
 */
export async function sendDiscordInviteOneShot(
  args: RunArgs = {}
): Promise<DiscordInviteResult> {
  const startedAt = new Date();
  const cap = args.maxUsers ?? DEFAULT_DAILY_CAP;

  if (!args.force && !isWithinUkDaylightWindow()) {
    throw new Error(
      `Outside UK daylight window (${DAYLIGHT_START_HOUR_UK}:00-${DAYLIGHT_END_HOUR_UK}:00). Re-run during the day or pass force=true.`
    );
  }

  // Fetch IDs of users who've already been pinged. We can't add an
  // appEvent join filter in a Prisma `findMany.where`, so we do a
  // lightweight pre-query and exclude. Cheap because it's just IDs.
  const alreadySent = await prisma.appEvent.findMany({
    where: { type: "discord_invite_sent" },
    select: { userId: true },
  });
  const sentUserIds = new Set(
    alreadySent.map((e) => e.userId).filter((id): id is string => !!id)
  );

  const eligible = await prisma.user.findMany({
    where: {
      pushToken: { not: null },
      discordUserId: null,
      marketingEmailsEnabled: true,
      id: { notIn: Array.from(sentUserIds) },
    },
    select: { id: true, pushToken: true, displayName: true },
    orderBy: { createdAt: "asc" }, // oldest users first
    take: cap,
  });

  if (eligible.length === 0 || args.dryRun) {
    const finishedAt = new Date();
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      skippedAlreadySent: sentUserIds.size,
      remainingEligible: eligible.length,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const messages: ExpoPushMessage[] = batch
      .filter((u) => u.pushToken)
      .map((u) => ({
        to: u.pushToken!,
        title: NOTIFICATION_TITLE,
        body: NOTIFICATION_BODY,
        sound: "default",
        priority: "high",
        data: { action: NOTIFICATION_ACTION },
      }));

    const tickets = await sendPushNotifications(messages);

    // Mark each user as pinged, regardless of ticket status. Expo
    // returning "error" usually means the token's stale (user
    // uninstalled), in which case re-sending tomorrow won't help.
    // Better to record the attempt than retry indefinitely.
    for (let j = 0; j < batch.length; j++) {
      const user = batch[j];
      const ticket = tickets[j];
      const ok = ticket?.status === "ok";
      if (ok) sent++;
      else failed++;
      logEvent("discord_invite_sent", user.id, {
        ticketStatus: ticket?.status ?? "unknown",
        ticketError: ticket?.details?.error ?? null,
      });
    }

    // Throttle between batches so we don't hammer Expo's gateway.
    if (i + BATCH_SIZE < eligible.length) {
      await new Promise((r) => setTimeout(r, SLEEP_BETWEEN_BATCHES_MS));
    }
  }

  const finishedAt = new Date();
  return {
    attempted: eligible.length,
    sent,
    failed,
    skippedAlreadySent: sentUserIds.size,
    remainingEligible: 0, // capped at `cap`; remainder picked up next run
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
}

/** Dry-run: how many users WOULD be pinged on the next call. */
export async function previewDiscordInviteRecipients(
  cap: number = DEFAULT_DAILY_CAP
): Promise<{
  eligible: number;
  alreadySent: number;
  cap: number;
  withinDaylight: boolean;
}> {
  const alreadySent = await prisma.appEvent.count({
    where: { type: "discord_invite_sent" },
  });
  const eligible = await prisma.user.count({
    where: {
      pushToken: { not: null },
      discordUserId: null,
      marketingEmailsEnabled: true,
      appEvents: {
        none: { type: "discord_invite_sent" },
      },
    },
  });
  return {
    eligible: Math.min(eligible, cap),
    alreadySent,
    cap,
    withinDaylight: isWithinUkDaylightWindow(),
  };
}
