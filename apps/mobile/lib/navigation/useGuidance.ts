// The Directions screen's state: find where the car is, get a route, guide
// along it (docs/navigation-1.4.0/DESIGN.md section 2). The thinking is in
// navigator.ts and rules.ts (pure); this wires it to the fixes (fixBus.ts and
// the foreground bridge), the route API, the voice, keep-awake, the phone's
// own store and the counts-only events.
//
// Nothing here touches trip recording: no shift, no Start Trip, no engine
// call, no classification, no write to the recorder's state. Ending
// directions (End, arriving, leaving the screen) only stops the prompts and
// lets the screen sleep.

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import type { NavigationRoute } from "@mileclear/shared";
import { fetchNavigationRoute, NavigationError, toNavigationError, type NavigationErrorKind } from "../api/navigation";
import { distanceMeters } from "./geo";
import { latestFix, subscribeToFixes } from "./fixBus";
import { useFixBridge } from "./fixBridge";
import {
  replaceRoute,
  repeatInstruction,
  smoothedSpeed,
  startNavigation,
  stepNavigation,
  viewOf,
  type NavFix,
  type NavigatorState,
  type NavView,
} from "./navigator";
import { shouldReroute, type RerouteFailure } from "./offRoute";
import { HALF_MILE_M } from "./announcer";
import { REROUTE_FAILED_PHRASE } from "./phrases";
import { gpsStateFor, inGreatBritain, pathMeters, rerouteOrigin, thinLine, type GpsState } from "./rules";
import { loadOptional } from "./optionalNative";
import { getVoice } from "./voice";
import * as store from "./store";
import { trackDirections } from "./telemetry";

const KEEP_AWAKE_TAG = "mileclear-directions";
/** A fix younger than this is good enough to route from. */
const ORIGIN_FIX_MAX_AGE_MS = 30_000;
/** Wait this long for a fix before asking the phone once. */
const LOCATE_WAIT_MS = 10_000;
/** Under this, "You're already there." */
const ALREADY_THERE_M = 161;
const STOPPED_MPS = 3 * 0.44704;

type KeepAwake = { activateKeepAwakeAsync: (t?: string) => Promise<void>; deactivateKeepAwake: (t?: string) => Promise<void> | void };
function keepAwake(): KeepAwake | null {
  return loadOptional(() => require("expo-keep-awake") as KeepAwake);
}

export type GuidancePhase = "pick" | "locating" | "routing" | "preview" | "guiding" | "arrived";
export type { PreviewError } from "./useGuidanceTypes";
import type { PreviewError } from "./useGuidanceTypes";
export type { GpsState } from "./rules";
export type RerouteStatus = { kind: "idle" } | { kind: "searching" } | { kind: "failed"; reason: RerouteFailure };

export interface Destination {
  lat: number;
  lng: number;
  label: string | null;
  /** Saved place name, said on arrival ("You have arrived at Home"). */
  name?: string | null;
}

