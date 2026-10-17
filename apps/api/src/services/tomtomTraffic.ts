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
//   - A 403 or 429 from TomTom means "stop until the 1st of next month". That
//     is persisted too, so a restart never retries it.
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
  /** UTC calendar month, "2026-10". TomTom's free allowance resets on the 1st. */
  month: string;
  /** Requests this month, today's included. */
  usedMonth: number;
  /** UTC day, "2026-10-02". */
  day: string;
  /** Requests today. */
  usedToday: number;
  /** Set by a 403/429: no more requests until the 1st of next month. */
  stopped: string | null;
}

/** One budget checkpoint as stored in AppEvent metadata (or the state file).
 *  Ones written before 17 Oct 2026 have only { day, used, stopped }, where
 *  used was that day's count. */
export interface BudgetCheckpoint {
  month?: string;
  usedMonth?: number;
  day?: string;
  usedToday?: number;
  used?: number;
  stopped?: string | null;
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

export function freshBudget(now: Date): BudgetState {
  return { month: utcMonthKey(now), usedMonth: 0, day: utcDayKey(now), usedToday: 0, stopped: null };
}

/** New month: everything resets, a 403/429 stop included. New day: only
 *  today's counter resets. */
export function rollBudget(state: BudgetState, now: Date): BudgetState {
  if (state.month !== utcMonthKey(now)) return freshBudget(now);
  const day = utcDayKey(now);
  return state.day === day ? state : { ...state, day, usedToday: 0 };
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
  return state.stopped == null && state.usedMonth < cap && state.usedToday < dayAllowance(state, cap, now);
}

/**
 * On boot: the larger of the state file and the checkpoints logged this
 * month, so a restart never resets the count. checkpoints = null means the
 * database could not be read: assume half the month is gone.
 *
 * The file is written on every request, so when it is at least as far on as
 * the newest checkpoint it is exact and is taken as it is. Only when it is
 * missing or behind (lost, or written to a different disk) do the
 * checkpoints count, plus CHECKPOINT_EVERY for the requests that could have
 * gone after the last one. Adding that margin on every boot would cost up to
 * 25 requests a night, which over a month of nightly restarts is a third of
 * the allowance.
 */
export function restoreBudget(file: unknown, checkpoints: BudgetCheckpoint[] | null, now: Date, cap: number): BudgetState {
  const month = utcMonthKey(now);
  const day = utcDayKey(now);
  let fileMonth: number | null = null;
  let fileToday = 0;
  let stopped: string | null = null;

  // The state file (this shape, or the per-day one written before 17 Oct).
  const f = (file && typeof file === "object" ? file : null) as BudgetCheckpoint | null;
  if (f && typeof f.usedMonth === "number" && f.month === month) {
    fileMonth = f.usedMonth;
    if (f.day === day && typeof f.usedToday === "number") fileToday = f.usedToday;
    stopped = f.stopped ?? null;
  } else if (f && typeof f.used === "number" && typeof f.day === "string" && f.day.startsWith(month)) {
    fileMonth = f.used;
    if (f.day === day) fileToday = f.used;
    stopped = f.stopped ?? null;
  }

  if (checkpoints == null) {
    const usedMonth = Math.max(fileMonth ?? 0, Math.floor(cap / 2), fileToday);
    return { month, usedMonth, day, usedToday: fileToday, stopped };
  }

  let cpMonth = -1; // -1: no checkpoint this month
  let cpToday = -1; // -1: none today
  const legacyByDay = new Map<string, number>();
  for (const c of checkpoints) {
    if (typeof c.usedMonth === "number" && c.month === month) {
      cpMonth = Math.max(cpMonth, c.usedMonth);
      if (c.day === day && typeof c.usedToday === "number") cpToday = Math.max(cpToday, c.usedToday);
      if (c.stopped && !stopped) stopped = c.stopped;
    } else if (typeof c.used === "number" && typeof c.day === "string" && c.day.startsWith(month)) {
      legacyByDay.set(c.day, Math.max(legacyByDay.get(c.day) ?? 0, c.used));
      if (c.stopped && !stopped) stopped = c.stopped;
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
  return { month, usedMonth, day, usedToday, stopped };
}

/** How fresh the screen insists on: 10 minutes normally, an hour once 70% of
 *  today's allowance is gone, and job-only (no screen-driven requests) past 90%. */
export function screenMaxAgeMs(used: number, cap: number): number | null {
  if (used >= cap * 0.9) return null;
  if (used >= cap * 0.7) return 60 * 60000;
  return 10 * 60000;
}

// ── Budget (IO) ────────────────────────────────────────────────────

function stateFile(): string {
  const dir = process.env.ROAD_ALERTS_STATE_DIR || path.join(homedir(), ".mileclear-state");
  return path.join(dir, "tomtom-budget.json");
}

let budget: BudgetState | null = null;
let budgetLoading: Promise<BudgetState> | null = null;

async function loadBudget(now: Date): Promise<BudgetState> {
  if (budget) return (budget = rollBudget(budget, now));
  if (!budgetLoading) {
    budgetLoading = (async () => {
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
        // Without the checkpoints, be conservative (see restoreBudget).
        checkpoints = null;
      }
      return restoreBudget(file, checkpoints, now, monthlyCap());
    })();
  }
  budget = await budgetLoading;
  return (budget = rollBudget(budget, now));
}

function saveBudget(state: BudgetState, checkpoint: boolean): void {
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
      stopped: state.stopped,
    });
  }
}

