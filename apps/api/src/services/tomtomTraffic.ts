// TomTom Traffic Incident Details v5 client for the road alerts trial
// (2 Oct 2026). FREE TIER ONLY, by design:
//
//   - TomTom's free (Freemium) plan gives 2,500 non-tile requests a MONTH,
//     not a day. Until 17 Oct 2026 this file assumed a day: we used about
//     2,525 between 3 and 13 Oct and every request from 14 Oct got a 403.
//     With no payment method on the account TomTom blocks rather than bills,
//     but we never rely on that.
//   - So the budget is per UTC calendar month (treated as resetting on the
//     1st at 00:00 UTC), at most MAX_MONTHLY_CAP (2,300, headroom under
//     2,500). TOMTOM_MONTHLY_REQUEST_CAP may lower it, never raise it.
//   - It is paced to last the month: today's allowance is what was left at
//     the start of today divided by the days left, today included (2,300 on
//     the 1st of a 31-day month = 74 a day). A quiet day leaves more for later.
//   - The counts (month and today) are kept in memory AND persisted (a small
//     state file, plus an AppEvent checkpoint every 25 requests), so the
//     nightly pm2 restart does not reset them. On boot we take the larger of
//     the two, adding a margin only when the file is missing or behind (see
//     restoreBudget).
//   - A 403 (quota used up, or forbidden) stops requests for the rest of the
//     UTC day, and the next day sends ONE probe request before anything else;
//     a 403 on the probe stops that day too. Not the whole month: TomTom's
//     allowance may reset on the account's anniversary rather than the 1st,
//     and refused requests cost nothing. The monthly cap above is the real
//     spending limit. A 429 stops the rest of the UTC day only (TomTom also
//     uses it for per-second breaches). Both are persisted, so a restart never
//     retries them, and the screen does not credit TomTom on a 403 day.
//   - Each request covers one fixed tile of 0.75 x 1.0 degrees (about
//     5,000-6,000 km2, under TomTom's 10,000 km2 bbox limit). Tiles are shared
//     by every driver whose usual roads touch them, so ten drivers in Leeds
//     cost the same as one.
//
// No env key (TOMTOM_API_KEY) = no requests at all. The key goes in a query
// parameter, so the request URL is never logged.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { logEvent } from "./appEvents.js";
import {
  TOMTOM_CATEGORY_FILTER,
  TOMTOM_FIELDS,
  parseTomTomIncidents,
  type RoadEvent,
} from "./roadEvents.js";
import { CELL_LAT_DEG, CELL_LNG_DEG, type Corridor } from "./roadCorridor.js";

const ENDPOINT = "https://api.tomtom.com/traffic/services/5/incidentDetails";
const REQUEST_TIMEOUT_MS = 20000;

/** Hard ceiling under the 2,500 a month free allowance, whatever the env var says. */
export const MAX_MONTHLY_CAP = 2300;
export const BUDGET_EVENT = "road_alerts.tomtom_budget";
const CHECKPOINT_EVERY = 25;

export const TILE_LAT_DEG = 0.75;
export const TILE_LNG_DEG = 1.0;
/** Most tiles one driver's corridor may pull (biggest share of their roads first). */
export const MAX_TILES_PER_DRIVER = 6;
/** A failed tile is not asked for again for this long. */
const FAILED_TILE_BACKOFF_MS = 15 * 60000;
/** Cached tiles older than this are thrown away rather than shown. */
const STALE_LIMIT_MS = 3 * 3600000;

export function isTomTomConfigured(): boolean {
  return !!process.env.TOMTOM_API_KEY;
}

/** Requests allowed this month: TOMTOM_MONTHLY_REQUEST_CAP when it is lower
 *  than the ceiling, else the ceiling. */
export function monthlyCap(): number {
  const raw = parseInt(process.env.TOMTOM_MONTHLY_REQUEST_CAP ?? "", 10);
  const cap = Number.isFinite(raw) && raw > 0 ? raw : MAX_MONTHLY_CAP;
  return Math.min(cap, MAX_MONTHLY_CAP);
}

