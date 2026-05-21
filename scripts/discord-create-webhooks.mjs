#!/usr/bin/env node
/**
 * Create the five MileClear channel webhooks via the bot API.
 *
 * Runs once. For each of #whats-new / #announcements / #wins / #bot-logs
 * / #mod-chat, creates a webhook named "MileClear" with bot-avatar.png
 * as the avatar. Prints the resulting URLs in a copy-pasteable .env
 * block.
 *
 * Idempotent: if a webhook named "MileClear" already exists in the
 * target channel, reuses it instead of creating a duplicate.
 *
 * Env vars (required, read from .env):
 *   DISCORD_BOT_TOKEN
 *   DISCORD_GUILD_ID
 *
 * Usage:
 *   node scripts/discord-create-webhooks.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Tiny dotenv replacement, matches discord-bootstrap.mjs.
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
  console.error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be set in .env");
  process.exit(2);
}

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
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    await new Promise((r) => setTimeout(r, (body.retry_after ?? 1) * 1000));
    return api(path, init);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}\n${text}`);
  }
  return res.json();
}

// Channel-name → env-var mapping. Matches the names created by the
// bootstrap script + the env-var names the api server reads in
// services/discord.ts.
const CHANNEL_TO_ENV = {
  "whats-new": "DISCORD_WEBHOOK_WHATSNEW",
  announcements: "DISCORD_WEBHOOK_ANNOUNCEMENTS",
  wins: "DISCORD_WEBHOOK_WINS",
  "bot-logs": "DISCORD_WEBHOOK_BOTLOGS",
  "mod-chat": "DISCORD_WEBHOOK_MODCHAT",
};

async function main() {
  // Load the bot avatar as base64 data URI for the webhook avatar field.
  const avatarPath = resolve(
    REPO_ROOT,
    "apps/mobile/assets/branding/bot-avatar.png"
  );
  let avatarDataUri;
  if (existsSync(avatarPath)) {
    const b64 = readFileSync(avatarPath).toString("base64");
    avatarDataUri = `data:image/png;base64,${b64}`;
  } else {
    console.warn(`  ⚠ ${avatarPath} not found — webhooks will use default avatar`);
  }

  // Fetch channels in the guild so we can map names → IDs.
  const channels = await api(`/guilds/${GUILD_ID}/channels`);
  const byName = new Map(channels.map((c) => [c.name, c]));

  const results = [];
  for (const [name, envVar] of Object.entries(CHANNEL_TO_ENV)) {
    const channel = byName.get(name);
    if (!channel) {
      console.error(`  ✗ #${name} not found in guild`);
      continue;
    }

    // Reuse existing "MileClear" webhook if one's already there.
    const existing = await api(`/channels/${channel.id}/webhooks`);
    let webhook = existing.find((w) => w.name === "MileClear");
    if (webhook) {
      console.log(`  ↪ #${name}: reusing existing webhook`);
    } else {
      const body = { name: "MileClear" };
      if (avatarDataUri) body.avatar = avatarDataUri;
      webhook = await api(`/channels/${channel.id}/webhooks`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      console.log(`  + #${name}: created webhook`);
    }
    // Webhook URL format: https://discord.com/api/webhooks/{id}/{token}
    const url = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
    results.push({ name, envVar, url });
  }

  console.log("\n── Copy this block into .env (local + prod) ──\n");
  for (const r of results) {
    console.log(`${r.envVar}=${r.url}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
