import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  adCampaign: { upsert: vi.fn(async () => ({})) },
  adDailyStat: { upsert: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("../../lib/prisma.js", () => ({ prisma: prismaMock }));

import {
  campaignFunnel,
  campaignWindow,
  costPer,
  graphGetAll,
  latestAcquisitionByUser,
  metaAdsConfig,
  parseMetaTime,
  redact,
  spendToPence,
  syncMetaAds,
  ukMidnight,
  type MetaAdsConfig,
} from "../../services/metaAds.js";

const TOKEN = "EAAB-secret-token-123";
const CFG: MetaAdsConfig = { token: TOKEN, accountId: "999", version: "v23.0" };
const NOW = new Date("2026-10-04T12:00:00Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("config", () => {
  it("accepts the account id with or without act_ and defaults the version", () => {
    expect(metaAdsConfig({ META_ADS_TOKEN: "t", META_AD_ACCOUNT_ID: "act_123" } as NodeJS.ProcessEnv)).toEqual({
      token: "t",
      accountId: "123",
      version: "v23.0",
    });
    expect(metaAdsConfig({ META_ADS_TOKEN: "t", META_AD_ACCOUNT_ID: "123", META_GRAPH_VERSION: "v24.0" } as NodeJS.ProcessEnv)?.version).toBe("v24.0");
    expect(metaAdsConfig({ META_AD_ACCOUNT_ID: "123" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("spendToPence", () => {
  it("turns Meta's decimal strings into whole pence", () => {
    expect(spendToPence("12.34")).toBe(1234);
    expect(spendToPence("0.1")).toBe(10);
    expect(spendToPence("4.995")).toBe(500);
    expect(spendToPence("100")).toBe(10000);
    expect(spendToPence(undefined)).toBe(0);
    expect(spendToPence("nonsense")).toBe(0);
  });
});

describe("parseMetaTime / ukMidnight", () => {
  it("reads Meta's +0100 offsets", () => {
    expect(parseMetaTime("2026-10-01T10:00:00+0100")?.toISOString()).toBe("2026-10-01T09:00:00.000Z");
    expect(parseMetaTime(undefined)).toBeNull();
  });
  it("finds UK midnight in summer and winter", () => {
    expect(ukMidnight("2026-10-01").toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(ukMidnight("2026-12-01").toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("graphGetAll", () => {
  it("follows paging.next until there is none", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "1" }, { id: "2" }], paging: { next: "https://graph.facebook.com/next-page?access_token=x" } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: "3" }], paging: {} }));
    const rows = await graphGetAll<{ id: string }>(CFG, "act_999/campaigns", { limit: "2" }, fetchMock as unknown as typeof fetch);
    expect(rows.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(firstUrl.pathname).toBe("/v23.0/act_999/campaigns");
    expect(firstUrl.searchParams.get("limit")).toBe("2");
    expect(firstUrl.searchParams.get("access_token")).toBe(TOKEN);
    expect(fetchMock.mock.calls[1][0]).toBe("https://graph.facebook.com/next-page?access_token=x");
  });

  it("returns a node as a single row", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ name: "MileClear", currency: "GBP" }));
    const rows = await graphGetAll(CFG, "act_999", { fields: "name,currency" }, fetchMock as unknown as typeof fetch);
    expect(rows).toEqual([{ name: "MileClear", currency: "GBP" }]);
  });

  it("never puts the token in a thrown error (Graph error)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: `Invalid OAuth access token ${TOKEN} (access_token=${TOKEN})`, code: 190 } }, 400));
    const err = await graphGetAll(CFG, "act_999", {}, fetchMock as unknown as typeof fetch).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(TOKEN);
    expect((err as Error).message).toContain("Invalid OAuth access token");
  });

  it("never puts the token in a thrown error (network failure echoing the URL)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      throw new TypeError(`fetch failed for ${url}`);
    });
    const err = await graphGetAll(CFG, "act_999", {}, fetchMock as unknown as typeof fetch).catch((e: Error) => e);
    expect((err as Error).message).not.toContain(TOKEN);
    expect((err as Error).message).toContain("access_token=[redacted]");
  });

  it("redact strips both the parameter and the bare token", () => {
    expect(redact(`x?access_token=abc&y=1 and ${TOKEN}`, TOKEN)).toBe("x?access_token=[redacted]&y=1 and [redacted]");
  });
});

