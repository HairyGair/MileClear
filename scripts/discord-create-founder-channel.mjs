#!/usr/bin/env node
/**
 * Create a private #founder channel + webhook via the bot API.
 *
 * Why: oncall telemetry (recording watchdog silent pushes, IAP
 * orphans, payment fails) was landing in #mod-chat where mods could
 * see it but couldn't action it. This script provisions a private
 * channel that only the guild owner (Anthony) can view, plus a
 * webhook for the API server to post to. After running, paste the
 * printed DISCORD_WEBHOOK_FOUNDER line into .env and restart the API.
 *
 * Idempotent: existing #founder channel + "MileClear" webhook are
 * reused.
 *
 * Env vars (required, read from .env):
 *   DISCORD_BOT_TOKEN
 *   DISCORD_GUILD_ID
 *
 * Usage:
 *   node scripts/discord-create-founder-channel.mjs
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
  console.error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be set in .env");
  process.exit(2);
}

const API = "https://discord.com/api/v10";
const CHANNEL_NAME = "founder";

// Discord permission bitfield flags (subset we use here).
//   VIEW_CHANNEL         = 1 <<  10 = 1024
//   SEND_MESSAGES        = 1 <<  11 = 2048
//   READ_MESSAGE_HISTORY = 1 <<  16 = 65536
//   EMBED_LINKS          = 1 <<  14 = 16384
//   ATTACH_FILES         = 1 <<  15 = 32768
//   MANAGE_CHANNELS      = 1 <<   4 = 16
const VIEW_CHANNEL = 1024n;
const SEND_MESSAGES = 2048n;
const READ_MESSAGE_HISTORY = 65536n;
const EMBED_LINKS = 16384n;
const ATTACH_FILES = 32768n;
const MANAGE_CHANNELS = 16n;

const OWNER_ALLOW =
  VIEW_CHANNEL |
  SEND_MESSAGES |
  READ_MESSAGE_HISTORY |
  EMBED_LINKS |
  ATTACH_FILES |
  MANAGE_CHANNELS;
const EVERYONE_DENY = VIEW_CHANNEL;

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
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}\n${text}`);
  }
  return res.json();
}

async function main() {
  // 1. Find the guild owner (= Anthony) so we can grant view perms
  //    explicitly. The @everyone role gets denied view.
  const guild = await api(`/guilds/${GUILD_ID}`);
  const ownerId = guild.owner_id;
  if (!ownerId) {
    throw new Error("Couldn't determine guild owner_id");
  }
  console.log(`  owner: ${ownerId}`);

  // 2. Reuse the existing #founder channel if it's already there
  //    (idempotent re-runs are safe).
  const channels = await api(`/guilds/${GUILD_ID}/channels`);
  let channel = channels.find((c) => c.name === CHANNEL_NAME && c.type === 0);

  if (channel) {
    console.log(`  ↪ #${CHANNEL_NAME}: reusing existing channel (id ${channel.id})`);
  } else {
    console.log(`  + #${CHANNEL_NAME}: creating private text channel`);
    channel = await api(`/guilds/${GUILD_ID}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name: CHANNEL_NAME,
        type: 0, // GUILD_TEXT
        topic:
          "Founder-only oncall telemetry: watchdog pings, IAP orphans, payment fails. Not for mods.",
        permission_overwrites: [
          // Deny @everyone view (= role ID === guild ID for @everyone)
          {
            id: GUILD_ID,
            type: 0, // role
            allow: "0",
            deny: EVERYONE_DENY.toString(),
          },
          // Grant the owner full access
          {
            id: ownerId,
            type: 1, // member
            allow: OWNER_ALLOW.toString(),
            deny: "0",
          },
        ],
      }),
    });
    console.log(`    created channel id ${channel.id}`);
  }

  // 3. Reuse or create the MileClear webhook on that channel.
  const avatarPath = resolve(
    REPO_ROOT,
    "apps/mobile/assets/branding/bot-avatar.png"
  );
  let avatarDataUri;
  if (existsSync(avatarPath)) {
    const b64 = readFileSync(avatarPath).toString("base64");
    avatarDataUri = `data:image/png;base64,${b64}`;
  }

  const existingHooks = await api(`/channels/${channel.id}/webhooks`);
  let webhook = existingHooks.find((w) => w.name === "MileClear");
  if (webhook) {
    console.log(`  ↪ webhook: reusing existing "MileClear" hook`);
  } else {
    console.log(`  + webhook: creating "MileClear" hook`);
    const body = { name: "MileClear" };
    if (avatarDataUri) body.avatar = avatarDataUri;
    webhook = await api(`/channels/${channel.id}/webhooks`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  const url = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;

  console.log("\n── Add this to .env (local + prod) ──\n");
  console.log(`DISCORD_WEBHOOK_FOUNDER="${url}"`);
  console.log("");
  console.log("Then restart the API:");
  console.log("  pm2 restart mileclear-api --update-env");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
