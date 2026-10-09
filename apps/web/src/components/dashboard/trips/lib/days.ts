// Day grouping for the trips list. Days are Europe/London days, the same ones
// the odometer log uses, so a day header and its odometer line always agree.

const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-09" in Europe/London. */
export function londonDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return DAY_FMT.format(d);
}

export interface DayGroup<T> {
  key: string;
  items: T[];
  miles: number;
}

/** Group newest-first items into consecutive days. Order is kept. */
export function groupByDay<T extends { startedAt: string; distanceMiles: number }>(items: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = londonDay(item.startedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
      last.miles += item.distanceMiles;
    } else {
      groups.push({ key, items: [item], miles: item.distanceMiles });
    }
  }
  return groups;
}

/** A Date at midday on a YYYY-MM-DD key, safe to format in any timezone. */
export function dayKeyToDate(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

/** The ISO instant a local date starts, for the API's `from`. */
export function startOfLocalDayIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toISOString();
}

/** The ISO instant a local date ends, for the API's `to`. */
export function endOfLocalDayIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999`).toISOString();
}

/** YYYY-MM-DD for a local Date. */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Combine a local date ("2026-10-09") and time ("18:40") into an ISO instant. */
export function localToIso(ymd: string, hm: string): string {
  return new Date(`${ymd}T${hm}:00`).toISOString();
}

export function isoToLocalYmd(iso: string): string {
  return toYmd(new Date(iso));
}

export function isoToLocalHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
