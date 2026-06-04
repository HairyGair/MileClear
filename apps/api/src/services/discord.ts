// Outbound Discord posts via channel webhooks. Used for community
// notifications (new App Store reviews, new Pro signups), build/deploy
// announcements, and oncall alerts.
//
// Design choices:
//   - Channel-scoped webhook URLs (one per target channel), stored in
//     env. Webhooks are URL-only — no bot token needed for sending,
//     and a leaked webhook URL only lets the attacker POST to that one
//     channel (not act as the bot).
//   - Defensive: a missing env var or a failing POST never throws to
//     the caller. Discord posts are nice-to-have telemetry, never on
//     the critical path of user actions. Log failures, move on.
//   - No client SDK — discord.com/api accepts a plain JSON POST.

/**
 * Logical channel names this service knows how to post to. Each maps
 * to a Discord webhook URL via the corresponding env var. New channels
 * land here, then in {@link channelWebhookUrl}, then a webhook is
 * created in Discord (Channel → Integrations → Webhooks).
 */
export type DiscordChannel =
  | "whatsNew" // #whats-new — build/release notes
  | "announcements" // #announcements — public-facing news (App Store reviews, big milestones)
  | "wins" // #wins — opt-in celebration channel
  | "botLogs" // #bot-logs — server-side event log
  | "modChat" // #mod-chat — actionable moderation alerts (abuse, spam, ToS)
  | "founder" // #founder — oncall/founder-only telemetry (watchdog, IAP orphans, payment fails)
  | "taxTips" // #tax-and-hmrc — daily tip-of-the-day cron
  | "tripReports" // #trip-reports — user "missing a trip?" reports (falls back to #founder)
;

function channelWebhookUrl(channel: DiscordChannel): string | null {
  switch (channel) {
    case "whatsNew":
      return process.env.DISCORD_WEBHOOK_WHATSNEW || null;
    case "announcements":
      return process.env.DISCORD_WEBHOOK_ANNOUNCEMENTS || null;
    case "wins":
      return process.env.DISCORD_WEBHOOK_WINS || null;
    case "botLogs":
      return process.env.DISCORD_WEBHOOK_BOTLOGS || null;
    case "modChat":
      return process.env.DISCORD_WEBHOOK_MODCHAT || null;
    case "founder":
      // Falls back to the mod-chat webhook if the founder channel
      // isn't configured yet, so the oncall signal still lands
      // somewhere visible until a private founder channel exists.
      return process.env.DISCORD_WEBHOOK_FOUNDER || process.env.DISCORD_WEBHOOK_MODCHAT || null;
    case "taxTips":
      return process.env.DISCORD_WEBHOOK_TAXTIPS || null;
    case "tripReports":
      // Falls back to #founder (then #mod-chat) until a dedicated
      // #trip-reports channel + webhook exists, so user reports always land
      // somewhere the team sees them.
      return (
        process.env.DISCORD_WEBHOOK_TRIPREPORTS ||
        process.env.DISCORD_WEBHOOK_FOUNDER ||
        process.env.DISCORD_WEBHOOK_MODCHAT ||
        null
      );
  }
}

/**
 * Optional embed fields. Discord supports much more than this; we
 * expose the bits we actually use. Reach for `embed` when the post
 * needs structure (title, link, fields) — plain content for everything
 * else. The two render very differently in Discord.
 */
export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // decimal RGB, e.g. 0xfbbf24 = amber
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string; // ISO8601
}

export interface PostOptions {
  /** Plain message body (Markdown supported). */
  content?: string;
  /** Optional rich embeds — up to 10 per message. */
  embeds?: DiscordEmbed[];
  /** Override the webhook's default username on this post only. */
  username?: string;
  /** Override the webhook's default avatar on this post only. */
  avatarUrl?: string;
  /** Suppress @everyone, @here, and role mentions even if present in content. */
  suppressMentions?: boolean;
}

/**
 * Post a message to a known Discord channel. Returns `true` if the
 * post landed, `false` if it was skipped (no webhook configured) or
 * failed. Never throws — Discord posts are best-effort by design.
 *
 * Example:
 *   await postToChannel("botLogs", { content: "Pro signup: " + email });
 *
 *   await postToChannel("announcements", {
 *     embeds: [{
 *       title: "New 5★ review",
 *       description: "Genuinely the best mileage app I've used…",
 *       color: 0xfbbf24,
 *     }],
 *   });
 */
