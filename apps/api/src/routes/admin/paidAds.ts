// Paid ads admin (4 Oct 2026). Registered inside adminRoutes, so the auth +
// admin hooks already apply.
//
//   GET  /admin/paid-ads                         Meta figures per campaign beside our clicks + sign-ups
//   POST /admin/paid-ads/refresh                 sync from Meta now
//   POST /admin/paid-ads/campaigns/:id/channel   { fromSource: string | null }
//
// Meta's figures come from services/metaAds.ts (synced daily by
// jobs/metaAds.ts). The maths is pure and tested there.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { logEvent } from "../../services/appEvents.js";
import { qrScanRollup } from "../../services/qrScans.js";
import {
  MetaSyncBusyError,
  campaignFunnel,
  campaignWindow,
  costPer,
  latestAcquisitionByUser,
  metaAdsConfigured,
  metaSyncRunning,
  syncMetaAds,
  ukDate,
  type SignupRow,
} from "../../services/metaAds.js";

const DAY = 24 * 60 * 60 * 1000;

export async function adminPaidAdsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/paid-ads", async (_request, reply) => {
    const now = new Date();
    const configured = metaAdsConfigured();

    const [campaigns, firstDays, scans] = await Promise.all([
      prisma.adCampaign.findMany(),
      prisma.adDailyStat.groupBy({ by: ["campaignId"], _min: { date: true } }),
      prisma.appEvent.findMany({
        where: { type: "marketing.qr_scan" },
        select: { id: true, createdAt: true, metadata: true },
      }),
    ]);
    const firstDayById = new Map(firstDays.map((r) => [r.campaignId, r._min.date ?? null]));

    const withWindows = campaigns.map((c) => ({
      c,
      window: campaignWindow(c.startTime, c.stopTime, firstDayById.get(c.id) ?? null, now),
    }));
    const starts = withWindows.map((w) => w.window?.from.getTime()).filter((t): t is number => t != null);
    const earliest = starts.length ? new Date(Math.min(...starts)) : null;

    // Sign-ups since the earliest campaign started, with each driver's latest
    // "How did you hear" answer.
    let signups: SignupRow[] = [];
    if (earliest) {
      const users = await prisma.user.findMany({
        where: { createdAt: { gte: earliest } },
        select: { id: true, createdAt: true },
      });
      const answers = users.length
        ? await prisma.appEvent.findMany({
            where: { type: "user.acquisition_source", userId: { in: users.map((u) => u.id) } },
            select: { userId: true, createdAt: true, metadata: true },
          })
        : [];
      const latest = latestAcquisitionByUser(answers);
      signups = users.map((u) => ({ userId: u.id, createdAt: u.createdAt, source: latest.get(u.id) ?? null }));
    }

    const rows = withWindows
      .map(({ c, window }) => {
        const f = campaignFunnel({
          spendPence: c.spendPence,
          metaLinkClicks: c.linkClicks,
          fromSource: c.fromSource,
          window,
          scans,
          signups,
        });
        return { c, f, sortKey: (window?.from ?? c.createdAt).getTime() };
      })
      .sort((a, b) => b.sortKey - a.sortKey);

    // Totals count each click and each driver once, even where campaigns overlap.
    const scanIds = new Set<string>();
    const fbUsers = new Set<string>();
    let spendPence = 0;
    let metaLinkClicks = 0;
    for (const { c, f } of rows) {
      spendPence += c.spendPence;
      metaLinkClicks += c.linkClicks;
      f.scanIds.forEach((id) => scanIds.add(id));
      f.facebookUserIds.forEach((id) => fbUsers.add(id));
    }

    // Last 30 UK days, all campaigns summed, oldest first, zero-filled.
    const since = ukDate(new Date(now.getTime() - 29 * DAY));
    const dailyRows = await prisma.adDailyStat.groupBy({
      by: ["date"],
      where: { date: { gte: since } },
      _sum: { spendPence: true, linkClicks: true },
    });
    const byDate = new Map(dailyRows.map((d) => [d.date, d._sum]));
    const daily: Array<{ date: string; spendPence: number; linkClicks: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const date = ukDate(new Date(now.getTime() - i * DAY));
      if (daily.length && daily[daily.length - 1].date === date) continue;
      const s = byDate.get(date);
      daily.push({ date, spendPence: s?.spendPence ?? 0, linkClicks: s?.linkClicks ?? 0 });
    }

    const latestSynced = campaigns.reduce<Date | null>(
      (acc, c) => (!acc || c.syncedAt > acc ? c.syncedAt : acc),
      null
    );
    const newest = campaigns.find((c) => c.syncedAt.getTime() === latestSynced?.getTime());

    return reply.send({
      data: {
        configured,
        syncing: metaSyncRunning(),
        accountName: newest?.accountName ?? null,
        currency: newest?.currency ?? "GBP",
        lastSyncedAt: latestSynced ? latestSynced.toISOString() : null,
        totals: {
          spendPence,
          metaLinkClicks,
          ourClicks: scanIds.size,
          facebookSignups: fbUsers.size,
          costPerFacebookSignupPence: costPer(spendPence, fbUsers.size),
        },
        campaigns: rows.map(({ c, f }) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective,
          startTime: c.startTime ? c.startTime.toISOString() : null,
          stopTime: c.stopTime ? c.stopTime.toISOString() : null,
          currency: c.currency,
          spendPence: c.spendPence,
          impressions: c.impressions,
          reach: c.reach,
          metaLinkClicks: c.linkClicks,
          fromSource: c.fromSource,
          ourClicks: f.ourClicks,
          facebookSignups: f.facebookSignups,
          instagramSignups: f.instagramSignups,
          allSignups: f.allSignups,
          costPerMetaClickPence: f.costPerMetaClickPence,
          costPerOurClickPence: f.costPerOurClickPence,
          costPerFacebookSignupPence: f.costPerFacebookSignupPence,
        })),
        daily,
        knownSources: qrScanRollup(scans, now).bySource.map((s) => s.source),
      },
    });
  });

  app.post("/paid-ads/refresh", async (request, reply) => {
    if (!metaAdsConfigured()) {
      return reply.status(503).send({ error: "Not connected to Meta yet. Set META_ADS_TOKEN and META_AD_ACCOUNT_ID on the server." });
    }
    try {
      const result = await syncMetaAds(new Date());
      logEvent("admin.paid_ads.refresh", request.userId!, { adminUserId: request.userId, ...result });
      return reply.send({ data: result });
    } catch (err) {
      if (err instanceof MetaSyncBusyError) return reply.status(409).send({ error: err.message });
      const message = err instanceof Error ? err.message : "Sync failed";
      request.log.error({ message }, "paid ads refresh failed");
      return reply.status(502).send({ error: message });
    }
  });

  app.post("/paid-ads/campaigns/:id/channel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z
      .object({ fromSource: z.string().trim().regex(/^[a-z0-9-]{1,40}$/i).nullable() })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Channel must be letters, numbers and hyphens (up to 40), or empty." });
    }
    const campaign = await prisma.adCampaign.findUnique({ where: { id }, select: { id: true, fromSource: true } });
    if (!campaign) return reply.status(404).send({ error: "Campaign not found" });
    // ?from= values are lower case (see services/qrScans.ts), so store it that way.
    const fromSource = parsed.data.fromSource ? parsed.data.fromSource.toLowerCase() : null;
    await prisma.adCampaign.update({ where: { id }, data: { fromSource } });
    logEvent("admin.paid_ads.channel", request.userId!, {
      adminUserId: request.userId,
      campaignId: id,
      before: { fromSource: campaign.fromSource },
      after: { fromSource },
    });
    return reply.send({ data: { ok: true, fromSource } });
  });
}
