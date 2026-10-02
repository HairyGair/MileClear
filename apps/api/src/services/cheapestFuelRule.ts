/**
 * "Cheapest fuel near you" rule (pure, unit tested). October 2026.
 *
 * Owner, 2 Oct 2026: "fuel is incredibly expensive currently. We shouldn't
 * forget about EV drivers either."
 *
 * One opt-in push each morning, only when it is worth reading:
 *   - the driver's primary vehicle decides the fuel (hybrid uses petrol E10,
 *     diesel uses B7, electric goes down the EV path instead);
 *   - the search centres on where they usually start trips (median of recent
 *     trip starts), falling back to their saved home;
 *   - stations within 5 miles, widened to 10 when fewer than 3 have a fresh
 *     price; fewer than 3 at 10 miles means no local average worth quoting;
 *   - a price reported more than 48 hours ago is ignored, and so is one with
 *     no timestamp at all (we do not guess);
 *   - it sends only when the cheapest is at least 3p a litre under the local
 *     average, and not when it is the same station at the same price as the
 *     last alert (yesterday's news is not news).
 *
 * The same selection feeds GET /fuel/cheapest-today, so the line at the top of
 * the fuel tab and the push never disagree.
 *
 * EV: there is no free national feed of public charger prices (see the report
 * in evCharging.ts), so the EV side is an honest running-cost estimate:
 * home tariff vs an editable public rapid price, per mile and for last week.
 */

import type { FuelStation } from "@mileclear/shared";
import { formatPence } from "@mileclear/shared";
import { median } from "./geography.js";

export const BASE_RADIUS_MILES = 5;
export const WIDE_RADIUS_MILES = 10;
export const MIN_STATIONS = 3;
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
/** Pence per litre under the local average before a push is worth sending. */
export const ALERT_THRESHOLD_PENCE = 3;
/** Litres used for "what it saves" when the vehicle has no tank size. */
export const DEFAULT_SAVING_LITRES = 50;
/** Trip starts used for the usual start point. */
export const START_POINT_LOOKBACK_DAYS = 30;
export const START_POINT_MAX_TRIPS = 50;
export const START_POINT_MIN_TRIPS = 3;

// A retailer feed occasionally carries a price in pounds or a placeholder.
// Anything outside this band is not a pence-per-litre price.
const PLAUSIBLE_MIN = 50;
const PLAUSIBLE_MAX = 400;

export type PumpFuelKey = "E10" | "B7";

export type FuelPath =
  | { path: "fuel"; key: PumpFuelKey; label: "petrol" | "diesel" }
  | { path: "ev" };

/** Vehicle fuel type to what we price. Hybrids fill up with petrol. Unknown
 *  types get nothing rather than a guess. */
export function fuelPathForVehicle(fuelType: string | null | undefined): FuelPath | null {
  switch ((fuelType ?? "").toLowerCase()) {
    case "petrol":
    case "hybrid":
      return { path: "fuel", key: "E10", label: "petrol" };
    case "diesel":
      return { path: "fuel", key: "B7", label: "diesel" };
    case "electric":
      return { path: "ev" };
    default:
      return null;
  }
}

/** The vehicle that decides the fuel: the primary one, else the newest. */
export function pickPrimaryVehicle<
  V extends { isPrimary: boolean; createdAt: Date },
