// Street names for road events that arrive without one (road alerts, Oct 2026).
//
// TomTom planned closures often carry no road number and no from/to streets,
// so the list said "A road on your usual route closed" for most of them. We
// look up the street at the middle of each such event on OpenStreetMap
// (geocoding.ts reverseGeocodeRoad) and remember it by event id.
//
// Nominatim asks for at most one request a second and the trip address
// backfill already uses it, so lookups go through one slow queue (one every
// 2 s) and the screen never waits: it shows what is known and the rest fills
// in on the next load. Only the push job waits, briefly, for its candidates.
// Volume is small: only events matched to an opted-in driver's usual roads,
// each looked up once (events are shared between drivers).

import type { RoadEvent } from "./roadEvents.js";
import type { LatLng } from "./roadCorridor.js";
import { reverseGeocodeRoad } from "./geocoding.js";

const LOOKUP_SPACING_MS = 2000;
const MAX_QUEUE = 300;
/** A known name (or a known "nothing here") is kept this long. */
const NAME_TTL_MS = 7 * 24 * 3600000;
/** After a provider failure, try that event again after this long. */
const RETRY_AFTER_MS = 30 * 60000;
const MAX_NAMES = 20000;

interface NameEntry {
  street: string | null;
  town: string | null;
  at: number;
  failed?: boolean;
}

const names = new Map<string, NameEntry>();
const queue: { id: string; at: LatLng }[] = [];
const queued = new Set<string>();
let running = false;

/** Where to ask about: the middle vertex of the first line, else the first point. */
export function middleOf(e: Pick<RoadEvent, "lines" | "points">): LatLng | null {
  const line = e.lines.find((l) => l.length > 0);
  if (line) return line[Math.floor(line.length / 2)];
  return e.points[0] ?? null;
}

/** Events with a road number already have a good name. */
export function needsName(e: RoadEvent): boolean {
  return !e.road && e.source === "tomtom";
}

function fresh(entry: NameEntry | undefined, now: number): boolean {
  if (!entry) return false;
  return now - entry.at < (entry.failed ? RETRY_AFTER_MS : NAME_TTL_MS);
}

function enqueue(e: RoadEvent, now: number): void {
  if (queued.has(e.id) || fresh(names.get(e.id), now)) return;
  if (queue.length >= MAX_QUEUE) return;
  const at = middleOf(e);
  if (!at) return;
  queue.push({ id: e.id, at });
  queued.add(e.id);
  if (!running) void drain();
}

async function drain(): Promise<void> {
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      const res = await reverseGeocodeRoad(job.at[0], job.at[1]).catch(() => null);
      queued.delete(job.id);
      if (!res || res.outcome === "unavailable") {
        names.set(job.id, { street: null, town: null, at: Date.now(), failed: true });
      } else {
        names.set(job.id, { street: res.street, town: res.town, at: Date.now() });
      }
      if (names.size > MAX_NAMES) {
        const oldest = names.keys().next().value;
        if (oldest) names.delete(oldest);
      }
      if (queue.length > 0) await new Promise((r) => setTimeout(r, LOOKUP_SPACING_MS));
    }
  } finally {
    running = false;
  }
}

/** Copies of the events with any known street name attached; events still
 *  unnamed are queued for a lookup. Never waits. */
export function applyKnownNames(events: RoadEvent[], now: number = Date.now()): RoadEvent[] {
  return events.map((e) => {
    if (!needsName(e)) return e;
    const entry = names.get(e.id);
    if (!fresh(entry, now)) enqueue(e, now);
    if (!entry?.street) return e;
    return { ...e, placeName: entry.street, placeTown: entry.town };
  });
}

/** Queue lookups for these events and wait up to maxWaitMs for them, then
 *  return the named copies. For the push job, which runs in the background. */
export async function nameEventsNow(events: RoadEvent[], maxWaitMs: number): Promise<RoadEvent[]> {
  const deadline = Date.now() + maxWaitMs;
  applyKnownNames(events);
  while (Date.now() < deadline && events.some((e) => queued.has(e.id))) {
    await new Promise((r) => setTimeout(r, 250));
  }
  return applyKnownNames(events);
}

/** Tests only. */
export function __resetRoadEventNames(): void {
  names.clear();
  queue.length = 0;
  queued.clear();
}
