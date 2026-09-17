// Name the stop where a split cuts a trip, at the moment the split happens.
//
// A split creates new boundary ends: leg one's end and leg two's start are the
// stop, and nobody has named that point yet. Until 17 Sep 2026 those were
// named from the driver's saved places and otherwise written as null for the
// hourly address backfill (jobs/geocodeMissingAddresses.ts) to fill. Drivers
// open the app in that gap. Luis De Abreu's trip was split at 18:21 and read
// "(blank) -> Home"; he deleted it at 18:23, and the job named the other leg
// at 18:23:35. Terry Lamb's leg sat blank until the 21:14 run on 15 Sep. A
// trip with a blank end looks like somebody else's, so they went.
//
// So the split now asks the same Nominatim geocoder the job uses, inline, with
// a hard cap: a slow or dead provider must never hold up or fail a split. Any
// boundary the cap cuts off stays null exactly as before, and the job still
// fills it. The service's own 30-day coordinate cache (including its memory of
// points with no name) is shared, so a later job pass costs nothing extra.

import { haversineDistance } from "@mileclear/shared";
import { reverseGeocodeDetailed, type ReverseGeocodeResult } from "./geocoding.js";
import { logEvent } from "./appEvents.js";

/** Matches the geocode job's tolerance for a fix drifting off a saved pin. */
const SAVED_LOCATION_DRIFT_BUFFER_M = 50;
const METERS_TO_MILES = 1 / 1609.34;

/** One lookup is abandoned after this long. The service itself gives up at 4 s. */
export const SPLIT_GEOCODE_TIMEOUT_MS = 3000;
/** All lookups for one split share this budget; the job gets the rest. */
export const SPLIT_GEOCODE_BUDGET_MS = 8000;
/** Nominatim usage policy, the same pace the job keeps between uncached lookups. */
export const SPLIT_GEOCODE_PACE_MS = 1100;

export interface SavedPlace {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface BoundaryPoint {
  lat: number;
  lng: number;
  /** An address already on this boundary. Never replaced. */
  existing?: string | null;
}

export type BoundaryNameSource = "existing" | "saved" | "geocoder";

export interface BoundaryName {
  address: string | null;
  source: BoundaryNameSource | null;
}

export interface NameSplitBoundariesOptions {
  saved: SavedPlace[];
  /** Test hook. Defaults to the shared Nominatim service. */
  geocode?: (lat: number, lng: number) => Promise<ReverseGeocodeResult>;
  timeoutMs?: number;
  budgetMs?: number;
  paceMs?: number;
}

/**
 * The driver's own name for a point, or null. Nearest match wins, so a second
 * saved place a little further off cannot take the label (Rachel Thorndyke,
 * 7 Sep 2026: Samantha Littlewood's at 53 m against Longlakes Equestrian at 86 m).
 */
export function nearestSavedName(saved: SavedPlace[], lat: number, lng: number): string | null {
  let best: string | null = null;
  let bestMiles = Infinity;
  for (const loc of saved) {
    const miles = haversineDistance(lat, lng, loc.latitude, loc.longitude);
    const limit = (loc.radiusMeters + SAVED_LOCATION_DRIFT_BUFFER_M) * METERS_TO_MILES;
    if (miles <= limit && miles < bestMiles) {
      best = loc.name;
      bestMiles = miles;
    }
  }
  return best;
}

function hasValidCoords(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !(Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Name each boundary: an existing address stays, then the driver's saved
 * place, then the geocoder within the time cap. Never throws. Lookups run one
 * at a time in the order given, paced like the job, and stop for good after
 * the first timeout or provider failure (a provider that is down will not come
 * back in the next second, and each further try would cost another wait).
 */
export async function nameSplitBoundaries(
  points: BoundaryPoint[],
  opts: NameSplitBoundariesOptions
): Promise<BoundaryName[]> {
  const geocode = opts.geocode ?? reverseGeocodeDetailed;
  const timeoutMs = opts.timeoutMs ?? SPLIT_GEOCODE_TIMEOUT_MS;
  const budgetMs = opts.budgetMs ?? SPLIT_GEOCODE_BUDGET_MS;
  const paceMs = opts.paceMs ?? SPLIT_GEOCODE_PACE_MS;
  const deadline = Date.now() + budgetMs;

  const out: BoundaryName[] = points.map((p) => {
    if (p.existing) return { address: p.existing, source: "existing" };
    const saved = hasValidCoords(p.lat, p.lng) ? nearestSavedName(opts.saved, p.lat, p.lng) : null;
    return saved ? { address: saved, source: "saved" } : { address: null, source: null };
  });

  let providerDown = false;
  let needPace = false;
  for (let i = 0; i < points.length; i++) {
    if (out[i].address || providerDown) continue;
    const p = points[i];
    if (!hasValidCoords(p.lat, p.lng)) continue;

    if (needPace) {
      if (Date.now() + paceMs >= deadline) break;
      await sleep(paceMs);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const r = await Promise.race<ReverseGeocodeResult | "timeout">([
        geocode(p.lat, p.lng),
        new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), Math.min(timeoutMs, remaining));
        }),
      ]);
      if (r === "timeout" || r.outcome === "unavailable") {
        providerDown = true;
        continue;
      }
      needPace = !r.cached;
      if (r.address) out[i] = { address: r.address, source: "geocoder" };
    } catch {
      providerDown = true;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return out;
}

/**
 * Interior boundaries of a partitioned trip, named. starts[k] is leg k's start
 * and ends[k] its end; the outer ends (leg 0's start, the last leg's end) are
 * not the split's to name and come back null.
 */
export async function nameInteriorBoundaries(
  legs: Array<Array<{ lat: number; lng: number }>>,
  opts: NameSplitBoundariesOptions
): Promise<{ starts: Array<BoundaryName | null>; ends: Array<BoundaryName | null> }> {
  const starts: Array<BoundaryName | null> = legs.map(() => null);
  const ends: Array<BoundaryName | null> = legs.map(() => null);
  const points: BoundaryPoint[] = [];
  const slots: Array<{ kind: "start" | "end"; k: number }> = [];
  for (let k = 0; k < legs.length; k++) {
    const leg = legs[k];
    if (leg.length === 0) continue;
    if (k > 0) {
      points.push({ lat: leg[0].lat, lng: leg[0].lng });
      slots.push({ kind: "start", k });
    }
    if (k < legs.length - 1) {
      const last = leg[leg.length - 1];
      points.push({ lat: last.lat, lng: last.lng });
      slots.push({ kind: "end", k });
    }
  }
  // Order is leg order, so a budget cut-off leaves the latest stops to the job.
  const names = await nameSplitBoundaries(points, opts);
  slots.forEach((slot, i) => {
    if (slot.kind === "start") starts[slot.k] = names[i];
    else ends[slot.k] = names[i];
  });
  return { starts, ends };
}

/**
 * Same event the backfill job writes, marked source "split" so the admin view
 * can tell an inline fill from a job fill. Only geocoder fills are logged, as
 * in the job; a saved-place name was never a backfill.
 */
export function logSplitAddressFill(
  userId: string,
  tripId: string,
  start: BoundaryName | null | undefined,
  end: BoundaryName | null | undefined
): void {
  const filledStart = start?.source === "geocoder";
  const filledEnd = end?.source === "geocoder";
  if (!filledStart && !filledEnd) return;
  logEvent("trip.address_backfilled", userId, {
    tripId,
    filledStart,
    filledEnd,
    source: "split",
  });
}
