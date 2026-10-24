// Which car am I in? From its Bluetooth (Mike French, 24 Oct 2026; plan in
// docs/car-bluetooth-plan-oct2026.md). When the phone is on a car's
// Bluetooth, the car is its audio output, and both phones name that output
// without any permission (modules/car-audio). A driver links a car by sitting
// in it and tapping "Use the Bluetooth I'm connected to now"; a trip the app
// records on its own then goes on the linked car the phone was on during it.
//
// The phone keeps a small log of what it was connected to (car_sightings,
// three days): a row on every connect event and at most one a minute from
// location fixes. Finalize reads that log for the trip's window. Everything
// here is best effort and cheap: a failure, a missing native module or an
// unclear answer means "no car seen", and the trip goes on the primary car
// exactly as before (defaultCar.ts).
//
// What counts as a link: a car whose bluetoothId is set. 42 cars still carry
// a bluetoothName typed in for the removed feature (eb823df9) with no id;
// those are never links. When the phone gives the car no id, the link is
// stored as "name:<name>" and matches on the name alone.

import { getDatabase } from "../db/index";
import type { CarAudioKind, CarAudioOutput } from "../../modules/car-audio";

export type { CarAudioOutput } from "../../modules/car-audio";

export interface CarLink {
  vehicleId: string;
  name: string;
  /** The OS id, or null when the link is name-only. */
  id: string | null;
}

export interface CarSighting {
  atMs: number;
  name: string;
  id: string | null;
  kind: CarAudioKind | string | null;
}

export interface CarQuestion {
  name: string;
  id: string | null;
  tripId?: string;
}

/** Sightings this long before the first fix count: the car pairs before the wheels turn. */
export const SIGHTING_LEAD_MS = 2 * 60 * 1000;
/** At most one sighting a minute from location fixes. */
export const FIX_SIGHTING_GAP_MS = 60 * 1000;
/** Sightings older than this are pruned. */
export const SIGHTING_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
/** Finalize never waits longer than this for an answer. */
const LOOKUP_TIMEOUT_MS = 2000;

const NAME_ONLY_PREFIX = "name:";
const LINKS_KEY = "car_links";
const QUESTION_KEY = "car_question";
const ANSWERED_KEY = "car_question_answered";

// ── Native read (guarded) ───────────────────────────────────────────────

interface CarAudioLike {
  isCarAudioAvailable(): boolean;
  currentCarAudio?: () => CarAudioOutput | null;
  // Every car-like output, if the module offers it: Android lists each
  // connected Bluetooth output, so a second speaker could hide the car.
  currentCarAudioOutputs?: () => CarAudioOutput[];
}

let carAudio: CarAudioLike | null | undefined;

function loadCarAudio(): CarAudioLike | null {
  if (carAudio !== undefined) return carAudio;
  try {
    // Lazy, so this file loads anywhere (tests, Expo Go); the module itself
    // no-ops when the native side isn't in the build.
    carAudio = require("../../modules/car-audio") as CarAudioLike;
  } catch {
    carAudio = null;
  }
  return carAudio;
}

/** True when this build can read the car's Bluetooth. */
export function isCarBluetoothSupported(): boolean {
  try {
    const m = loadCarAudio();
    return (
      !!m &&
      (typeof m.currentCarAudio === "function" || typeof m.currentCarAudioOutputs === "function") &&
      m.isCarAudioAvailable()
    );
  } catch {
    return false;
  }
}

/** The car output the phone is on right now, or null. Sync, never throws. */
export function readConnectedCar(): CarAudioOutput | null {
  try {
    const out = loadCarAudio()?.currentCarAudio?.() ?? null;
    return out && typeof out.name === "string" && out.name.trim() ? out : null;
  } catch {
    return null;
  }
}

function isOutput(out: unknown): out is CarAudioOutput {
  return !!out && typeof (out as CarAudioOutput).name === "string" && !!(out as CarAudioOutput).name.trim();
}

/** Every car output the phone is on right now (often none or one). Sync, never throws. */
export function readConnectedCars(): CarAudioOutput[] {
  try {
    const m = loadCarAudio();
    if (typeof m?.currentCarAudioOutputs === "function") {
      const all = m.currentCarAudioOutputs();
      if (Array.isArray(all)) return all.filter(isOutput);
    }
    const one = m?.currentCarAudio?.() ?? null;
    return isOutput(one) ? [one] : [];
  } catch {
    return [];
  }
}

