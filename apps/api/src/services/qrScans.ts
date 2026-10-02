// Billboard QR scan counts (event marketing.qr_scan, one per scan of
// mileclear.com/app). Pure so it can be tested; the admin route fetches rows.

export type QrStore = "ios" | "android" | "other";

export interface QrScanRollup {
  total: number;
  byStore: Record<QrStore, number>;
  last24h: number;
  /** UK calendar days, newest first, last 14 days including today. */
  byDay: Array<{ date: string; total: number; ios: number; android: number; other: number }>;
  firstAt: string | null;
  lastAt: string | null;
  /** Clicks per channel (?from=), most first. Scans from before 2 Oct 2026
   *  carry no source and count as the billboard, which was the only link. */
  bySource: Array<{ source: string; total: number; ios: number; android: number; other: number; last7d: number }>;
}

const DAY = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in UK time (handles BST/GMT). */
function ukDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}

function sourceOf(metadata: unknown): string {
  const f = (metadata as { from?: unknown } | null)?.from;
  return typeof f === "string" && /^[a-z0-9-]{1,32}$/.test(f) ? f : "billboard";
}

function storeOf(metadata: unknown): QrStore {
  const s = (metadata as { store?: unknown } | null)?.store;
  return s === "ios" || s === "android" ? s : "other";
}

export function qrScanRollup(rows: Array<{ createdAt: Date; metadata: unknown }>, now: Date): QrScanRollup {
  const byStore: Record<QrStore, number> = { ios: 0, android: 0, other: 0 };
  const days = new Map<string, { total: number; ios: number; android: number; other: number }>();
  for (let i = 0; i < 14; i++) {
    days.set(ukDate(new Date(now.getTime() - i * DAY)), { total: 0, ios: 0, android: 0, other: 0 });
  }
  const sources = new Map<string, { total: number; ios: number; android: number; other: number; last7d: number }>();
  let last24h = 0;
  let first: number | null = null;
  let last: number | null = null;
  for (const r of rows) {
    const t = r.createdAt.getTime();
    const store = storeOf(r.metadata);
    byStore[store]++;
    const src = sourceOf(r.metadata);
    const agg = sources.get(src) ?? { total: 0, ios: 0, android: 0, other: 0, last7d: 0 };
    agg.total++;
    agg[store]++;
    if (now.getTime() - t < 7 * DAY) agg.last7d++;
    sources.set(src, agg);
    if (now.getTime() - t < DAY) last24h++;
    first = first == null ? t : Math.min(first, t);
    last = last == null ? t : Math.max(last, t);
    const day = days.get(ukDate(r.createdAt));
    if (day) {
      day.total++;
      day[store]++;
    }
  }
  return {
    total: rows.length,
    byStore,
    last24h,
    byDay: [...days.entries()].map(([date, v]) => ({ date, ...v })),
    firstAt: first == null ? null : new Date(first).toISOString(),
    lastAt: last == null ? null : new Date(last).toISOString(),
    bySource: [...sources.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source)),
  };
}
