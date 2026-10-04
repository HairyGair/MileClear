// Ticket defender lookup (Pro, Oct 2026).
//
// A driver enters the date and time on a penalty notice (and optionally where
// and which vehicle). This gathers what MileClear recorded within an hour
// either side: the trips, their GPS breadcrumbs, the point nearest the time,
// the point nearest the place, speeds, accuracy and gaps. The pure work lives
// in @mileclear/shared (utils/ticketDefender.ts); this file is the database,
// postcode and street-name lookups.
//
// Street names come from Nominatim (OpenStreetMap) through
// services/geocoding.ts, the same provider and 30-day cache that names trip
// addresses. At most two lookups per request, and every lookup from this file
// goes through one queue spaced 1.1 s apart, so a run of lookups never bursts
// the shared provider.

import { prisma } from "../lib/prisma.js";
import { cacheGet, cacheSet } from "../lib/redis.js";
import { reverseGeocodeDetailed } from "./geocoding.js";
import {
  accuracyStats,
  buildLookupSummary,
  findRecordingGaps,
  nearestInTime,
  nearestToLocation,
  tableRows,
  TICKET_DEFENDER_CAVEATS,
  toView,
  type TdPoint,
  type TicketDefenderLookup,
} from "@mileclear/shared";

export const TD_WINDOW_MINUTES = 60;
const MAX_POINTS = 20_000;

export interface TicketDefenderInput {
  at: Date;
  lat?: number | null;
  lng?: number | null;
  postcode?: string | null;
  /** Free text from the map picker, shown back as the notice location. */
  locationLabel?: string | null;
  vehicleId?: string | null;
}

export class TicketDefenderInputError extends Error {}

// ── Postcode → point (postcodes.io, as the trips route does) ──────────────

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export function normalisePostcode(raw: string): { code: string; partial: boolean } | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (POSTCODE_RE.test(s)) {
    const compact = s.replace(/\s/g, "");
    return { code: `${compact.slice(0, -3)} ${compact.slice(-3)}`, partial: false };
  }
  if (OUTCODE_RE.test(s)) return { code: s, partial: true };
  return null;
}