// ── Tiles (pure) ───────────────────────────────────────────────────

export function tileIdFor(lat: number, lng: number): string {
  return `${Math.floor(lat / TILE_LAT_DEG)}:${Math.floor(lng / TILE_LNG_DEG)}`;
}

export function tileBbox(id: string): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const [i, j] = id.split(":").map(Number);
  return { minLat: i * TILE_LAT_DEG, maxLat: (i + 1) * TILE_LAT_DEG, minLng: j * TILE_LNG_DEG, maxLng: (j + 1) * TILE_LNG_DEG };
}

export function tileAreaKm2(id: string): number {
  const b = tileBbox(id);
  const midLat = ((b.minLat + b.maxLat) / 2) * (Math.PI / 180);
  return (b.maxLat - b.minLat) * 111.32 * (b.maxLng - b.minLng) * 111.32 * Math.cos(midLat);
}

/** Tiles a corridor touches, most corridor cells first, capped. */
export function tilesForCorridor(corridor: Corridor, cap: number = MAX_TILES_PER_DRIVER): string[] {
  const counts = new Map<string, number>();
  for (const key of corridor.cells.keys()) {
    const [i, j] = key.split(":").map(Number);
    const id = tileIdFor((i + 0.5) * CELL_LAT_DEG, (j + 0.5) * CELL_LNG_DEG);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap).map(([id]) => id);
}

// ── Budget (pure parts) ────────────────────────────────────────────

export interface BudgetState {
  /** UTC calendar month, "2026-10". Our own spending limit resets on the 1st. */
  month: string;
  /** Requests this month, today's included. */
  usedMonth: number;
  /** UTC day, "2026-10-02". */
  day: string;
  /** Requests today. */
  usedToday: number;
  /** Set by a 403 ("tomtom_403_day") or a 429 ("tomtom_429_day"): no more
   *  requests until 00:00 UTC. */
  stoppedToday: string | null;
  /** UTC day of the last 403 not yet followed by a good answer. While set,
   *  the next day sends a single probe request before anything else. */
  forbiddenSince: string | null;
}

/** One budget checkpoint as stored in AppEvent metadata (or the state file).
 *  Ones written before 17 Oct 2026 have only { day, used, stopped }, where
 *  used was that day's count and stopped was a 403/429 for that day. */
export interface BudgetCheckpoint {
  month?: string;
  usedMonth?: number;
  day?: string;
  usedToday?: number;
  used?: number;
  stopped?: string | null;
  stoppedToday?: string | null;
  forbiddenSince?: string | null;
}

export const STOP_DAY_403 = "tomtom_403_day";
export const STOP_DAY_429 = "tomtom_429_day";

/** A 403 stop (old rows said "tomtom_403", a draft of this branch said
 *  "tomtom_403_month"; both are treated as a stop for their own day). */
export function isForbiddenStop(reason: string | null | undefined): boolean {
  return !!reason && reason.startsWith("tomtom_403");
}

export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function utcMonthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Days left in this UTC month, today included (1 on the last day). */
export function daysLeftInMonth(now: Date): number {
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return daysInMonth - now.getUTCDate() + 1;
}

export function freshBudget(now: Date, forbiddenSince: string | null = null): BudgetState {
  return {
    month: utcMonthKey(now),
    usedMonth: 0,
    day: utcDayKey(now),
    usedToday: 0,
    stoppedToday: null,
    forbiddenSince,
  };
}

/**
 * New month: the counts reset. New day: today's count and any day stop
 * reset. Never backwards: a caller holding an older `now` (a job that took
 * its clock before midnight) gets the state as it is, so it can never wipe
 * a newer day or month.
 */
