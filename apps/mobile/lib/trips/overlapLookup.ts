// Where the add-trip form and the "Missing a trip?" sheet find the trips
// MileClear already has around a time: the phone's own trips first (they
// include drives saved on this phone and not uploaded yet), then the server
// for windows older than the phone holds. The rule for what counts as an
// overlap is shared with the server and the website (@mileclear/shared
// tripOverlap). Never throws: a failed read means "nothing to say".

import { firstOverlappingTrip, overlapLookupWindow } from "@mileclear/shared";
import { getDatabase } from "../db/index";
import { fetchTripsAround } from "../api/trips";
import { isOnline } from "../network";
import { needsServerCheck, phoneHoldsFrom, PHONE_HOLDS_ROWS } from "./pastTripRule";

export interface KnownTrip {
  id: string;
  startedAt: string;
  endedAt: string | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  isManualEntry: boolean;
  /** Only the server knows this (the phone's table has no column for it). */
  recordedBy: string | null;
  /** When the server saved it, for "saved later". Null from the phone. */
  createdAt: string | null;
  source: "phone" | "server";
}

interface LocalRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_address: string | null;
  end_address: string | null;
  distance_miles: number | null;
  is_manual_entry: number | null;
}

/** The phone's trips that start in [from, to). */
export async function phoneTripsBetween(from: Date, to: Date): Promise<KnownTrip[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<LocalRow>(
      `SELECT id, started_at, ended_at, start_address, end_address, distance_miles, is_manual_entry
       FROM trips WHERE started_at >= ? AND started_at < ? ORDER BY started_at ASC`,
      [from.toISOString(), to.toISOString()]
    );
    return rows.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      startAddress: r.start_address,
      endAddress: r.end_address,
      distanceMiles: r.distance_miles ?? 0,
      isManualEntry: r.is_manual_entry === 1,
      recordedBy: null,
      createdAt: null,
      source: "phone" as const,
    }));
  } catch {
    return [];
  }
}

/** The earliest moment the phone has every trip from (pastTripRule.phoneHoldsFrom). */
export async function phoneHoldsFromNow(now: number): Promise<number> {
  let nth: number | null = null;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ started_at: string }>(
      "SELECT started_at FROM trips ORDER BY started_at DESC LIMIT 1 OFFSET ?",
      [PHONE_HOLDS_ROWS - 1]
    );
    const t = row ? new Date(row.started_at).getTime() : Number.NaN;
    nth = Number.isFinite(t) ? t : null;
  } catch {
    nth = null;
  }
  return phoneHoldsFrom({ now, hundredthNewestStart: nth });
}

/**
 * Every trip MileClear has that starts in [from, to): the phone's, plus the
 * server's when the window reaches back past what the phone holds and the
 * phone is online. The phone's copy wins when both have the same trip.
 */
export async function knownTripsBetween(
  from: Date,
  to: Date,
  now: number = Date.now()
): Promise<{ trips: KnownTrip[]; askedServer: boolean; serverFailed: boolean }> {
  const phone = await phoneTripsBetween(from, to);
  const holds = await phoneHoldsFromNow(now);
  if (!needsServerCheck({ windowStart: from.getTime(), phoneHoldsFrom: holds }) || !isOnline()) {
    return { trips: phone, askedServer: false, serverFailed: false };
  }
  try {
    const server = await fetchTripsAround(from, to);
    const have = new Set(phone.map((t) => t.id));
    const extra: KnownTrip[] = server
      .filter((t) => !have.has(t.id))
      .map((t) => ({ ...t, source: "server" as const }));
    const trips = [...phone, ...extra].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
    return { trips, askedServer: true, serverFailed: false };
  } catch {
    return { trips: phone, askedServer: true, serverFailed: true };
  }
}

/** The trip MileClear already has around [start, end], or null. */
export async function findTripAround(
  start: Date,
  end: Date | null,
  opts: { excludeIds?: string[]; now?: number } = {}
): Promise<KnownTrip | null> {
  const window = overlapLookupWindow(start, end);
  const { trips } = await knownTripsBetween(window.from, window.to, opts.now);
  return firstOverlappingTrip(trips, start, end, { excludeIds: opts.excludeIds });
}

/** When the phone's newest trip ended, epoch ms, or null. */
export async function lastTripEndedAt(): Promise<number | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ ended_at: string | null; started_at: string }>(
      "SELECT ended_at, started_at FROM trips ORDER BY started_at DESC LIMIT 1"
    );
    if (!row) return null;
    const t = new Date(row.ended_at ?? row.started_at).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}
