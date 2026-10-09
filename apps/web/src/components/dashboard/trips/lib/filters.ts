// URL <-> filter state for the Trips list. Pure so it can be unit tested.
import { PRESET_LABELS, presetRange, type PeriodPreset } from "../../../../lib/dashboard/periods";
import { endOfLocalDayIso, startOfLocalDayIso } from "./days";

export type TripsView = "all" | "inbox" | "business" | "personal";
export const TRIPS_VIEWS: TripsView[] = ["all", "inbox", "business", "personal"];

export interface TripFilters {
  platform: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: TripFilters = { platform: "", from: "", to: "" };
export const PAGE_SIZE = 20;

export function parseView(v: string | null | undefined): TripsView {
  return TRIPS_VIEWS.includes(v as TripsView) ? (v as TripsView) : "all";
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(get: (k: string) => string | null): TripFilters {
  const from = get("from") ?? "";
  const to = get("to") ?? "";
  return {
    platform: get("platform") ?? "",
    from: YMD.test(from) ? from : "",
    to: YMD.test(to) ? to : "",
  };
}

export function activeFilterCount(f: TripFilters): number {
  return (f.platform ? 1 : 0) + (f.from || f.to ? 1 : 0);
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
  if (f.from) q.set("from", startOfLocalDayIso(f.from));
  if (f.to) q.set("to", endOfLocalDayIso(f.to));
  return q;
}

/** Search params for the page URL: only what differs from the defaults. */
export function pageUrlParams(view: TripsView, f: TripFilters, pages: number): string {
  const q = new URLSearchParams();
  if (view !== "all") q.set("view", view);
  if (f.platform) q.set("platform", f.platform);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  if (pages > 1) q.set("page", String(pages));
  const s = q.toString();
  return s ? `?${s}` : "";
}
