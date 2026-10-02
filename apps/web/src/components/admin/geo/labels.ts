// Words and small helpers for the Sign-ups & geography page.

import type { AdminGeoConfidence, AdminGeoMetrics, AdminGeoPlatform } from "@mileclear/shared";
import type { Tone } from "@/components/admin/ui";

export type GeoWindowKey = "7" | "30" | "90" | "365" | "all";
export type GeoPlatformKey = "all" | "ios" | "android";

export const WINDOW_OPTIONS: Array<{ value: GeoWindowKey; short: string; long: string }> = [
  { value: "7", short: "7d", long: "7 days" },
  { value: "30", short: "30d", long: "30 days" },
  { value: "90", short: "90d", long: "90 days" },
  { value: "365", short: "1y", long: "12 months" },
  { value: "all", short: "All", long: "All time" },
];

export const PLATFORM_OPTIONS: Array<{ value: GeoPlatformKey; label: string }> = [
  { value: "all", label: "All phones" },
  { value: "ios", label: "iPhone" },
  { value: "android", label: "Android" },
];

/** "the last 30 days", "all time". */
export function windowPhrase(w: GeoWindowKey): string {
  if (w === "all") return "all time";
  if (w === "365") return "the last 12 months";
  return `the last ${w} days`;
}

/** "vs the 30 days before". */
export function previousPhrase(w: GeoWindowKey): string {
  if (w === "365") return "vs the 12 months before";
  return `vs the ${w} days before`;
}

export const CONFIDENCE: Record<AdminGeoConfidence, { label: string; tone: Tone; hint: string }> = {
  trip_postcode: { label: "Trip postcode", tone: "good", hint: "Placed by the postcode most of their trips start from" },
  saved_home: { label: "Saved home", tone: "info", hint: "Placed by the home they saved in the app" },
  trip_location: { label: "Trip location", tone: "info", hint: "Placed by where their trips start, without a full postcode" },
  signup_ip: { label: "Signup IP", tone: "warn", hint: "Placed only by the internet address they signed up from, which is often a mobile network hub" },
  unknown: { label: "Unknown", tone: "neutral", hint: "Nothing yet tells us where they drive from" },
};

export const CONFIDENCE_ORDER: AdminGeoConfidence[] = ["trip_postcode", "saved_home", "trip_location", "signup_ip", "unknown"];

export function platformLabel(p: AdminGeoPlatform | null): string {
  if (p === "ios") return "iPhone";
  if (p === "android") return "Android";
  if (p === "both") return "iPhone and Android";
  if (p === "web") return "Web";
  return "Phone not known";
}

/** "3 min ago", "5 hours ago", "2 days ago". */
export function hoursAgoLabel(h: number): string {
  if (h < 1) {
    const m = Math.max(1, Math.round(h * 60));
    return `${m} min ago`;
  }
  if (h < 24) {
    const r = Math.round(h);
    return `${r} hour${r === 1 ? "" : "s"} ago`;
  }
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Activation as a whole percent, or "-" with no sign-ups. */
export function activationLabel(m: Pick<AdminGeoMetrics, "activationRatePct">): string {
  return m.activationRatePct == null ? "-" : `${Math.round(m.activationRatePct)}%`;
}

export function shareOf(n: number, of: number): number | null {
  return of > 0 ? (n / of) * 100 : null;
}

/** HTML-escape for Leaflet tooltip strings. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** Sum a set of metric rows (used for page-wide totals from byNation). */
export function sumMetrics(rows: AdminGeoMetrics[]) {
  const t = { signups: 0, activated: 0, ios: 0, android: 0, both: 0, other: 0 };
  for (const r of rows) {
    t.signups += r.signups;
    t.activated += r.activatedSignups;
    t.ios += r.platform.ios;
    t.android += r.platform.android;
    t.both += r.platform.both;
    t.other += r.platform.other;
  }
  return t;
}