/** The bluetoothId to save when linking a car (the UI's one rule). */
export function bluetoothIdFor(out: CarAudioOutput): string {
  // VarChar(100) on the server; a name-only id carries the name.
  return (out.id ?? `${NAME_ONLY_PREFIX}${out.name.trim()}`).slice(0, 100);
}

// ── The rule (pure) ─────────────────────────────────────────────────────

function normName(name: string | null | undefined): string {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

/** A real OS id, or null for none / name-only. */
function realId(id: string | null | undefined): string | null {
  if (typeof id !== "string") return null;
  const t = id.trim();
  return t && !t.startsWith(NAME_ONLY_PREFIX) ? t : null;
}

/** Links from a car list: only cars linked with the button (bluetoothId set). */
export function linksFromCars(
  cars: Array<{ id: string; bluetoothName?: string | null; bluetoothId?: string | null }>
): CarLink[] {
  const links: CarLink[] = [];
  for (const c of cars) {
    if (!c?.id || typeof c.bluetoothId !== "string" || !c.bluetoothId.trim()) continue;
    if (!normName(c.bluetoothName)) continue;
    links.push({ vehicleId: c.id, name: c.bluetoothName!.trim(), id: realId(c.bluetoothId) });
  }
  return links;
}

function matches(link: CarLink, s: CarSighting): boolean {
  if (!normName(link.name) || normName(link.name) !== normName(s.name)) return false;
  const a = realId(link.id);
  const b = realId(s.id);
  // Ids only separate when both sides have one: an Android address may be
  // masked, and a name-only link has none.
  return a === null || b === null || a === b;
}

function inWindow(startMs: number, endMs: number, s: CarSighting): boolean {
  return Number.isFinite(s.atMs) && s.atMs >= startMs - SIGHTING_LEAD_MS && s.atMs <= endMs;
}

function validWindow(startMs: number, endMs: number): boolean {
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;
}

/**
 * The linked car seen most during [start - 2 min, end], or null. Null too
 * when two cars tie, or when a sighting fits more than one linked car (two
 * cars with the same Bluetooth name that ids can't tell apart): a wrong car
 * is worse than the primary car.
 */
export function carSeenDuring(
  startMs: number,
  endMs: number,
  links: CarLink[],
  sightings: CarSighting[]
): string | null {
  if (!validWindow(startMs, endMs) || links.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of sightings) {
    if (!inWindow(startMs, endMs, s) || !normName(s.name)) continue;
    const cars = new Set(links.filter((l) => matches(l, s)).map((l) => l.vehicleId));
    if (cars.size > 1) return null;
    for (const id of cars) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  let tie = false;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id;
      bestCount = n;
      tie = false;
    } else if (n === bestCount) {
      tie = true;
    }
  }
  return tie ? null : best;
}

// Headphones and speakers are Bluetooth outputs too; never ask "Which car is
// AirPods?". Only names that plainly aren't cars are skipped.
const NOT_A_CAR =
  /airpods|beats|buds|earbud|earphone|headphone|headset|speaker|soundbar|soundcore|\bjbl\b|bose|\bwh-|\bwf-|\btws\b|watch|hearing/i;

/**
 * An output seen during the trip that no linked car matches, worth asking
 * about: seen twice or more (or CarPlay / Android Auto, which is always a
 * car), not a headphone-like name, not already answered. Null when any
 * linked car was seen, since that trip already has its answer.
 */