export function rollBudget(state: BudgetState, now: Date): BudgetState {
  const day = utcDayKey(now);
  if (day <= state.day) return state;
  if (state.month !== utcMonthKey(now)) return freshBudget(now, state.forbiddenSince);
  return { ...state, day, usedToday: 0, stoppedToday: null };
}

/**
 * Today's share of what is left this month: what was left at the start of
 * today, spread evenly over the days left (today included). A quiet day
 * leaves more for the rest of the month, so unused requests carry forward
 * with no extra bookkeeping. 2,300 on the 1st of a 31-day month = 74.
 */
export function dayAllowance(state: BudgetState, cap: number, now: Date): number {
  const leftAtStartOfDay = Math.max(0, cap - (state.usedMonth - state.usedToday));
  return Math.floor(leftAtStartOfDay / daysLeftInMonth(now));
}

export function budgetAllows(state: BudgetState, cap: number, now: Date): boolean {
  return state.stoppedToday == null && state.usedMonth < cap && state.usedToday < dayAllowance(state, cap, now);
}

/** This month's count from the state file (either shape), or null when the
 *  file is missing, unreadable or from another month. */
function fileUsedThisMonth(f: BudgetCheckpoint | null, month: string): number | null {
  if (f && typeof f.usedMonth === "number" && f.month === month) return f.usedMonth;
  if (f && typeof f.used === "number" && typeof f.day === "string" && f.day.startsWith(month)) return f.used;
  return null;
}

/**
 * On boot: the larger of the state file and the checkpoints logged this
 * month, so a restart never resets the count.
 *
 * The file is written on every request, so when it is at least as far on as
 * the newest checkpoint it is exact and is taken as it is. Only when it is
 * missing or behind (lost, or written to a different disk) do the
 * checkpoints count, plus CHECKPOINT_EVERY for the requests that could have
 * gone after the last one. Adding that margin on every boot would cost up to
 * 25 requests a night, which over a month of nightly restarts is a third of
 * the allowance.
 *
 * checkpoints = null means the database could not be read. With this
 * month's file we trust the file; without it we assume the whole month is
 * gone (usedMonth = cap), and loadBudget asks the database again next time.
 */
export function restoreBudget(file: unknown, checkpoints: BudgetCheckpoint[] | null, now: Date, cap: number): BudgetState {
  const month = utcMonthKey(now);
  const day = utcDayKey(now);
  const f = (file && typeof file === "object" ? file : null) as BudgetCheckpoint | null;
  const fileMonth = fileUsedThisMonth(f, month);
  let fileToday = 0;
  if (fileMonth != null && f?.day === day) fileToday = typeof f.usedToday === "number" ? f.usedToday : (f.used ?? 0);

  let stoppedToday: string | null = null;
  let forbiddenSince: string | null = null;
  // Any stop counts only for the day it was set on; a 403 also marks the
  // next day for a single probe.
  const noteStops = (c: BudgetCheckpoint) => {
    if (c.forbiddenSince && (!forbiddenSince || c.forbiddenSince > forbiddenSince)) forbiddenSince = c.forbiddenSince;
    for (const reason of [c.stopped, c.stoppedToday]) {
      if (!reason || typeof c.day !== "string") continue;
      if (isForbiddenStop(reason) && (!forbiddenSince || c.day > forbiddenSince)) forbiddenSince = c.day;
      if (c.day === day && (stoppedToday == null || isForbiddenStop(reason))) stoppedToday = reason;
    }
  };
  // The file is read whatever its month, so a 403 on the 31st still makes
  // the 1st start with a probe.
  if (f) noteStops(f);

  if (checkpoints == null) {
    if (fileMonth == null) return { month, usedMonth: cap, day, usedToday: 0, stoppedToday, forbiddenSince };
    return { month, usedMonth: Math.max(fileMonth, fileToday), day, usedToday: fileToday, stoppedToday, forbiddenSince };
  }

  let cpMonth = -1; // -1: no checkpoint this month
  let cpToday = -1; // -1: none today
  const legacyByDay = new Map<string, number>();
  for (const c of checkpoints) {
    noteStops(c);
    if (typeof c.usedMonth === "number" && c.month === month) {
      cpMonth = Math.max(cpMonth, c.usedMonth);
      if (c.day === day && typeof c.usedToday === "number") cpToday = Math.max(cpToday, c.usedToday);
    } else if (typeof c.used === "number" && typeof c.day === "string" && c.day.startsWith(month)) {
      legacyByDay.set(c.day, Math.max(legacyByDay.get(c.day) ?? 0, c.used));
    }
  }
  // Old per-day rows (before 17 Oct): the month so far is the sum of each
  // day's last count, each with its own margin.
  let legacyMonth = 0;
  for (const v of legacyByDay.values()) legacyMonth += v + CHECKPOINT_EVERY;

  let usedMonth: number;
  let usedToday: number;
  if (fileMonth != null && fileMonth >= cpMonth) {
    usedMonth = fileMonth;
    usedToday = Math.max(fileToday, cpToday);
  } else {
    usedMonth = Math.max(fileMonth ?? 0, cpMonth >= 0 ? cpMonth + CHECKPOINT_EVERY : 0);
    usedToday = Math.max(fileToday, cpToday >= 0 ? cpToday + CHECKPOINT_EVERY : 0);
  }
  const legacyToday = legacyByDay.get(day);
  if (legacyToday != null) usedToday = Math.max(usedToday, legacyToday + CHECKPOINT_EVERY);
  usedMonth = Math.max(usedMonth, legacyMonth, usedToday);
  return { month, usedMonth, day, usedToday, stoppedToday, forbiddenSince };
}