describe("syncMetaAds", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.META_ADS_TOKEN = TOKEN;
    process.env.META_AD_ACCOUNT_ID = "act_999";
    prismaMock.adCampaign.upsert.mockClear();
    prismaMock.adDailyStat.upsert.mockClear();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("stores campaigns in pence and leaves the admin's link alone", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/act_999")) return jsonResponse({ name: "MileClear ads", currency: "GBP" });
      if (u.pathname.endsWith("/campaigns"))
        return jsonResponse({ data: [{ id: "c1", name: "Boost 1", status: "ACTIVE", objective: "OUTCOME_TRAFFIC", start_time: "2026-10-01T10:00:00+0100" }] });
      if (u.searchParams.get("date_preset") === "maximum")
        return jsonResponse({
          data: [
            { campaign_id: "c1", campaign_name: "Boost 1", spend: "12.34", impressions: "1000", reach: "800", inline_link_clicks: "25" },
            { campaign_id: "c2", campaign_name: "Deleted boost", spend: "3", impressions: "10", reach: "9" },
          ],
        });
      expect(JSON.parse(u.searchParams.get("time_range")!)).toEqual({ since: "2026-07-06", until: "2026-10-04" });
      return jsonResponse({ data: [{ campaign_id: "c1", date_start: "2026-10-01", spend: "5.50", impressions: "400", reach: "300", inline_link_clicks: "10" }] });
    });
    const r = await syncMetaAds(NOW, fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ accountName: "MileClear ads", currency: "GBP", campaigns: 2, dailyRows: 1 });
    const calls = prismaMock.adCampaign.upsert.mock.calls as unknown as Array<[{ where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }]>;
    const c1 = calls.find((c) => c[0].where.id === "c1")![0];
    expect(c1.update).toMatchObject({ spendPence: 1234, impressions: 1000, reach: 800, linkClicks: 25, accountId: "999" });
    expect(c1.update).not.toHaveProperty("fromSource");
    const c2 = calls.find((c) => c[0].where.id === "c2")![0];
    expect(c2.create).toMatchObject({ name: "Deleted boost", spendPence: 300, linkClicks: 0 });
    expect(prismaMock.adDailyStat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId_date: { campaignId: "c1", date: "2026-10-01" } }, update: expect.objectContaining({ spendPence: 550 }) })
    );
  });
});

describe("cost maths", () => {
  it("costPer gives null when there is nothing to divide by", () => {
    expect(costPer(1000, 0)).toBeNull();
    expect(costPer(0, 0)).toBeNull();
    expect(costPer(1000, 3)).toBe(333);
  });

  const window = campaignWindow(new Date("2026-10-01T09:00:00Z"), new Date("2026-10-03T09:00:00Z"), null, NOW)!;
  const scan = (id: string, iso: string, from?: string) => ({ id, createdAt: new Date(iso), metadata: from ? { link: "app", from } : { link: "app" } });

  it("counts our clicks for the campaign's link inside its window only", () => {
    const f = campaignFunnel({
      spendPence: 2000,
      metaLinkClicks: 40,
      fromSource: "fb-boost-1",
      window,
      scans: [
        scan("a", "2026-10-01T10:00:00Z", "fb-boost-1"),
        scan("b", "2026-10-02T10:00:00Z", "fb-boost-1"),
        scan("c", "2026-10-02T10:00:00Z", "other-link"),
        scan("d", "2026-10-04T10:00:00Z", "fb-boost-1"), // after stop
        scan("e", "2026-10-02T10:00:00Z"), // billboard
      ],
      signups: [
        { userId: "u1", createdAt: new Date("2026-10-01T12:00:00Z"), source: "facebook" },
        { userId: "u2", createdAt: new Date("2026-10-02T12:00:00Z"), source: "instagram" },
        { userId: "u3", createdAt: new Date("2026-10-02T13:00:00Z"), source: null },
        { userId: "u4", createdAt: new Date("2026-09-30T12:00:00Z"), source: "facebook" }, // before start
      ],
    });
    expect(f.ourClicks).toBe(2);
    expect(f.facebookSignups).toBe(1);
    expect(f.instagramSignups).toBe(1);
    expect(f.allSignups).toBe(3);
    expect(f.costPerMetaClickPence).toBe(50);
    expect(f.costPerOurClickPence).toBe(1000);
    expect(f.costPerFacebookSignupPence).toBe(2000);
  });

  it("gives null costs when there are no clicks or sign-ups, and none for our clicks with no link set", () => {
    const f = campaignFunnel({ spendPence: 500, metaLinkClicks: 0, fromSource: null, window, scans: [scan("a", "2026-10-02T10:00:00Z", "x")], signups: [] });
    expect(f.ourClicks).toBe(0);
    expect(f.costPerMetaClickPence).toBeNull();
    expect(f.costPerOurClickPence).toBeNull();
    expect(f.costPerFacebookSignupPence).toBeNull();
  });

  it("matches the billboard channel to scans with no from", () => {
    const f = campaignFunnel({ spendPence: 100, metaLinkClicks: 1, fromSource: "billboard", window, scans: [scan("e", "2026-10-02T10:00:00Z")], signups: [] });
    expect(f.ourClicks).toBe(1);
  });

  it("window runs from the first day of figures to now when Meta gave no dates", () => {
    const w = campaignWindow(null, null, "2026-10-02", NOW)!;
    expect(w.from.toISOString()).toBe("2026-10-01T23:00:00.000Z");
    expect(w.to).toBe(NOW);
    expect(campaignWindow(null, null, null, NOW)).toBeNull();
  });

  it("uses each driver's latest How did you hear answer", () => {
    const m = latestAcquisitionByUser([
      { userId: "u1", createdAt: new Date("2026-10-01T10:00:00Z"), metadata: { source: "tiktok" } },
      { userId: "u1", createdAt: new Date("2026-10-02T10:00:00Z"), metadata: { source: "facebook" } },
      { userId: null, createdAt: NOW, metadata: { source: "facebook" } },
    ]);
    expect(m.get("u1")).toBe("facebook");
    expect(m.size).toBe(1);
  });
});