export function unlinkedCarDuring(
  startMs: number,
  endMs: number,
  links: CarLink[],
  sightings: CarSighting[],
  answered: string[]
): { name: string; id: string | null } | null {
  if (!validWindow(startMs, endMs)) return null;
  const skip = new Set(answered.map(normName));
  const seen = new Map<string, { name: string; id: string | null; n: number; car: boolean }>();
  for (const s of sightings) {
    if (!inWindow(startMs, endMs, s) || !normName(s.name)) continue;
    if (links.some((l) => matches(l, s))) return null;
    const key = normName(s.name);
    if (skip.has(key) || NOT_A_CAR.test(s.name)) continue;
    const e = seen.get(key) ?? { name: s.name.trim(), id: realId(s.id), n: 0, car: false };
    e.n += 1;
    if (s.kind === "carplay" || s.kind === "android_auto") e.car = true;
    seen.set(key, e);
  }
  let best: { name: string; id: string | null; n: number } | null = null;
  for (const e of seen.values()) {
    if (e.n < 2 && !e.car) continue;
    if (!best || e.n > best.n) best = e;
  }
  return best ? { name: best.name, id: best.id } : null;
}

// ── Sightings store ─────────────────────────────────────────────────────

/** Log what the phone is connected to. Best effort, never throws. */
export async function recordCarSighting(
  out: CarAudioOutput | CarAudioOutput[] | null,
  source: string
): Promise<void> {
  try {
    const outs = (Array.isArray(out) ? out : [out]).filter(isOutput).slice(0, 5);
    if (outs.length === 0) return;
    const now = Date.now();
    const db = await getDatabase();
    for (const o of outs) {
      await db.runAsync(
        "INSERT INTO car_sightings (at_ms, name, device_id, kind, source) VALUES (?, ?, ?, ?, ?)",
        [now, o.name.trim().slice(0, 100), o.id ?? null, o.kind ?? null, source.slice(0, 20)]
      );
    }
    await db.runAsync("DELETE FROM car_sightings WHERE at_ms < ?", [now - SIGHTING_KEEP_MS]);
  } catch {
    /* best effort */
  }
}

let lastFixSightingAt = 0;

/**
 * From every native location fix: at most once a minute, read the car output
 * and log it if there is one. Synchronous gate, fire-and-forget write, so the
 * fix is never held up.
 */
export function noteCarOnFix(nowMs: number = Date.now()): void {
  try {
    if (nowMs >= lastFixSightingAt && nowMs - lastFixSightingAt < FIX_SIGHTING_GAP_MS) return;
    lastFixSightingAt = nowMs;
    const outs = readConnectedCars();
    if (outs.length > 0) void recordCarSighting(outs, "fix");
  } catch {
    /* never into the recorder */
  }
}

async function readSightings(fromMs: number, toMs: number): Promise<CarSighting[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ at_ms: number; name: string; device_id: string | null; kind: string | null }>(
    "SELECT at_ms, name, device_id, kind FROM car_sightings WHERE at_ms >= ? AND at_ms <= ? ORDER BY at_ms",
    [fromMs, toMs]
  );
  return rows.map((r) => ({ atMs: Number(r.at_ms), name: r.name, id: r.device_id, kind: r.kind }));
}

// ── Links cache (tracking_state) ────────────────────────────────────────

interface LinksCache {
  cars: number;
  links: CarLink[];
}

async function readJson<T>(key: string): Promise<T | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM tracking_state WHERE key = ?",
    [key]
  );
  return row ? (JSON.parse(row.value) as T) : null;
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
    key,
    JSON.stringify(value),
  ]);
}

async function deleteKey(key: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [key]);
}

async function readLinks(): Promise<LinksCache> {
  const c = await readJson<LinksCache>(LINKS_KEY);
  return {
    cars: typeof c?.cars === "number" ? c.cars : 0,
    links: Array.isArray(c?.links) ? c!.links : [],
  };
}

