// "Just the totals" on the Add a past shift screen (Lucian, Deliveroo, 19 Oct
// 2026): typing every drop of a past shift is tedious, and the platform does
// not always show where a drop was. Instead the driver types the shift's
// total miles, how many drops (optional), and where the shift started and
// finished. The server saves it as one Business trip across the shift with
// exactly those miles (POST /shifts/past with `totals`).
//
// Start defaults to the driver's saved Home; finish follows the start until
// the driver picks a finish of their own. Validity is shared with the server
// (@mileclear/shared pastShiftTotalsProblem), so the two agree.
//
// Pure: no React, no database, no clock (callers pass `now`).

import { formatMiles, pastShiftTotalsProblem } from "@mileclear/shared";
import type { ShiftWindowPlan } from "./pastShiftRule";
import { parseAmountPence } from "./pastShiftRule";
import { parseTypedMilesText } from "../trips/typedMiles";

export type PastShiftMode = "trips" | "totals";

export interface TotalsPlace {
  lat: number;
  lng: number;
  address: string | null;
}

export interface DraftTotals {
  from: TotalsPlace | null;
  to: TotalsPlace | null;
  /** The driver picked the finish themselves; it no longer follows the start. */
  toPicked: boolean;
  milesText: string;
  dropsText: string;
  platformTag: string | null;
}

/** A saved place row as the phone's saved_locations table holds it. */
export interface SavedPlaceForHome {
  name: string;
  latitude: number;
  longitude: number;
  location_type?: string | null;
}

/** The driver's saved Home, or null when they have none. */
export function homeFrom(saved: SavedPlaceForHome[]): TotalsPlace | null {
  const home = saved.find(
    (s) => s.location_type === "home" && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
  );
  if (!home) return null;
  return { lat: home.latitude, lng: home.longitude, address: home.name.trim() || "Home" };
}

/** A fresh totals form: start and finish at Home when there is one. */
export function emptyTotals(home: TotalsPlace | null): DraftTotals {
  return { from: home, to: home, toPicked: false, milesText: "", dropsText: "", platformTag: null };
}

/**
 * Home arrived after the form opened (it is read from the phone): fill the
 * places the driver has not set yet, and nothing else.
 */
export function withHome(t: DraftTotals, home: TotalsPlace | null): DraftTotals {
  if (!home || t.from) return t;
  return { ...t, from: home, to: t.toPicked ? t.to : home };
}

/** The start moved (or was cleared). The finish follows it until the driver picks one. */
export function withStart(t: DraftTotals, from: TotalsPlace | null): DraftTotals {
  return { ...t, from, to: t.toPicked ? t.to : from };
}

/** The driver picked (or cleared) the finish themselves. */
export function withFinish(t: DraftTotals, to: TotalsPlace | null): DraftTotals {
  return { ...t, to, toPicked: true };
}

/** "84", "84.5", "84,5", "1,000", "84 mi" -> miles. Null for anything else or nothing. */
export const parseTotalMiles = parseTypedMilesText;