/** How fresh the screen insists on: 10 minutes normally, an hour once 70% of
 *  today's allowance is gone, and job-only (no screen-driven requests) past 90%. */
export function screenMaxAgeMs(used: number, cap: number): number | null {
  if (used >= cap * 0.9) return null;
  if (used >= cap * 0.7) return 60 * 60000;
  return 10 * 60000;
}

// ── Budget (IO) ────────────────────────────────────────────────────
//
// Every function below reads the clock itself (new Date()) and never takes
// a caller's `now`: the road alerts job takes its `now` once and uses it for
// minutes, which across midnight would count requests against the wrong
// day or month.

function stateFile(): string {
  const dir = process.env.ROAD_ALERTS_STATE_DIR || path.join(homedir(), ".mileclear-state");
  return path.join(dir, "tomtom-budget.json");
}

let budget: BudgetState | null = null;
/** True while `budget` is the "whole month gone" guess (no file, database
 *  unreadable): never saved, and the next call asks the database again. */
let budgetGuessed = false;
let budgetLoading: Promise<{ state: BudgetState; guessed: boolean }> | null = null;
/** A probe request is out (see forbiddenSince): send nothing else until it answers. */
let probeInFlight = false;

async function loadBudget(): Promise<BudgetState> {
  if (budget && !budgetGuessed) return (budget = rollBudget(budget, new Date()));
  if (!budgetLoading) {
    budgetLoading = (async () => {
      const now = new Date();
      let file: unknown = null;
      try {
        file = JSON.parse(readFileSync(stateFile(), "utf8"));
      } catch {
        file = null;
      }
      let checkpoints: BudgetCheckpoint[] | null = null;
      try {
        const rows = await prisma.appEvent.findMany({
          where: { type: BUDGET_EVENT, createdAt: { gte: utcMonthStart(now) } },
          select: { metadata: true },
          take: 5000,
        });
        checkpoints = rows
          .map((r) => r.metadata as BudgetCheckpoint | null)
          .filter((m): m is BudgetCheckpoint => !!m && typeof m === "object");
      } catch {
        checkpoints = null;
      }
      const guessed =
        checkpoints == null && fileUsedThisMonth(file as BudgetCheckpoint | null, utcMonthKey(now)) == null;
      return { state: restoreBudget(file, checkpoints, now, monthlyCap()), guessed };
    })().finally(() => {
      budgetLoading = null;
    });
  }
  const loaded = await budgetLoading;
  if (!budget || budgetGuessed) {
    budget = loaded.state;
    budgetGuessed = loaded.guessed;
  }
  return (budget = rollBudget(budget, new Date()));
}

