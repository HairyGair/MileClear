// A drive the phone could not save, about to be cleared by the next
// recording: hand it to the upload queue instead. No React Native, no SQLite
// (the caller hands in the database reads and writes), so it runs under vitest.
//
// When a new recording opens (nativeLocation.ts openNativeRecording) and the
// buffer still holds a previous recording, it is finalized first. If that save
// failed on the phone (the save threw, a local database error, the drain loop's
// pass cap), finalize leaves the recording open and the open then cleared the
// buffer anyway: the drive was gone, reported only as "stale_buffer_cleared".
//
// The same safe hand-off finalize uses for a drive the server refuses
// (56c2963d / bb0b59bd): a local trip row plus a queued create, through
// syncCreateTrip(body, { queueOnly: true }). The driver sees the trip in their
// list, the Uploads screen offers Try again, and the new recording starts on a
// clean buffer. Leftovers that are not a drive are judged by finalize's own
// rules and cleared as before: fewer than two fixes, a momentary or slow
// phantom, under the shortest trip we save, a walk, a flight, over the
// server's cap. A span a saved trip already covers is not queued twice.
//
// Also used by End trip (a recording whose save keeps failing is handed off on
// the second press, endTrip.ts) and by the JS engine's stale-buffer purge.

import {
  DRIVING_EVIDENCE_SPEED_MPH,
  DRIVING_SPEED_THRESHOLD_MPH,
  computeSustainedSpeedMph,
  decideWalk,
  summariseMotion,
} from "@mileclear/shared";
import type { CreateTripData } from "../api/trips";
import {
  arrivalEndIndex,
  cleanTraceForSave,
  exceedsServerDistance,
  normaliseRecordedAt,
  prepareCoordinatesForServer,
  tripWireTimes,
} from "./finalizeSaveRule";
import { cutFlights, findFlights, type FlightSpan } from "./flightRule";
import { ALREADY_SAVED_MIN_OVERLAP, savedTripOverlap, type SavedTripSpan } from "./orphanRoute";
import type { DropInput, DropReason } from "./recordingDropRule";

/** finalize's thresholds (detection.ts), so a hand-off judges a leftover the
 *  way finalize would have. */
export const MIN_HANDOFF_MILES = 0.3; // MIN_AUTO_TRIP_DISTANCE_MILES
const MOMENTARY_SPAN_MS = 30_000;
const SPEED_THRESHOLD_MS = DRIVING_SPEED_THRESHOLD_MPH * 0.44704;

export interface BufferedFix {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
  /** detection_coordinates row id, where the reader has it: lets the caller
   *  delete exactly the rows that were handed off. */
  id?: number;
  /** The motion coprocessor's call, where the platform gives one. */
  activity?: string | null;
  activity_confidence?: number | null;
}

export type SkipWhy =
  | "no_coords"
  | "phantom"
  | "too_short"
  | "walk"
  | "flight"
  | "implausible_distance"
  | "already_saved";

export interface HandoffLeg {
  body: CreateTripData;
  startedAt: string;
  endedAt: string;
  coords: number;
  distanceMiles: number;
}

export interface SkippedLeg {
  why: SkipWhy;
  /** The finer verdict (the walk rule's reason, a flight's kind and speed). */
  detail?: string;
  startedAt: string | null;
  endedAt: string | null;
  coords: number;
  distanceMiles: number;
}

export interface HandoffPlan {
  legs: HandoffLeg[];
  skipped: SkippedLeg[];
}

