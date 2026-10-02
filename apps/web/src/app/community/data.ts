import type { CommunityMonthly } from "@mileclear/shared";

// Reads GET /community/monthly on the server, fresh on every visit: the API
// caches each finished month for a day, so this is cheap. (It was ISR, but
// a render during the deploy that added the endpoint cached "couldn't load"
// for an hour, 2 Oct 2026.)

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type CommunityResult =
  | { status: "ok"; data: CommunityMonthly }
  | { status: "missing" }
  | { status: "error" };

export async function fetchCommunityMonthly(month?: string): Promise<CommunityResult> {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  try {
    const res = await fetch(`${base}/community/monthly${qs}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 400) return { status: "missing" };
    if (!res.ok) return { status: "error" };
    const body = (await res.json()) as { data?: CommunityMonthly };
    return body.data ? { status: "ok", data: body.data } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

/** "about £123,000": the claim value is an estimate, so it is rounded. */
export function formatClaim(pence: number): string {
  const pounds = pence / 100;
  const step = pounds >= 100_000 ? 1000 : pounds >= 10_000 ? 100 : 10;
  return `£${(Math.round(pounds / step) * step).toLocaleString("en-GB")}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

/** "Friday 11 September". */
export function dayLabel(day: { date: string; weekday: string }): string {
  return `${day.weekday} ${Number(day.date.slice(8, 10))} ${MONTHS[Number(day.date.slice(5, 7)) - 1]}`;
}

/** One-sentence summary for metadata and the headline. */
export function summarySentence(c: CommunityMonthly): string | null {
  if (!c.published || c.activeDrivers == null || c.totalMiles == null || c.trips == null) return null;
  return `In ${monthName(c.month)}, ${formatCount(c.activeDrivers)} MileClear drivers logged ${formatCount(c.totalMiles)} miles across ${formatCount(c.trips)} trips.`;
}
