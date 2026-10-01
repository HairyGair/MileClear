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
}

const DAY = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in UK time (handles BST/GMT). */
function ukDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
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
  let last24h = 0;
  let first: number | null = null;
  let last: number | null = null;
  for (const r of rows) {
    const t = r.createdAt.getTime();
    const store = storeOf(r.metadata);
    byStore[store]++;
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
  };
}