function fixMs(f: { recorded_at: string }): number {
  const iso = normaliseRecordedAt(f.recorded_at);
  return iso ? Date.parse(iso) : Number.NaN;
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathMiles(fixes: ReadonlyArray<{ lat: number; lng: number }>): number {
  let m = 0;
  for (let i = 1; i < fixes.length; i++) m += metres(fixes[i - 1], fixes[i]);
  return m / 1609.344;
}

/** Split where finalize would: a gap longer than the journey boundary, or the
 *  first fix after a cut flight. */
export function splitLegs<T extends { recorded_at: string }>(
  fixes: ReadonlyArray<T>,
  splitMs: number,
  legStarts: ReadonlySet<string> = new Set()
): T[][] {
  if (fixes.length === 0) return [];
  const legs: T[][] = [[fixes[0]]];
  for (let i = 1; i < fixes.length; i++) {
    const gap = fixMs(fixes[i]) - fixMs(fixes[i - 1]);
    if (gap > splitMs || legStarts.has(fixes[i].recorded_at)) legs.push([]);
    legs[legs.length - 1].push(fixes[i]);
  }
  return legs;
}

/**
 * The trip finalize would save from one leg, or why it would not. Same steps
 * in the same order as _finalizeAutoTripInner: tail trim, outlier and endpoint
 * clean (shared helpers in finalizeSaveRule.ts), then the phantom, too-short,
 * walk and slow-phantom guards and the server's distance cap.
 */
function judgeLeg(
  raw: BufferedFix[],
  saved: SavedTripSpan[] | undefined
): { leg: HandoffLeg } | { skip: Omit<SkippedLeg, "startedAt" | "endedAt" | "coords"> } {
  if (raw.length < 2) return { skip: { why: "no_coords", distanceMiles: 0 } };
  const trimmed = raw.slice(0, arrivalEndIndex(raw) + 1);
  const filtered = cleanTraceForSave(trimmed).coords;
  const times = tripWireTimes(filtered);
  if (filtered.length < 2 || !times) return { skip: { why: "no_coords", distanceMiles: 0 } };
  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  const startMs = fixMs(first);
  const endMs = fixMs(last);
  const spanMs = endMs - startMs;
  const miles = pathMiles(filtered);
  if (!Number.isFinite(spanMs) || (spanMs < MOMENTARY_SPAN_MS && miles < MIN_HANDOFF_MILES)) {
    return { skip: { why: "phantom", detail: "momentary", distanceMiles: miles } };
  }
  if (miles < MIN_HANDOFF_MILES) return { skip: { why: "too_short", distanceMiles: miles } };
  const durationSec = spanMs / 1000;
  const sustained = computeSustainedSpeedMph(filtered);
  const sustainedP95 = computeSustainedSpeedMph(filtered, { percentile: 0.95 });
  let deviceMaxMph: number | null = null;
  for (const f of raw) {
    if (typeof f.speed === "number" && f.speed >= 0) deviceMaxMph = Math.max(deviceMaxMph ?? 0, f.speed * 2.23694);
  }
  // finalize's walk guard. Steps are not read here (no platform call in a pure
  // rule); a missing input only ever refuses the walk verdict, never forces it.
  const walk = decideWalk({
    distanceMiles: miles,
    durationSec,
    sustainedSpeedMph: sustained,
    sustainedSpeedP95Mph: sustainedP95,
    deviceMaxSpeedMph: deviceMaxMph !== null ? Math.round(deviceMaxMph) : null,
    fixes: filtered.length,
    motion: summariseMotion(raw),
    steps: null,
  });
  if (walk.verdict === "walk") return { skip: { why: "walk", detail: walk.reason, distanceMiles: miles } };
  // finalize's slow phantom: under a mile, over five minutes, under 5 mph on
  // average, and never at driving speed.
  const provedDriving =
    (sustained !== null && sustained >= DRIVING_EVIDENCE_SPEED_MPH) ||
    (deviceMaxMph ?? 0) >= DRIVING_EVIDENCE_SPEED_MPH ||
    filtered.some((f) => (f.speed ?? 0) >= SPEED_THRESHOLD_MS);
  const avgMph = durationSec > 0 ? miles / (durationSec / 3600) : 0;
  if (miles < 1.0 && durationSec > 5 * 60 && avgMph < 5 && !provedDriving) {
    return { skip: { why: "phantom", detail: "slow", distanceMiles: miles } };
  }
  const roundedMiles = Math.round(miles * 100) / 100;
  if (exceedsServerDistance(roundedMiles)) return { skip: { why: "implausible_distance", distanceMiles: miles } };
  if (saved && saved.length > 0 && savedTripOverlap(startMs, endMs, saved) >= ALREADY_SAVED_MIN_OVERLAP) {
    return { skip: { why: "already_saved", distanceMiles: miles } };
  }
  const wire = prepareCoordinatesForServer(filtered);
  return {
    leg: {
      startedAt: times.startedAt,
      endedAt: times.endedAt,
      coords: raw.length,
      distanceMiles: roundedMiles,
      body: {
        startLat: first.lat,
        startLng: first.lng,
        endLat: last.lat,
        endLng: last.lng,
        distanceMiles: roundedMiles,
        startedAt: times.startedAt,
        endedAt: times.endedAt,
        classification: "unclassified",
        coordinates: wire.coords.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          speed: c.speed,
          accuracy: c.accuracy,
          recordedAt: c.recorded_at,
        })),
        recordedBy: "automatic",
      },
    },
  };
}