function newSessionId(): string {
  return `dir_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function failureOf(kind: NavigationErrorKind): RerouteFailure {
  if (kind === "OFFLINE") return "OFFLINE";
  if (kind === "NO_ROUTE") return "NO_ROUTE";
  if (kind === "ROUTING_UNAVAILABLE" || kind === "TOO_MANY_REQUESTS") return "ROUTING_UNAVAILABLE";
  return "OTHER";
}

export function useGuidance(opts: { focused: boolean }) {
  const [phase, setPhase] = useState<GuidancePhase>("pick");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [view, setView] = useState<NavView | null>(null);
  const [previewError, setPreviewError] = useState<PreviewError | null>(null);
  const [alreadyThere, setAlreadyThere] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [gps, setGps] = useState<GpsState>("ok");
  const [reroute, setReroute] = useState<RerouteStatus>({ kind: "idle" });
  const [stuck, setStuck] = useState(false);
  const [lastFix, setLastFix] = useState<NavFix | null>(null);
  const [movingMps, setMovingMps] = useState<number | null>(null);
  const [arrivedAtMs, setArrivedAtMs] = useState<number | null>(null);
  /** What was really driven while guided: shown on arrival, never the plan. */
  const [driven, setDriven] = useState<{ meters: number; seconds: number } | null>(null);
  const drivenM = useRef(0);
  const pathPrev = useRef<NavFix | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [crashed, setCrashed] = useState(false);

  const nav = useRef<NavigatorState | null>(null);
  const phaseRef = useRef<GuidancePhase>("pick");
  const mutedRef = useRef(false);
  const lastUsableAt = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const speeds = useRef<Array<{ atMs: number; v: number }>>([]);
  const rr = useRef({ inFlight: false, lastAt: null as number | null, failures: 0, lastFailure: null as RerouteFailure | null, saidFailure: false });
  const counts = useRef({ reroutes: 0, rerouteFailures: 0, gpsWaits: 0, prompts: 0, bridge: 0, native: 0, task: 0 });
  const lastSavedStep = useRef(-1);
  const autoStart = useRef(false);
  const mounted = useRef(true);
  /** Foreground only: with the phone locked or the app in the background,
   *  only the navigator and the voice run; no map or view state updates
   *  (R1: nothing that keeps the app busier than recording needs). */
  const appActive = useRef(AppState.currentState === "active");
  const latestFixRef = useRef<NavFix | null>(null);
  const voice = getVoice();

  phaseRef.current = phase;
  mutedRef.current = muted;

  useFixBridge(opts.focused && phase !== "arrived");

  // Mute is remembered on the phone.
  useEffect(() => {
    store.getMuted().then((m) => {
      if (!mounted.current) return;
      setMutedState(m);
      voice.setMuted(m);
    });
  }, [voice]);

  const speak = useCallback(
    (text: string | null, urgent: boolean) => {
      if (!text || mutedRef.current) return;
      counts.current.prompts++;
      // Debug builds only, for testers capturing voice lines: the words,
      // never a position. Metro strips this from release bundles.
      if (__DEV__) console.log(`[directions] say${urgent ? " (now)" : ""}: ${text}`);
      void voice.say({ text, urgent });
    },
    [voice]
  );

  const releaseAwake = useCallback(() => {
    try {
      void keepAwake()?.deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      // best effort
    }
  }, []);

  const finishCounts = useCallback(
    (type: "directions.ended" | "directions.arrived") => {
      const c = counts.current;
      trackDirections(type, {
        minutes: startedAt.current ? (Date.now() - startedAt.current) / 60000 : 0,
        reroutes: c.reroutes,
        reroute_failures: c.rerouteFailures,
        gps_waits: c.gpsWaits,
        prompts: c.prompts,
        fixes_native: c.native,
        fixes_task: c.task,
        fixes_bridge: c.bridge,
        muted: mutedRef.current,
      });
    },
    []
  );

  const persist = useCallback((state: NavigatorState, force = false) => {
    if (!force && state.stepIndex === lastSavedStep.current) return;
    lastSavedStep.current = state.stepIndex;
    const d = state.destination;
    void store.saveSession({
      destination: { lat: d.lat, lng: d.lng, label: state.destinationName },
      startedAtMs: startedAt.current ?? Date.now(),
      updatedAtMs: Date.now(),
      remaining: thinLine(state.prepared.route.geometry, state.segIndex),
    });
  }, []);

  const requestReroute = useCallback(
    async (fix: NavFix) => {
      const state = nav.current;
      if (!state) return;
      rr.current.inFlight = true;
      rr.current.lastAt = Date.now();
      setReroute({ kind: "searching" });
      try {
        const from = rerouteOrigin(fix, state.courseDeg, smoothedSpeed(speeds.current) ?? fix.speedMps);
        const next = await fetchNavigationRoute({ from, to: state.destination, headingDeg: state.courseDeg });
        if (!mounted.current || phaseRef.current !== "guiding" || !nav.current) return;
        // Back on the old line before the answer came: carry on with it.
        if (!nav.current.offRoute.offRoute) {
          setReroute({ kind: "idle" });
          return;
        }
        nav.current = replaceRoute(nav.current, next);
        rr.current = { ...rr.current, failures: 0, lastFailure: null, saidFailure: false };
        counts.current.reroutes++;
        trackDirections("directions.rerouted", { profile_car_nav: next.profile === "car_nav" });
        setRoute(next);
        setView(viewOf(nav.current));
        setReroute({ kind: "idle" });
        setStuck(false);
        persist(nav.current, true);
      } catch (err) {
        const e = toNavigationError(err, null);
        if (!mounted.current) return;
        if (e.kind === "NAVIGATION_NOT_ENABLED") {
          // Switched off mid-drive (DESIGN 2.12): finish on the line we have.
          setReroute({ kind: "failed", reason: "OTHER" });
        } else {
          const reason = failureOf(e.kind);
          rr.current.failures++;
          rr.current.lastFailure = reason;
          counts.current.rerouteFailures++;
          trackDirections("directions.reroute_failed", { code: e.kind });
          setReroute({ kind: "failed", reason });
          if (!rr.current.saidFailure) {
            rr.current.saidFailure = true;
            speak(REROUTE_FAILED_PHRASE, false);
          }
          const stopped = (smoothedSpeed(speeds.current) ?? 0) < STOPPED_MPS;
          if (rr.current.failures >= 3 && stopped) setStuck(true);
        }
      } finally {
        rr.current.inFlight = false;
      }
    },
    [persist, speak]
  );

  const onArrived = useCallback(() => {
    releaseAwake();
    // Let "You have arrived" finish before the audio category goes back.
    setTimeout(() => voice.endGuidance({ hush: false }), 6_000);
    void store.clearSession();
    setArrivedAtMs(Date.now());
    setDriven({
      meters: drivenM.current,
      seconds: startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0,
    });
    setPhase("arrived");
    phaseRef.current = "arrived";
    finishCounts("directions.arrived");
  }, [releaseAwake, finishCounts, voice]);

  /** Commit a prompt only if it will be heard now; muted or on a call it
   *  counts as said (never owed later), busy it is tried on the next fix. */
  const canSay = useCallback(
    (a: { urgent: boolean }) => mutedRef.current || voice.dropReason(a) !== "busy",
    [voice]
  );

  const onFix = useCallback(
    (fix: NavFix) => {
      if (fix.source === "native" || fix.source === "task" || fix.source === "bridge") counts.current[fix.source]++;
      const usable = fix.accuracyM == null || fix.accuracyM <= 50;
      const ui = appActive.current;
      if (usable) {
        lastUsableAt.current = Date.now();
        if (ui) setGps("ok");
      }
      latestFixRef.current = fix;
      if (ui) setLastFix(fix);
      if (fix.speedMps != null) {
        speeds.current = [...speeds.current, { atMs: fix.atMs, v: fix.speedMps }].filter((s) => fix.atMs - s.atMs <= 5000);
        if (ui) setMovingMps(smoothedSpeed(speeds.current));
      }
      if (phaseRef.current !== "guiding" || !nav.current) return;
      try {
        if (usable) {
          drivenM.current += pathMeters(pathPrev.current, fix);
          pathPrev.current = fix;
        }
        const step = stepNavigation(nav.current, fix, { canSay });
        nav.current = step.state;
        if (ui) setView(step.view);
        if (step.say) speak(step.say.text, step.say.urgent);
        if (step.view.arrived) {
          onArrived();
          return;
        }
        persist(step.state);
        if (!step.view.offRoute) {
          setReroute((r) => (r.kind === "idle" ? r : { kind: "idle" }));
          return;
        }
        if (
          step.wantReroute &&
          shouldReroute({
            offRoute: true,
            nowMs: Date.now(),
            lastRequestAtMs: rr.current.lastAt,
            inFlight: rr.current.inFlight,
            failures: rr.current.failures,
            lastFailure: rr.current.lastFailure,
          })
        ) {
          void requestReroute(fix);
        } else if (rr.current.lastAt == null) {
          setReroute({ kind: "searching" });
        }
      } catch {
        // A bug in guidance: the fallback screen, never a red screen. The
        // recorder is untouched either way.
        trackDirections("directions.crashed", {});
        setCrashed(true);
      }
    },
    [onArrived, persist, requestReroute, speak, canSay]
  );

  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    mounted.current = true;
    const off = subscribeToFixes((f) => onFixRef.current(f));
    return () => {
      mounted.current = false;
      off();
      voice.endGuidance();
      releaseAwake();
    };
  }, [voice, releaseAwake]);

  // Back in the foreground: show where things are now, in one update.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      appActive.current = st === "active";
      if (!appActive.current || !mounted.current) return;
      if (latestFixRef.current) setLastFix(latestFixRef.current);
      setMovingMps(smoothedSpeed(speeds.current));
      if (nav.current && phaseRef.current === "guiding") setView(viewOf(nav.current));
    });
    return () => sub.remove();
  }, []);

  // A call or Siri ended: say the instruction again if it is close.
  useEffect(() => {
    const navVoice = loadOptional(() => require("../../modules/nav-voice") as { addInterruptionListener: (cb: (b: boolean) => void) => () => void });
    if (!navVoice) return;
    return navVoice.addInterruptionListener((began) => {
      if (began || phaseRef.current !== "guiding" || !nav.current) return;
      speak(repeatInstruction(nav.current, HALF_MILE_M), false);
    });
  }, [speak]);

  // "Waiting for GPS" (DESIGN 2.6).
  useEffect(() => {
    if (phase !== "guiding") {
      setGps("ok");
      return;
    }
    let wasWaiting = false;
    const tick = () => {
      if (!appActive.current) return;
      const now = Date.now();
      const next = gpsStateFor({
        nowMs: now,
        lastUsableAtMs: lastUsableAt.current,
        startedAtMs: startedAt.current ?? now,
        lastSpeedMps: smoothedSpeed(speeds.current),
      });
      if (next === "waiting" && !wasWaiting) counts.current.gpsWaits++;
      wasWaiting = next === "waiting" || next === "still_waiting";
      setGps(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase]);

  /** Where the car is: a recent fix, a new one within 10 s, else one reading. */
  const locate = useCallback(async (): Promise<NavFix | null | "denied"> => {
    const recent = latestFix(ORIGIN_FIX_MAX_AGE_MS);
    if (recent) return recent;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") return "denied";
    } catch {
      return "denied";
    }
    const deadline = Date.now() + LOCATE_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      if (!mounted.current) return null;
      const f = latestFix(ORIGIN_FIX_MAX_AGE_MS);
      if (f) return f;
    }
    try {
      const p = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
      if (p) {
        return {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          speedMps: p.coords.speed ?? null,
          accuracyM: p.coords.accuracy ?? null,
          headingDeg: p.coords.heading != null && p.coords.heading >= 0 ? p.coords.heading : null,
          atMs: p.timestamp,
        };
      }
    } catch {
      // fall through
    }
    return null;
  }, []);

  const planTo = useCallback(
    async (dest: Destination, o: { autoStart?: boolean } = {}) => {
      autoStart.current = !!o.autoStart;
      setDestination(dest);
      setPreviewError(null);
      setAlreadyThere(false);
      setRoute(null);
      setPhase("preview");
      if (!inGreatBritain(dest)) {
        setPreviewError("OUTSIDE_GB");
        return;
      }
      setPhase("locating");
      const from = await locate();
      if (!mounted.current) return;
      if (from === "denied" || from == null) {
        setPreviewError(from === "denied" ? "NO_PERMISSION" : "NO_FIX");
        setPhase("preview");
        return;
      }
      if (distanceMeters(from, dest) < ALREADY_THERE_M) {
        setAlreadyThere(true);
        setPhase("preview");
        return;
      }
      setPhase("routing");
      trackDirections("directions.route_requested", {});
      const moving = (from.speedMps ?? 0) > 5 * 0.44704;
      try {
        const r = await fetchNavigationRoute({ from, to: dest, headingDeg: moving ? from.headingDeg : null });
        if (!mounted.current) return;
        setRoute(r);
        setPhase("preview");
        if (r.distanceMeters < ALREADY_THERE_M) setAlreadyThere(true);
      } catch (err) {
        if (!mounted.current) return;
        const e = toNavigationError(err, null);
        trackDirections("directions.route_failed", { code: e.kind });
        setPreviewError(e.kind);
        setPhase("preview");
      }
    },
    [locate]
  );

  const start = useCallback(() => {
    if (!route || !destination) return;
    const id = newSessionId();
    setSessionId(id);
    nav.current = startNavigation(route, { lat: destination.lat, lng: destination.lng }, { name: destination.name ?? null });
    rr.current = { inFlight: false, lastAt: null, failures: 0, lastFailure: null, saidFailure: false };
    counts.current = { reroutes: 0, rerouteFailures: 0, gpsWaits: 0, prompts: 0, bridge: 0, native: 0, task: 0 };
    startedAt.current = Date.now();
    drivenM.current = 0;
    pathPrev.current = null;
    setDriven(null);
    lastSavedStep.current = -1;
    setView(viewOf(nav.current));
    setReroute({ kind: "idle" });
    setStuck(false);
    setCrashed(false);
    setPhase("guiding");
    phaseRef.current = "guiding";
    voice.startGuidance();
    try {
      void keepAwake()?.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } catch {
      // best effort
    }
    if (destination.label) {
      void store.rememberDestination({ lat: destination.lat, lng: destination.lng, label: destination.label, atMs: Date.now() });
    }
    persist(nav.current, true);
    trackDirections("directions.started", {
      miles: route.distanceMeters / 1609.344,
      steps: route.steps.length,
      profile_car_nav: route.profile === "car_nav",
    });
    const recent = latestFix(5_000);
    if (recent) onFixRef.current(recent);
  }, [route, destination, persist, voice]);

  // A resumed session starts by itself once its fresh route is in.
  useEffect(() => {
    if (phase === "preview" && route && autoStart.current && !previewError) {
      autoStart.current = false;
      trackDirections("directions.resumed", {});
      start();
    }
  }, [phase, route, previewError, start]);

  const end = useCallback(() => {
    if (phaseRef.current === "guiding") finishCounts("directions.ended");
    voice.endGuidance();
    releaseAwake();
    void store.clearSession();
    nav.current = null;
    setView(null);
    setReroute({ kind: "idle" });
    setStuck(false);
    setPhase("pick");
    phaseRef.current = "pick";
  }, [voice, releaseAwake, finishCounts]);

  const back = useCallback(() => {
    setRoute(null);
    setPreviewError(null);
    setAlreadyThere(false);
    setPhase("pick");
  }, []);

  const toggleMute = useCallback(() => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMutedState(m);
    voice.setMuted(m);
    void store.setMutedPref(m);
    trackDirections("directions.mute_toggled", { muted: m });
    // Voice back on: the current instruction once, if a turn is close.
    if (!m && nav.current && phaseRef.current === "guiding") speak(repeatInstruction(nav.current, HALF_MILE_M), false);
  }, [voice, speak]);

  /** Banner tap: hear it again (muted means muted: nothing). */
  const repeat = useCallback(() => {
    if (!nav.current || mutedRef.current) return false;
    const text = repeatInstruction(nav.current);
    if (text) void voice.say({ text, urgent: true });
    return !!text;
  }, [voice]);

  const keepTrying = useCallback(() => {
    setStuck(false);
    rr.current.failures = 0;
    rr.current.lastAt = null;
  }, []);

  return {
    phase,
    destination,
    route,
    view,
    previewError,
    alreadyThere,
    muted,
    gps,
    reroute,
    stuck,
    lastFix,
    movingMps,
    arrivedAtMs,
    driven,
    sessionId,
    crashed,
    voiceAvailable: voice.available,
    planTo,
    start,
    end,
    back,
    toggleMute,
    repeat,
    keepTrying,
    clearError: () => setPreviewError(null),
  };
}

export { NavigationError };
