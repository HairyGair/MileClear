#!/usr/bin/env node
/**
 * Render App Store screenshot composites by driving the Next.js
 * `/screenshot-composer` route with Playwright.
 *
 * What it does:
 *   1. Boots the web app on PORT (default 3300).
 *   2. Iterates the 10 slots in `apps/web/src/components/screenshot/slots.ts`.
 *   3. Saves each composite to `apps/mobile/assets/appstore-screenshots/`
 *      as `iphone-{NN}-{slug}.png` at the exact Apple-required
 *      1320x2868 (iPhone 6.9") dimensions.
 *
 * Rerun whenever a slot's copy or source capture changes. Idempotent —
 * overwrites prior outputs.
 *
 * Usage:
 *   node scripts/render-app-store-screenshots.mjs
 *   node scripts/render-app-store-screenshots.mjs --device=ipad
 *   node scripts/render-app-store-screenshots.mjs --slot=2     # one only
 *   node scripts/render-app-store-screenshots.mjs --port=3301
 *
 * Requirements: Playwright is fetched on-demand via npx if not installed
 * locally (no need to track it in package.json).
 *
 * Why this is committed: the previous script lived in /tmp and was
 * lost on reboot. Keeping it under scripts/ stops the disappearing act.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// CLI args -----------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const DEVICE = (args.device ?? "iphone").toString();
const PORT = parseInt(args.port?.toString() ?? "3300", 10);
const ONLY_SLOT = args.slot ? parseInt(args.slot.toString(), 10) : null;

if (DEVICE !== "iphone" && DEVICE !== "ipad") {
  console.error(`device must be 'iphone' or 'ipad', got '${DEVICE}'`);
  process.exit(2);
}

const VIEWPORT =
  DEVICE === "iphone"
    ? { width: 1320, height: 2868 }
    : { width: 2064, height: 2752 };

// Pull slot metadata directly from the TypeScript source so the script
// stays in sync with the composer. Cheap regex parse — we only need
// slot number + slug + iphoneSrc presence.
async function loadSlots() {
  const txt = await readFile(
    resolve(REPO_ROOT, "apps/web/src/components/screenshot/slots.ts"),
    "utf8"
  );
  const slots = [];
  const re = /\{\s*slot:\s*(\d+),\s*slug:\s*"([^"]+)",[\s\S]*?iphoneSrc:\s*"([^"]+)",[\s\S]*?ipadSrc:\s*"([^"]+)"/g;
  for (const m of txt.matchAll(re)) {
    slots.push({
      slot: parseInt(m[1], 10),
      slug: m[2],
      iphoneSrc: m[3],
      ipadSrc: m[4],
    });
  }
  return slots.sort((a, b) => a.slot - b.slot);
}

// Boot Next.js prod build for stable rendering. Falls back to dev if
// no build is present; dev mode just adds a few hundred ms per first
// hit per slot.
function startWebServer() {
  const useProd = existsSync(resolve(REPO_ROOT, "apps/web/.next/BUILD_ID"));
  const mode = useProd ? "start" : "dev";
  console.log(`[server] launching pnpm web ${mode} on port ${PORT}…`);
  const child = spawn(
    "pnpm",
    ["--filter", "@mileclear/web", mode, "--port", String(PORT)],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(PORT) },
    }
  );
  child.stdout.on("data", (d) => {
    const s = d.toString();
    if (s.includes("Ready") || s.includes("compiled")) process.stdout.write(`[server] ${s}`);
  });
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  return child;
}

async function waitForReady(url, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* not yet */
    }
    await sleep(1000);
  }
  throw new Error(`server never became ready at ${url}`);
}

async function main() {
  // Lazy-import Playwright so the script can be run without it pinned
  // in package.json. `npx playwright install chromium` is a separate
  // one-time step if Chromium isn't already on the machine.
  const { chromium } = await import("playwright");

  const slots = await loadSlots();
  const targetSlots = ONLY_SLOT
    ? slots.filter((s) => s.slot === ONLY_SLOT)
    : slots;
  if (targetSlots.length === 0) {
    console.error(`no slots matched ${ONLY_SLOT ?? "(all)"}`);
    process.exit(1);
  }

  const outDir = resolve(REPO_ROOT, "apps/mobile/assets/appstore-screenshots");
  await mkdir(outDir, { recursive: true });

  const server = startWebServer();
  const baseUrl = `http://localhost:${PORT}`;

  try {
    await waitForReady(`${baseUrl}/screenshot-composer/${DEVICE}/1`);
    console.log(`[server] ready at ${baseUrl}`);

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    for (const s of targetSlots) {
      const url = `${baseUrl}/screenshot-composer/${DEVICE}/${s.slot}`;
      const padded = String(s.slot).padStart(2, "0");
      const filename = `${DEVICE}-${padded}-${s.slug}.png`;
      const outPath = resolve(outDir, filename);

      console.log(`[shot] ${s.slot} (${s.slug}) → ${filename}`);
      await page.goto(url, { waitUntil: "networkidle" });
      // Small extra settle — gives gradient layers and any images
      // (logo, device capture) a beat to paint.
      await sleep(400);
      await page.screenshot({
        path: outPath,
        fullPage: false,
        omitBackground: false,
      });
    }

    await browser.close();
    console.log(`\n[done] ${targetSlots.length} ${DEVICE} composites written to`);
    console.log(`       ${outDir}`);
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
