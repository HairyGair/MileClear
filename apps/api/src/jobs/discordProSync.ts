// Daily Pro Member role sync for the MileClear Discord server.
//
// Walks every user with a linked Discord account and reconciles their
// Pro Member role against the source of truth (User.isPremium +
// premiumExpiresAt). Grants the role when a subscription becomes
// active, revokes it when it lapses.
//
// Why a cron and not just inline updates? Subscriptions can lapse
// silently (Apple IAP expiry, Stripe cancellation processed mid-period,
// admin downgrade). A daily sweep makes the badge stay honest without
// relying on every revenue event landing exactly when it should.
//
// Defensive: silent no-op when DISCORD_BOT_TOKEN / DISCORD_GUILD_ID /
// DISCORD_PRO_ROLE_ID aren't all set, so the job is safe to schedule
// before Discord is fully configured.

import { prisma } from "../lib/prisma.js";
import { syncProMemberRole } from "../services/discordBot.js";
import { logEvent } from "../services/appEvents.js";

export async function runDiscordProSyncJob(): Promise<void> {
  // Skip if Discord isn't configured for role management. Cheaper than
  // querying the DB only to find we can't do anything with the result.
  if (
    !process.env.DISCORD_BOT_TOKEN ||
    !process.env.DISCORD_GUILD_ID ||
    !process.env.DISCORD_PRO_ROLE_ID
  ) {
    console.log("[discordProSync] Discord role config missing — skip");
    return;
  }

  const linked = await prisma.user.findMany({
    where: { discordUserId: { not: null } },
    select: {
      id: true,
      discordUserId: true,
      isPremium: true,
      premiumExpiresAt: true,
    },
  });

  if (linked.length === 0) {
    console.log("[discordProSync] no linked users to sync");
    return;
  }

  const now = new Date();
  const counts = {
    total: linked.length,
    granted: 0,
    revoked: 0,
    noop: 0,
    not_in_server: 0,
    not_configured: 0,
  };

  for (const u of linked) {
    if (!u.discordUserId) continue;
    const active =
      !!u.isPremium && (!u.premiumExpiresAt || u.premiumExpiresAt > now);
    try {
      const outcome = await syncProMemberRole({
        discordUserId: u.discordUserId,
        isPremiumActive: active,
      });
      switch (outcome) {
        case "granted":
          counts.granted += 1;
          break;
        case "revoked":
          counts.revoked += 1;
          break;
        case "noop_not_in_server":
          counts.not_in_server += 1;
          break;
        case "noop_not_configured":
          counts.not_configured += 1;
          break;
      }
    } catch (err) {
      // Per-user failure shouldn't break the rest of the sweep.
      console.warn(
        `[discordProSync] sync failed for user ${u.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[discordProSync] processed ${counts.total} linked users: ` +
      `${counts.granted} granted, ${counts.revoked} revoked, ` +
      `${counts.not_in_server} not in server`
  );

  // Audit trail — one log line per run.
  logEvent("discord.pro_sync_run", null, counts);
}
