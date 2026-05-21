#!/usr/bin/env node
/**
 * Post a deploy summary to Discord #whats-new.
 *
 * Designed to be the last command in every prod deploy. Reads the
 * last-deployed git SHA from `.last-deployed-sha` (a single-line file
 * at the repo root), compares to current HEAD, and posts the commit
 * list between them as a Discord embed.
 *
 * Idempotent: if nothing has changed since the last marker, no-op.
 * Defensive: silently skips when DISCORD_WEBHOOK_WHATSNEW is not set,
 * so it never breaks a deploy.
 *
 * Usage:
 *   node scripts/notify-deploy.mjs           # post & update marker
 *   node scripts/notify-deploy.mjs --dry     # show what would post,
 *                                              don't actually send
 *
 * Suggested deploy flow:
 *   cd ~/mileclear-app
 *   && git pull
 *   && npx pnpm install
 *   && npx pnpm build:shared && npx pnpm build:api && npx pnpm build:web
 *   && pm2 restart mileclear-api && pm2 restart mileclear-web
 *   && node scripts/notify-deploy.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MARKER_PATH = resolve(REPO_ROOT, ".last-deployed-sha");

// CLI args
const DRY_RUN = process.argv.includes("--dry");

// ── env loader (matches discord-bootstrap + discord-create-webhooks) ─
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

const WEBHOOK = process.env.DISCORD_WEBHOOK_WHATSNEW;

// ── git helpers ──────────────────────────────────────────────────────
function git(...args) {
  return execSync(`git ${args.join(" ")}`, {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
}

function safeGit(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

// ── Build the message body ───────────────────────────────────────────
function buildPayload(prevSha, currentSha) {
  const isFirstDeploy = !prevSha;
  const shortPrev = prevSha?.slice(0, 7) ?? "—";
  const shortCurrent = currentSha.slice(0, 7);

  // Commit list. On first deploy we just show the most recent commit
  // — listing the entire history would be useless noise.
  const range = isFirstDeploy
    ? "-1"
    : `${prevSha}..${currentSha}`;
  const raw = safeGit("log", range, "--oneline", "--no-merges") ?? "";
  const commits = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (commits.length === 0 && !isFirstDeploy) {
    return null; // genuinely nothing new — no-op
  }

  // Cap the embed description to avoid blowing past Discord's 4096-char
  // limit on big deploys. Show the first 10 commits and a "+N more" tail.
  const MAX = 10;
  const shown = commits.slice(0, MAX);
  const more = commits.length - shown.length;

  const lines = shown.map((c) => `• ${c}`);
  if (more > 0) lines.push(`…and ${more} more`);

  // Pull the API package version for the title — keeps it grounded in
  // a real version number even if mobile + API versions diverge.
  let version = "API";
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "apps/api/package.json"), "utf8")
    );
    if (pkg.version) version = `API v${pkg.version}`;
  } catch {
    /* fall back */
  }

  const title = isFirstDeploy
    ? `🚀 ${version} deployed (first tracked deploy)`
    : `🚀 ${version} deployed · ${commits.length} commit${commits.length === 1 ? "" : "s"}`;

  return {
    title,
    description: lines.join("\n"),
    footer: `${shortPrev} → ${shortCurrent}`,
  };
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const currentSha = git("rev-parse", "HEAD");
  const prevSha = existsSync(MARKER_PATH)
    ? readFileSync(MARKER_PATH, "utf8").trim() || null
    : null;

  if (prevSha === currentSha) {
    console.log(`[deploy-notify] No new commits since ${prevSha.slice(0, 7)} — skip.`);
    return;
  }

  const payload = buildPayload(prevSha, currentSha);
  if (!payload) {
    console.log("[deploy-notify] No real commits between markers — skip.");
    // Still update the marker so we don't repeat the check.
    if (!DRY_RUN) writeFileSync(MARKER_PATH, currentSha + "\n");
    return;
  }

  if (DRY_RUN) {
    console.log("[deploy-notify] DRY RUN — would post:");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!WEBHOOK) {
    console.log(
      "[deploy-notify] DISCORD_WEBHOOK_WHATSNEW unset — skipping post."
    );
    writeFileSync(MARKER_PATH, currentSha + "\n");
    return;
  }

  const body = {
    embeds: [
      {
        title: payload.title,
        description: payload.description,
        color: 0x10b981, // emerald — deploys are good
        footer: { text: payload.footer },
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [] }, // never @-mention from a deploy
  };

  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[deploy-notify] Discord returned ${res.status}: ${text.slice(0, 200)}`);
      // Don't update the marker if the post failed — next run can retry
      process.exit(0);
    }
    console.log(`[deploy-notify] Posted to #whats-new (${payload.footer})`);
    writeFileSync(MARKER_PATH, currentSha + "\n");
  } catch (err) {
    console.warn("[deploy-notify] Post failed:", err?.message ?? err);
    // Same as above — leave marker untouched so next deploy retries
    process.exit(0);
  }
}

main().catch((err) => {
  console.warn("[deploy-notify] Unexpected error:", err);
  // Never fail the deploy because of a notification problem.
  process.exit(0);
});
