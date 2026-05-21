#!/usr/bin/env node
/**
 * Register the MileClear slash commands with Discord.
 *
 * Uses guild-scoped commands so they appear instantly (global commands
 * can take up to an hour to propagate). Once we expand beyond a single
 * server we'd switch to global.
 *
 * Idempotent: Discord's bulk-overwrite endpoint replaces the whole
 * command set in one call. Re-run safely whenever this file changes.
 *
 * Env vars (required, read from .env):
 *   DISCORD_BOT_TOKEN
 *   DISCORD_GUILD_ID
 *
 * Application ID is derived from the bot token (Discord encodes it in
 * the first segment) so no separate env var needed.
 *
 * Usage:
 *   node scripts/discord-register-commands.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
if (!TOKEN || !GUILD_ID) {
  console.error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID required");
  process.exit(2);
}

/**
 * Extract the application ID from a bot token. Discord encodes it as
 * the base64-decoded first segment of the token. Saves needing a
 * separate env var.
 */
function applicationIdFromToken(token) {
  const firstSegment = token.split(".")[0];
  return Buffer.from(firstSegment, "base64").toString("utf8");
}

const APP_ID = applicationIdFromToken(TOKEN);

// Application-command type 1 = CHAT_INPUT (regular slash command).
// Each command needs a name (≤32 chars, lowercase, no spaces) +
// description (1-100 chars). No options here — all four commands are
// arg-less. Adding options later is non-breaking.
const COMMANDS = [
  {
    name: "miles",
    description: "Your business miles this tax year + AMAP deduction",
    type: 1,
  },
  {
    name: "tax",
    description: "Live HMRC tax estimate and this week's set-aside",
    type: 1,
  },
  {
    name: "streak",
    description: "Your current streak, longest streak, and personal records",
    type: 1,
  },
  {
    name: "savings",
    description: "How much tax MileClear has saved you this year",
    type: 1,
  },
  {
    name: "expense",
    description: "Can I claim this on tax?",
    type: 1,
    options: [
      {
        name: "item",
        description: "What you spent money on (e.g. parking, phone bill, accountant)",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "deadline",
    description: "The next 3 HMRC deadlines with countdowns",
    type: 1,
  },
  {
    name: "find",
    description: "Search the MileClear tax tip bank",
    type: 1,
    options: [
      {
        name: "query",
        description: "Topic or keyword to search for (e.g. pension, mileage, deadline)",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "leaderboard",
    description: "This week's top drivers by business miles (anonymised)",
    type: 1,
  },
  {
    name: "stats",
    description: "Community benchmark for a platform (Uber, Deliveroo, etc.)",
    type: 1,
    options: [
      {
        name: "platform",
        description: "Platform name (uber, deliveroo, just_eat, amazon_flex, etc.)",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "help",
    description: "What MileClear's slash commands do",
    type: 1,
  },
];

async function main() {
  const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`;
  console.log(`Registering ${COMMANDS.length} slash commands…`);
  const res = await fetch(url, {
    method: "PUT", // bulk overwrite — replaces all guild commands
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMANDS),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Discord rejected: ${res.status}\n${text}`);
    process.exit(1);
  }
  const registered = await res.json();
  console.log(`✓ Registered ${registered.length} commands:`);
  for (const cmd of registered) {
    console.log(`  /${cmd.name} — ${cmd.description}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
