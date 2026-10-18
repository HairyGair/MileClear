// The navigation screen's state: plan a route, preview it, guide along it.
// The thinking is in navigator.ts (pure); this wires it to the recorder's
// fixes (fixBus.ts), the route API, the voice and the keep-awake.
//
// Nothing here touches trip recording: no shift, no Start Trip, no engine
// call, no classification. Ending guidance (End or arriving) only stops the
// prompts and lets the screen sleep again.

import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { NavigationRoute } from "@mileclear/shared";
import { fetchNavigationRoute, NavigationError, toNavigationError } from "../api/navigation";
import { latestFix, subscribeToFixes } from "./fixBus";
import {
  gpsStale,
  replaceRoute,
  startNavigation,
  stepNavigation,
  viewOf,
  type NavFix,
  type NavigatorState,
  type NavView,
} from "./navigator";
import { shouldReroute } from "./offRoute";
import { hush, say } from "./voice";

const KEEP_AWAKE_TAG = "mileclear-navigation";
/** A recorder fix younger than this is good enough to route from. */
const ORIGIN_FIX_MAX_AGE_MS = 30_000;

export type GuidancePhase = "pick" | "routing" | "preview" | "guiding" | "arrived";

export interface Destination {
  lat: number;
  lng: number;
  label: string | null;
}

async function currentPosition(): Promise<{ lat: number; lng: number; headingDeg: number | null } | null> {
  const fix = latestFix(ORIGIN_FIX_MAX_AGE_MS);
  if (fix) return { lat: fix.lat, lng: fix.lng, headingDeg: fix.headingDeg };
  // One reading for the start of the route. A one-off position request, as
  // the place pickers already make; it is not a listener and does not touch
  // the trip recorder's engine.
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const h = p.coords.heading;
    return { lat: p.coords.latitude, lng: p.coords.longitude, headingDeg: h != null && h >= 0 ? h : null };
  } catch {
    return null;
  }
}

export function useGuidance() {
  const [phase, setPhase] = useState<GuidancePhase>("pick");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [view, setView] = useState<NavView | null>(null);
  const [error, setError] = useState<NavigationError | null>(null);
  const [muted, setMuted] = useState(false);
  const [waitingForGps, setWaitingForGps] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [lastFix, setLastFix] = useState<NavFix | null>(null);

  const nav = useRef<NavigatorState | null>(null);
  const phaseRef = useRef<GuidancePhase>("pick");
  const mutedRef = useRef(false);
  const lastFixAt = useRef<number | null>(null);
  const reroute = useRef<{ inFlight: boolean; lastAt: number | null }>({ inFlight: false, lastAt: null });
  const mounted = useRef(true);

  phaseRef.current = phase;
  mutedRef.current = muted;

  const speakAll = useCallback((lines: string[]) => {
    if (mutedRef.current) return;
    for (const l of lines) say(l);
  }, []);

  const stopGuiding = useCallback(() => {
    hush();
    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      // best effort
    }
  }, []);

  const requestReroute = useCallback(
    async (fix: NavFix) => {
      const state = nav.current;
      if (!state) return;
      reroute.current = { inFlight: true, lastAt: Date.now() };
      setRerouting(true);
      try {
        const next = await fetchNavigationRoute({
          from: fix,
          to: state.destination,
          headingDeg: state.courseDeg,
        });
        if (!mounted.current || phaseRef.current !== "guiding" || !nav.current) return;
        nav.current = replaceRoute(nav.current, next);
        setRoute(next);
        setView(viewOf(nav.current));
        setRerouting(false);
      } catch (err) {
        const e = toNavigationError(err, null);
        if (e.kind === "NAVIGATION_NOT_ENABLED" && mounted.current) {
          // Switched off mid-drive: stop guiding, say why. Recording carries on.
          stopGuiding();
          setError(e);
          setPhase("pick");
        }
        // Otherwise keep the old line and try again after the throttle.
      } finally {
        reroute.current = { ...reroute.current, inFlight: false };
      }
    },
    [stopGuiding]
  );

  const stopGuidingAfterArrival = useCallback(() => {
    // Let "You have arrived" finish before the screen may sleep; no hush.
    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      // best effort
    }
    setPhase("arrived");
  }, []);

  const onFix = useCallback(
    (fix: NavFix) => {
      lastFixAt.current = Date.now();
      setLastFix(fix);
      setWaitingForGps(false);
      if (phaseRef.current !== "guiding" || !nav.current) return;
      const step = stepNavigation(nav.current, fix);
      nav.current = step.state;
      setView(step.view);
      speakAll(step.speak);
      if (step.view.arrived) {
        stopGuidingAfterArrival();
        return;
      }
      if (!step.view.offRoute) setRerouting(false);
      if (
        step.wantReroute &&
        shouldReroute({
          offRoute: true,
          nowMs: Date.now(),
          lastRequestAtMs: reroute.current.lastAt,
          inFlight: reroute.current.inFlight,
        })
      ) {
        void requestReroute(fix);
      } else if (step.wantReroute) {
        setRerouting(true);
      }
    },
    [requestReroute, speakAll, stopGuidingAfterArrival]
  );

  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  // Listen for the recorder's fixes for as long as the screen is open, so a
  // recent one is to hand as the start of the route.
  useEffect(() => {
    mounted.current = true;
    const off = subscribeToFixes((f) => onFixRef.current(f));
    return () => {
      mounted.current = false;
      off();
      hush();
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // best effort
      }
    };
  }, []);

  // "Waiting for GPS" when the fixes stop while guiding.
  useEffect(() => {
    if (phase !== "guiding") {
      setWaitingForGps(false);
      return;
    }
    const tick = () => setWaitingForGps(gpsStale(lastFixAt.current, Date.now()));
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [phase]);

  const planTo = useCallback(async (dest: Destination) => {
    setDestination(dest);
    setError(null);
    setPhase("routing");
    const from = await currentPosition();
    if (!mounted.current) return;
    if (!from) {
      setError(new NavigationError("UNKNOWN", "We can't tell where you are yet. Check location is on and try again."));
      setPhase("pick");
      return;
    }
    try {
      const r = await fetchNavigationRoute({ from, to: dest, headingDeg: from.headingDeg });
      if (!mounted.current) return;
      setRoute(r);
      setPhase("preview");
    } catch (err) {
      if (!mounted.current) return;
      setError(toNavigationError(err, null));
      setPhase("pick");
    }
  }, []);

  const start = useCallback(() => {
    if (!route || !destination) return;
    nav.current = startNavigation(route, { lat: destination.lat, lng: destination.lng });
    reroute.current = { inFlight: false, lastAt: null };
    setView(viewOf(nav.current));
    setRerouting(false);
    setPhase("guiding");
    phaseRef.current = "guiding";
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    // Use the newest fix straight away so the first prompt does not wait.
    const recent = latestFix(5_000);
    if (recent) onFixRef.current(recent);
    else lastFixAt.current = null;
  }, [route, destination]);

  const end = useCallback(() => {
    stopGuiding();
    nav.current = null;
    setView(null);
    setRoute(null);
    setDestination(null);
    setRerouting(false);
    setPhase("pick");
  }, [stopGuiding]);

  const back = useCallback(() => {
    setRoute(null);
    setError(null);
    setPhase("pick");
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m) hush();
      return !m;
    });
  }, []);

  return {
    phase,
    destination,
    route,
    view,
    error,
    muted,
    waitingForGps,
    rerouting,
    lastFix,
    planTo,
    start,
    end,
    back,
    toggleMute,
    clearError: () => setError(null),
  };
}
