// "Newest trip first" (Oct 2026): a driver's choice to run the trips inside
// each day newest first on the Trips tab. Off by default. Kept on this phone
// in tracking_state, like the other per-phone display settings. Reads that
// fail mean "off"; writes that fail are swallowed.
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

export const NEWEST_TRIP_FIRST_KEY = "trips_newest_first";

/** Pure: stored text to a boolean. Anything unreadable is off. */
export function parseNewestTripFirst(raw: string | null | undefined): boolean {
  return raw === "1";
}

async function db() {
  const mod = await import("../db/index");
  return mod.getDatabase();
}

export async function getNewestTripFirst(): Promise<boolean> {
  try {
    const d = await db();
    const row = await d.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [
      NEWEST_TRIP_FIRST_KEY,
    ]);
    return parseNewestTripFirst(row?.value);
  } catch {
    return false;
  }
}

export async function setNewestTripFirst(on: boolean): Promise<void> {
  try {
    const d = await db();
    await d.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      NEWEST_TRIP_FIRST_KEY,
      on ? "1" : "0",
    ]);
  } catch {
    // best-effort
  }
}

/** Current choice, re-read whenever the screen gains focus. */
export function useNewestTripFirst(): boolean {
  const [on, setOn] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getNewestTripFirst().then((v) => {
        if (!cancelled) setOn(v);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );
  return on;
}
