#!/usr/bin/env node
/**
 * Bootstrap the MileClear Discord server.
 *
 * Creates all roles, category sections, channels, and category-level
 * permission overwrites in one run. Idempotent — skips roles and
 * channels that already exist by name, so re-running is safe.
 *
 * Source of truth: docs/discord-server-setup.md.
 *
 * Requirements:
 *   - Node 18+ (uses native fetch)
 *   - DISCORD_BOT_TOKEN env var: bot token from the Developer Portal
 *   - DISCORD_GUILD_ID env var: server ID (Discord Settings →
 *     Advanced → Developer Mode, right-click server icon → Copy
 *     Server ID)
 *   - The bot must already be in the server with Administrator
 *     permission (OAuth2 invite)
 *
 * Usage:
 *   # one-shot:
 *   DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/discord-bootstrap.mjs
 *
 *   # or, with the vars in .env:
 *   node scripts/discord-bootstrap.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ── env loader ──────────────────────────────────────────────────────
// Tiny dotenv replacement so the script works without a dep. Only
// honours lines of the form KEY=VALUE — no quoting, no expansion. The
// process env takes precedence so command-line vars override .env.
function loadEnv() {
  const envPath = resolve(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    if (!(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}
loadEnv();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
if (!TOKEN) {
  console.error("DISCORD_BOT_TOKEN is missing. Add it to .env or pass on the command line.");
  process.exit(2);
}
if (!GUILD_ID) {
  console.error("DISCORD_GUILD_ID is missing. Enable Developer Mode in Discord settings, right-click the server icon, Copy Server ID, then add to .env as DISCORD_GUILD_ID=...");
  process.exit(2);
}

// ── Discord REST helpers ─────────────────────────────────────────────
const API = "https://discord.com/api/v10";

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  // Honour 429 rate-limit responses transparently.
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const retry = body.retry_after ?? 1;
    console.log(`  ⏳ rate-limited, sleeping ${retry}s`);
    await new Promise((r) => setTimeout(r, retry * 1000));
    return api(path, init);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `${init.method ?? "GET"} ${path} → ${res.status}\n${text}`
    );
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Spec ─────────────────────────────────────────────────────────────
// All numbers are bitfield positions for Discord permissions. We only
// need two of them: VIEW_CHANNEL (1 << 10) and SEND_MESSAGES (1 << 11).
const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;

const ROLES = [
  { name: "Founder", color: 0xfbbf24, hoist: true, mentionable: false },
  { name: "Mod", color: 0xf59e0b, hoist: true, mentionable: true },
  { name: "Pro Member", color: 0xfcd34d, hoist: true, mentionable: true },
  { name: "TestFlight Tester", color: 0x38bdf8, hoist: true, mentionable: true },
  { name: "Sole Trader", color: 0xa78bfa, hoist: false, mentionable: true },
  { name: "Gig Driver", color: 0xfb7185, hoist: false, mentionable: true },
  { name: "PAYE Driver", color: 0x7dd3fc, hoist: false, mentionable: true },
];

// perms options:
//   readOnly         - @everyone can view but not send (Information)
//   hideFromEveryone - @everyone denied VIEW; unlockForRoles allowed
//   unlockForRoles   - role names that get VIEW back when hidden
const TREE = [
  {
    category: "📍 Information",
    perms: { readOnly: true },
    channels: [
      { name: "welcome", topic: "Start here — pick your driver type and grab a role." },
      { name: "announcements", topic: "MileClear news, releases, App Store updates." },
      { name: "whats-new", topic: "Build notes and changelog. Subscribed to release pings." },
      { name: "rules", topic: "Be kind. Be helpful. No spam. Full rules pinned." },
    ],
  },
  {
    category: "💬 General",
    perms: {},
    channels: [
      { name: "general", topic: "All-purpose chat for MileClear drivers." },
      { name: "wins", topic: "Milestones, big tax refunds, streaks. Show off.", rateLimit: 30 },
      { name: "introductions", topic: "New here? Say hi. Tell us what you drive." },
    ],
  },
  {
    category: "🛟 Support",
    perms: {},
    channels: [
      { name: "help", topic: "Stuck? Ask here. Search first — your answer might already be pinned.", rateLimit: 10 },
      { name: "bugs-and-feedback", topic: "Found a bug or have an idea? Drop it here. We read all of them." },
    ],
  },
  {
    category: "🧾 Tax & HMRC",
    perms: {},
    channels: [
      { name: "tax-and-hmrc", topic: "Self Assessment, deadlines, allowable expenses — the gnarly bits HMRC won't explain." },
      { name: "first-self-assessment", topic: "First time filing? You're not alone. Walk-through and peer support." },
    ],
  },
  {
    category: "🚗 By Driver Type",
    perms: {},
    channels: [
      { name: "gig-drivers", topic: "Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD, Yodel, Evri — platforms, blocks, tips." },
      { name: "sole-traders", topic: "Invoices, accountants, sole-trader life." },
      { name: "paye-drivers", topic: "Claiming mileage back from your employer. Mileage Allowance Relief, P87, employer rates." },
    ],
  },
  {
    category: "💎 Pro Lounge",
    perms: { hideFromEveryone: true, unlockForRoles: ["Pro Member", "Mod", "Founder"] },
    channels: [
      { name: "pro-lounge", topic: "Pro members only. Early access, deeper feedback loop with Anthony." },
      { name: "pro-help", topic: "Pro tier? Drop your question here for priority help." },
    ],
  },
  {
    category: "🧪 Beta Testers",
    perms: { hideFromEveryone: true, unlockForRoles: ["TestFlight Tester", "Mod", "Founder"] },
    channels: [
      { name: "testflight", topic: "TestFlight beta build chat. Link: https://testflight.apple.com/join/SGrmnaaH" },
      { name: "beta-feedback", topic: "Structured feedback on the latest build. Pinned template." },
    ],
  },
  {
    category: "🔧 Staff",
    perms: { hideFromEveryone: true, unlockForRoles: ["Mod", "Founder"] },
    channels: [
      { name: "mod-chat", topic: "Mods + founder coordination." },
      { name: "bot-logs", topic: "Bot activity, webhook events, moderation logs." },
    ],
  },
];

// ── Bootstrap ────────────────────────────────────────────────────────
async function main() {
  console.log(`Bootstrapping MileClear Discord (guild ${GUILD_ID})…\n`);

  // Existing state — used for idempotency.
  const existingRoles = await api(`/guilds/${GUILD_ID}/roles`);
  const existingChannels = await api(`/guilds/${GUILD_ID}/channels`);
  const rolesByName = new Map(existingRoles.map((r) => [r.name, r]));
  const channelsByName = new Map(existingChannels.map((c) => [c.name, c]));

  // ── Roles ─────────────────────────────────────────────────────────
  console.log("── Roles ──");
  for (const role of ROLES) {
    if (rolesByName.has(role.name)) {
      console.log(`  skip ${role.name} (exists)`);
      continue;
    }
    const created = await api(`/guilds/${GUILD_ID}/roles`, {
      method: "POST",
      body: JSON.stringify(role),
    });
    rolesByName.set(role.name, created);
    console.log(`  + ${role.name}`);
  }

  // @everyone role's ID is identical to the guild ID by Discord
  // convention.
  const everyoneId = GUILD_ID;

  // ── Categories + channels ─────────────────────────────────────────
  console.log("\n── Categories + channels ──");
  for (const { category, perms, channels } of TREE) {
    // Compute permission_overwrites for the category from the perms spec
    const overwrites = [];
    if (perms.hideFromEveryone) {
      overwrites.push({
        id: everyoneId,
        type: 0,
        deny: VIEW_CHANNEL.toString(),
      });
      for (const roleName of perms.unlockForRoles ?? []) {
        const r = rolesByName.get(roleName);
        if (!r) {
          console.warn(`  ⚠ role "${roleName}" not found; can't unlock ${category}`);
          continue;
        }
        overwrites.push({
          id: r.id,
          type: 0,
          allow: VIEW_CHANNEL.toString(),
        });
      }
    }
    if (perms.readOnly) {
      overwrites.push({
        id: everyoneId,
        type: 0,
        deny: SEND_MESSAGES.toString(),
      });
    }

    // Create or update the category. Discord stores categories as
    // channels with type=4.
    let categoryChannel = channelsByName.get(category);
    if (!categoryChannel) {
      categoryChannel = await api(`/guilds/${GUILD_ID}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: category,
          type: 4,
          permission_overwrites: overwrites,
        }),
      });
      channelsByName.set(category, categoryChannel);
      console.log(`  + ${category}`);
    } else {
      await api(`/channels/${categoryChannel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ permission_overwrites: overwrites }),
      });
      console.log(`  ~ ${category} (perms refreshed)`);
    }

    // Channels inside the category. Type 0 = GUILD_TEXT. Permission
    // overwrites cascade from the category, so we don't repeat them
    // here.
    for (const ch of channels) {
      if (channelsByName.has(ch.name)) {
        console.log(`    skip #${ch.name} (exists)`);
        continue;
      }
      const body = {
        name: ch.name,
        type: 0,
        topic: ch.topic,
        parent_id: categoryChannel.id,
      };
      if (ch.rateLimit) body.rate_limit_per_user = ch.rateLimit;
      const created = await api(`/guilds/${GUILD_ID}/channels`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      channelsByName.set(ch.name, created);
      console.log(`    + #${ch.name}`);
    }
  }

  // ── Final manual steps ───────────────────────────────────────────
  console.log("\n✅ Done!\n");
  console.log("Manual finishing touches (the bot can't safely do these):");
  console.log("");
  console.log("  1. Server Settings → Roles. Drag this order (top → bottom):");
  console.log("       Founder");
  console.log("       Mod");
  console.log("       MileClear  (the bot's own role)");
  console.log("       Pro Member");
  console.log("       TestFlight Tester");
  console.log("       Sole Trader");
  console.log("       Gig Driver");
  console.log("       PAYE Driver");
  console.log("       @everyone");
  console.log("");
  console.log("  2. Pin the welcome post in #welcome (copy from docs/discord-server-setup.md).");
  console.log("  3. Pin the rules in #rules (copy from the same doc).");
  console.log("  4. Invite Carl-bot (https://carl.gg) for reaction roles + auto-greeter.");
  console.log("  5. Enable Community Server in Server Settings → Enable Community once you hit 10+ members.");
}

main().catch((err) => {
  console.error("\n❌ Bootstrap failed:");
  console.error(err.message ?? err);
  process.exit(1);
});
