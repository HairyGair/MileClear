#!/usr/bin/env node
/**
 * One-shot Discord invite blast. Sends a push to every eligible user
 * who hasn't been pinged yet, capped at 500 per run.
 *
 * Usage on the prod server:
 *   cd ~/mileclear-app
 *   node scripts/send-discord-invite.mjs            # default run
 *   node scripts/send-discord-invite.mjs --dry-run  # count only, no sends
 *   node scripts/send-discord-invite.mjs --force    # skip daylight check
 *   node scripts/send-discord-invite.mjs --max=50   # smaller batch for testing
 *
 * The service tracks dedup via the `discord_invite_sent` appEvent —
 * re-running is always safe; previously-pinged users are skipped.
 */
import "dotenv/config";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("--dryrun");
const force = args.has("--force");
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const maxUsers = maxArg ? parseInt(maxArg.split("=")[1], 10) : undefined;

const {
  sendDiscordInviteOneShot,
  previewDiscordInviteRecipients,
} = await import("../apps/api/dist/services/discordInvite.js");

console.log("── Preview ─────────────────────────────────");
const preview = await previewDiscordInviteRecipients(maxUsers ?? 500);
console.log(JSON.stringify(preview, null, 2));

if (dryRun) {
  console.log("\nDry run — no pushes sent.");
  process.exit(0);
}

if (preview.eligible === 0) {
  console.log("\nNo eligible users. Either everyone's been pinged already, or no one matches the filter.");
  process.exit(0);
}

if (!preview.withinDaylight && !force) {
  console.error(
    "\nOutside UK daylight hours (11:00-19:00). Re-run during the day or pass --force."
  );
  process.exit(1);
}

console.log(`\nSending invite to up to ${preview.eligible} users…`);
const result = await sendDiscordInviteOneShot({ force, maxUsers });
console.log("\n── Result ──────────────────────────────────");
console.log(JSON.stringify(result, null, 2));