export async function postToChannel(
  channel: DiscordChannel,
  options: PostOptions
): Promise<boolean> {
  const url = channelWebhookUrl(channel);
  if (!url) {
    // Silent skip — no webhook configured for this channel.
    return false;
  }

  const body: Record<string, unknown> = {};
  if (options.content) body.content = options.content;
  if (options.embeds && options.embeds.length > 0) body.embeds = options.embeds;
  if (options.username) body.username = options.username;
  if (options.avatarUrl) body.avatar_url = options.avatarUrl;
  if (options.suppressMentions) {
    body.allowed_mentions = { parse: [] };
  }

  if (!body.content && !body.embeds) {
    console.warn("[discord] postToChannel called with no content or embeds");
    return false;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[discord] ${channel} webhook returned ${res.status}: ${text.slice(0, 200)}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[discord] ${channel} post failed:`, err);
    return false;
  }
}

// ── Pre-shaped helpers ─────────────────────────────────────────────
// Convenience wrappers for the most common posts. Centralise the
// formatting + colour conventions so every "new Pro signup" message
// reads the same.

const COLOUR_AMBER = 0xfbbf24;
const COLOUR_EMERALD = 0x10b981;
const COLOUR_SKY = 0x38bdf8;
const COLOUR_RED = 0xef4444;

/**
 * Celebrate a new Pro subscription. Goes to #bot-logs by default — set
 * `loud=true` to broadcast to #wins instead, once the public audience
 * is comfortable seeing IAP signups.
 */
export async function postProSignup(args: {
  source: "apple_iap" | "stripe";
  amountPence: number;
  productId?: string;
  loud?: boolean;
}): Promise<void> {
  const amountGbp = (args.amountPence / 100).toFixed(2);
  const platform = args.source === "apple_iap" ? "Apple IAP" : "Stripe";
  await postToChannel(args.loud ? "wins" : "botLogs", {
    embeds: [
      {
        title: "New Pro signup 🎉",
        description: `${platform} · £${amountGbp}${args.productId ? ` · ${args.productId}` : ""}`,
        color: COLOUR_EMERALD,
        timestamp: new Date().toISOString(),
      },
    ],
    suppressMentions: true,
  });
}

/**
 * Announce a new build OTA / TestFlight / App Store release.
 */
export async function postBuildAnnouncement(args: {
  version: string; // "1.2.0"
  buildNumber?: number;
  channel: "ota" | "testflight" | "appstore";
  notes?: string;
  url?: string;
}): Promise<void> {
  const labels = {
    ota: "OTA update",
    testflight: "TestFlight build",
    appstore: "App Store release",
  } as const;
  const title = `${labels[args.channel]}: ${args.version}${args.buildNumber ? ` (${args.buildNumber})` : ""}`;
  await postToChannel("whatsNew", {
    embeds: [
      {
        title,
        description: args.notes,
        url: args.url,
        color: args.channel === "appstore" ? COLOUR_AMBER : COLOUR_SKY,
        timestamp: new Date().toISOString(),
      },
    ],
    suppressMentions: true,
  });
}

/**
 * Surface a new App Store review. First line trimmed to keep the post
 * scannable; full content lives behind the link if there is one.
 */
export async function postAppStoreReview(args: {
  rating: number; // 1-5
  title?: string;
  body: string;
  reviewer?: string;
  reviewUrl?: string;
}): Promise<void> {
  const stars = "★".repeat(args.rating) + "☆".repeat(5 - args.rating);
  const firstLine = args.body.split("\n")[0].slice(0, 280);
  await postToChannel("announcements", {
    embeds: [
      {
        title: `${stars} ${args.title ?? "New review"}`,
        description: firstLine + (args.body.length > 280 ? "…" : ""),
        url: args.reviewUrl,
        color: args.rating >= 4 ? COLOUR_AMBER : COLOUR_RED,
        footer: args.reviewer ? { text: `— ${args.reviewer}` } : undefined,
        timestamp: new Date().toISOString(),
      },
    ],
    suppressMentions: true,
  });
}

/**
 * Founder-only oncall alert — pings #founder (falls back to #mod-chat
 * if the founder webhook isn't configured yet). Used by the recording
 * watchdog, IAP orphan detection, payment-fail surfacing, and other
 * server-side telemetry that needs a human glance but is NOT actionable
 * by community mods.
 *
 * Renamed from postModAlert on 22 May 2026 after mods asked why they
 * were being pinged about things they couldn't action. Genuine mod
 * alerts (abuse reports, spam, ToS) should call postModAlert (TODO) or
 * postToChannel("modChat") directly.
 */
export async function postFounderAlert(args: {
  severity: "info" | "warning" | "critical";
  title: string;
  detail?: string;
  userId?: string;
  link?: string;
}): Promise<void> {
  const colour =
    args.severity === "critical"
      ? COLOUR_RED
      : args.severity === "warning"
        ? COLOUR_AMBER
        : COLOUR_SKY;
  const fields: DiscordEmbed["fields"] = [];
  if (args.userId) fields.push({ name: "User ID", value: args.userId, inline: true });
  await postToChannel("founder", {
    embeds: [
      {
        title: args.title,
        description: args.detail,
        url: args.link,
        color: colour,
        fields: fields.length ? fields : undefined,
        timestamp: new Date().toISOString(),
      },
    ],
    suppressMentions: true,
  });
}