/**
 * Decide, leg by leg, what to queue and what to clear. `saved` is the trips
 * already on the phone that touch the buffer's span.
 */
export function planRescueHandoff(
  fixes: ReadonlyArray<BufferedFix>,
  opts: { splitMs: number; legStarts?: ReadonlySet<string>; saved?: SavedTripSpan[] }
): HandoffPlan {
  const plan: HandoffPlan = { legs: [], skipped: [] };

  // Flights first, as in finalize: the airborne stretch is cut out and
  // reported, and the car legs either side become their own legs.
  let flights: FlightSpan[] = [];
  try {
    flights = fixes.length >= 2 ? findFlights(fixes) : [];
  } catch {
    flights = [];
  }
  const { kept, legStarts: cutAt } = cutFlights(fixes, flights);
  for (const f of flights) {
    plan.skipped.push({
      why: "flight",
      detail: `${f.kind}_peak_${f.peakMph}mph`,
      startedAt: fixes[f.startIdx].recorded_at,
      endedAt: fixes[f.endIdx].recorded_at,
      coords: f.removedCount,
      distanceMiles: f.miles,
    });
  }
  const starts = new Set(opts.legStarts ?? []);
  for (const idx of cutAt) if (kept[idx]) starts.add(kept[idx].recorded_at);

  for (const raw of splitLegs(kept, opts.splitMs, starts)) {
    const verdict = judgeLeg(raw, opts.saved);
    if ("leg" in verdict) {
      plan.legs.push(verdict.leg);
    } else {
      plan.skipped.push({
        ...verdict.skip,
        startedAt: raw[0]?.recorded_at ?? null,
        endedAt: raw[raw.length - 1]?.recorded_at ?? null,
        coords: raw.length,
      });
    }
  }
  return plan;
}

export interface RescueDeps {
  /** finalizeAutoTrip(), or null to hand off without trying a save first. */
  finalize: (() => Promise<void>) | null;
  /** A finalize pass is running right now (detection.ts isFinalizeInFlight). */
  isFinalizeInFlight: () => boolean;
  /** Settles when that pass is done. Never rejects. */
  waitForFinalize: () => Promise<void>;
  /** The buffer as it is now (detection_coordinates, oldest first). */
  readBuffer: () => Promise<BufferedFix[]>;
  /** recorded_at of each first fix after a cut flight (tracking_state flight_cut). */
  readLegStarts: () => Promise<string[]>;
  /** Trips on the phone that touch [fromIso, toIso]. */
  readSavedTrips: (fromIso: string, toIso: string) => Promise<SavedTripSpan[]>;
  /** syncCreateTrip(body, { queueOnly: true }). */
  queueCreate: (body: CreateTripData) => Promise<void>;
  noteDrop: (input: DropInput) => Promise<void>;
  log: (event: string, data?: Record<string, unknown>) => void;
  /** The driver's journey boundary (journeyBoundaryMs(...).splitMs). */
  splitMs: number;
  /** Who is handing off, for the drop reports. Default "recording_open". */
  source?: string;
}

export type RescueOutcome =
  /** finalize emptied the buffer: nothing left to clear. */
  | { kind: "saved" }
  /** What was a drive is in the upload queue and every leg is reported: the
   *  caller clears the buffer without reporting it again. */
  | { kind: "handed_off"; queued: number; cleared: number; readIds: number[] }
  /** Do NOT clear: the drive could not be queued (a local database error), or
   *  another save owns the buffer right now. The fixes stay and are saved by
   *  the next finalize; a leg already queued is caught there by the
   *  same-start guard. */
  | { kind: "keep" };

