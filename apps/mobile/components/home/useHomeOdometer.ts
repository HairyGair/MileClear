// Data for the Odometer card on Home. Reads /vehicles (which carries each
// vehicle's running figure) and, for the vehicles shown, /vehicles/:id/odometer
// for the line under the figure. Re-read when Home gains focus, on pull to
// refresh, and when the last trip changes (a trip saved or uploaded).
//
// Best-effort throughout: the last good answer is kept on this phone, so with
// no signal the card shows the last known figure, and a read that fails
// keeps what is showing.

import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getDatabase } from "../../lib/db/index";
import { fetchVehicles } from "../../lib/api/vehicles";
import { fetchVehicleOdometer } from "../../lib/api/odometer";
import {
  basisOf,
  parseHomeOdometerCache,
  selectHomeOdometerVehicles,
  toHomeOdometerRows,
  type HomeOdometerBasis,
  type HomeOdometerRow,
} from "../../lib/home/odometerCard";

const CACHE_KEY = "home_odometer_card";
/** Focus events close together (tab flicks) share one read. */
const MIN_GAP_MS = 15_000;

async function readCache(): Promise<HomeOdometerRow[] | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [CACHE_KEY]);
    return parseHomeOdometerCache(row?.value);
  } catch {
    return null;
  }
}

async function writeCache(rows: HomeOdometerRow[]): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      CACHE_KEY,
      JSON.stringify(rows),
    ]);
  } catch {
    // best-effort
  }
}

async function loadRows(): Promise<HomeOdometerRow[]> {
  const vehicles = selectHomeOdometerVehicles((await fetchVehicles()).data);
  const bases = new Map<string, HomeOdometerBasis | null>();
  await Promise.all(
    vehicles.map(async (v) => {
      try {
        const res = await fetchVehicleOdometer(v.id);
        bases.set(v.id, basisOf(res.data?.current));
      } catch {
        bases.set(v.id, null);
      }
    })
  );
  return toHomeOdometerRows(vehicles, bases);
}

/**
 * `enabled` false (the driver hid the card) skips every read.
 * `refreshKey` and `tripKey` changing force a fresh read.
 */
export function useHomeOdometer(enabled: boolean, refreshKey: number, tripKey: string): HomeOdometerRow[] {
  const [rows, setRows] = useState<HomeOdometerRow[]>([]);
  const mounted = useRef(true);
  const lastAt = useRef(0);
  const busy = useRef(false);
  const again = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async function load(force: boolean): Promise<void> {
      if (!enabled) return;
      if (busy.current) {
        // A trip saved while a read was running: read again once it ends.
        if (force) again.current = true;
        return;
      }
      if (!force && Date.now() - lastAt.current < MIN_GAP_MS) return;
      busy.current = true;
      lastAt.current = Date.now();
      try {
        const next = await loadRows();
        if (mounted.current) setRows(next);
        writeCache(next);
      } catch {
        // No signal or a server error: show the last known figure, if any.
        const cached = await readCache();
        if (cached && mounted.current) setRows((prev) => (prev.length > 0 ? prev : cached));
        // Try again on the next focus rather than waiting out the gap.
        lastAt.current = 0;
      } finally {
        busy.current = false;
      }
      if (again.current && mounted.current) {
        again.current = false;
        void load(true);
      }
    },
    [enabled]
  );

  // Show the last known figure straight away, before the network answers.
  useEffect(() => {
    if (!enabled) return;
    readCache().then((cached) => {
      if (cached && mounted.current) setRows((prev) => (prev.length > 0 ? prev : cached));
    });
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  // Pull to refresh, a trip sorted on Home, or a new / uploaded last trip.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    load(true);
  }, [refreshKey, tripKey, load]);

  return enabled ? rows : [];
}
