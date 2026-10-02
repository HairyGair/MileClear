// TomTom Traffic Incident Details v5 client for the road alerts trial
// (2 Oct 2026). FREE TIER ONLY, by design:
//
//   - TomTom's free (Freemium) plan gives 2,500 non-tile requests a day with
//     no payment method on the account. We stop at TOMTOM_DAILY_REQUEST_CAP
//     (default 2,000, never above 2,400 whatever the env says) per UTC day.
//   - The count is kept in memory AND persisted (a small state file, plus an
//     AppEvent checkpoint every 25 requests), so the nightly pm2 restart does
//     not reset it. On boot we take the larger of the two, plus a margin.
//   - A 403 or 429 from TomTom means "stop for the rest of the UTC day". It is
//     never retried.
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

export const DEFAULT_DAILY_CAP = 2000;
/** Hard ceiling under the 2,500 free allowance, whatever the env var says. */
export const MAX_DAILY_CAP = 2400;
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

export function dailyCap(): number {
  const raw = parseInt(process.env.TOMTOM_DAILY_REQUEST_CAP ?? "", 10);
  const cap = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_CAP;
  return Math.min(cap, MAX_DAILY_CAP);
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
  /** UTC day, "2026-10-02". */
  day: string;
  used: number;
  /** Set by a 403/429: no more requests this UTC day. */
  stopped: string | null;
}

export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function rollBudget(state: BudgetState, now: Date): BudgetState {
  const day = utcDayKey(now);
  return state.day === day ? state : { day, used: 0, stopped: null };
}

export function budgetAllows(state: BudgetState, cap: number): boolean {
  return state.stopped == null && state.used < cap;
}

/** On boot: the larger of the file and the last checkpoint (plus the most
 *  requests that could have gone after it), so a restart never resets. */
export function restoreBudget(
  file: BudgetState | null,
  checkpoint: { used: number; stopped: string | null } | null,
  now: Date
): BudgetState {
  const day = utcDayKey(now);
  const fromFile = file && file.day === day ? file : null;
  const cpUsed = checkpoint ? checkpoint.used + CHECKPOINT_EVERY : 0;
  return {
    day,
    used: Math.max(fromFile?.used ?? 0, cpUsed),
    stopped: fromFile?.stopped ?? checkpoint?.stopped ?? null,
  };
}

/** How fresh the screen insists on: 10 minutes normally, an hour once 70% of
 *  the day's budget is gone, and job-only (no screen-driven requests) past 90%. */
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
      let file: BudgetState | null = null;
      try {
        file = JSON.parse(readFileSync(stateFile(), "utf8")) as BudgetState;
      } catch {
        file = null;
      }
      let checkpoint: { used: number; stopped: string | null } | null = null;
      try {
        const dayStart = new Date(`${utcDayKey(now)}T00:00:00Z`);
        const row = await prisma.appEvent.findFirst({
          where: { type: BUDGET_EVENT, createdAt: { gte: dayStart } },
          orderBy: { createdAt: "desc" },
          select: { metadata: true },
        });
        const m = row?.metadata as { used?: number; stopped?: string | null } | null;
        if (m && typeof m.used === "number") checkpoint = { used: m.used, stopped: m.stopped ?? null };
      } catch {
        // Without the checkpoint, be conservative: assume a big chunk is gone.
        checkpoint = { used: Math.floor(dailyCap() / 2), stopped: null };
      }
      return restoreBudget(file, checkpoint, now);
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
  if (checkpoint) logEvent(BUDGET_EVENT, null, { day: state.day, used: state.used, stopped: state.stopped });
}

export async function budgetSnapshot(now: Date = new Date()): Promise<BudgetState & { cap: number }> {
  const s = await loadBudget(now);
  return { ...s, cap: dailyCap() };
}

/** Take one request from today's budget, or refuse. */
async function spendOne(now: Date): Promise<boolean> {
  const s = await loadBudget(now);
  if (!budgetAllows(s, dailyCap())) return false;
  s.used += 1;
  saveBudget(s, s.used % CHECKPOINT_EVERY === 0);
  if (s.used === dailyCap()) {
    console.warn(`[tomtom] daily request cap ${dailyCap()} reached for ${s.day}; no more requests until 00:00 UTC`);
    saveBudget(s, true);
  }
  return true;
}

async function stopForTheDay(now: Date, reason: string): Promise<void> {
  const s = await loadBudget(now);
  s.stopped = reason;
  saveBudget(s, true);
  console.warn(`[tomtom] ${reason}: no more TomTom requests until 00:00 UTC`);
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
      await stopForTheDay(now, `tomtom_${res.status}`);
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
  return screenMaxAgeMs(s.used, dailyCap());
}

/** Drop tiles nobody has needed for a while (memory hygiene). */
export function pruneTileCache(): void {
  const cutoff = Date.now() - STALE_LIMIT_MS;
  for (const [id, c] of tileCache) if (c.fetchedAt < cutoff) tileCache.delete(id);
}
