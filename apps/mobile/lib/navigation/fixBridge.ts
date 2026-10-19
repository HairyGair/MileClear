// The foreground bridge (rule in bridgeRule.ts): a foreground-only
// expo-location watch that fills in while the recorder is silent and the
// Directions screen is on screen. Checked every second, so it stops within
// 2 seconds of the screen going away, and of recorder fixes flowing again
// once it has been on for 15 seconds.
//
// Never the trip recorder's engine, never a background task, never the
// recorder's state. On the next recorder fix the watch is removed.

import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { bridgeShouldRun } from "./bridgeRule";
import { emitBridgeFix, lastRecorderFixAt } from "./fixBus";

const TICK_MS = 1_000;

export function useFixBridge(focused: boolean, onRunningChange?: (running: boolean) => void): void {
  const sub = useRef<Location.LocationSubscription | null>(null);
  const starting = useRef(false);
  const runningSince = useRef<number | null>(null);
  const since = useRef(Date.now());
  const appActive = useRef(AppState.currentState === "active");
  const changed = useRef(onRunningChange);
  changed.current = onRunningChange;

  useEffect(() => {
    since.current = Date.now();
    let cancelled = false;

    const stop = () => {
      if (sub.current) {
        try {
          sub.current.remove();
        } catch {
          // best effort
        }
        sub.current = null;
        runningSince.current = null;
        changed.current?.(false);
      }
    };

    const start = async () => {
      if (sub.current || starting.current) return;
      starting.current = true;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted" || cancelled) return;
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (loc) => emitBridgeFix(loc)
        );
        // Focus may have gone while it started.
        if (cancelled || !wanted()) {
          s.remove();
          return;
        }
        sub.current = s;
        runningSince.current = Date.now();
        changed.current?.(true);
      } catch {
        // no bridge: Directions wait for the recorder
      } finally {
        starting.current = false;
      }
    };

    const wanted = () =>
      bridgeShouldRun({
        focused,
        appActive: appActive.current,
        nowMs: Date.now(),
        lastRecorderAtMs: lastRecorderFixAt(),
        listeningSinceMs: since.current,
        runningSinceMs: runningSince.current,
      });

    const tick = () => {
      if (wanted()) void start();
      else stop();
    };

    const appSub = AppState.addEventListener("change", (s) => {
      appActive.current = s === "active";
      if (!appActive.current) stop();
    });
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      appSub.remove();
      stop();
    };
  }, [focused]);
}