async function readAnswered(): Promise<string[]> {
  try {
    const a = await readJson<unknown>(ANSWERED_KEY);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Called from rememberCars with every car list the app loads. Best effort. */
export async function cacheCarLinks(
  cars: Array<{ id: string; bluetoothName?: string | null; bluetoothId?: string | null }>
): Promise<void> {
  try {
    await writeJson(LINKS_KEY, { cars: cars.length, links: linksFromCars(cars) } satisfies LinksCache);
  } catch {
    /* best effort */
  }
}

/** On sign out: links, sightings and the question go with the driver. */
export async function forgetCarBluetooth(): Promise<void> {
  for (const key of [LINKS_KEY, QUESTION_KEY, ANSWERED_KEY]) {
    try {
      await deleteKey(key);
    } catch {
      /* best effort */
    }
  }
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM car_sightings");
  } catch {
    /* table absent on this install */
  }
}

// ── At finalize ─────────────────────────────────────────────────────────

export interface BluetoothCarAnswer {
  vehicleId: string;
  /** In-window sightings that matched it, for the log. */
  seen: number;
}

async function lookup(startMs: number, endMs: number): Promise<BluetoothCarAnswer | null> {
  const { cars, links } = await readLinks();
  const sightings = await readSightings(startMs - SIGHTING_LEAD_MS, endMs);
  if (sightings.length === 0) return null;
  const vehicleId = carSeenDuring(startMs, endMs, links, sightings);
  if (vehicleId) {
    const link = links.filter((l) => l.vehicleId === vehicleId);
    const seen = sightings.filter((s) => inWindow(startMs, endMs, s) && link.some((l) => matches(l, s))).length;
    return { vehicleId, seen };
  }
  // No linked car: maybe worth asking which car this was (once per name).
  if (cars >= 2) {
    void (async () => {
      try {
        if (await readJson<CarQuestion>(QUESTION_KEY)) return; // one question at a time
        const ask = unlinkedCarDuring(startMs, endMs, links, sightings, await readAnswered());
        if (ask) await writeJson(QUESTION_KEY, ask satisfies CarQuestion);
      } catch {
        /* best effort */
      }
    })();
  }
  return null;
}

/**
 * The linked car the phone was on during a recorded trip, or null (then the
 * caller uses carForRecordedTrip as before). Never throws, never takes more
 * than two seconds.
 */
export async function bluetoothCarForTrip(
  startMs: number,
  endMs: number
): Promise<BluetoothCarAnswer | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(startMs, endMs).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── "Which car is MY FORD?" ─────────────────────────────────────────────

/** The question to show, or null. Re-checked on read: still 2+ cars, name not linked or answered since. */
export async function pendingCarQuestion(): Promise<CarQuestion | null> {
  try {
    const q = await readJson<CarQuestion>(QUESTION_KEY);
    if (!q || typeof q.name !== "string" || !normName(q.name)) return null;
    const { cars, links } = await readLinks();
    const answered = (await readAnswered()).map(normName);
    const stale =
      cars < 2 ||
      answered.includes(normName(q.name)) ||
      links.some((l) => matches(l, { atMs: 0, name: q.name, id: q.id ?? null, kind: null }));
    if (stale) {
      await deleteKey(QUESTION_KEY).catch(() => {});
      return null;
    }
    return { name: q.name, id: q.id ?? null, ...(q.tripId ? { tripId: q.tripId } : {}) };
  } catch {
    return null;
  }
}

/**
 * The driver's answer. A car links that car's Bluetooth to this name (the
 * server call can throw; the question then stays for next time). null means
 * "None of these": never asked about this name again.
 */
export async function answerCarQuestion(q: CarQuestion, vehicleId: string | null): Promise<void> {
  if (vehicleId) {
    const out: CarAudioOutput = { name: q.name, id: q.id, kind: "bluetooth" };
    const { updateVehicle } = await import("../api/vehicles");
    await updateVehicle(vehicleId, { bluetoothName: q.name.trim(), bluetoothId: bluetoothIdFor(out) });
    try {
      // The link counts from the next trip without waiting for a car list load.
      const cache = await readLinks();
      const link: CarLink = { vehicleId, name: q.name.trim(), id: realId(q.id) };
      await writeJson(LINKS_KEY, {
        cars: cache.cars,
        links: [...cache.links.filter((l) => l.vehicleId !== vehicleId), link],
      } satisfies LinksCache);
    } catch {
      /* the next car list load writes it */
    }
    if (q.tripId) {
      try {
        const { syncUpdateTrip } = await import("../sync/actions");
        await syncUpdateTrip(q.tripId, { vehicleId });
      } catch {
        /* the trip keeps its car; the driver can change it */
      }
    }
  }
  try {
    const answered = await readAnswered();
    if (!answered.map(normName).includes(normName(q.name))) answered.push(q.name.trim());
    await writeJson(ANSWERED_KEY, answered.slice(-50));
    await deleteKey(QUESTION_KEY);
  } catch {
    /* best effort */
  }
}
