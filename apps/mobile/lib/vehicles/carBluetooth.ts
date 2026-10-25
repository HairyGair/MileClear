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
// A Bluetooth address, full or masked (lower case).
const ADDRESS = /^(?:[0-9a-fx]{2}:){5}[0-9a-f]{2}$/;
const LINKS_KEY = "car_links";
const QUESTION_KEY = "car_question";
const SNOOZE_KEY = "car_question_snooze_until";
const FLAG_KEY = "car_bluetooth_enabled";
/** A snoozed question stays away this long, across app opens. */
export const QUESTION_SNOOZE_MS = 24 * 60 * 60 * 1000;
const ANSWERED_KEY = "car_question_answered";

// ── Who has it (tester rollout) ─────────────────────────────────────────
//
// The server decides (carBluetooth on /user/profile, CAR_BLUETOOTH_ROLLOUT)
// and the phone keeps the answer in tracking_state, because finalize runs in
// the background with no network. Unknown means off. Off, the feature is
// inert: nothing recorded, no lookup, no question.

let flagCache: boolean | null = null;

/** Is car Bluetooth switched on for this driver? Never throws; unknown is false. */
export async function isCarBluetoothOn(): Promise<boolean> {
  if (flagCache !== null) return flagCache;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [FLAG_KEY]
    );
    flagCache = row?.value === "1";
  } catch {
    return false; // not cached: try the database again next time
  }
  return flagCache;
}

/**
 * The server's answer, from every profile load. Off (or missing) also deletes
 * the sightings and any waiting question, so turning it off stops everything.
 */
export async function rememberCarBluetoothFlag(raw: unknown): Promise<void> {
  const on = raw === true;
  flagCache = on;
  try {
    const db = await getDatabase();
    if (on) {
      await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [FLAG_KEY, "1"]);
      return;
    }
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [FLAG_KEY]);
    await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [QUESTION_KEY]);
    await db.runAsync("DELETE FROM car_sightings");
  } catch {
    /* best effort: the in-memory answer holds for this process */
  }
}

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

/**
 * Every car-audio output the phone is on right now, best first, with no
 * name filter: for the link button only, so a head unit that calls itself
 * "JBL" can still be linked by hand. Sync, never throws.
 */
export function readConnectedOutputs(): CarAudioOutput[] {
  try {
    const all = loadCarAudio()?.currentCarAudioOutputs?.();
    return Array.isArray(all) ? all.filter(isOutput) : [];
  } catch {
    return [];
  }
}

