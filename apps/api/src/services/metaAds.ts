// Paid ads (4 Oct 2026): Meta (Facebook/Instagram) campaign figures for the
// admin. Anthony boosts Facebook posts; this pulls spend, reach, impressions
// and link clicks per campaign from the Marketing API once a day and keeps
// them in ad_campaigns / ad_daily_stats, so the admin can put them beside our
// own link clicks (marketing.qr_scan with ?from=) and sign-ups who said
// "Facebook" to "How did you hear about MileClear?".
//
// Off unless META_ADS_TOKEN and META_AD_ACCOUNT_ID are set. The token is
// never logged: every error message passes through redact().
//
// The maths (window, our clicks, sign-ups, cost per X) is pure and tested in
// __tests__/services/metaAds.test.ts.

import { prisma } from "../lib/prisma.js";
import { sourceOf } from "./qrScans.js";

const DAY = 24 * 60 * 60 * 1000;
const GRAPH_TIMEOUT_MS = 20_000;
const MAX_PAGES = 50;
const DAILY_DAYS = 90;

// ── Config ───────────────────────────────────────────────────────────────

export interface MetaAdsConfig {
  token: string;
  accountId: string; // without the act_ prefix
  version: string;
}

export function metaAdsConfig(env: NodeJS.ProcessEnv = process.env): MetaAdsConfig | null {
  const token = (env.META_ADS_TOKEN ?? "").trim();
  const rawId = (env.META_AD_ACCOUNT_ID ?? "").trim();
  if (!token || !rawId) return null;
  const accountId = rawId.replace(/^act_/i, "");
  if (!accountId) return null;
  const version = (env.META_GRAPH_VERSION ?? "").trim() || "v23.0";
  return { token, accountId, version };
}

export function metaAdsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return metaAdsConfig(env) !== null;
}

// ── Graph helper ─────────────────────────────────────────────────────────

/** Removes the access token from anything about to be logged or thrown. */
export function redact(text: string, token?: string): string {
  let out = text.replace(/access_token=[^&\s"']+/gi, "access_token=[redacted]");
  if (token) out = out.split(token).join("[redacted]");
  return out;
}

export class MetaGraphError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "MetaGraphError";
  }
}

type GraphPage = { data?: unknown[]; paging?: { next?: string }; error?: { message?: string; code?: number } };

/**
 * GETs a Graph edge and returns every row, following paging.next. For a
 * node (no data array) returns the object itself as the single row.
 */