>(vehicles: V[]): V | null {
  if (vehicles.length === 0) return null;
  const primary = vehicles.find((v) => v.isPrimary);
  if (primary) return primary;
  return [...vehicles].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

function usable(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

export interface StartPoint {
  lat: number;
  lng: number;
  source: "trip_starts" | "saved_home";
}

/** Where the driver usually sets off: the median of their recent trip starts
 *  (needs at least 3, so one odd journey does not move it), else their saved
 *  home. The median, not the mean, so a single long-distance trip barely
 *  shifts it. */
export function pickStartPoint(input: {
  tripStarts: { startLat: number | null; startLng: number | null }[];
  savedHome: { latitude: number; longitude: number } | null;
}): StartPoint | null {
  const pts = input.tripStarts.filter((t) => usable(t.startLat, t.startLng));
  if (pts.length >= START_POINT_MIN_TRIPS) {
    const lat = median(pts.map((p) => p.startLat!));
    const lng = median(pts.map((p) => p.startLng!));
    if (lat != null && lng != null) return { lat, lng, source: "trip_starts" };
  }
  if (input.savedHome && usable(input.savedHome.latitude, input.savedHome.longitude)) {
    return { lat: input.savedHome.latitude, lng: input.savedHome.longitude, source: "saved_home" };
  }
  return null;
}

/**
 * Feed timestamps to epoch ms. The Fuel Finder API sends ISO; the retailer
 * feeds send "02/10/2026 09:56:30" (UK day first), which Date.parse misreads
 * or rejects. The day-first form is read as UTC: up to an hour out in summer,
 * which does not matter against a 48-hour staleness limit.
 */
export function parsePriceTimestamp(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const s = raw.trim();
  const dayFirst = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dayFirst) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = dayFirst;
    const ms = Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss);
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** "TESCO EXTRA" to "Tesco Extra"; short initialisms ("BP", "JET", "MFG")
 *  stay as they are. Mixed-case text is left alone. */
function titleCaseIfShouting(text: string): string {
  if (text !== text.toUpperCase() || !/[A-Z]/.test(text)) return text;
  return text
    .split(/(\s+)/)
    .map((w) => (w.length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join("");
}

/** "Tesco Gateshead" from brand "TESCO" and address "Park Road, Gateshead".
 *  The town is the last address part that is not a postcode. */
export function shortStationName(brand: string, address: string): string {
  const b = titleCaseIfShouting(brand.trim()) || "A station";
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/\d/.test(p));
  const town = parts.length ? titleCaseIfShouting(parts[parts.length - 1]) : "";
  if (!town || b.toLowerCase().includes(town.toLowerCase())) return b;
  return `${b} ${town}`;
}

export interface LastAlert {
  siteId: string;
  pencePerLitre: number;
}

export type FuelDecision =
  | "send"
  | "below_threshold"
  | "same_as_last_alert"
  | "too_few_stations";

export interface FuelSelection {
  decision: FuelDecision;
  radiusMiles: number;
  /** Stations with a fresh, plausible price inside radiusMiles. */
  stationCount: number;
  cheapest: {
    siteId: string;
    name: string;
    pencePerLitre: number;
    distanceMiles: number;
    latitude: number;
    longitude: number;
  } | null;
  localAveragePence: number | null;
  /** Local average minus the cheapest, one decimal. */
  underLocalPence: number;
  nationalAveragePence: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pick today's cheapest station for one driver. `stations` must already be
 * the stations within WIDE_RADIUS_MILES of the start point (fuel.ts
 * getNearbyStations), so the radius widening needs no second lookup.
 */
export function selectCheapestFuel(input: {
  stations: FuelStation[];
  key: PumpFuelKey;
  nowMs: number;
  nationalAveragePence: number | null;
  lastAlert: LastAlert | null;
}): FuelSelection {
  const fresh: { s: FuelStation; price: number }[] = [];
  for (const s of input.stations) {
    const price = s.prices[input.key];
    if (typeof price !== "number" || price < PLAUSIBLE_MIN || price > PLAUSIBLE_MAX) continue;
    const at = parsePriceTimestamp(s.pricesUpdatedAt?.[input.key]);
    if (at == null || input.nowMs - at > STALE_AFTER_MS) continue;
    fresh.push({ s, price });
  }

  let radiusMiles = BASE_RADIUS_MILES;
  let pool = fresh.filter((f) => f.s.distanceMiles <= BASE_RADIUS_MILES);
  if (pool.length < MIN_STATIONS) {
    radiusMiles = WIDE_RADIUS_MILES;
    pool = fresh.filter((f) => f.s.distanceMiles <= WIDE_RADIUS_MILES);
  }

  const base: FuelSelection = {
    decision: "too_few_stations",
    radiusMiles,
    stationCount: pool.length,
    cheapest: null,
    localAveragePence: null,
    underLocalPence: 0,
    nationalAveragePence: input.nationalAveragePence,
  };
  if (pool.length < MIN_STATIONS) return base;

  const avg = median(pool.map((f) => f.price))!;
  // Cheapest price; a tie goes to the nearer station.
  const best = [...pool].sort((a, b) => a.price - b.price || a.s.distanceMiles - b.s.distanceMiles)[0];
  const under = Math.max(0, round1(avg - best.price));

  const sel: FuelSelection = {
    ...base,
    cheapest: {
      siteId: best.s.siteId,
      name: shortStationName(best.s.brand, best.s.address),
      pencePerLitre: best.price,
      distanceMiles: best.s.distanceMiles,
      latitude: best.s.latitude,
      longitude: best.s.longitude,
    },
    localAveragePence: round1(avg),
    underLocalPence: under,
  };

  if (under < ALERT_THRESHOLD_PENCE) return { ...sel, decision: "below_threshold" };
  if (
    input.lastAlert &&
    input.lastAlert.siteId === best.s.siteId &&
    Math.abs(input.lastAlert.pencePerLitre - best.price) < 0.05
  ) {
    return { ...sel, decision: "same_as_last_alert" };
  }
  return { ...sel, decision: "send" };
}

/** "139.9p" */
export function formatPpl(pence: number): string {
  return `${pence.toFixed(1)}p`;
}

/** "6p" or "5.5p": whole pence lose the ".0". */
export function formatPenceGap(pence: number): string {
  const r = round1(pence);
  return Number.isInteger(r) ? `${r}p` : `${r.toFixed(1)}p`;
}

/** The fuel tab's one sentence. */
export function cheapestFuelLine(label: "petrol" | "diesel", sel: FuelSelection): string | null {
  if (!sel.cheapest) return null;
  const head = `Cheapest ${label} near you today: ${formatPpl(sel.cheapest.pencePerLitre)} at ${sel.cheapest.name}`;
  if (sel.underLocalPence >= 0.5) {
    return `${head}, ${formatPenceGap(sel.underLocalPence)} under the local average.`;
  }
  return `${head}, about the same as the local average.`;
}

export interface PushCopy {
  title: string;
  body: string;
}

/** The morning push. Only called for a "send" decision. */
export function buildFuelAlertCopy(
  label: "petrol" | "diesel",
  sel: FuelSelection,
  tankLitres: number | null = null
): PushCopy | null {
  if (!sel.cheapest) return null;
  const c = sel.cheapest;
  let body = `${formatPpl(c.pencePerLitre)} at ${c.name}, ${formatPenceGap(sel.underLocalPence)} under the local average`;
  const underNational =
    sel.nationalAveragePence != null ? round1(sel.nationalAveragePence - c.pencePerLitre) : 0;
  if (underNational >= 1) {
    body += ` and ${formatPenceGap(underNational)} under the UK average`;
  }
  body += ".";
  const litres = tankLitres && tankLitres > 0 ? tankLitres : DEFAULT_SAVING_LITRES;
  const savingPence = Math.round(sel.underLocalPence * litres);
  if (savingPence >= 50) {
    const what = tankLitres && tankLitres > 0 ? `a full tank (${litres} litres)` : `${litres} litres`;
    body += ` About ${formatPence(savingPence)} less on ${what}.`;
  }
  return { title: `Cheapest ${label} near you today`, body };
}

// ── EV ─────────────────────────────────────────────────────────────────────

export interface EvCostInput {
  milesPerKwh: number;
  homePencePerKwh: number;
  publicPencePerKwh: number;
}

export function evPencePerMile(milesPerKwh: number, pencePerKwh: number): number {
  return milesPerKwh > 0 ? pencePerKwh / milesPerKwh : 0;
}

/** The fuel tab's EV sentence. */
export function evRunningCostLine(i: EvCostInput): string {
  const home = evPencePerMile(i.milesPerKwh, i.homePencePerKwh);
  const pub = evPencePerMile(i.milesPerKwh, i.publicPencePerKwh);
  return (
    `Charging at home costs about ${formatPenceGap(home)} a mile. ` +
    `On a public rapid charger at ${formatPenceGap(i.publicPencePerKwh)}/kWh it is about ${formatPenceGap(pub)} a mile.`
  );
}

/** The Monday EV push: last week's miles costed both ways. Null when there
 *  was no driving to cost. */
export function buildEvWeeklyCopy(
  i: EvCostInput & { miles: number; vehicleName: string | null }
): PushCopy | null {
  if (!(i.miles >= 1) || !(i.milesPerKwh > 0)) return null;
  const kwh = i.miles / i.milesPerKwh;
  const homePence = Math.round(kwh * i.homePencePerKwh);
  const publicPence = Math.round(kwh * i.publicPencePerKwh);
  const miles = Math.round(i.miles).toLocaleString("en-GB");
  const inVehicle = i.vehicleName ? ` in your ${i.vehicleName}` : "";
  const body =
    `${miles} miles${inVehicle}: about ${formatPence(homePence)} charged at home ` +
    `(${formatPenceGap(evPencePerMile(i.milesPerKwh, i.homePencePerKwh))} a mile), ` +
    `or ${formatPence(publicPence)} on public rapid chargers at ${formatPenceGap(i.publicPencePerKwh)}/kWh.`;
  return { title: "Your EV running costs last week", body };
}

// ── When the pushes go ─────────────────────────────────────────────────────
//
// Asked for "about 07:00". Pushes are held between 21:00 and 08:00 UK time
// (pushQuietHoursRule.ts, 28 Sep 2026) and a reminder must not opt out of
// that, so the morning alert goes at 08:00-09:59 UK, before most drivers fill
// up. Two hours wide so the 30-minute runner lands in it several times
// whatever minute the server booted on; the per-day check keeps it to one.

export const FUEL_ALERT_WINDOW_START_HOUR = 8;
export const FUEL_ALERT_WINDOW_END_HOUR = 10;

export function inFuelAlertWindow(localHour: number): boolean {
  return localHour >= FUEL_ALERT_WINDOW_START_HOUR && localHour < FUEL_ALERT_WINDOW_END_HOUR;
}

/** EV summary: Mondays 09:00-10:59 UK, covering the week just ended. */
export function inEvWeeklyWindow(clock: { year: number; month: number; day: number; hour: number }): boolean {
  const weekday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay();
  return weekday === 1 && clock.hour >= 9 && clock.hour < 11;
}