/** checkpoint: also log an AppEvent. reason: the stop that prompted it
 *  (tomtom_403_day or tomtom_429_day), logged so the two read apart. */
function saveBudget(state: BudgetState, checkpoint: boolean, reason?: string): void {
  if (budgetGuessed) return; // never persist a guess
  try {
    mkdirSync(path.dirname(stateFile()), { recursive: true });
    writeFileSync(stateFile(), JSON.stringify(state));
  } catch (err) {
    console.error("[tomtom] could not write budget file:", (err as Error).message);
  }
  if (checkpoint) {
    logEvent(BUDGET_EVENT, null, {
      month: state.month,
      usedMonth: state.usedMonth,
      day: state.day,
      usedToday: state.usedToday,
      stoppedToday: state.stoppedToday,
      forbiddenSince: state.forbiddenSince,
      ...(reason ? { reason } : {}),
    });
  }
}

export async function budgetSnapshot(): Promise<BudgetState & { cap: number; todayAllowance: number }> {
  const s = await loadBudget();
  const cap = monthlyCap();
  return { ...s, cap, todayAllowance: dayAllowance(s, cap, new Date()) };
}

/**
 * Take one request from today's allowance, or refuse. "probe": the first
 * request after a 403 on an earlier day; nothing else goes until it answers.
 */
async function spendOne(): Promise<"ok" | "probe" | false> {
  const s = await loadBudget();
  const now = new Date();
  const cap = monthlyCap();
  if (!budgetAllows(s, cap, now)) return false;
  const probe = s.forbiddenSince != null;
  if (probe && probeInFlight) return false;
  const allowance = dayAllowance(s, cap, now);
  s.usedMonth += 1;
  s.usedToday += 1;
  if (probe) probeInFlight = true;
  saveBudget(s, s.usedMonth % CHECKPOINT_EVERY === 0);
  if (s.usedMonth >= cap) {
    console.warn(`[tomtom] monthly request cap ${cap} reached for ${s.month}; no more requests until the 1st (00:00 UTC)`);
    saveBudget(s, true);
  } else if (s.usedToday === allowance) {
    console.warn(`[tomtom] today's allowance of ${allowance} reached for ${s.day}; no more requests until 00:00 UTC`);
    saveBudget(s, true);
  }
  return probe ? "probe" : "ok";
}

/**
 * 403 (quota used up, or the key refused): stop for the rest of the UTC day,
 * and mark tomorrow for a single probe. Not the month: TomTom's free
 * allowance may reset on the account's anniversary rather than the 1st, so a
 * month stop could lose a whole month. Refused requests cost nothing.
 */
async function stopForbidden(): Promise<void> {
  const s = await loadBudget();
  s.stoppedToday = STOP_DAY_403;
  s.forbiddenSince = s.day;
  saveBudget(s, true, STOP_DAY_403);
  console.warn(`[tomtom] 403: no more TomTom requests until 00:00 UTC, then one probe`);
}

/** 429: TomTom also uses it for a per-second (QPS) breach, so it costs the
 *  rest of the UTC day only. */
async function stopForTheDay(): Promise<void> {
  const s = await loadBudget();
  s.stoppedToday = STOP_DAY_429;
  saveBudget(s, true, STOP_DAY_429);
  console.warn(`[tomtom] 429: no more TomTom requests until 00:00 UTC`);
}

/** A good answer after a probe: TomTom is back. */
async function clearForbidden(): Promise<void> {
  const s = await loadBudget();
  if (s.forbiddenSince == null) return;
  s.forbiddenSince = null;
  saveBudget(s, true);
  console.warn(`[tomtom] probe answered: TomTom requests resume`);
}