/** Drop reason for a leg that is not queued: finalize's own reason where it
 *  has one (walk, flight), otherwise as before. */
function skipReason(why: SkipWhy): DropReason {
  if (why === "already_saved") return "deduped";
  if (why === "walk") return "walk";
  if (why === "flight") return "flight";
  return "stale_buffer_cleared";
}

/**
 * Finalize the previous recording; if fixes are still in the buffer after it,
 * hand the real drives among them to the upload queue. Never throws.
 */
export async function rescueBufferBeforeOpen(deps: RescueDeps): Promise<RescueOutcome> {
  const source = deps.source ?? "recording_open";
  let failure: unknown = null;
  if (deps.finalize) {
    try {
      await deps.finalize();
    } catch (err) {
      failure = err;
    }
  }
  // A pass that started before (or alongside) ours makes finalize() return at
  // once while that pass still owns the buffer. Reading and queueing the
  // buffer now would queue the very fixes it is saving, and the caller's clear
  // would delete them under it: two trips, or none. Wait for it; if another
  // pass is running even then, leave the buffer to it.
  if (deps.isFinalizeInFlight()) {
    await deps.waitForFinalize();
    if (deps.isFinalizeInFlight()) {
      deps.log("rescue_handoff_finalize_busy");
      return { kind: "keep" };
    }
  }
  let fixes: BufferedFix[];
  try {
    fixes = await deps.readBuffer();
  } catch {
    // Cannot see the buffer: do not let the caller clear what it cannot see.
    deps.log("rescue_handoff_read_failed");
    return { kind: "keep" };
  }
  if (fixes.length === 0) return { kind: "saved" };

  let legStarts = new Set<string>();
  try {
    legStarts = new Set(await deps.readLegStarts());
  } catch {}
  let saved: SavedTripSpan[] = [];
  const startIso = normaliseRecordedAt(fixes[0].recorded_at);
  const endIso = normaliseRecordedAt(fixes[fixes.length - 1].recorded_at);
  if (startIso && endIso) {
    try {
      saved = await deps.readSavedTrips(startIso, endIso);
    } catch {}
  }
  const plan = planRescueHandoff(fixes, { splitMs: deps.splitMs, legStarts, saved });
  const reason =
    failure instanceof Error ? `${failure.name}: ${failure.message}` : failure != null ? String(failure) : null;

  for (const leg of plan.legs) {
    try {
      await deps.queueCreate(leg.body);
    } catch (err) {
      deps.log("rescue_handoff_queue_failed", {
        error: err instanceof Error ? err.message.slice(0, 120) : String(err),
        coords: fixes.length,
      });
      return { kind: "keep" };
    }
  }
  for (const leg of plan.legs) {
    await deps
      .noteDrop({
        reason: "rescued_to_queue",
        detail: reason,
        startedAt: leg.startedAt,
        endedAt: leg.endedAt,
        coords: leg.coords,
        distanceMiles: leg.distanceMiles,
        source,
      })
      .catch(() => {});
  }
  for (const s of plan.skipped) {
    // Not a drive (or already a trip): cleared as before, reported as before
    // (a lone fix never was), with the finer reason in the detail.
    if (s.coords < 2 && s.why !== "flight") continue;
    const dropReason = skipReason(s.why);
    await deps
      .noteDrop({
        reason: dropReason,
        detail:
          s.why === "already_saved"
            ? "saved_trip_covers_span"
            : dropReason === "stale_buffer_cleared"
            ? [s.why, s.detail].filter(Boolean).join(":")
            : s.detail ?? null,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        coords: s.coords,
        distanceMiles: s.distanceMiles,
        source,
      })
      .catch(() => {});
  }
  deps.log("rescue_handoff", {
    source,
    coords: fixes.length,
    queued: plan.legs.length,
    cleared: plan.skipped.length,
    queuedMiles: plan.legs.reduce((a, l) => a + l.distanceMiles, 0),
    ...(reason ? { error: reason.slice(0, 120) } : {}),
  });
  return {
    kind: "handed_off",
    queued: plan.legs.length,
    cleared: plan.skipped.length,
    readIds: fixes.map((f) => f.id).filter((id): id is number => typeof id === "number"),
  };
}