/** "32" -> 32; empty -> null (drops are optional); anything else -> NaN. */
export function parseDrops(text: string): number | null {
  const cleaned = text.trim();
  if (!cleaned) return null;
  return /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

/**
 * What the Save button says while it can't be pressed, or null. One plain
 * ask, the first thing missing.
 */
export function missingForTotals(args: {
  shiftStart: Date | null;
  shiftEnd: Date | null;
  totals: DraftTotals;
  carNeeded?: boolean;
}): string | null {
  if (!args.shiftStart) return "Add when the shift started";
  if (!args.shiftEnd) return "Add when the shift ended";
  if (args.carNeeded) return "Pick which car you drove";
  if (!args.totals.milesText.trim()) return "Add the total miles";
  if (!args.totals.from) return "Add where the shift started";
  if (!args.totals.to) return "Add where the shift finished";
  return null;
}

export interface PastShiftTotalsBody {
  startedAt: string;
  endedAt: string;
  vehicleId?: string;
  totals: {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    startAddress?: string;
    endAddress?: string;
    distanceMiles: number;
    drops?: number;
    platformTag?: string;
  };
  earning?: { platform: string; amountPence: number };
}

/**
 * The request for POST /shifts/past from the totals, or the reason it can't
 * be sent yet. The shift's times are saved as given: there are no trip times
 * to stretch them around.
 */
export function buildPastShiftTotalsBody(args: {
  shiftStart: Date | null;
  shiftEnd: Date | null;
  vehicleId: string | null;
  totals: DraftTotals;
  earningText: string;
  earningPlatform: string | null;
  now: number;
  carNeeded?: boolean;
}): { body: PastShiftTotalsBody; plan: ShiftWindowPlan } | { problem: string } {
  const missing = missingForTotals({
    shiftStart: args.shiftStart,
    shiftEnd: args.shiftEnd,
    totals: args.totals,
    carNeeded: args.carNeeded,
  });
  if (missing) return { problem: missing };
  const startedAt = args.shiftStart as Date;
  const endedAt = args.shiftEnd as Date;
  const from = args.totals.from as TotalsPlace;
  const to = args.totals.to as TotalsPlace;

  const miles = parseTotalMiles(args.totals.milesText);
  if (miles == null) return { problem: "Check the total miles, for example 84.5." };
  const drops = parseDrops(args.totals.dropsText);

  const problem = pastShiftTotalsProblem({ startedAt, endedAt, distanceMiles: miles, drops, now: args.now });
  if (problem) return { problem };

  let earning: PastShiftTotalsBody["earning"];
  if (args.earningText.trim()) {
    const pence = parseAmountPence(args.earningText);
    if (pence == null) return { problem: "Check the amount earned, for example 64.50." };
    if (!args.earningPlatform) return { problem: "Pick which app the earnings are from." };
    earning = { platform: args.earningPlatform, amountPence: pence };
  }

  return {
    body: {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      ...(args.vehicleId ? { vehicleId: args.vehicleId } : {}),
      totals: {
        startLat: from.lat,
        startLng: from.lng,
        endLat: to.lat,
        endLng: to.lng,
        ...(from.address ? { startAddress: from.address } : {}),
        ...(to.address ? { endAddress: to.address } : {}),
        distanceMiles: Math.round(miles * 100) / 100,
        ...(drops != null ? { drops } : {}),
        ...(args.totals.platformTag ? { platformTag: args.totals.platformTag } : {}),
      },
      ...(earning ? { earning } : {}),
    },
    plan: { startedAt, endedAt, stretched: false, message: null },
  };
}

/** The line under the form before saving: "84.5 mi, 32 drops". */
export function totalsSummary(t: DraftTotals): string | null {
  const miles = parseTotalMiles(t.milesText);
  if (miles == null) return null;
  const drops = parseDrops(t.dropsText);
  const dropWords = drops != null && Number.isInteger(drops) && drops > 0 ? `, ${drops} ${drops === 1 ? "drop" : "drops"}` : "";
  return `${formatMiles(miles)}${dropWords}`;
}

/** Miles to one decimal place, always: "84.0 mi". The driver typed this figure, so it reads back as typed. */
function oneDecimalMiles(miles: number): string {
  return `${miles.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
}

/** The confirmation once the server has saved the shift. */
export function pastShiftSavedText(args: {
  tripCount: number;
  miles: number;
  fromTotals: boolean;
  /** Trips the server found already saved in the total's hours (its 201 `overlapping`). */
  overlappingTrips?: number;
}): string {
  if (args.fromTotals) {
    const join = (args.overlappingTrips ?? 0) > 0 ? " Check Trips to join them into the total." : "";
    return `1 shift, ${oneDecimalMiles(args.miles)} from your totals, saved as Business.${join}`;
  }
  return `${args.tripCount} ${args.tripCount === 1 ? "trip" : "trips"}, ${formatMiles(args.miles)}, saved as Business.`;
}

/**
 * The trips MileClear already has whose time sits inside the shift: the same
 * rule the server uses to mark them as possible doubles of the total. A trip
 * with no end is judged by its start. Personal trips are left out, as the
 * server leaves them unmarked; a trip whose classification isn't known
 * (the phone's own list may not say) counts.
 */
export function tripsInsideShift(
  trips: Array<{ startedAt: string | Date; endedAt: string | Date | null; distanceMiles: number; classification?: string | null }>,
  shiftStart: Date,
  shiftEnd: Date
): { trips: number; miles: number } {
  const s = shiftStart.getTime();
  const e = shiftEnd.getTime();
  let count = 0;
  let miles = 0;
  for (const t of trips) {
    const ts = new Date(t.startedAt).getTime();
    const te = t.endedAt ? new Date(t.endedAt).getTime() : ts;
    if (!Number.isFinite(ts) || !Number.isFinite(te)) continue;
    if (t.classification === "personal") continue;
    if (ts >= s && te <= e) {
      count += 1;
      miles += Number.isFinite(t.distanceMiles) ? t.distanceMiles : 0;
    }
  }
  return { trips: count, miles: Math.round(miles * 100) / 100 };
}

/** The warning before saving a total over hours that already hold trips. */
export function totalsOverlapWarning(found: { trips: number; miles: number }): string | null {
  if (found.trips <= 0) return null;
  const what = `${found.trips} ${found.trips === 1 ? "trip" : "trips"} (${formatMiles(found.miles)})`;
  return `MileClear already has ${what} in these hours. Saving the total as well could count those miles twice.`;
}
