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
import { fixTimeMs } from "../tracking/savedFixes";
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
  /** "connect" (a connect event) or "fix" (the once-a-minute read). */
  source?: string | null;
}

export interface CarQuestion {
  name: string;
  id: string | null;
}

/** Connect events this long before the first fix count: the car pairs before the wheels turn. */
export const SIGHTING_LEAD_MS = 2 * 60 * 1000;
/** At most one sighting a minute from location fixes. */
export const FIX_SIGHTING_GAP_MS = 60 * 1000;
/** Sightings older than this are pruned. */
export const SIGHTING_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
/** Finalize never waits longer than this for an answer. */
export const LOOKUP_TIMEOUT_MS = 2000;

const NAME_ONLY_PREFIX = "name:";
// Both phones mask the address down to its last two bytes.
const MASKED_PREFIX = "xx:xx:xx:xx:";
const LINKS_KEY = "car_links";
const QUESTION_KEY = "car_question";
const ANSWERED_KEY = "car_question_answered";

// ── Native read (guarded) ───────────────────────────────────────────────

interface CarAudioLike {
  isCarOutputsAvailable?: () => boolean;
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

/** True when this build's native side can say which car it is. */
export function isCarBluetoothSupported(): boolean {
  try {
    const m = loadCarAudio();
    return typeof m?.isCarOutputsAvailable === "function" && m.isCarOutputsAvailable() === true;
  } catch {
    return false;
  }
}

function isOutput(out: unknown): out is CarAudioOutput {
  return !!out && typeof (out as CarAudioOutput).name === "string" && !!(out as CarAudioOutput).name.trim();
}

// Headphones, speakers, watches and TVs are Bluetooth outputs too. They are
// never offered for a link, logged, or asked about ("Which car is AirPods?").
const NOT_A_CAR =
  /airpods|beats|buds|earbud|earphone|headphone|headset|speaker|soundbar|soundcore|anker|\bjbl\b|bose|jabra|shokz|aftershokz|nothing ear|\becho\b|sonos|\bwh-|\bwf-|\btws\b|watch|hearing|\btv\b|television|chromecast|fire ?stick/i;

/** False for names that are plainly not a car. CarPlay or Android Auto doesn't override the name. */
export function looksLikeACar(out: Pick<CarAudioOutput, "name"> | null | undefined): boolean {
  return isOutput(out) && !NOT_A_CAR.test(out.name);
}

/** Every car-like output the phone is on right now, best first. Sync, never throws. */
export function readConnectedCars(): CarAudioOutput[] {
  try {
    const all = loadCarAudio()?.currentCarAudioOutputs?.();
    return Array.isArray(all) ? all.filter(looksLikeACar) : [];
  } catch {
    return [];
  }
}

/** The car output the phone is on right now, or null. Sync, never throws. */
export function readConnectedCar(): CarAudioOutput | null {
  return readConnectedCars()[0] ?? null;
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

/** Same device? A masked id on either side compares the last two bytes only,
 *  so an unmasked id from a dev build still matches its masked form. */
function sameId(rawA: string, rawB: string): boolean {
  const a = rawA.toLowerCase();
  const b = rawB.toLowerCase();
  if (a.startsWith(MASKED_PREFIX) || b.startsWith(MASKED_PREFIX)) return a.slice(-5) === b.slice(-5);
  return a === b;
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

function matches(link: CarLink, s: { name: string; id: string | null }): boolean {
  if (!normName(link.name) || normName(link.name) !== normName(s.name)) return false;
  const a = realId(link.id);
  const b = realId(s.id);
  // Ids only separate when both sides have one: a name-only link has none.
  return a === null || b === null || sameId(a, b);
}

/**
 * Another car already linked to this output, or null. For the car screen
 * ("MY FORD is linked to your Fiesta. Move it here?") and the question, so
 * our own UI never makes two cars match the same Bluetooth.
 */
export function linkedElsewhere(
  out: Pick<CarAudioOutput, "name" | "id">,
  links: CarLink[],
  vehicleId: string
): CarLink | null {
  return links.find((l) => l.vehicleId !== vehicleId && matches(l, out)) ?? null;
}

/** Trip start and end in epoch ms from stored times (ISO or raw native epoch), or null. */
export function tripWindowMs(
  startedAt: string | number | null | undefined,
  endedAt: string | number | null | undefined
): { startMs: number; endMs: number } | null {
  const startMs = fixTimeMs(startedAt);
  const endMs = fixTimeMs(endedAt);
  return startMs > 0 && endMs >= startMs ? { startMs, endMs } : null;
}

function validWindow(startMs: number, endMs: number): boolean {
  return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs > 0 && endMs >= startMs;
}

function duringTrip(startMs: number, endMs: number, s: CarSighting): boolean {
  return Number.isFinite(s.atMs) && s.atMs >= startMs && s.atMs <= endMs;
}

/** Inside the trip, or a connect event in the two minutes before it. A
 *  once-a-minute read before the start is the previous drive's car. */
function counts(startMs: number, endMs: number, s: CarSighting): boolean {
  if (duringTrip(startMs, endMs, s)) return true;
  return s.source === "connect" && s.atMs >= startMs - SIGHTING_LEAD_MS && s.atMs < startMs;
}

/**
 * The linked car seen most during the trip, or null. A car needs at least
 * one sighting inside [start, end]; a connect event up to two minutes before
 * the start also counts towards it. Null too when two cars tie, or when a
 * sighting fits more than one linked car (two cars with the same Bluetooth
 * name that ids can't tell apart): a wrong car is worse than the primary.
 */
export function carSeenDuring(
  startMs: number,
  endMs: number,
  links: CarLink[],
  sightings: CarSighting[]
): string | null {
  return tallyLinked(startMs, endMs, links, sightings)?.vehicleId ?? null;
}

function tallyLinked(
  startMs: number,
  endMs: number,
  links: CarLink[],
  sightings: CarSighting[]
): { vehicleId: string; seen: number } | null {
  if (!validWindow(startMs, endMs) || links.length === 0) return null;
  const total = new Map<string, number>();
  const inside = new Set<string>();
  for (const s of sightings) {
    if (!normName(s.name) || !counts(startMs, endMs, s)) continue;
    const cars = new Set(links.filter((l) => matches(l, s)).map((l) => l.vehicleId));
    if (cars.size > 1) return null;
    for (const id of cars) {
      total.set(id, (total.get(id) ?? 0) + 1);
      if (duringTrip(startMs, endMs, s)) inside.add(id);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  let tie = false;
  for (const [id, n] of total) {
    if (!inside.has(id)) continue;
    if (n > bestCount) {
      best = id;
      bestCount = n;
      tie = false;
    } else if (n === bestCount) {
      tie = true;
    }
  }
  return best && !tie ? { vehicleId: best, seen: bestCount } : null;
}

/**
 * An output seen during the trip that no linked car matches, worth asking
 * about: seen twice or more (or CarPlay / Android Auto), car-like by name,
 * not already answered. Null when any linked car was seen, since that trip
 * already has its answer.
 */
export function unlinkedCarDuring(
  startMs: number,
  endMs: number,
  links: CarLink[],
  sightings: CarSighting[],
  answered: string[]
): CarQuestion | null {
  if (!validWindow(startMs, endMs)) return null;
  const skip = new Set(answered.map(normName));
  const seen = new Map<string, { name: string; id: string | null; n: number; car: boolean }>();
  for (const s of sightings) {
    if (!duringTrip(startMs, endMs, s) || !normName(s.name)) continue;
    if (links.some((l) => matches(l, s))) return null;
    const key = normName(s.name);
    if (skip.has(key) || !looksLikeACar(s)) continue;
    const e = seen.get(key) ?? { name: s.name.trim(), id: s.id ?? null, n: 0, car: false };
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
    const outs = (Array.isArray(out) ? out : [out]).filter((o): o is CarAudioOutput => looksLikeACar(o)).slice(0, 5);
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
  const rows = await db.getAllAsync<{
    at_ms: number;
    name: string;
    device_id: string | null;
    kind: string | null;
    source: string | null;
  }>(
    "SELECT at_ms, name, device_id, kind, source FROM car_sightings WHERE at_ms >= ? AND at_ms <= ? ORDER BY at_ms",
    [fromMs, toMs]
  );
  return rows.map((r) => ({
    atMs: Number(r.at_ms),
    name: r.name,
    id: r.device_id,
    kind: r.kind,
    source: r.source,
  }));
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

/** The links this phone knows (from the last car list load). Empty on failure. */
export async function readCarLinks(): Promise<CarLink[]> {
  try {
    return (await readLinks()).links;
  } catch {
    return [];
  }
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
  questionSnoozed = false;
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
  /** Sightings that counted for it, for the log. */
  seen: number;
}

async function lookup(startMs: number, endMs: number): Promise<BluetoothCarAnswer | null> {
  const { cars, links } = await readLinks();
  const sightings = await readSightings(startMs - SIGHTING_LEAD_MS, endMs);
  if (sightings.length === 0) return null;
  const answer = tallyLinked(startMs, endMs, links, sightings);
  if (answer) return answer;
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
 * caller uses carForRecordedTrip as before). Takes the trip's stored start
 * and end (ISO or raw native epoch). Never throws, never takes more than two
 * seconds.
 */
export async function bluetoothCarForTrip(
  startedAt: string | number | null | undefined,
  endedAt: string | number | null | undefined
): Promise<BluetoothCarAnswer | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const w = tripWindowMs(startedAt, endedAt);
    if (!w) return null;
    return await Promise.race([
      lookup(w.startMs, w.endMs).catch(() => null),
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

let questionSnoozed = false;

/** Not now: no question for the rest of this app open (a failed answer, or the sheet dismissed). */
export async function snoozeCarQuestion(): Promise<void> {
  questionSnoozed = true;
}

/** The question to show, or null. Re-checked on read: still 2+ cars, name not linked or answered since. */
export async function pendingCarQuestion(): Promise<CarQuestion | null> {
  if (questionSnoozed) return null;
  try {
    const q = await readJson<CarQuestion>(QUESTION_KEY);
    if (!q || typeof q.name !== "string" || !normName(q.name)) return null;
    const { cars, links } = await readLinks();
    const answered = (await readAnswered()).map(normName);
    const stale =
      cars < 2 ||
      answered.includes(normName(q.name)) ||
      links.some((l) => matches(l, { name: q.name, id: q.id ?? null }));
    if (stale) {
      await deleteKey(QUESTION_KEY).catch(() => {});
      return null;
    }
    return { name: q.name, id: q.id ?? null };
  } catch {
    return null;
  }
}

/**
 * The driver's answer. A car links that car's Bluetooth to this name, first
 * unlinking any other car that holds the same link (best effort). The link
 * call can throw; the question then stays for another app open (call
 * snoozeCarQuestion). null means "None of these": never asked again for this
 * name. Dismissing the sheet is not an answer: don't call this for it.
 */
export async function answerCarQuestion(q: CarQuestion, vehicleId: string | null): Promise<void> {
  if (vehicleId) {
    const out: CarAudioOutput = { name: q.name.trim(), id: q.id, kind: "bluetooth" };
    const { updateVehicle } = await import("../api/vehicles");
    let cache: LinksCache = { cars: 0, links: [] };
    try {
      cache = await readLinks();
    } catch {
      /* no cache: nothing known to unlink */
    }
    const others = cache.links.filter((l) => l.vehicleId !== vehicleId && matches(l, out));
    for (const other of others) {
      try {
        await updateVehicle(other.vehicleId, { bluetoothName: null, bluetoothId: null });
      } catch {
        /* best effort: the rule gives no answer for an ambiguous pair */
      }
    }
    await updateVehicle(vehicleId, { bluetoothName: out.name, bluetoothId: bluetoothIdFor(out) });
    try {
      // The link counts from the next trip without waiting for a car list load.
      const gone = new Set([vehicleId, ...others.map((o) => o.vehicleId)]);
      const link: CarLink = { vehicleId, name: out.name, id: realId(q.id) };
      await writeJson(LINKS_KEY, {
        cars: cache.cars,
        links: [...cache.links.filter((l) => !gone.has(l.vehicleId)), link],
      } satisfies LinksCache);
    } catch {
      /* the next car list load writes it */
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