export async function postcodeToPoint(raw: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const pc = normalisePostcode(raw);
  if (!pc) return null;
  const key = `td:pc:${pc.code}`;
  const cached = await cacheGet(key);
  if (cached) {
    const [lat, lng] = cached.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, label: pc.code };
  }
  try {
    const url = pc.partial
      ? `https://api.postcodes.io/outcodes/${encodeURIComponent(pc.code)}`
      : `https://api.postcodes.io/postcodes/${encodeURIComponent(pc.code)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
    const lat = body.result?.latitude;
    const lng = body.result?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    await cacheSet(key, `${lat},${lng}`, 30 * 24 * 60 * 60);
    return { lat, lng, label: pc.code };
  } catch {
    return null;
  }
}

// ── Paced street names ───────────────────────────────────────────────────

const NOMINATIM_SPACING_MS = 1100;
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNetworkLookupAt = 0;

function pacedAddress(lat: number, lng: number): Promise<string | null> {
  const run = async () => {
    const wait = lastNetworkLookupAt + NOMINATIM_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const r = await reverseGeocodeDetailed(lat, lng);
    if (!r.cached) lastNetworkLookupAt = Date.now();
    return r.address;
  };
  const next = nominatimQueue.then(run, run);
  nominatimQueue = next.catch(() => undefined);
  return next;
}

// ── Lookup ───────────────────────────────────────────────────────────────

function vehicleLabelOf(v: { make: string; model: string } | null | undefined): string | null {
  if (!v) return null;
  const label = `${v.make} ${v.model}`.trim();
  return label || null;
}

export async function lookupTicketRecord(userId: string, input: TicketDefenderInput): Promise<TicketDefenderLookup> {
  return (await lookupTicketRecordWithPoints(userId, input)).lookup;
}

/** The lookup plus every point in the window (the PDF draws the track from them). */
export async function lookupTicketRecordWithPoints(
  userId: string,
  input: TicketDefenderInput
): Promise<{ lookup: TicketDefenderLookup; points: TdPoint[] }> {
  const atMs = input.at.getTime();
  if (!Number.isFinite(atMs)) throw new TicketDefenderInputError("That date and time could not be read.");
  if (atMs > Date.now() + 5 * 60_000) throw new TicketDefenderInputError("The time on the notice is in the future.");
  const lo = new Date(atMs - TD_WINDOW_MINUTES * 60_000);
  const hi = new Date(atMs + TD_WINDOW_MINUTES * 60_000);

  // Where the notice says.
  let location: TicketDefenderLookup["location"] = null;
  if (input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    location = { lat: input.lat, lng: input.lng, label: input.locationLabel?.slice(0, 200) ?? null, source: "map" };
  } else if (input.postcode) {
    const p = await postcodeToPoint(input.postcode);
    if (!p) throw new TicketDefenderInputError("We couldn't find that postcode. Check it, or pick the place on the map.");
    location = { lat: p.lat, lng: p.lng, label: p.label, source: "postcode" };
  }

  // Which vehicle.
  let chosenVehicle: { id: string; make: string; model: string; registrationPlate: string | null } | null = null;
  if (input.vehicleId) {
    chosenVehicle = await prisma.vehicle.findFirst({
      where: { id: input.vehicleId, userId },
      select: { id: true, make: true, model: true, registrationPlate: true },
    });
    if (!chosenVehicle) throw new TicketDefenderInputError("That vehicle was not found.");
  }

  const trips = await prisma.trip.findMany({
    where: {
      userId,
      isPhantomTrip: false,
      startedAt: { lte: hi },
      AND: [
        { OR: [{ endedAt: { gte: lo } }, { endedAt: null, startedAt: { gte: lo } }] },
        ...(chosenVehicle ? [{ OR: [{ vehicleId: chosenVehicle.id }, { vehicleId: null }] }] : []),
      ],
    },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      startAddress: true,
      endAddress: true,
      distanceMiles: true,
      isManualEntry: true,
      vehicle: { select: { id: true, make: true, model: true, registrationPlate: true } },
    },
    orderBy: { startedAt: "asc" },
    take: 50,
  });

  const trackedIds = trips.filter((t) => !t.isManualEntry).map((t) => t.id);
  const coords = trackedIds.length
    ? await prisma.tripCoordinate.findMany({
        where: { tripId: { in: trackedIds }, recordedAt: { gte: lo, lte: hi } },
        select: { tripId: true, lat: true, lng: true, speed: true, accuracy: true, recordedAt: true },
        orderBy: { recordedAt: "asc" },
        take: MAX_POINTS,
      })
    : [];

  let points: TdPoint[] = coords
    .filter((c) => !(Math.abs(c.lat) < 0.001 && Math.abs(c.lng) < 0.001))
    .map((c) => ({
      tripId: c.tripId,
      lat: c.lat,
      lng: c.lng,
      speed: c.speed,
      accuracy: c.accuracy,
      recordedAt: c.recordedAt.toISOString(),
    }));

  // A tracked trip with no breadcrumbs in the window still has its start and
  // end. Use them (no speed, no accuracy) and say so in the caveats.
  let startEndOnly = false;
  if (points.length === 0) {
    for (const t of trips) {
      if (t.isManualEntry) continue;
      if (t.startedAt >= lo && t.startedAt <= hi) {
        points.push({ tripId: t.id, lat: t.startLat, lng: t.startLng, speed: null, accuracy: null, recordedAt: t.startedAt.toISOString() });
      }
      if (t.endedAt && t.endLat != null && t.endLng != null && t.endedAt >= lo && t.endedAt <= hi) {
        points.push({ tripId: t.id, lat: t.endLat, lng: t.endLng, speed: null, accuracy: null, recordedAt: t.endedAt.toISOString() });
      }
    }
    points = points
      .filter((p) => !(Math.abs(p.lat) < 0.001 && Math.abs(p.lng) < 0.001))
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    startEndOnly = points.length > 0;
  }

  const pointsPerTrip = new Map<string, number>();
  for (const p of points) pointsPerTrip.set(p.tripId, (pointsPerTrip.get(p.tripId) ?? 0) + 1);

  const status: TicketDefenderLookup["status"] =
    points.length > 0 ? "recorded" : trips.length > 0 ? "manual_only" : "nothing_recorded";

  const nt = nearestInTime(points, atMs);
  const nl = location ? nearestToLocation(points, location.lat, location.lng) : null;

  // Street names: two lookups at most, queued and spaced.
  const ntAddress = nt ? await pacedAddress(points[nt.index].lat, points[nt.index].lng) : null;
  const nlAddress =
    nl && (!nt || nl.index !== nt.index) && nl.distanceMetres < 50_000
      ? await pacedAddress(points[nl.index].lat, points[nl.index].lng)
      : nt && nl && nl.index === nt.index
        ? ntAddress
        : null;

  const nearestInTimeView = nt
    ? { ...toView(points, nt.index, location?.lat, location?.lng), offsetSeconds: nt.offsetSeconds, address: ntAddress }
    : null;
  const nearestToLocationView = nl
    ? {
        ...toView(points, nl.index, location?.lat, location?.lng),
        offsetSeconds: Math.round((new Date(points[nl.index].recordedAt).getTime() - atMs) / 1000),
        address: nlAddress,
      }
    : null;

  // The vehicle to name: the one asked about, else the trip nearest the time.
  const tripOfNearest = nt ? trips.find((t) => t.id === points[nt.index].tripId) : trips[0];
  const vehicleRow = chosenVehicle ?? tripOfNearest?.vehicle ?? null;
  const vehicle = vehicleRow
    ? { id: vehicleRow.id, label: vehicleLabelOf(vehicleRow) ?? "Vehicle", registration: vehicleRow.registrationPlate }
    : null;

  // Nothing in the window: when was the nearest recording either side?
  let before: string | null = null;
  let after: string | null = null;
  if (status === "nothing_recorded") {
    const [prev, next] = await Promise.all([
      prisma.trip.findFirst({
        where: { userId, isPhantomTrip: false, startedAt: { lt: lo } },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, endedAt: true },
      }),
      prisma.trip.findFirst({
        where: { userId, isPhantomTrip: false, startedAt: { gt: hi } },
        orderBy: { startedAt: "asc" },
        select: { startedAt: true },
      }),
    ]);
    before = prev ? (prev.endedAt ?? prev.startedAt).toISOString() : null;
    after = next ? next.startedAt.toISOString() : null;
  }

  const gaps = startEndOnly ? [] : findRecordingGaps(points);
  const accuracy = accuracyStats(points);
  const rows = tableRows(points, atMs, {
    rowMinutes: 15,
    max: 30,
    noticeLat: location?.lat,
    noticeLng: location?.lng,
    mustIncludeTimes: [nearestInTimeView?.recordedAt, nearestToLocationView?.recordedAt].filter(
      (t): t is string => !!t
    ),
  });

  const summary = buildLookupSummary({
    at: input.at.toISOString(),
    status,
    vehicleLabel: vehicle?.label ?? null,
    nearestInTime: nearestInTimeView,
    nearestToLocation: nearestToLocationView,
    hasLocation: !!location,
    gaps,
    accuracy,
    before,
    after,
    manualTrips: trips.filter((t) => t.isManualEntry).length,
  });

  const caveats = [...TICKET_DEFENDER_CAVEATS];
  if (startEndOnly) {
    caveats.unshift("The phone saved only the start and end of this journey for that hour, so there is no route or speed in between.");
  }
  if (trips.some((t) => t.isManualEntry)) {
    caveats.unshift("Journeys you entered by hand have no GPS points, so they are listed but not mapped.");
  }

  const lookup: TicketDefenderLookup = {
    at: input.at.toISOString(),
    windowMinutes: TD_WINDOW_MINUTES,
    status,
    location,
    vehicle,
    trips: trips.map((t) => ({
      id: t.id,
      startedAt: t.startedAt.toISOString(),
      endedAt: t.endedAt ? t.endedAt.toISOString() : null,
      startAddress: t.startAddress,
      endAddress: t.endAddress,
      distanceMiles: Math.round(t.distanceMiles * 10) / 10,
      isManualEntry: t.isManualEntry,
      pointsInWindow: pointsPerTrip.get(t.id) ?? 0,
      vehicleLabel: vehicleLabelOf(t.vehicle),
    })),
    nearestInTime: nearestInTimeView,
    nearestToLocation: nearestToLocationView,
    gaps,
    accuracy,
    rows,
    before,
    after,
    summary,
    caveats,
  };
  return { lookup, points };
}
