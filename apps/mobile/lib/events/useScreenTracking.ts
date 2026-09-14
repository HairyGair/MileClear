/**
 * One hook, mounted once, that covers every route in the app.
 *
 * Deliberately hooked at the navigation layer rather than pasted into each
 * screen: there are 20-plus destinations and new ones land regularly, and
 * per-screen instrumentation is only ever as complete as the last person who
 * remembered to add it. Mounting this in RootNavigator means a new screen is
 * measured the day it ships, with no extra code.
 */

import { useEffect } from "react";
import { useSegments } from "expo-router";
import {
  flushScreenViews,
  mountScreenViewFlush,
  recordScreenView,
  setScreenTrackingEnabled,
} from "./screenViews";

/**
 * @param enabled record only for a signed-in, settled session. The events
 * endpoint is authenticated, so there is nowhere to send a logged-out view.
 */
export function useScreenTracking(enabled: boolean): void {
  // useSegments(), never usePathname(): segments keep dynamic routes as their
  // file pattern ("[id]"), a pathname would resolve them to the real record id.
  const segments = useSegments();
  // Join for the dependency so the effect fires on an actual route change
  // rather than on every render that hands back a new array instance.
  const routeKey = Array.isArray(segments) ? segments.join("/") : "";

  useEffect(() => {
    setScreenTrackingEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    try {
      recordScreenView(routeKey.split("/"));
    } catch {
      // Never throw into navigation.
    }
  }, [enabled, routeKey]);

  useEffect(() => {
    if (!enabled) return;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = mountScreenViewFlush();
    } catch {
      // Without the listener we still flush on the buffer threshold.
    }
    return () => {
      try {
        unsubscribe?.();
        void flushScreenViews();
      } catch {
        // teardown is best-effort
      }
    };
  }, [enabled]);
}
