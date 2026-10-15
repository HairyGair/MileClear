// Data for the Odometer card on Home. One request: /vehicles carries each
// vehicle's running figure and the reading it is built on. Re-read when Home
// gains focus (at most every 15 s), on pull to refresh, and when the last trip
// changes (a trip saved or uploaded).
//
// Best-effort throughout: the last good answer is kept on this phone for this
// account (lib/home/odometerCache), so with no signal the card shows the last
// known figure, and a read that fails keeps what is showing.

import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchVehicles } from "../../lib/api/vehicles";
import { homeOdometerRows, type HomeOdometerRow } from "../../lib/home/odometerCard";
import { readHomeOdometerCache, writeHomeOdometerCache } from "../../lib/home/odometerCache";

/** Focus events close together (tab flicks) share one read. */
const MIN_GAP_MS = 15_000;

/**
 * `enabled` false (the driver hid the card) skips every read. No `userId`
 * (signed out) shows nothing. `refreshKey` and `tripKey` changing force a
 * fresh read.
 */
export function useHomeOdometer(
  enabled: boolean,
  userId: string | null | undefined,
  refreshKey: number,
  tripKey: string
): HomeOdometerRow[] {
  const [state, setState] = useState<{ userId: string; rows: HomeOdometerRow[] } | null>(null);
  const mounted = useRef(true);
  const lastAt = useRef(0);
  const busy = useRef(false);
  const again = useRef(false);
  const currentUser = useRef(userId ?? "");
  currentUser.current = userId ?? "";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Only keep rows for the account that is signed in right now. */
  const show = useCallback((uid: string, rows: HomeOdometerRow[], onlyIfEmpty: boolean) => {
    if (!mounted.current || uid !== currentUser.current) return;
    setState((prev) => (onlyIfEmpty && prev?.userId === uid && prev.rows.length > 0 ? prev : { userId: uid, rows }));
  }, []);

  const load = useCallback(
    async function load(force: boolean): Promise<void> {
      const uid = userId ?? "";
      if (!enabled || !uid) return;
      if (busy.current) {
        // A trip saved while a read was running: read again once it ends.
        if (force) again.current = true;
        return;
      }
      if (!force && Date.now() - lastAt.current < MIN_GAP_MS) return;
      busy.current = true;
      lastAt.current = Date.now();
      try {
        const rows = homeOdometerRows((await fetchVehicles()).data);
        if (uid === currentUser.current) {
          show(uid, rows, false);
          void writeHomeOdometerCache(uid, rows);
        }
      } catch {
        // No signal or a server error: show the last known figure, if any.
        const cached = await readHomeOdometerCache(uid);
        if (cached) show(uid, cached, true);
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
    [enabled, userId, show]
  );

  // A different account: start again from its own saved figure.
  useEffect(() => {
    lastAt.current = 0;
    const uid = userId ?? "";
    if (!enabled || !uid) return;
    readHomeOdometerCache(uid).then((cached) => {
      if (cached) show(uid, cached, true);
    });
  }, [enabled, userId, show]);

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

  if (!enabled || !userId || state?.userId !== userId) return [];
  return state.rows;
}
