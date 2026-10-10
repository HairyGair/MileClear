// The live signals Home reads from this phone: a trip being recorded right
// now, trips that failed to upload, and the last saved trip. All best-effort
// reads of local SQLite, polled lightly, with the setState guarded so a poll
// that finds nothing new does not re-render the screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { haversineDistance } from "@mileclear/shared";
import { getDatabase } from "../../lib/db/index";
import { isOnline } from "../../lib/network";
import { fetchUnclassifiedCount, fetchMissedJourneys } from "../../lib/api/trips";
import { tripEndLabel, type SavedPlace } from "../../lib/trips/placeLabel";
import type { LastTripData, SyncChip, TripChoice } from "../../lib/home/lastTrip";

const QUICK_TRIP_SHIFT_ID = "__quick_trip__";

function sumMiles(coords: { lat: number; lng: number }[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    d += haversineDistance(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
  }
  return d;
}

// ── Recording right now ───────────────────────────────────────────────

export interface RecordingNow {
  miles: number;
  elapsedMs: number;
  mode: "auto" | "quick";
}

/** Auto-detected recording or a manual Start Trip in progress, else null. */
export function useRecordingNow(): RecordingNow | null {
  const [raw, setRaw] = useState<{ miles: number; startedAt: number | null; mode: "auto" | "quick" } | null>(null);
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const autoRow = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      let next: { miles: number; startedAt: number | null; mode: "auto" | "quick" } | null = null;
      if (autoRow?.value === "1") {
        const coords = await db.getAllAsync<{ lat: number; lng: number; recorded_at: string }>(
          "SELECT lat, lng, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
        );
        next = {
          mode: "auto",
          miles: sumMiles(coords),
          startedAt: coords.length > 0 ? new Date(coords[0].recorded_at).getTime() : null,
        };
      } else {
        const shiftRow = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
        );
        if (shiftRow?.value === QUICK_TRIP_SHIFT_ID) {
          const coords = await db.getAllAsync<{ lat: number; lng: number; recorded_at: string }>(
            "SELECT lat, lng, recorded_at FROM shift_coordinates WHERE shift_id = ? ORDER BY recorded_at ASC",
            [QUICK_TRIP_SHIFT_ID]
          );
          next = {
            mode: "quick",
            miles: sumMiles(coords),
            startedAt: coords.length > 0 ? new Date(coords[0].recorded_at).getTime() : null,
          };
        }
      }
      if (!mounted.current) return;
      setRaw((prev) => {
        if (!next && !prev) return prev;
        if (next && prev && prev.mode === next.mode && prev.startedAt === next.startedAt && Math.abs(prev.miles - next.miles) < 0.05) {
          return prev;
        }
        return next;
      });
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const id = setInterval(refresh, 2000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  const active = raw !== null;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [active]);

  if (!raw) return null;
  return {
    miles: raw.miles,
    mode: raw.mode,
    elapsedMs: raw.startedAt != null ? Math.max(0, now - raw.startedAt) : 0,
  };
}

// ── Trips that failed to upload ───────────────────────────────────────

/** Trips stuck for good in the sync queue (they need the driver). */
export function useFailedSyncCount(): { count: number; allTrips: boolean } {
  const [state, setState] = useState({ count: 0, allTrips: true });
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ entity_type: string; n: number }>(
        "SELECT entity_type, COUNT(*) AS n FROM sync_queue WHERE status = 'permanently_failed' GROUP BY entity_type"
      );
      const count = rows.reduce((t, r) => t + r.n, 0);
      const allTrips = rows.every((r) => r.entity_type === "trip");
      if (mounted.current) {
        setState((prev) => (prev.count === count && prev.allTrips === allTrips ? prev : { count, allTrips }));
      }
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  return state;
}

// ── The last saved trip ───────────────────────────────────────────────

interface LocalTripRow {
  id: string;
  shift_id: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number | null;
  end_lng: number | null;
  start_address: string | null;
  end_address: string | null;
  distance_miles: number;
  started_at: string;
  ended_at: string | null;
  is_manual_entry: number;
  classification: string;
  classification_source?: string | null;
  synced_at: string | null;
}

const MAX_ROUTE_POINTS = 36;

function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

async function readSyncChip(db: Awaited<ReturnType<typeof getDatabase>>, row: LocalTripRow): Promise<SyncChip> {
  if (row.synced_at) return "synced";
  const q = await db.getFirstAsync<{ status: string }>(
    "SELECT status FROM sync_queue WHERE entity_id = ? ORDER BY updated_at DESC LIMIT 1",
    [row.id]
  );
  if (q?.status === "permanently_failed") return "failed";
  if (q?.status === "synced") return "synced";
  return isOnline() ? "saving" : "waiting";
}