/** Configured and not stopped today by a 403: only then does the road alerts
 *  screen use or credit TomTom. A 429 day stop does not count: that day
 *  still shows (and credits) the cached incidents. */
export async function isTomTomServing(): Promise<boolean> {
  if (!isTomTomConfigured()) return false;
  return !isForbiddenStop((await loadBudget()).stoppedToday);
}

// ── Fetch + cache ──────────────────────────────────────────────────

interface TileCache {
  fetchedAt: number;
  events: RoadEvent[];
}

const tileCache = new Map<string, TileCache>();
const tileFailedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<RoadEvent[] | null>>();

async function fetchTile(id: string): Promise<RoadEvent[] | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;
  const spent = await spendOne();
  if (!spent) return null;
  const b = tileBbox(id);
  const params = new URLSearchParams({
    key,
    bbox: `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`,
    fields: TOMTOM_FIELDS,
    language: "en-GB",
    categoryFilter: TOMTOM_CATEGORY_FILTER,
    timeValidityFilter: "present,future",
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: ctrl.signal });
    if (res.status === 403) {
      await stopForbidden();
      return null;
    }
    if (res.status === 429) {
      await stopForTheDay();
      return null;
    }
    if (!res.ok) {
      console.error(`[tomtom] tile ${id} answered ${res.status}`);
      tileFailedAt.set(id, Date.now());
      return null;
    }
    if (spent === "probe") await clearForbidden();
    const events = parseTomTomIncidents(await res.json());
    tileCache.set(id, { fetchedAt: Date.now(), events });
    tileFailedAt.delete(id);
    return events;
  } catch (err) {
    console.error(`[tomtom] tile ${id} failed: ${(err as Error).name}`);
    tileFailedAt.set(id, Date.now());
    return null;
  } finally {
    clearTimeout(timer);
    if (spent === "probe") probeInFlight = false;
  }
}

/**
 * Events for these tiles, fetching any whose cache is older than maxAgeMs
 * (null = never fetch, cache only). Over budget, unconfigured or failed: the
 * cached copy if it is under 3 hours old, else nothing.
 */
export async function getTileEvents(tileIds: string[], maxAgeMs: number | null): Promise<RoadEvent[]> {
  const out: RoadEvent[] = [];
  const seen = new Set<string>();
  for (const id of tileIds) {
    const cached = tileCache.get(id);
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    let events: RoadEvent[] | null = null;
    if (cached && maxAgeMs != null && age <= maxAgeMs) {
      events = cached.events;
    } else if (maxAgeMs != null && isTomTomConfigured()) {
      const failed = tileFailedAt.get(id);
      if (!failed || Date.now() - failed > FAILED_TILE_BACKOFF_MS) {
        let p = inFlight.get(id);
        if (!p) {
          p = fetchTile(id).finally(() => inFlight.delete(id));
          inFlight.set(id, p);
        }
        events = await p;
      }
    }
    if (!events && cached && age <= STALE_LIMIT_MS) events = cached.events;
    for (const e of events ?? []) {
      if (seen.has(e.id)) continue; // an incident on a tile edge comes back twice
      seen.add(e.id);
      out.push(e);
    }
  }
  return out;
}

/** Screen freshness for the current budget (see screenMaxAgeMs). */
export async function screenFreshnessMs(): Promise<number | null> {
  if (!isTomTomConfigured()) return null;
  const s = await loadBudget();
  if (s.stoppedToday) return null;
  return screenMaxAgeMs(s.usedToday, dayAllowance(s, monthlyCap(), new Date()));
}

/** Drop tiles nobody has needed for a while (memory hygiene). */
export function pruneTileCache(): void {
  const cutoff = Date.now() - STALE_LIMIT_MS;
  for (const [id, c] of tileCache) if (c.fetchedAt < cutoff) tileCache.delete(id);
}
