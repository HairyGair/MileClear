// URL <-> filter state for the Trips list. Pure so it can be unit tested.
import { PRESET_LABELS, presetRange, taxYearRange, type PeriodPreset } from "../../../../lib/dashboard/periods";
import { endOfLocalDayIso, startOfLocalDayIso } from "./days";

export type TripsView = "all" | "inbox" | "business" | "personal";
export const TRIPS_VIEWS: TripsView[] = ["all", "inbox", "business", "personal"];

export interface TripFilters {
  platform: string;
  from: string;
  to: string;
  /**
   * Project / client (23 Oct 2026): "" every client, NO_CLIENT trips with
   * none, else one label (the server matches it however it was typed).
   */
  client: string;
}

/** The "No client" choice. Not a label: labels are trimmed text. */
export const NO_CLIENT = "\u0000none";
const CLIENT_MAX = 100;

export const EMPTY_FILTERS: TripFilters = { platform: "", from: "", to: "", client: "" };
export const PAGE_SIZE = 20;

export function parseView(v: string | null | undefined): TripsView {
  return TRIPS_VIEWS.includes(v as TripsView) ? (v as TripsView) : "all";
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(get: (k: string) => string | null): TripFilters {
  const from = get("from") ?? "";
  const to = get("to") ?? "";
  const client = (get("client") ?? "").trim().replace(/\s+/g, " ").slice(0, CLIENT_MAX);
  return {
    platform: get("platform") ?? "",
    from: YMD.test(from) ? from : "",
    to: YMD.test(to) ? to : "",
    client: get("noclient") === "1" ? NO_CLIENT : client,
  };
}

export function activeFilterCount(f: TripFilters): number {
  return (f.platform ? 1 : 0) + (f.from || f.to ? 1 : 0) + (f.client ? 1 : 0);
}

/** "No client", the client's name, or "" with no client filter. */
export function clientLabel(f: TripFilters): string {
  return f.client === NO_CLIENT ? "No client" : f.client;
}

/**
 * The Trips URL for a Miles by project row: the trips it counts, so one
 * client (or no client, for null), Business, in that tax year.
 */
export function clientTripsHref(label: string | null, taxYear: string): string {
  const { from, to } = taxYearRange(taxYear);
  return `/dashboard/trips${pageUrlParams("business", { ...EMPTY_FILTERS, client: label ?? NO_CLIENT, from, to }, 1)}`;
}

const PRESETS: PeriodPreset[] = ["thisWeek", "thisMonth", "lastMonth", "thisTaxYear", "lastTaxYear"];

function shortYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace(/\bSept\b/g, "Sep");
}

/** "Last tax year" when the range is a preset, otherwise "9 Oct to 20 Oct". */
export function rangeLabel(f: TripFilters, now: Date = new Date()): string {
  for (const p of PRESETS) {
    const r = presetRange(p, now);
    if (r.from === f.from && r.to === f.to) return PRESET_LABELS[p];
  }
  if (f.from && f.to) return `${shortYmd(f.from)} to ${shortYmd(f.to)}`;
  if (f.from) return `From ${shortYmd(f.from)}`;
  return `Until ${shortYmd(f.to)}`;
}

export function classificationFor(view: TripsView): "business" | "personal" | "unclassified" | undefined {
  if (view === "business") return "business";
  if (view === "personal") return "personal";
  if (view === "inbox") return "unclassified";
  return undefined;
}

export function filterQuery(view: TripsView, f: TripFilters): URLSearchParams {
  const q = new URLSearchParams();
  const c = classificationFor(view);
  if (c) q.set("classification", c);
  if (f.platform) q.set("platformTag", f.platform);
  if (f.client === NO_CLIENT) q.set("noProjectLabel", "true");
  else if (f.client) q.set("projectLabel", f.client);
  if (f.from) q.set("from", startOfLocalDayIso(f.from));
  if (f.to) q.set("to", endOfLocalDayIso(f.to));
  return q;
}

/** Search params for the page URL: only what differs from the defaults. */
export function pageUrlParams(view: TripsView, f: TripFilters, pages: number): string {
  const q = new URLSearchParams();
  if (view !== "all") q.set("view", view);
  if (f.platform) q.set("platform", f.platform);
  if (f.client === NO_CLIENT) q.set("noclient", "1");
  else if (f.client) q.set("client", f.client);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (pages > 1) q.set("page", String(pages));
  const s = q.toString();
  return s ? `?${s}` : "";
}