export async function loadLastTrip(): Promise<LastTripData | null> {
  const db = await getDatabase();
  let row: LocalTripRow | null;
  try {
    row = await db.getFirstAsync<LocalTripRow>(
      "SELECT id, shift_id, start_lat, start_lng, end_lat, end_lng, start_address, end_address, distance_miles, started_at, ended_at, is_manual_entry, classification, classification_source, synced_at FROM trips ORDER BY started_at DESC LIMIT 1"
    );
  } catch {
    row = await db.getFirstAsync<LocalTripRow>(
      "SELECT id, shift_id, start_lat, start_lng, end_lat, end_lng, start_address, end_address, distance_miles, started_at, ended_at, is_manual_entry, classification, synced_at FROM trips ORDER BY started_at DESC LIMIT 1"
    );
  }
  if (!row) return null;

  let saved: SavedPlace[] = [];
  try {
    const places = await db.getAllAsync<{ name: string; latitude: number; longitude: number; radius_meters: number }>(
      "SELECT name, latitude, longitude, radius_meters FROM saved_locations"
    );
    saved = places.map((p) => ({ name: p.name, lat: p.latitude, lng: p.longitude, radiusMeters: p.radius_meters }));
  } catch {
    // labels fall back to addresses
  }

  let route: { lat: number; lng: number }[] = [];
  try {
    const coords = await db.getAllAsync<{ lat: number; lng: number }>(
      "SELECT lat, lng FROM coordinates WHERE trip_id = ? ORDER BY recorded_at ASC LIMIT 3000",
      [row.id]
    );
    route = thin(coords, MAX_ROUTE_POINTS);
  } catch {
    // no route drawn
  }

  const sync = await readSyncChip(db, row).catch((): SyncChip => "synced");
  const cls: TripChoice =
    row.classification === "business" || row.classification === "personal" ? row.classification : "unclassified";

  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    distanceMiles: row.distance_miles,
    startLabel: tripEndLabel(row.start_address, row.start_lat, row.start_lng, saved),
    endLabel: tripEndLabel(row.end_address, row.end_lat, row.end_lng, saved),
    classification: cls,
    autoSorted: !!row.classification_source && cls !== "unclassified",
    isShiftTrip: !!row.shift_id && row.shift_id !== QUICK_TRIP_SHIFT_ID,
    isManual: row.is_manual_entry === 1,
    sync,
    route,
    startPoint: Number.isFinite(row.start_lat) && (row.start_lat !== 0 || row.start_lng !== 0)
      ? { lat: row.start_lat, lng: row.start_lng }
      : null,
    endPoint: row.end_lat != null && row.end_lng != null ? { lat: row.end_lat, lng: row.end_lng } : null,
  };
}

export interface LastTripState {
  trip: LastTripData | null;
  /** True until the first read has finished. */
  loading: boolean;
  unsortedCount: number | null;
  missedCount: number | null;
  /** Re-read everything (after a classify, or a pull to refresh). */
  reload: () => void;
}

/** Re-read on focus; the local part (sync chip) also every 5 s while mounted. */
export function useLastTrip(): LastTripState {
  const [trip, setTrip] = useState<LastTripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsortedCount, setUnsortedCount] = useState<number | null>(null);
  const [missedCount, setMissedCount] = useState<number | null>(null);
  const mounted = useRef(true);
  const tripSig = useRef("");

  const probeSig = useRef("");
  const readLocal = useCallback(async () => {
    try {
      // Every 5 s: a cheap look at the newest trip first, and the full read
      // (saved places, up to 3,000 route points) only when something changed.
      const db = await getDatabase();
      const probe = await db.getFirstAsync<{
        id: string;
        classification: string;
        synced_at: string | null;
        distance_miles: number;
        end_address: string | null;
        ended_at: string | null;
      }>(
        "SELECT id, classification, synced_at, distance_miles, end_address, ended_at FROM trips ORDER BY started_at DESC LIMIT 1"
      );
      const q = probe && !probe.synced_at
        ? await db.getFirstAsync<{ status: string }>(
            "SELECT status FROM sync_queue WHERE entity_id = ? ORDER BY updated_at DESC LIMIT 1",
            [probe.id]
          )
        : null;
      const pSig = probe
        ? `${probe.id}|${probe.classification}|${probe.synced_at ?? ""}|${probe.distance_miles}|${probe.end_address ?? ""}|${probe.ended_at ?? ""}|${q?.status ?? ""}|${isOnline() ? 1 : 0}`
        : "none";
      if (pSig === probeSig.current) return;
      probeSig.current = pSig;
      const t = await loadLastTrip();
      if (!mounted.current) return;
      const sig = t ? `${t.id}|${t.classification}|${t.sync}|${t.distanceMiles}|${t.endLabel}|${t.endedAt}` : "none";
      if (sig !== tripSig.current) {
        tripSig.current = sig;
        setTrip(t);
      }
    } catch {
      // keep what is showing, and do the full read again next time
      probeSig.current = "";
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const readCounts = useCallback(async () => {
    let unsorted: number | null = null;
    try {
      const res = await fetchUnclassifiedCount();
      unsorted = res.count ?? 0;
    } catch {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ n: number }>(
          "SELECT COUNT(*) AS n FROM trips WHERE classification = 'unclassified'"
        );
        unsorted = row?.n ?? 0;
      } catch {
        unsorted = null;
      }
    }
    if (!mounted.current) return;
    setUnsortedCount(unsorted);
    // The footer only uses the missed count when nothing is waiting to be sorted.
    if (unsorted === 0) {
      try {
        const res = await fetchMissedJourneys();
        if (mounted.current) setMissedCount(res.proposals?.length ?? 0);
      } catch {
        if (mounted.current) setMissedCount(null);
      }
    } else if (mounted.current) {
      setMissedCount(null);
    }
  }, []);

  const reload = useCallback(() => {
    probeSig.current = "";
    readLocal();
    readCounts();
  }, [readLocal, readCounts]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  useEffect(() => {
    mounted.current = true;
    const id = setInterval(readLocal, 5000);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [readLocal]);

  return { trip, loading, unsortedCount, missedCount, reload };
}