export async function graphGetAll<T = Record<string, unknown>>(
  cfg: MetaAdsConfig,
  path: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<T[]> {
  const first = new URL(`https://graph.facebook.com/${cfg.version}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) first.searchParams.set(k, v);
  first.searchParams.set("access_token", cfg.token);

  const rows: T[] = [];
  let url: string | undefined = first.toString();
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    pages += 1;
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new MetaGraphError(redact(`Meta request to ${path} failed: ${msg}`, cfg.token));
    }
    let body: GraphPage | null = null;
    try {
      body = (await res.json()) as GraphPage;
    } catch {
      body = null;
    }
    if (!res.ok || !body || body.error) {
      const detail = body?.error?.message ?? `HTTP ${res.status}`;
      throw new MetaGraphError(redact(`Meta ${path}: ${detail}`, cfg.token), res.status);
    }
    if (Array.isArray(body.data)) {
      rows.push(...(body.data as T[]));
      url = body.paging?.next;
    } else {
      rows.push(body as unknown as T);
      url = undefined;
    }
  }
  return rows;
}

// ── Parsing ──────────────────────────────────────────────────────────────

/** "12.34" (account currency) → 1234 minor units. Bad input → 0. */
export function spendToPence(spend: unknown): number {
  const n = Number(spend);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Meta sends "2026-10-01T10:00:00+0100"; add the colon so Date parses it everywhere. */
export function parseMetaTime(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD in UK time. */
export function ukDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

/** Midnight UK time at the start of a YYYY-MM-DD day. */
export function ukMidnight(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const bst = new Date(utc - 60 * 60 * 1000);
  return ukDate(bst) === date ? bst : new Date(utc);
}

// ── Sync ─────────────────────────────────────────────────────────────────

export class MetaSyncBusyError extends Error {
  constructor() {
    super("A sync with Meta is already running.");
    this.name = "MetaSyncBusyError";
  }
}

export interface MetaSyncResult {
  accountName: string | null;
  currency: string;
  campaigns: number;
  dailyRows: number;
}

type CampaignRow = { id: string; name?: string; status?: string; objective?: string; start_time?: string; stop_time?: string };
type InsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  date_start?: string;
};

let syncing = false;

export function metaSyncRunning(): boolean {
  return syncing;
}

export async function syncMetaAds(now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<MetaSyncResult> {
  const cfg = metaAdsConfig();
  if (!cfg) throw new Error("Meta ads are not configured.");
  if (syncing) throw new MetaSyncBusyError();
  syncing = true;
  try {
    const act = `act_${cfg.accountId}`;
    const [account] = await graphGetAll<{ name?: string; currency?: string }>(cfg, act, { fields: "name,currency" }, fetchImpl);
    const accountName = account?.name ?? null;
    const currency = (account?.currency ?? "GBP").slice(0, 8);

    const campaigns = await graphGetAll<CampaignRow>(
      cfg,
      `${act}/campaigns`,
      { fields: "id,name,status,objective,start_time,stop_time", limit: "200" },
      fetchImpl
    );
    const lifetime = await graphGetAll<InsightRow>(
      cfg,
      `${act}/insights`,
      {
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,impressions,reach,inline_link_clicks",
        date_preset: "maximum",
        limit: "500",
      },
      fetchImpl
    );
    const since = ukDate(new Date(now.getTime() - DAILY_DAYS * DAY));
    const until = ukDate(now);
    const daily = await graphGetAll<InsightRow>(
      cfg,
      `${act}/insights`,
      {
        level: "campaign",
        fields: "campaign_id,spend,impressions,reach,inline_link_clicks",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        limit: "500",
      },
      fetchImpl
    );

    // Every campaign in the list, plus any that only show up in insights
    // (the campaigns edge leaves deleted ones out but they still spent).
    const byId = new Map<string, CampaignRow>();
    for (const c of campaigns) if (c.id) byId.set(String(c.id), c);
    const lifeById = new Map<string, InsightRow>();
    for (const i of lifetime) {
      if (!i.campaign_id) continue;
      lifeById.set(i.campaign_id, i);
      if (!byId.has(i.campaign_id)) byId.set(i.campaign_id, { id: i.campaign_id, name: i.campaign_name });
    }

    for (const [id, c] of byId) {
      const life = lifeById.get(id);
      const figures = {
        accountId: cfg.accountId,
        accountName: accountName ? accountName.slice(0, 255) : null,
        name: (c.name ?? life?.campaign_name ?? id).slice(0, 255),
        status: c.status ? c.status.slice(0, 32) : null,
        objective: c.objective ? c.objective.slice(0, 64) : null,
        startTime: parseMetaTime(c.start_time),
        stopTime: parseMetaTime(c.stop_time),
        currency,
        spendPence: spendToPence(life?.spend),
        impressions: toInt(life?.impressions),
        reach: toInt(life?.reach),
        linkClicks: toInt(life?.inline_link_clicks),
        syncedAt: now,
      };
      // fromSource is the admin's choice: never touched by a sync.
      await prisma.adCampaign.upsert({ where: { id }, create: { id, ...figures }, update: figures });
    }

    let dailyRows = 0;
    const dailyOps = daily
      .filter((d) => d.campaign_id && d.date_start)
      .map((d) => {
        const figures = {
          spendPence: spendToPence(d.spend),
          impressions: toInt(d.impressions),
          reach: toInt(d.reach),
          linkClicks: toInt(d.inline_link_clicks),
        };
        const key = { campaignId: d.campaign_id!, date: d.date_start!.slice(0, 10) };
        return prisma.adDailyStat.upsert({
          where: { campaignId_date: key },
          create: { ...key, ...figures },
          update: figures,
        });
      });
    for (let i = 0; i < dailyOps.length; i += 50) {
      const chunk = dailyOps.slice(i, i + 50);
      await prisma.$transaction(chunk);
      dailyRows += chunk.length;
    }

    return { accountName, currency, campaigns: byId.size, dailyRows };
  } finally {
    syncing = false;
  }
}

// ── Pure maths for the admin view ────────────────────────────────────────

export interface Window {
  from: Date;
  to: Date;
}

/**
 * When a campaign counts: from its start (or its first day with figures) to
 * its stop (or now). Null when we know neither start nor any day.
 */
export function campaignWindow(
  startTime: Date | null,
  stopTime: Date | null,
  firstDailyDate: string | null,
  now: Date
): Window | null {
  const from = startTime ?? (firstDailyDate ? ukMidnight(firstDailyDate) : null);
  if (!from) return null;
  const to = stopTime && stopTime.getTime() < now.getTime() ? stopTime : now;
  return { from, to: to.getTime() < from.getTime() ? from : to };
}

function inWindow(t: Date, w: Window): boolean {
  return t.getTime() >= w.from.getTime() && t.getTime() <= w.to.getTime();
}

/** Spend divided by a count, in whole pence; null when there is nothing to divide by. */
export function costPer(spendPence: number, count: number): number | null {
  if (!count || count <= 0) return null;
  return Math.round(spendPence / count);
}

export interface ScanRow {
  id: string;
  createdAt: Date;
  metadata: unknown;
}

export interface SignupRow {
  userId: string;
  createdAt: Date;
  /** The driver's latest "How did you hear" answer, or null. */
  source: string | null;
}

/** Latest "How did you hear" answer per driver. */
export function latestAcquisitionByUser(
  rows: Array<{ userId: string | null; createdAt: Date; metadata: unknown }>
): Map<string, string> {
  const latest = new Map<string, { at: number; source: string }>();
  for (const r of rows) {
    if (!r.userId) continue;
    const s = (r.metadata as { source?: unknown } | null)?.source;
    const source = typeof s === "string" ? s : "other";
    const prev = latest.get(r.userId);
    if (!prev || prev.at < r.createdAt.getTime()) latest.set(r.userId, { at: r.createdAt.getTime(), source });
  }
  return new Map([...latest].map(([k, v]) => [k, v.source]));
}

export interface CampaignFunnel {
  ourClicks: number;
  facebookSignups: number;
  instagramSignups: number;
  allSignups: number;
  costPerMetaClickPence: number | null;
  costPerOurClickPence: number | null;
  costPerFacebookSignupPence: number | null;
  /** Ids behind the counts, so totals can count each once across campaigns. */
  scanIds: string[];
  facebookUserIds: string[];
}

export function campaignFunnel(input: {
  spendPence: number;
  metaLinkClicks: number;
  fromSource: string | null;
  window: Window | null;
  scans: ScanRow[];
  signups: SignupRow[];
}): CampaignFunnel {
  const { window: w } = input;
  const scanIds: string[] = [];
  const facebookUserIds: string[] = [];
  let instagram = 0;
  let all = 0;
  if (w) {
    if (input.fromSource) {
      for (const s of input.scans) {
        if (sourceOf(s.metadata) === input.fromSource && inWindow(s.createdAt, w)) scanIds.push(s.id);
      }
    }
    for (const u of input.signups) {
      if (!inWindow(u.createdAt, w)) continue;
      all += 1;
      if (u.source === "facebook") facebookUserIds.push(u.userId);
      else if (u.source === "instagram") instagram += 1;
    }
  }
  return {
    ourClicks: scanIds.length,
    facebookSignups: facebookUserIds.length,
    instagramSignups: instagram,
    allSignups: all,
    costPerMetaClickPence: costPer(input.spendPence, input.metaLinkClicks),
    costPerOurClickPence: input.fromSource ? costPer(input.spendPence, scanIds.length) : null,
    costPerFacebookSignupPence: costPer(input.spendPence, facebookUserIds.length),
    scanIds,
    facebookUserIds,
  };
}
