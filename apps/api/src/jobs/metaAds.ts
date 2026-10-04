/**
 * Paid ads (Oct 2026): syncs Meta campaign figures once a day at 06:15 UK
 * time, plus once a minute after start. Off unless META_ADS_TOKEN and
 * META_AD_ACCOUNT_ID are set. Runs only in the first pm2 instance.
 */

import { prisma } from "../lib/prisma.js";
import { metaAdsConfigured, syncMetaAds, ukDate } from "../services/metaAds.js";

const CHECK_EVERY_MS = 10 * 60 * 1000;
const FIRST_RUN_MS = 60_000;
const RUN_AT_MINUTES = 6 * 60 + 15;

function ukMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function startMetaAdsJobs(): void {
  if (!metaAdsConfigured()) return;
  if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== "0") return;

  let lastRunDate: string | null = null;
  let lastErrorAt = 0;

  const run = async () => {
    const now = new Date();
    try {
      const r = await syncMetaAds(now);
      // A start-up run before 06:15 does not count as today's daily sync.
      if (ukMinutes(now) >= RUN_AT_MINUTES) lastRunDate = ukDate(now);
      console.log("[meta-ads] synced %d campaigns, %d daily rows", r.campaigns, r.dailyRows);
    } catch (err) {
      // Messages from services/metaAds.ts are already stripped of the token.
      if (Date.now() - lastErrorAt > 3_600_000) {
        lastErrorAt = Date.now();
        console.error("[meta-ads] sync failed:", err instanceof Error ? err.message : String(err));
      }
    }
  };

  const tick = async () => {
    const now = new Date();
    const today = ukDate(now);
    if (lastRunDate === today || ukMinutes(now) < RUN_AT_MINUTES) return;
    try {
      // Another process (or an admin refresh) may already have synced today.
      const latest = await prisma.adCampaign.findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } });
      if (latest && ukDate(latest.syncedAt) === today && ukMinutes(latest.syncedAt) >= RUN_AT_MINUTES) {
        lastRunDate = today;
        return;
      }
    } catch {
      // Fall through and try the sync; it logs its own errors.
    }
    await run();
  };

  setTimeout(() => void run(), FIRST_RUN_MS);
  setInterval(() => void tick(), CHECK_EVERY_MS);
}
