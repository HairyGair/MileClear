// Cutting a shift's breadcrumbs into trips.
//
// Lives outside lib/tracking/index.ts so it can be tested: index.ts registers
// a background task at import time and the test runner cannot load it.
//
// A trip ends where the car sat still for STOP_THRESHOLD_MS. That rule only
// sees fixes, and the shift's location task records every 50 m while moving
// and NOTHING while parked, so a car that parks and falls silent never shows
// a stop: the next fix, hours later and miles away, simply continues the
// trip. 05bb9c56's 25 Sep shift was saved as one trip from 12:18 to 10:20 the
// next morning (76.1 mi), and e231c04c's 27 Sep shift as 10:53 to 06:30.
// A silence of a journey boundary or more now ends the trip, the same rule
// automatic recording uses (journeyBoundary.ts), and the straight line across
// the silence is no longer counted as driving.

import { JOURNEY_END_DEFAULT_MIN } from "./journeyBoundary";

export interface SegmentCoordinate {
  lat: number;
  lng: number;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string;
}

export const STOP_THRESHOLD_MS = 5 * 60 * 1000; // traffic lights / brief stops never split a trip
export const STOP_SPEED_MS = 1.5; // m/s (~3.4 mph)
export const DEFAULT_SILENCE_SPLIT_MS = JOURNEY_END_DEFAULT_MIN * 60 * 1000;

function metresBetween(a: SegmentCoordinate, b: SegmentCoordinate): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function segmentTrips<T extends SegmentCoordinate>(
  coords: T[],
  silenceSplitMs: number = DEFAULT_SILENCE_SPLIT_MS
): T[][] {
  if (coords.length < 2) return [];

  const trips: T[][] = [];
  let current: T[] = [coords[0]];
  let stoppedSince: number | null = null;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const currTime = new Date(curr.recorded_at).getTime();
    const prevTime = new Date(prev.recorded_at).getTime();

    // Parked and silent: the phone recorded nothing for a journey boundary.
    // Whatever came before was one trip; this fix starts the next.
    if (Number.isFinite(currTime) && Number.isFinite(prevTime) && currTime - prevTime >= silenceSplitMs) {
      if (current.length >= 2) trips.push(current);
      current = [curr];
      stoppedSince = null;
      continue;
    }

    let stopped = false;
    if (curr.speed != null && curr.speed >= 0) {
      stopped = curr.speed < STOP_SPEED_MS;
    } else {
      const dt = (currTime - prevTime) / 1000;
      if (dt > 0) {
        stopped = metresBetween(prev, curr) / dt < STOP_SPEED_MS;
      } else {
        stopped = true;
      }
    }

    if (stopped) {
      if (stoppedSince === null) stoppedSince = currTime;

      if (currTime - stoppedSince >= STOP_THRESHOLD_MS) {
        // Stopped for the threshold - end current trip, start fresh
        if (current.length >= 2) {
          trips.push(current);
        }
        current = [];
        stoppedSince = null;
        continue;
      }
    } else {
      stoppedSince = null;
    }

    current.push(curr);
  }

  if (current.length >= 2) {
    trips.push(current);
  }

  return trips;
}

/**
 * The pieces of a trail to save as trips. Normally the stop and silence rules
 * above cut it up. `whole` keeps one piece: a Start Trip finished from the
 * "Still on your trip?" reminder is the driver saying the waits were part of
 * the job (a 36-minute wait at a depot split Kada's Amazon Flex block, 9 Oct
 * 2026), so it must not be cut at a long stop.
 */
export function segmentsToSave<T extends SegmentCoordinate>(
  coords: T[],
  silenceSplitMs: number,
  whole: boolean
): T[][] {
  if (!whole) return segmentTrips(coords, silenceSplitMs);
  return coords.length >= 2 ? [coords] : [];
}