export async function budgetSnapshot(
  now: Date = new Date()
): Promise<BudgetState & { cap: number; todayAllowance: number }> {
  const s = await loadBudget(now);
  const cap = monthlyCap();
  return { ...s, cap, todayAllowance: dayAllowance(s, cap, now) };
}

/** Take one request from today's allowance, or refuse. */
async function spendOne(now: Date): Promise<boolean> {
  const s = await loadBudget(now);
  const cap = monthlyCap();
  if (!budgetAllows(s, cap, now)) return false;
  const allowance = dayAllowance(s, cap, now);
  s.usedMonth += 1;
  s.usedToday += 1;
  saveBudget(s, s.usedMonth % CHECKPOINT_EVERY === 0);
  if (s.usedMonth >= cap) {
    console.warn(`[tomtom] monthly request cap ${cap} reached for ${s.month}; no more requests until the 1st (00:00 UTC)`);
    saveBudget(s, true);
  } else if (s.usedToday === allowance) {
    console.warn(`[tomtom] today's allowance of ${allowance} reached for ${s.day}; no more requests until 00:00 UTC`);
    saveBudget(s, true);
  }
  return true;
}

async function stopForTheMonth(now: Date, reason: string): Promise<void> {
  const s = await loadBudget(now);
  s.stopped = reason;
  saveBudget(s, true);
  console.warn(`[tomtom] ${reason}: no more TomTom requests until the 1st of next month (00:00 UTC)`);
}

/** Configured and not stopped for the month by a 403/429: only then does the
 *  road alerts screen use or credit TomTom. */
export async function isTomTomServing(now: Date = new Date()): Promise<boolean> {
  if (!isTomTomConfigured()) return false;
  return (await loadBudget(now)).stopped == null;
}

// ── Fetch + cache ──────────────────────────────────────────────────

interface TileCache {
  fetchedAt: number;
  events: RoadEvent[];
}

const tileCache = new Map<string, TileCache>();
const tileFailedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<RoadEvent[] | null>>();

async function fetchTile(id: string, now: Date): Promise<RoadEvent[] | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;
  if (!(await spendOne(now))) return null;
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
    if (res.status === 403 || res.status === 429) {
      await stopForTheMonth(now, `tomtom_${res.status}`);
      return null;
    }
    if (!res.ok) {
      console.error(`[tomtom] tile ${id} answered ${res.status}`);
      tileFailedAt.set(id, Date.now());
      return null;
    }
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
  }
}

/**
 * Events for these tiles, fetching any whose cache is older than maxAgeMs
 * (null = never fetch, cache only). Over budget, unconfigured or failed: the
 * cached copy if it is under 3 hours old, else nothing.
 */
export async function getTileEvents(tileIds: string[], maxAgeMs: number | null, now: Date = new Date()): Promise<RoadEvent[]> {
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
          p = fetchTile(id, now).finally(() => inFlight.delete(id));
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
export async function screenFreshnessMs(now: Date = new Date()): Promise<number | null> {
  if (!isTomTomConfigured()) return null;
  const s = await loadBudget(now);
  if (s.stopped) return null;
  return screenMaxAgeMs(s.usedToday, dayAllowance(s, monthlyCap(), now));
}

/** Drop tiles nobody has needed for a while (memory hygiene). */
export function pruneTileCache(): void {
  const cutoff = Date.now() - STALE_LIMIT_MS;
  for (const [id, c] of tileCache) if (c.fetchedAt < cutoff) tileCache.delete(id);
}