/** Every car-like output the phone is on right now, best first. Sync, never throws. */
export function readConnectedCars(): CarAudioOutput[] {
  return readConnectedOutputs().filter(looksLikeACar);
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
  const addrA = ADDRESS.test(a);
  const addrB = ADDRESS.test(b);
  // A Bluetooth address on one side and some other id (a CarPlay uid) on the
  // other: different kinds of id for the same car, so the name decides.
  if (addrA !== addrB) return true;
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

/** A read this early in the trip may still be the last car's Bluetooth. */
export const EARLY_READ_MS = 90 * 1000;
/** Trips longer than this need two sightings of the linked car, not one. */
export const SHORT_TRIP_MS = 3 * 60 * 1000;

interface Tally {
  /** A sighting fitted two linked cars that ids can't tell apart. */
  ambiguous: boolean;
  /** Every car seen (linked: "v:<vehicleId>", unlinked: "n:<name>"). */
  cars: Map<
    string,
    { vehicleId: string | null; name: string; id: string | null; total: number; inTrip: number; carplay: boolean }
  >;
  /** All counted sightings, every car. */
  counted: number;
}

/**
 * Every car-like output seen during the trip, linked or not, so a linked car
 * has to beat the unlinked car the driver was really in: one lingering
 * sighting of the parked Ford must not win a trip in the Seat. Once-a-minute
 * reads in the first 90 s are dropped when a later sighting disagrees.
 */
function tally(startMs: number, endMs: number, links: CarLink[], sightings: CarSighting[]): Tally {
  const out: Tally = { ambiguous: false, cars: new Map(), counted: 0 };
  if (!validWindow(startMs, endMs)) return out;
  const seen: Array<{ key: string; s: CarSighting; vehicleId: string | null }> = [];
  for (const s of sightings) {
    if (!isOutput(s) || !counts(startMs, endMs, s)) continue;
    const linked = new Set(links.filter((l) => matches(l, s)).map((l) => l.vehicleId));
    // A name the driver linked by hand counts even if it looks like headphones.
    if (linked.size === 0 && !looksLikeACar(s)) continue;
    if (linked.size > 1) {
      out.ambiguous = true;
      return out;
    }
    const vehicleId = linked.size === 1 ? [...linked][0] : null;
    seen.push({ key: vehicleId ? `v:${vehicleId}` : `n:${normName(s.name)}`, s, vehicleId });
  }
  for (const e of seen) {
    const early = e.s.source !== "connect" && e.s.atMs >= startMs && e.s.atMs < startMs + EARLY_READ_MS;
    if (early && seen.some((f) => f.s.atMs > e.s.atMs && f.key !== e.key)) continue;
    const c = out.cars.get(e.key) ?? {
      vehicleId: e.vehicleId,
      name: e.s.name.trim(),
      id: e.s.id ?? null,
      total: 0,
      inTrip: 0,
      carplay: false,
    };
    c.total += 1;
    if (duringTrip(startMs, endMs, e.s)) c.inTrip += 1;
    if (e.s.kind === "carplay") c.carplay = true;
    out.cars.set(e.key, c);
    out.counted += 1;
  }
  return out;
}

/** The car with a strict majority of the counted sightings, or null. */
function majority(t: Tally) {
  for (const c of t.cars.values()) if (c.total * 2 > t.counted) return c;
  return null;
}

/**
 * The linked car the phone was on during the trip, or null. It needs a
 * strict majority of every car-like sighting (linked or not) and at least
 * one sighting inside the trip, two when the trip is over three minutes; a
 * connect event up to two minutes before the start also counts. Null when a
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
  if (links.length === 0) return null;
  const t = tally(startMs, endMs, links, sightings);
  if (t.ambiguous) return null;
  const best = majority(t);
  if (!best?.vehicleId) return null;
  const needInTrip = endMs - startMs > SHORT_TRIP_MS ? 2 : 1;
  return best.inTrip >= needInTrip ? { vehicleId: best.vehicleId, seen: best.total } : null;
}

/**
 * The unlinked car the trip was mostly in, worth asking about: a strict
 * majority of the car-like sightings, seen twice or more inside the trip
 * (once is enough for CarPlay; Android tags every output Android Auto in car
 * mode, so that is no proof), not already answered.
 */
export function unlinkedCarDuring(
  startMs: number,
  endMs: number,
  links: CarLink[],
  sightings: CarSighting[],
  answered: string[]
): CarQuestion | null {
  const t = tally(startMs, endMs, links, sightings);
  if (t.ambiguous) return null;
  const best = majority(t);
  if (!best || best.vehicleId) return null;
  if (answered.map(normName).includes(normName(best.name))) return null;
  if (best.inTrip < 2 && !(best.carplay && best.inTrip >= 1)) return null;
  return { name: best.name, id: best.id };
}

// ── Sightings store ─────────────────────────────────────────────────────

/**
 * Log what the phone is connected to: car-like names, and any name a car is
 * linked to (a head unit called "JBL" linked by hand). Headphones are never
 * stored. Best effort, never throws.
 */
export async function recordCarSighting(
  out: CarAudioOutput | CarAudioOutput[] | null,
  source: string
): Promise<void> {
  try {
    if (!(await isCarBluetoothOn())) return;
    let outs = (Array.isArray(out) ? out : [out]).filter(isOutput);
    if (outs.some((o) => !looksLikeACar(o))) {
      let links: CarLink[] = [];
      try {
        links = (await readLinks()).links;
      } catch {
        /* no links: only car-like names */
      }
      outs = outs.filter((o) => looksLikeACar(o) || links.some((l) => matches(l, o)));
    }
    outs = outs.slice(0, 5);
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
 * and log it if there is one. Synchronous gate; the read and the write run on
 * a later tick, so the fix is never held up.
 */
export function noteCarOnFix(nowMs: number = Date.now()): void {
  try {
    if (flagCache === false) return;
    if (nowMs >= lastFixSightingAt && nowMs - lastFixSightingAt < FIX_SIGHTING_GAP_MS) return;
    lastFixSightingAt = nowMs;
    // The native read too runs after the fix handler has moved on.
    setTimeout(() => {
      void (async () => {
        try {
          if (!(await isCarBluetoothOn())) return;
          const outs = readConnectedOutputs();
          if (outs.length > 0) await recordCarSighting(outs, "fix");
        } catch {
          /* best effort */
        }
      })();
    }, 0);
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
  flagCache = false;
  for (const key of [LINKS_KEY, QUESTION_KEY, ANSWERED_KEY, SNOOZE_KEY, FLAG_KEY]) {
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

// Read only: used for decisions (which car, merge or not), so it never
// writes the question. maybeAskCarQuestion does that, for saved trips only.
async function lookup(startMs: number, endMs: number): Promise<BluetoothCarAnswer | null> {
  if (!(await isCarBluetoothOn())) return null;
  const { links } = await readLinks();
  if (links.length === 0) return null;
  const sightings = await readSightings(startMs - SIGHTING_LEAD_MS, endMs);
  if (sightings.length === 0) return null;
  return tallyLinked(startMs, endMs, links, sightings);
}

/**
 * After a recorded drive is saved as a new trip (not merged, not deduped):
 * if it was mostly in a car no link matches, note "Which car is SEAT BT?"
 * once per name, on a 2+ car account. Fire and forget, never throws.
 */
export async function maybeAskCarQuestion(
  startedAt: string | number | null | undefined,
  endedAt: string | number | null | undefined
): Promise<void> {
  try {
    if (!(await isCarBluetoothOn())) return;
    const w = tripWindowMs(startedAt, endedAt);
    if (!w) return;
    const { cars, links } = await readLinks();
    if (cars < 2) return;
    if (await readJson<CarQuestion>(QUESTION_KEY)) return; // one question at a time
    const sightings = await readSightings(w.startMs - SIGHTING_LEAD_MS, w.endMs);
    if (sightings.length === 0) return;
    const ask = unlinkedCarDuring(w.startMs, w.endMs, links, sightings, await readAnswered());
    if (ask) await writeJson(QUESTION_KEY, ask satisfies CarQuestion);
  } catch {
    /* best effort */
  }
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
  if (flagCache === false) return null; // off: nothing to wait for
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

/**
 * The car a recorded trip goes on: the Bluetooth answer, else the default
 * (carForRecordedTrip). A lookup that throws or gives nothing is the default,
 * exactly as before.
 */
export async function chooseRecordedTripCar(
  bluetooth: () => Promise<BluetoothCarAnswer | null>,
  fallback: () => Promise<string | undefined>
): Promise<{ vehicleId: string | undefined; fromBluetooth: BluetoothCarAnswer | null }> {
  let fromBluetooth: BluetoothCarAnswer | null = null;
  try {
    fromBluetooth = await bluetooth();
  } catch {
    fromBluetooth = null;
  }
  if (fromBluetooth?.vehicleId) return { vehicleId: fromBluetooth.vehicleId, fromBluetooth };
  return { vehicleId: await fallback(), fromBluetooth: null };
}

/**
 * Two drives in two cars must not be glued into one trip, but a false split
 * is worse than a wrong car, so only a definite answer on BOTH legs blocks a
 * merge: the trip being extended was itself seen in its own car, and this
 * segment in a different linked car. Any missing answer, or "Still on a
 * job", is today's merge rule.
 */
export function mergeBlockedByCar(
  segmentCar: string | null | undefined,
  recentLegCar: string | null | undefined,
  recentTripVehicleId: string | null | undefined,
  keepGoing: boolean
): boolean {
  if (keepGoing) return false;
  if (!segmentCar || !recentLegCar || !recentTripVehicleId) return false;
  return recentLegCar === recentTripVehicleId && segmentCar !== recentTripVehicleId;
}

/** The merge decision for a segment close enough (in time and place) to the last trip. */
export function mergeOutcome(input: {
  closeEnough: boolean;
  keepGoingApplies: boolean;
  segmentCar: string | null | undefined;
  recentLegCar: string | null | undefined;
  recentTripVehicleId: string | null | undefined;
}): "merge" | "split" | "apart" {
  if (!input.closeEnough) return "apart";
  return mergeBlockedByCar(input.segmentCar, input.recentLegCar, input.recentTripVehicleId, input.keepGoingApplies)
    ? "split"
    : "merge";
}

// ── After linking: earlier drives in that car ───────────────────────────
//
// Anthony, 25 Oct 2026: drove to Kath's in the Toyota, linked it 11 minutes
// later, and that drive stayed on the Astra. The sightings log still had the
// drive (it is kept whether or not a car is linked), so linking a car looks
// back over it and offers to move the recorded trips the phone was on that
// car's Bluetooth for. The driver says yes first; nothing moves on its own.

export interface EarlierTrip {
  id: string;
  startMs: number;
  endMs: number;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  /** On the server already (synced_at set), so the server can vouch for it. */
  synced: boolean;
}

/** At most this many trips are offered in one go. */
export const EARLIER_TRIPS_MAX = 20;
/** Candidates passed on for the server check (copies included). */
export const EARLIER_TRIPS_LOOKED_AT = 60;

/**
 * The links once vehicleId is linked to out: its old link goes, and so does
 * any other car's link to the same output (the car screen and the question
 * both move a link rather than share it).
 */
export function linksAfterLinking(
  links: CarLink[],
  vehicleId: string,
  out: { name: string; id: string | null }
): CarLink[] {
  const link: CarLink = { vehicleId, name: out.name.trim(), id: realId(out.id) };
  return [...links.filter((l) => l.vehicleId !== vehicleId && !matches(l, link)), link];
}

/**
 * Of these recorded trips, the ones the phone was on vehicleId's Bluetooth
 * for that are on some other car or none. Stricter than finalize: the finalize
 * rule (carSeenDuring) must pick this car AND no other car may have been seen
 * during the trip, so a trip merged across two cars is never offered. Newest
 * first. Copies of one drive are all returned: the server check decides which
 * is real before withoutOverlaps (earlierTrips.ts).
 */
export function tripsSeenInCar<T extends { vehicleId: string | null; startMs: number; endMs: number }>(
  vehicleId: string,
  links: CarLink[],
  sightings: CarSighting[],
  trips: T[]
): T[] {
  if (!links.some((l) => l.vehicleId === vehicleId)) return [];
  const found = trips
    .filter((t) => {
      if (t.vehicleId === vehicleId) return false;
      if (carSeenDuring(t.startMs, t.endMs, links, sightings) !== vehicleId) return false;
      return tally(t.startMs, t.endMs, links, sightings).cars.size === 1;
    })
    .sort((a, b) => b.startMs - a.startMs);
  return found;
}

/**
 * Of trips that overlap in time (a doubled copy still on the phone), the
 * first in the list only. Run after the server check, so a copy the server
 * deleted never hides the real one.
 */
export function withoutOverlaps<T extends { startMs: number; endMs: number }>(trips: T[]): T[] {
  const kept: T[] = [];
  for (const t of trips) {
    if (!kept.some((k) => t.startMs <= k.endMs && k.startMs <= t.endMs)) kept.push(t);
  }
  return kept;
}

/**
 * Recorded trips from the sightings window (three days) that were in the car
 * just linked to out, but are on another car. Read only; never throws, empty
 * on any failure or when the feature is off.
 */
export async function earlierTripsInCar(
  vehicleId: string,
  out: { name: string; id: string | null },
  nowMs: number = Date.now()
): Promise<EarlierTrip[]> {
  try {
    if (!vehicleId || !isOutput(out)) return [];
    if (!(await isCarBluetoothOn())) return [];
    const links = linksAfterLinking((await readLinks()).links, vehicleId, out);
    const fromMs = nowMs - SIGHTING_KEEP_MS;
    const sightings = await readSightings(fromMs - SIGHTING_LEAD_MS, nowMs);
    if (sightings.length === 0) return [];
    const db = await getDatabase();
    // Not shift trips: they keep the shift's car. Start Trip trips carry no
    // shift on the phone, so they can be offered too; the driver is asked
    // first either way. Times can be ISO or raw epoch text: SQL narrows the
    // ISO ones, the exact window is applied below.
    const rows = await db.getAllAsync<{
      id: string;
      vehicle_id: string | null;
      started_at: string;
      ended_at: string | null;
      start_address: string | null;
      end_address: string | null;
      distance_miles: number | null;
      synced_at: string | null;
    }>(
      "SELECT id, vehicle_id, started_at, ended_at, start_address, end_address, distance_miles, synced_at FROM trips " +
        "WHERE is_manual_entry = 0 AND shift_id IS NULL AND ended_at IS NOT NULL AND (started_at >= ? OR started_at NOT LIKE '%-%')",
      [new Date(fromMs).toISOString()]
    );
    const trips = [];
    for (const r of rows) {
      const w = tripWindowMs(r.started_at, r.ended_at);
      if (!w || w.startMs < fromMs || w.endMs > nowMs) continue;
      trips.push({ ...w, vehicleId: r.vehicle_id ?? null, row: r });
    }
    return tripsSeenInCar(vehicleId, links, sightings, trips)
      .slice(0, EARLIER_TRIPS_LOOKED_AT)
      .map((t) => ({
        id: t.row.id,
        startMs: t.startMs,
        endMs: t.endMs,
        startAddress: t.row.start_address ?? null,
        endAddress: t.row.end_address ?? null,
        distanceMiles: Number(t.row.distance_miles) || 0,
        synced: !!t.row.synced_at,
      }));
  } catch {
    return [];
  }
}

// ── "Which car is MY FORD?" ─────────────────────────────────────────────

let questionSnoozed = false;

/**
 * Not now (a failed answer, or the sheet dismissed): no question for this
 * app open, nor for 24 hours. Never throws.
 */
export async function snoozeCarQuestion(): Promise<void> {
  questionSnoozed = true;
  try {
    await writeJson(SNOOZE_KEY, Date.now() + QUESTION_SNOOZE_MS);
  } catch {
    /* the in-memory snooze still holds for this app open */
  }
}

/** The question to show, or null. Re-checked on read: still 2+ cars, name not linked or answered since. */
export async function pendingCarQuestion(): Promise<CarQuestion | null> {
  if (questionSnoozed) return null;
  if (!(await isCarBluetoothOn())) return null;
  try {
    const until = await readJson<unknown>(SNOOZE_KEY);
    // A snooze reaching past 24 h from now means the clock went back: expired.
    const now = Date.now();
    if (typeof until === "number" && now < until && until <= now + QUESTION_SNOOZE_MS) return null;
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
 * The driver's answer. A car links that car's Bluetooth to this name, then
 * unlinks any other car that held the same link (best effort). If the link
 * call fails this throws, the question stays for another app open and is
 * snoozed for this one. null means "None of these": never asked again for
 * this name. Dismissing the sheet is not an answer: don't call this for it.
 */
export async function answerCarQuestion(q: CarQuestion, vehicleId: string | null): Promise<void> {
  let replaced: string | null = null;
  try {
    if (vehicleId) replaced = await linkFromAnswer(q, vehicleId);
  } catch (err) {
    await snoozeCarQuestion(); // never loops
    throw err;
  }
  try {
    // The car's old link name too, if this replaced one: otherwise the next
    // trip on that output (CarPlay vs Bluetooth, say) asks straight back.
    const answered = await readAnswered();
    for (const name of [q.name, replaced]) {
      if (name && !answered.map(normName).includes(normName(name))) answered.push(name.trim());
    }
    await writeJson(ANSWERED_KEY, answered.slice(-50));
    await deleteKey(QUESTION_KEY);
  } catch {
    await snoozeCarQuestion();
  }
}

/** Links the chosen car; returns the name of the link it replaced, if any. */
async function linkFromAnswer(q: CarQuestion, vehicleId: string): Promise<string | null> {
  const out: CarAudioOutput = { name: q.name.trim(), id: q.id, kind: "bluetooth" };
  const { updateVehicle } = await import("../api/vehicles");
  let cache: LinksCache = { cars: 0, links: [] };
  try {
    cache = await readLinks();
  } catch {
    /* no cache: nothing known to unlink */
  }
  const previous = cache.links.find((l) => l.vehicleId === vehicleId)?.name ?? null;
  // The chosen car first: if this throws, nothing has changed anywhere.
  await updateVehicle(vehicleId, { bluetoothName: out.name, bluetoothId: bluetoothIdFor(out) });
  const unlinked = new Set<string>();
  for (const other of cache.links.filter((l) => l.vehicleId !== vehicleId && matches(l, out))) {
    try {
      await updateVehicle(other.vehicleId, { bluetoothName: null, bluetoothId: null });
      unlinked.add(other.vehicleId);
    } catch {
      // Still linked on the server, so it stays in the cache: the pair is
      // ambiguous and finalize gives no answer rather than the wrong car.
    }
  }
  try {
    // Exactly what the server now holds, so the next trip uses it without
    // waiting for a car list load.
    const link: CarLink = { vehicleId, name: out.name, id: realId(q.id) };
    await writeJson(LINKS_KEY, {
      cars: cache.cars,
      links: [...cache.links.filter((l) => l.vehicleId !== vehicleId && !unlinked.has(l.vehicleId)), link],
    } satisfies LinksCache);
  } catch {
    /* the next car list load writes it */
  }
  return previous && normName(previous) !== normName(out.name) ? previous : null;
}
