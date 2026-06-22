// Drive Detection Diagnostics Screen
// On-device dump of drive detection state, permissions, recent events, and
// tracking_state so we can diagnose "autotrips aren't picking up" reports
// without needing Xcode / DBeaver access to the device's SQLite file.

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
  Platform,
  Linking,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import {
  getRecentDetectionEvents,
  getDriveDetectionDiagnostics,
  clearDetectionEvents,
  restartDriveDetection,
  stopDriveDetection,
  type DriveDetectionDiagnostics,
} from "../lib/tracking/detection";
import { getBatterySnapshot, type BatterySnapshot } from "../lib/tracking/batteryAware";
import {
  isNativeLocationEngineEnabled,
  setNativeLocationEngineEnabled,
} from "../lib/tracking/nativeEngineFlag";
import {
  isNativeEngineAvailable,
  stopNativeLocationEngine,
} from "../lib/tracking/nativeLocation";
import { useUser } from "../lib/user/context";
import { colors, fonts } from "../lib/theme";

// ── Constants ──────────────────────────────────────────────────────────────

const BG = colors.bg;
const CARD_BG = colors.surface;
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const GREEN = colors.green;
const RED = colors.red;
const ORANGE = "#f97316";

const EVENT_COLORS: Record<string, string> = {
  detection_started: GREEN,
  detection_already_running: TEXT_3,
  detection_skipped: ORANGE,
  permission_lost: RED,
  recording_started: GREEN,
  recording_finalized: GREEN,
  force_start_skipped: ORANGE,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface DetectionEventRow {
  recorded_at: string;
  event: string;
  data: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelative(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return "in the future";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatMs(ms: number): string {
  if (ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  return `${minutes}m ${remainder}s`;
}

function permissionColor(status: string): string {
  if (status === "granted") return GREEN;
  if (status === "denied") return RED;
  return ORANGE;
}

function boolColor(val: boolean, goodIsTrue = true): string {
  const good = goodIsTrue ? val : !val;
  return good ? GREEN : RED;
}

// ── Health computation ────────────────────────────────────────────────────

type Severity = "healthy" | "info" | "warning" | "error";

interface Problem {
  severity: Severity;
  title: string;
  cause: string;
  action?: string;
  onAction?: () => void;
}

interface Health {
  verdict: Severity;
  headline: string;
  problems: Problem[];
}

/**
 * Walk the diagnostics state and surface every known failure mode as a
 * human-readable problem. Priority is expressed by list order: the first
 * problem determines the top-level verdict banner. Lower-severity items
 * (info) still render in the problems card so the user sees context.
 */
function computeHealth(
  d: DriveDetectionDiagnostics,
  events: DetectionEventRow[],
  nativeActive: boolean
): Health {
  const problems: Problem[] = [];

  // 1. Kill switches (highest severity - nothing can work)
  if (!d.enabled) {
    problems.push({
      severity: "error",
      title: "Drive Detection is OFF",
      cause: "You've turned off the Drive Detection toggle in Profile → Settings.",
      action: "Turn it back on to start detecting trips automatically.",
    });
  }

  // 2. Permission issues
  if (d.backgroundPermission !== "granted") {
    const isDenied = d.backgroundPermission === "denied";
    problems.push({
      severity: "error",
      title: isDenied ? "Background location is denied" : "Background location not granted",
      cause: isDenied
        ? "iOS Settings has location set to Never or While Using. MileClear can't detect trips when the app is in the background."
        : "Location permission hasn't been granted yet. iOS won't send background location updates.",
      action: "Open Settings → MileClear → Location → Always, then come back.",
      onAction: () => {
        Linking.openSettings().catch(() => {});
      },
    });
  } else if (d.foregroundPermission !== "granted") {
    problems.push({
      severity: "error",
      title: "Foreground location is denied",
      cause: "Basic location access is turned off.",
      action: "Open Settings → MileClear → Location and allow access.",
      onAction: () => {
        Linking.openSettings().catch(() => {});
      },
    });
  }

  // Native location engine active: it owns GPS directly, so the JS detection
  // task ("Task running") is idle BY DESIGN. Surface that as context and skip
  // the backstop fault below — otherwise the screen flags a false alarm and
  // "Restart detection" can never clear it, because the restart re-runs the
  // very handoff that (correctly) leaves the JS task stopped. (Anthony, 3 June.)
  if (nativeActive) {
    const lastFixMs = d.lastNativeLocationAt
      ? Date.now() - new Date(d.lastNativeLocationAt).getTime()
      : null;
    if (lastFixMs != null) {
      problems.push({
        severity: "info",
        title: "Running on ClearTrack",
        cause: `ClearTrack owns GPS directly, so 'Task running: false' is expected. It last reported a location ${formatMs(lastFixMs)} ago — it's alive and delivering fixes.`,
        action: "No action needed.",
      });
    } else {
      problems.push({
        severity: "warning",
        title: "ClearTrack on, but no location reported yet",
        cause:
          "ClearTrack is enabled and owns GPS, but it hasn't delivered a single location fix on this device yet. That's normal right after enabling it; if it persists through a drive, the engine may not actually be running.",
        action:
          "Take a short drive to confirm it captures. If no trip appears, toggle ClearTrack off (falls back to the JS engine) and tap Restart detection.",
      });
    }
    if (d.motionPermission === "denied") {
      problems.push({
        severity: "warning",
        title: "Motion & Fitness is off",
        cause:
          "ClearTrack uses iOS motion detection to catch the moment a drive starts. With Motion & Fitness denied, it falls back to the slower geofence path and is more likely to miss the start of short trips.",
        action: "Turn it on in Settings → MileClear → Motion & Fitness.",
        onAction: () => {
          Linking.openSettings().catch(() => {});
        },
      });
    }
  }

  // 3. Subscription isn't running. Post-28-May backstop refactor a parked
  //    device keeps a low-power subscription alive (auto-idled by iOS when
  //    stationary, hasStartedLocationUpdatesAsync still reports true), so
  //    !taskRunning is a genuine fault again — the backstop should be up. If
  //    the anchor geofence is armed it's still a backup wake signal, so soften
  //    to a warning; otherwise nothing is watching and it's an error.
  //    Skipped when the native engine owns location — taskRunning:false is the
  //    expected, healthy state there.
  if (d.enabled && d.backgroundPermission === "granted" && !d.taskRunning && !d.activeShiftId && !nativeActive) {
    if (d.hasAnchor && d.geofencingActive) {
      problems.push({
        severity: "warning",
        title: "Backstop subscription isn't running",
        cause:
          "The low-power monitoring subscription isn't registered with iOS. Your anchor geofence is still armed as a backup, but the backstop is meant to be running too.",
        action: "Tap Restart detection below.",
      });
    } else {
      problems.push({
        severity: "error",
        title: "Detection isn't running",
        cause:
          "No background location subscription is registered with iOS and the anchor geofence isn't armed — nothing will catch your next drive. iOS drops these after a reboot, an update, or if Precise Location is off.",
        action: "Tap Restart detection below. If it keeps happening, check Location is 'Always' + 'Precise Location' ON, then reboot the phone.",
        onAction: () => {
          Linking.openSettings().catch(() => {});
        },
      });
    }
  }

  // 4. Active shift (informational, not an error)
  if (d.activeShiftId) {
    problems.push({
      severity: "info",
      title: "A shift is currently active",
      cause: `Auto-detection is paused while a shift runs (shift ID ${d.activeShiftId.slice(0, 8)}…).`,
      action: "This is expected. End the shift to resume auto-detection.",
    });
  }

  // 5. Auto-recording stuck — active but latest event is old
  if (d.autoRecordingActive) {
    problems.push({
      severity: "warning",
      title: "Auto-recording is marked active",
      cause:
        "A trip recording is in progress. If you're not currently driving, this is a stuck state from a crash and the buffer will be discarded by the gap detector on next finalize.",
      action:
        "If you're not driving right now, tap Restart detection below to clear the state.",
    });
  }

  // 6. Repeated permission_lost events in recent history
  const recentPermLost = events.slice(0, 10).filter((e) => e.event === "permission_lost").length;
  if (recentPermLost >= 3) {
    problems.push({
      severity: "warning",
      title: `Location permission dropped ${recentPermLost}x recently`,
      cause:
        "The detection task keeps seeing the background permission as lost. iOS may have downgraded the permission silently, or the device was set to Low Power Mode.",
      action: "Verify Settings → MileClear → Location is set to Always, and disable Low Power Mode.",
      onAction: () => {
        Linking.openSettings().catch(() => {});
      },
    });
  }

  // 7. Recent gap trimming — this flags the build-39 purge bug resurfacing
  const gapTrimmed = events.slice(0, 20).find((e) => e.event === "finalize_gap_trimmed");
  if (gapTrimmed) {
    problems.push({
      severity: "warning",
      title: "A trip was gap-trimmed",
      cause:
        "The finalize pass detected a large time gap in the buffer and kept only the most recent segment. This usually means a crash happened during a previous recording and stale coordinates were left behind.",
      action: "If a recent trip looks short or is missing its start, this is why.",
    });
  }

  // 7b. Phantom anchor exits — recording_started from anchor_exit followed
  // by finalize_no_coords (or finalize_too_short). Two distinct patterns:
  //
  // - IMMEDIATE RE-EXIT: recording_started(anchor_exit) within 5 seconds of
  //   a previous finalize_saved. iOS evaluated the newly-registered anchor
  //   region and immediately determined the user is outside it, firing an
  //   exit event instantly. Root cause: the anchor was set at a stale
  //   trimmed last coord instead of the user's current position. Fixed in
  //   build 42 by switching to current-position anchoring.
  //
  // - INDOOR-DRIFT PHANTOM: recording_started(anchor_exit) fires some time
  //   after a stable anchor, with no preceding finalize_saved. Indoor GPS
  //   drift crossed the 200m radius and iOS fired a real (but false) exit.
  //   Both variants end in finalize_no_coords because no real movement
  //   happens during the phantom window.
  const phantomExits: Array<{ at: string; immediate: boolean; durationMs: number | null }> = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.event !== "recording_started") continue;
    if (!e.data || !e.data.includes("anchor_exit")) continue;

    // Check if this is an immediate re-exit: was the PREVIOUS event a
    // finalize_saved within 5 seconds? (events are newest-first, so
    // i+1 is the older neighbour)
    let immediate = false;
    for (let k = i + 1; k < Math.min(events.length, i + 5); k++) {
      const prev = events[k];
      if (prev.event === "finalize_saved") {
        const gap =
          new Date(e.recorded_at).getTime() - new Date(prev.recorded_at).getTime();
        if (gap >= 0 && gap < 5000) immediate = true;
        break;
      }
      if (prev.event === "recording_started") break;
    }

    // Walk newer events to find the terminating finalize
    let durationMs: number | null = null;
    for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
      const f = events[j];
      if (f.event === "finalize_no_coords" || f.event === "finalize_too_short") {
        durationMs =
          new Date(f.recorded_at).getTime() - new Date(e.recorded_at).getTime();
        phantomExits.push({ at: e.recorded_at, immediate, durationMs });
        break;
      }
      if (f.event === "finalize_saved") break;
    }
  }

  const immediatePhantoms = phantomExits.filter((p) => p.immediate);
  const indoorPhantoms = phantomExits.filter((p) => !p.immediate);

  if (immediatePhantoms.length > 0) {
    const totalLostMs = immediatePhantoms.reduce(
      (sum, p) => sum + (p.durationMs ?? 0),
      0
    );
    problems.push({
      severity: "warning",
      title: `${immediatePhantoms.length} immediate phantom re-exit${immediatePhantoms.length === 1 ? "" : "s"}`,
      cause:
        `After a trip saved, iOS fired another exit event within milliseconds because the departure anchor was registered at a stale coordinate. MileClear started a phantom recording that burned ${formatMs(totalLostMs)} with no real movement. Fixed in build 42 by anchoring at the user's current position instead of the trimmed trip end.`,
      action:
        "If you're on build 42+ and still seeing this, tap Restart detection to force a fresh anchor registration.",
    });
  }

  if (indoorPhantoms.length > 0) {
    const totalLostMs = indoorPhantoms.reduce((sum, p) => sum + (p.durationMs ?? 0), 0);
    problems.push({
      severity: "warning",
      title: `${indoorPhantoms.length} indoor-drift phantom exit${indoorPhantoms.length === 1 ? "" : "s"}`,
      cause:
        `iOS fired a geofence exit while you weren't actually moving — indoor GPS drift crossed the 200m anchor radius. MileClear started a phantom recording that burned ${formatMs(totalLostMs)} with no real movement. If this is recent, a legitimate trip may have been missed because the anchor was consumed.`,
      action:
        "Build 42+ re-arms the anchor after phantom exits, so the next real departure will still fire.",
    });
  }

  // 7c. Anchor re-arm events — confirms the build-42 fix is firing
  const anchorRearmed = events.slice(0, 30).find((e) => e.event === "anchor_rearmed_after_phantom");
  if (anchorRearmed) {
    problems.push({
      severity: "info",
      title: "Anchor re-armed after phantom exit",
      cause:
        "A false geofence exit was cleaned up and the departure anchor has been re-registered at the current location. This prevents the next real trip from being missed.",
    });
  }

  // 7e. Live Activity failures — if startLiveActivity failed from force_start,
  // the user would have had no Lock Screen or Dynamic Island feedback at all.
  const laFailures = events.slice(0, 20).filter((e) => e.event === "live_activity_failed");
  if (laFailures.length > 0) {
    const lastError = laFailures[0].data
      ? (() => { try { return JSON.parse(laFailures[0].data).error; } catch { return laFailures[0].data; } })()
      : "unknown";
    problems.push({
      severity: "warning",
      title: `Live Activity failed to start (${laFailures.length}x)`,
      cause:
        `The Live Activity could not start from the background geofence handler: "${lastError}". This means no lock screen banner or Dynamic Island pill appeared during the trip.`,
      action:
        "Check Settings → MileClear → Live Activities is enabled. If it is, this may be an iOS throttling issue in the background.",
      onAction: () => {
        Linking.openSettings().catch(() => {});
      },
    });
  }

  // 7f. Stale finalize delay — if a trip took a long time to appear because
  // the app had to be foregrounded before finalize ran. Show how long the
  // user waited.
  const staleFinalize = events.slice(0, 10).find((e) => e.event === "stale_finalize_triggered");
  if (staleFinalize?.data) {
    try {
      const { elapsedMs } = JSON.parse(staleFinalize.data);
      if (typeof elapsedMs === "number" && elapsedMs > 15 * 60 * 1000) {
        problems.push({
          severity: "warning",
          title: `Trip delayed ${formatMs(elapsedMs)} before saving`,
          cause:
            "After you parked, iOS stopped delivering location callbacks and the stop-detection timer couldn't run. The trip only saved when you opened the app.",
          action:
            "This is an iOS limitation when the phone goes indoors. Build 44+ adds a backup timer to catch this sooner.",
        });
      }
    } catch {}
  }

  // 7g. Trip split on resume - confirms the multi-stop fix is working
  const splitEvents = events.slice(0, 20).filter((e) => e.event === "split_trip_on_resume");
  if (splitEvents.length > 0) {
    problems.push({
      severity: "info",
      title: `${splitEvents.length} trip${splitEvents.length === 1 ? "" : "s"} auto-split on resume`,
      cause:
        "You stopped for more than 10 minutes then started driving again. MileClear saved the first trip and started recording a fresh one, so both legs appear separately in your trip list.",
    });
  }

  // 8. Cooldown active (info)
  if (d.cooldownRemainingMs > 0) {
    problems.push({
      severity: "info",
      title: `Notification cooldown: ${formatMs(d.cooldownRemainingMs)} remaining`,
      cause:
        "Trips still record silently, but the 'Looks like you're driving' prompt won't fire again until the cooldown expires. Prevents notification spam between short trips.",
    });
  }

  // 9. Quiet hours (info)
  if (d.quietHours) {
    problems.push({
      severity: "info",
      title: "Quiet hours active (22:00–07:00)",
      cause:
        "Trips still record, but driving-detected notifications are suppressed so the phone doesn't buzz at night.",
    });
  }

  // 10. Buffered coords with nothing recording (possibly orphaned)
  if (!d.autoRecordingActive && !d.activeShiftId && d.bufferedCoordinates > 5) {
    problems.push({
      severity: "warning",
      title: `${d.bufferedCoordinates} orphaned GPS points in the buffer`,
      cause:
        "Detection coordinates are present but no recording is active. These should have been cleared on finalize or at task restart.",
      action: "Tap Restart detection below to flush them.",
    });
  }

  // Determine verdict from highest-severity problem
  const severityOrder: Record<Severity, number> = { healthy: 0, info: 1, warning: 2, error: 3 };
  let worst: Severity = "healthy";
  for (const p of problems) {
    if (severityOrder[p.severity] > severityOrder[worst]) worst = p.severity;
  }

  let headline: string;
  if (worst === "healthy") {
    headline = "Drive detection is healthy";
  } else if (worst === "info") {
    headline = "Drive detection is working";
  } else if (worst === "warning") {
    headline = "Drive detection has warnings";
  } else {
    // Use the first error's title as the headline
    const firstError = problems.find((p) => p.severity === "error");
    headline = firstError?.title ?? "Drive detection is broken";
  }

  return { verdict: worst, headline, problems };
}

function severityColor(s: Severity): string {
  if (s === "healthy") return GREEN;
  if (s === "info") return "#3b82f6";
  if (s === "warning") return ORANGE;
  return RED;
}

function severityIcon(s: Severity): keyof typeof Ionicons.glyphMap {
  if (s === "healthy") return "checkmark-circle";
  if (s === "info") return "information-circle";
  if (s === "warning") return "warning";
  return "alert-circle";
}

// ── Screen ─────────────────────────────────────────────────────────────────

// App / device identifiers for the header strip. Read once at module level
// since Constants.expoConfig and nativeBuildVersion don't change at runtime.
const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
const BUILD_NUMBER =
  Constants.expoConfig?.ios?.buildNumber ??
  (Constants as unknown as { nativeBuildVersion?: string }).nativeBuildVersion ??
  "?";

interface SavedLocationLookup {
  [id: string]: string; // id -> display name
}

interface RecentTripRow {
  id: string;
  start_address: string | null;
  end_address: string | null;
  distance_miles: number;
  started_at: string;
  ended_at: string | null;
  classification: string | null;
}

export default function DriveDetectionDiagnosticsScreen() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DriveDetectionDiagnostics | null>(null);
  const [events, setEvents] = useState<DetectionEventRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [capturedAt, setCapturedAt] = useState<Date>(() => new Date());
  const [locationLookup, setLocationLookup] = useState<SavedLocationLookup>({});
  const [recentTrips, setRecentTrips] = useState<RecentTripRow[]>([]);
  const [tripFilter, setTripFilter] = useState<RecentTripRow | null>(null);
  // Native location engine (staged rollout). `available` = the native binary
  // is bundled (a dev/production build); false in Expo Go / OTA-only builds.
  const [nativeOn, setNativeOn] = useState(false);
  const [battery, setBattery] = useState<BatterySnapshot | null>(null);
  const nativeAvailable = useMemo(() => isNativeEngineAvailable(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { getDatabase } = await import("../lib/db");
      const db = await getDatabase();
      const [diag, ev, locs, trips, nativeFlag] = await Promise.all([
        getDriveDetectionDiagnostics(),
        getRecentDetectionEvents(50),
        db.getAllAsync<{ id: string; name: string }>(
          "SELECT id, name FROM saved_locations"
        ).catch(() => [] as Array<{ id: string; name: string }>),
        db.getAllAsync<RecentTripRow>(
          "SELECT id, start_address, end_address, distance_miles, started_at, ended_at, classification FROM trips ORDER BY started_at DESC LIMIT 10"
        ).catch(() => [] as RecentTripRow[]),
        isNativeLocationEngineEnabled().catch(() => false),
      ]);
      getBatterySnapshot().then(setBattery).catch(() => {});
      setDiagnostics(diag);
      setEvents(ev);
      const lookup: SavedLocationLookup = {};
      for (const l of locs) lookup[l.id] = l.name;
      setLocationLookup(lookup);
      setRecentTrips(trips);
      setNativeOn(nativeFlag);
      setCapturedAt(new Date());
    } catch (err) {
      console.error("Failed to load diagnostics", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Flip the native engine for THIS device. On→ stop the JS task + start the
  // native engine (via startDriveDetection's flag check). Off→ stop native +
  // restart the JS engine. Restarting picks the right engine either way.
  const handleToggleNative = useCallback(async (next: boolean) => {
    setBusy(true);
    try {
      await setNativeLocationEngineEnabled(next);
      setNativeOn(next);
      if (!next) {
        await stopNativeLocationEngine();
      } else {
        await stopDriveDetection().catch(() => {});
      }
      await restartDriveDetection();
      await load();
      Alert.alert(
        next ? "ClearTrack ON" : "ClearTrack OFF",
        next
          ? nativeAvailable
            ? "Detection now runs on ClearTrack. Drive and check the events for native_engine_started."
            : "Flag set, but this build doesn't include the native module yet - detection stays on the JS engine until you install a dev build."
          : "Back on the JavaScript detection engine."
      );
    } catch (err) {
      Alert.alert("Couldn't switch engine", (err as Error).message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  }, [load, nativeAvailable]);

  // Compute the 24h activity summary from the events list. Cheap —
  // events is already loaded.
  const activitySummary = useMemo(() => {
    const counts: Record<string, number> = {};
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const ev of events) {
      if (new Date(ev.recorded_at).getTime() < cutoff) continue;
      counts[ev.event] = (counts[ev.event] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  // Filter the events list to the time window of the selected trip,
  // if any. Lets the operator focus on what happened DURING a trip
  // without scrolling through unrelated noise.
  const visibleEvents = useMemo(() => {
    if (!tripFilter) return events;
    const start = new Date(tripFilter.started_at).getTime() - 60_000; // 1 min before
    const end = tripFilter.ended_at
      ? new Date(tripFilter.ended_at).getTime() + 60_000 // 1 min after
      : Date.now();
    return events.filter((ev) => {
      const t = new Date(ev.recorded_at).getTime();
      return t >= start && t <= end;
    });
  }, [events, tripFilter]);

  const health = useMemo(
    () => (diagnostics ? computeHealth(diagnostics, events, nativeOn && nativeAvailable) : null),
    [diagnostics, events, nativeOn, nativeAvailable]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleShare = useCallback(async () => {
    if (!diagnostics || !health) return;
    const lines: string[] = [];
    lines.push("MileClear Drive Detection Diagnostics");
    lines.push(`App: v${APP_VERSION} (build ${BUILD_NUMBER})`);
    lines.push(`User: ${user?.email ?? "(not signed in)"}`);
    lines.push(`User ID: ${user?.id ?? "-"}`);
    lines.push(`Captured: ${capturedAt.toISOString()}`);
    lines.push(`Platform: ${Platform.OS} ${Platform.Version}`);
    lines.push("");
    lines.push(`── Verdict: ${health.verdict.toUpperCase()} ──`);
    lines.push(health.headline);
    if (health.problems.length > 0) {
      lines.push("");
      lines.push("── Problems ──");
      for (const p of health.problems) {
        lines.push(`[${p.severity.toUpperCase()}] ${p.title}`);
        lines.push(`  Cause: ${p.cause}`);
        if (p.action) lines.push(`  Action: ${p.action}`);
      }
    }
    lines.push("");
    lines.push("── Status ──");
    lines.push(`Enabled: ${diagnostics.enabled}`);
    lines.push(`Task running: ${diagnostics.taskRunning}`);
    lines.push(`Detection mode: ${diagnostics.detectionProfile ?? "—"}`);
    lines.push(`Anchor set: ${diagnostics.hasAnchor}`);
    lines.push(`Geofence armed: ${diagnostics.geofencingActive}`);
    lines.push(`Last fix accuracy: ${diagnostics.lastFixAccuracyMeters == null ? "unknown" : diagnostics.lastFixAccuracyMeters + "m"}`);
    lines.push(`Foreground permission: ${diagnostics.foregroundPermission}`);
    lines.push(`Background permission: ${diagnostics.backgroundPermission}`);
    lines.push(`Active shift: ${diagnostics.activeShiftId ?? "none"}`);
    lines.push(`Auto-recording: ${diagnostics.autoRecordingActive}`);
    lines.push(`Quiet hours: ${diagnostics.quietHours}`);
    lines.push(`Speed threshold: ${diagnostics.speedThresholdMph} mph`);
    lines.push(`Buffered coords: ${diagnostics.bufferedCoordinates}`);
    lines.push(
      `Last notification: ${diagnostics.lastNotificationAt ?? "never"} (cooldown remaining ${formatMs(diagnostics.cooldownRemainingMs)})`
    );
    lines.push("");
    lines.push("── tracking_state ──");
    if (diagnostics.trackingState.length === 0) {
      lines.push("(empty)");
    } else {
      for (const row of diagnostics.trackingState) {
        lines.push(`${row.key} = ${row.value}`);
      }
    }
    lines.push("");
    lines.push(`── detection_events (last ${events.length}) ──`);
    for (const ev of events) {
      lines.push(`${ev.recorded_at}  ${ev.event}${ev.data ? `  ${ev.data}` : ""}`);
    }
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {}
  }, [diagnostics, events, health, user, capturedAt]);

  const handleClearEvents = useCallback(() => {
    Alert.alert(
      "Clear events?",
      "This deletes the detection_events log. Do this right before reproducing a problem so only the repro is captured.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await clearDetectionEvents();
              await load();
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [load]);

  const handleRestart = useCallback(async () => {
    setBusy(true);
    try {
      await restartDriveDetection();
      await load();
      Alert.alert("Restarted", "Drive detection task restarted.");
    } catch (err) {
      Alert.alert("Couldn't restart detection", (err as Error).message ?? "Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [load]);

  const handleSimulate = useCallback(
    (miles: number) => {
      Alert.alert(
        `Simulate a ${miles} mi trip?`,
        "Injects a synthetic GPS route and runs the real finalize pipeline (distance, road-match, phantom guards, save, display). It does NOT test start detection - just everything after the engine has the coordinates. A test trip will appear in your list.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Simulate",
            onPress: async () => {
              setBusy(true);
              try {
                const { simulateTrip } = await import("../lib/tracking/simulateTrip");
                const res = await simulateTrip(miles);
                await load();
                Alert.alert(res.ok ? "Trip simulated" : "No trip saved", res.message);
              } catch (err) {
                Alert.alert("Simulation failed", (err as Error).message ?? "Try again.");
              } finally {
                setBusy(false);
              }
            },
          },
        ]
      );
    },
    [load]
  );

  if (loading && !diagnostics) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={AMBER} />
      </View>
    );
  }

  if (!diagnostics) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Failed to load diagnostics</Text>
        <TouchableOpacity style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const d = diagnostics;
  const h = health!;
  const verdictColor = severityColor(h.verdict);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Header strip — app version, user, capture time, OS. Always visible
          at the top of a screenshot so we can identify the reporter at a glance. */}
      <View style={styles.headerStrip}>
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>App</Text>
          <Text style={styles.headerValue}>v{APP_VERSION} (build {BUILD_NUMBER})</Text>
        </View>
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>User</Text>
          <Text style={styles.headerValue} numberOfLines={1}>
            {user?.email ?? "(not signed in)"}
          </Text>
        </View>
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>Device</Text>
          <Text style={styles.headerValue}>{Platform.OS} {Platform.Version}</Text>
        </View>
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>Captured</Text>
          <Text style={styles.headerValue}>{capturedAt.toLocaleString()}</Text>
        </View>
      </View>

      {/* Verdict banner — the headline answer at a glance */}
      <View
        style={[
          styles.verdictBanner,
          { backgroundColor: verdictColor + "22", borderColor: verdictColor },
        ]}
      >
        <Ionicons name={severityIcon(h.verdict)} size={28} color={verdictColor} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.verdictLabel, { color: verdictColor }]}>
            {h.verdict.toUpperCase()}
          </Text>
          <Text style={styles.verdictHeadline}>{h.headline}</Text>
        </View>
      </View>

      {/* Problems card — specific issues with cause + action */}
      {h.problems.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Detected {h.problems.length === 1 ? "issue" : `${h.problems.length} issues`}
          </Text>
          {h.problems.map((p, i) => {
            const color = severityColor(p.severity);
            return (
              <View
                key={`${p.title}-${i}`}
                style={[
                  styles.problemRow,
                  i < h.problems.length - 1 && styles.problemRowBorder,
                ]}
              >
                <View style={styles.problemHeader}>
                  <Ionicons name={severityIcon(p.severity)} size={18} color={color} />
                  <Text style={[styles.problemTitle, { color }]}>{p.title}</Text>
                </View>
                <Text style={styles.problemCause}>{p.cause}</Text>
                {p.action && (
                  p.onAction ? (
                    <TouchableOpacity
                      onPress={p.onAction}
                      accessibilityRole="button"
                      style={styles.problemActionButton}
                    >
                      <Text style={styles.problemActionText}>{p.action}</Text>
                      <Ionicons name="chevron-forward" size={14} color={AMBER} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.problemAction}>→ {p.action}</Text>
                  )
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Status card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <StatusRow label="Enabled" value={String(d.enabled)} color={boolColor(d.enabled)} />
        <StatusRow
          label="Task running"
          value={
            d.taskRunning
              ? "true"
              : nativeOn && nativeAvailable
                ? "false (ClearTrack owns location)"
                : "false"
          }
          color={d.taskRunning || (nativeOn && nativeAvailable) ? GREEN : RED}
          hint={
            !d.taskRunning && !(nativeOn && nativeAvailable)
              ? "Backstop subscription isn't running — tap Restart detection"
              : undefined
          }
        />
        {nativeOn && (
          <StatusRow
            label="ClearTrack"
            value={nativeAvailable ? "on" : "on (binary missing → JS)"}
            color={nativeAvailable ? GREEN : AMBER}
          />
        )}
        {nativeOn && nativeAvailable && (
          <StatusRow
            label="Last ClearTrack fix"
            value={
              d.lastNativeLocationAt
                ? `${formatMs(Date.now() - new Date(d.lastNativeLocationAt).getTime())} ago`
                : "never"
            }
            color={d.lastNativeLocationAt ? GREEN : AMBER}
            hint={
              !d.lastNativeLocationAt
                ? "ClearTrack hasn't reported a location yet — drive to confirm it's capturing"
                : undefined
            }
          />
        )}
        {nativeOn && (
          <StatusRow
            label={"Motion & Fitness"}
            value={d.motionPermission}
            color={d.motionPermission === "granted" ? GREEN : d.motionPermission === "denied" ? RED : AMBER}
            hint={
              d.motionPermission === "granted"
                ? undefined
                : d.motionPermission === "denied"
                  ? "Turn ON in Settings → MileClear → Motion & Fitness. Without it, the engine misses the start of short trips."
                  : d.motionPermission === "unavailable"
                    ? "This build can't read it yet — comes in the next build."
                    : "Not granted yet — enable in Settings → MileClear → Motion & Fitness."
            }
          />
        )}
        {nativeOn && nativeAvailable && (() => {
          const motion = events.find((e) => e.event === "native_motionchange");
          return (
            <StatusRow
              label="Motion detection"
              value={motion ? `fired ${formatMs(Date.now() - new Date(motion.recorded_at).getTime())} ago` : "no events seen"}
              color={motion ? GREEN : AMBER}
              hint={motion ? undefined : "RNBG hasn't reported a motion change yet — drive to confirm."}
            />
          );
        })()}
        <StatusRow
          label="Detection mode"
          value={d.detectionProfile ?? "—"}
          color={d.detectionProfile ? GREEN : TEXT_2}
          hint={
            d.detectionProfile === "backstop"
              ? "Parked — low-power backstop (idles dark, wakes on driving)"
              : d.detectionProfile === "standard"
              ? "Away from anchor — continuous monitoring"
              : undefined
          }
        />
        <StatusRow
          label="Anchor set"
          value={String(d.hasAnchor)}
          color={d.hasAnchor ? GREEN : TEXT_2}
        />
        <StatusRow
          label="Geofence armed"
          value={String(d.geofencingActive)}
          color={d.geofencingActive ? GREEN : d.hasAnchor ? ORANGE : TEXT_2}
          hint={d.hasAnchor && !d.geofencingActive ? "Anchor geofence not monitoring — the backstop subscription is the active wake signal" : undefined}
        />
        <StatusRow
          label="Last fix accuracy"
          value={d.lastFixAccuracyMeters == null ? "unknown" : `${d.lastFixAccuracyMeters} m`}
          color={d.lastFixAccuracyMeters != null && d.lastFixAccuracyMeters > 65 ? ORANGE : TEXT_2}
          hint={d.lastFixAccuracyMeters != null && d.lastFixAccuracyMeters > 65 ? "Coarse — Precise Location may be OFF" : undefined}
        />
        <StatusRow
          label="Foreground perm"
          value={d.foregroundPermission}
          color={permissionColor(d.foregroundPermission)}
        />
        <StatusRow
          label="Background perm"
          value={d.backgroundPermission}
          color={permissionColor(d.backgroundPermission)}
        />
        <StatusRow
          label="Active shift"
          value={d.activeShiftId ? d.activeShiftId.slice(0, 8) + "…" : "none"}
          color={d.activeShiftId ? ORANGE : GREEN}
          hint={d.activeShiftId ? "Detection is paused during shifts" : undefined}
        />
        <StatusRow
          label="Auto-recording"
          value={String(d.autoRecordingActive)}
          color={d.autoRecordingActive ? ORANGE : GREEN}
          hint={d.autoRecordingActive ? "Already recording a trip" : undefined}
        />
        <StatusRow
          label="Quiet hours"
          value={String(d.quietHours)}
          color={d.quietHours ? ORANGE : GREEN}
          hint={d.quietHours ? "22:00–07:00: trips record, notifications suppressed" : undefined}
        />
        <StatusRow label="Speed threshold" value={`${d.speedThresholdMph} mph`} color={TEXT_2} />
        <StatusRow label="Buffered coords" value={String(d.bufferedCoordinates)} color={TEXT_2} />
        <StatusRow
          label="Last notification"
          value={d.lastNotificationAt ? formatRelative(d.lastNotificationAt) : "never"}
          color={TEXT_2}
          hint={
            d.cooldownRemainingMs > 0
              ? `Cooldown: ${formatMs(d.cooldownRemainingMs)} remaining`
              : undefined
          }
        />
      </View>

      {/* Battery & Power — surface the adaptive low-power behaviour so the user
          can see MileClear isn't hammering GPS. Live battery % + battery-aware
          throttling arrive with expo-battery in the next native build. */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Battery &amp; Power</Text>
        <Text style={styles.batteryBody}>
          MileClear is built for low battery use. It doesn&apos;t poll GPS constantly —
          while you&apos;re parked it idles in a low-power backstop and only wakes when you
          start driving. High-accuracy tracking runs only while a trip is actually
          recording, then releases.
        </Text>
        {battery && battery.level != null && (
          <StatusRow
            label="Battery"
            value={`${Math.round(battery.level * 100)}%${
              battery.charging ? " · charging" : ""
            }${battery.lowPowerMode ? " · Low Power Mode" : ""}`}
            color={battery.lowPowerMode ? AMBER : TEXT_2}
            hint={
              battery.lowPowerMode
                ? "iOS Low Power Mode is on — it can throttle background location."
                : undefined
            }
          />
        )}
        <Text style={styles.batteryNow}>
          {d.detectionProfile === "backstop"
            ? "Right now: parked — low-power mode, minimal battery."
            : d.detectionProfile === "standard"
              ? "Right now: watching for the start of a drive."
              : "Right now: idle until you next drive."}
        </Text>
        <Text style={styles.batteryTip}>
          Tip: keep iOS Low Power Mode off while driving — it can throttle background
          location and delay trip capture.
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={load}
          disabled={busy}
        >
          <Ionicons name="refresh" size={16} color={BG} />
          <Text style={styles.buttonText}>Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={handleShare}
          disabled={busy}
        >
          <Ionicons name="share-outline" size={16} color={BG} />
          <Text style={styles.buttonText}>Share</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
          onPress={handleRestart}
          disabled={busy}
        >
          <Ionicons name="reload" size={16} color={TEXT_1} />
          <Text style={styles.buttonSecondaryText}>Restart detection</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.buttonDanger, busy && styles.buttonDisabled]}
          onPress={handleClearEvents}
          disabled={busy}
        >
          <Ionicons name="trash-outline" size={16} color={TEXT_1} />
          <Text style={styles.buttonDangerText}>Clear events</Text>
        </TouchableOpacity>
      </View>

      {/* ClearTrack engine toggle */}
      <View style={styles.card}>
        <View style={styles.nativeRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cardTitle}>ClearTrack engine</Text>
            <Text style={styles.nativeSub}>
              {nativeAvailable
                ? "MileClear's ClearTrack engine - wake + capture run natively, surviving the app being backgrounded or killed. Reuses the same finalize/sync pipeline."
                : "Not in this build yet. Install a dev build with the ClearTrack module, then flip this on to test."}
            </Text>
            <Text style={[styles.nativeStatus, { color: nativeAvailable ? GREEN : TEXT_3 }]}>
              {nativeAvailable ? "● ClearTrack available" : "○ ClearTrack not bundled"}
            </Text>
          </View>
          <Switch
            value={nativeOn}
            onValueChange={handleToggleNative}
            disabled={busy}
            trackColor={{ true: AMBER, false: "#3f3f46" }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Simulate a trip (admin only) - test the capture->save pipeline without driving */}
      {user?.isAdmin ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Simulate a trip</Text>
          <Text style={styles.nativeSub}>
            Inject a synthetic route and run the real finalize pipeline - distance, road-match,
            phantom guards, save, display. Tests everything after the engine has the coordinates
            (not wake/start detection). A test trip appears in your list; delete it after.
          </Text>
          <View style={[styles.actionsRow, { marginTop: 12 }]}>
            <TouchableOpacity
              style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
              onPress={() => handleSimulate(0.8)}
              disabled={busy}
            >
              <Ionicons name="car-outline" size={16} color={TEXT_1} />
              <Text style={styles.buttonSecondaryText}>Short (0.8 mi)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
              onPress={() => handleSimulate(5)}
              disabled={busy}
            >
              <Ionicons name="car-sport-outline" size={16} color={TEXT_1} />
              <Text style={styles.buttonSecondaryText}>Longer (5 mi)</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* tracking_state dump */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>tracking_state ({d.trackingState.length})</Text>
        {d.trackingState.length === 0 ? (
          <Text style={styles.emptyText}>empty</Text>
        ) : (
          d.trackingState.map((row) => (
            <View key={row.key} style={styles.kvRow}>
              <Text style={styles.kvKey} numberOfLines={1}>{row.key}</Text>
              <Text style={styles.kvValue} numberOfLines={2}>{row.value}</Text>
            </View>
          ))
        )}
      </View>

      {/* Activity summary — 24h event-type counts. One-line glance at
          the shape of activity before scrolling the raw firehose. */}
      {Object.keys(activitySummary).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Activity (last 24h)</Text>
          {Object.entries(activitySummary)
            .sort(([, a], [, b]) => b - a)
            .map(([event, count]) => (
              <View key={event} style={styles.kvRow}>
                <View
                  style={[
                    styles.eventDot,
                    { backgroundColor: EVENT_COLORS[event] ?? TEXT_2, marginRight: 8 },
                  ]}
                />
                <Text style={styles.kvKey} numberOfLines={1}>{event}</Text>
                <Text style={[styles.kvValue, { textAlign: "right", minWidth: 32 }]}>{count}</Text>
              </View>
            ))}
        </View>
      )}

      {/* Recent trips with tap-to-filter. Selecting a trip filters the
          events list below to that trip's time window (±60s) so you can
          see exactly what fired during a specific recording without
          mental filtering of the 50-event firehose. */}
      {recentTrips.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent trips (tap to filter events)</Text>
          {tripFilter && (
            <TouchableOpacity
              onPress={() => setTripFilter(null)}
              style={[styles.kvRow, { paddingVertical: 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Clear trip filter"
            >
              <Text style={[styles.kvKey, { color: AMBER }]}>← Show all events</Text>
            </TouchableOpacity>
          )}
          {recentTrips.map((t) => {
            const selected = tripFilter?.id === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTripFilter(selected ? null : t)}
                style={[
                  styles.kvRow,
                  { paddingVertical: 10, opacity: tripFilter && !selected ? 0.5 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${selected ? "Deselect" : "Filter events to"} trip from ${t.start_address ?? "unknown"} to ${t.end_address ?? "unknown"}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.kvKey, { color: selected ? AMBER : TEXT_1 }]} numberOfLines={1}>
                    {t.start_address ?? "?"} → {t.end_address ?? "?"}
                  </Text>
                  <Text style={[styles.kvValue, { fontSize: 11 }]}>
                    {t.distance_miles.toFixed(1)} mi · {formatRelative(t.started_at)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* detection_events list */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          detection_events ({visibleEvents.length}{tripFilter ? ` of ${events.length}, filtered` : ""})
        </Text>
        {visibleEvents.length === 0 ? (
          <Text style={styles.emptyText}>
            {tripFilter ? "No events in this trip's time window." : "No events logged yet. Drive detection hasn't fired."}
          </Text>
        ) : (
          visibleEvents.map((ev, i) => {
            const color = EVENT_COLORS[ev.event] ?? TEXT_2;
            // Resolve saved-location UUIDs in event payloads to names.
            // Makes events like geofence_tentative_arrival readable
            // without a server lookup.
            let dataDisplay = ev.data;
            if (ev.data) {
              try {
                const parsed = JSON.parse(ev.data) as Record<string, unknown>;
                const locId = parsed.locationId as string | undefined;
                if (locId && locationLookup[locId]) {
                  dataDisplay = ev.data.replace(
                    locId,
                    `${locId} (${locationLookup[locId]})`
                  );
                }
              } catch {
                // Not JSON or malformed — leave dataDisplay as-is.
              }
            }
            return (
              <View key={`${ev.recorded_at}-${i}`} style={styles.eventRow}>
                <View style={[styles.eventDot, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventName}>{ev.event}</Text>
                  <Text style={styles.eventTime}>{formatRelative(ev.recorded_at)}</Text>
                  {dataDisplay && <Text style={styles.eventData}>{dataDisplay}</Text>}
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

// ── Row component ──────────────────────────────────────────────────────────

function StatusRow({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={[styles.statusValue, { color }]}>{value}</Text>
        {hint && <Text style={styles.statusHint}>{hint}</Text>}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerStrip: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    gap: 10,
  },
  headerLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: TEXT_3,
    width: 64,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerValue: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: TEXT_1,
  },
  verdictBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  verdictLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 2,
  },
  verdictHeadline: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: TEXT_1,
    lineHeight: 19,
  },
  problemRow: {
    paddingVertical: 12,
  },
  problemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  problemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  problemTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  problemCause: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: TEXT_2,
    lineHeight: 17,
    marginLeft: 26,
  },
  problemAction: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: TEXT_1,
    lineHeight: 17,
    marginLeft: 26,
    marginTop: 6,
  },
  problemActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 26,
    marginTop: 8,
    paddingVertical: 6,
  },
  problemActionText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: AMBER,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: AMBER,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  batteryBody: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: TEXT_2,
    lineHeight: 19,
  },
  batteryNow: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: GREEN,
    marginTop: 10,
  },
  batteryTip: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: TEXT_2,
    marginTop: 8,
    lineHeight: 18,
  },
  nativeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  nativeSub: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: TEXT_2,
    lineHeight: 17,
    marginTop: -4,
  },
  nativeStatus: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    marginTop: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
    gap: 12,
  },
  statusLabel: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: TEXT_2,
    width: 130,
  },
  statusValue: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    textAlign: "right",
  },
  statusHint: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: TEXT_3,
    textAlign: "right",
    marginTop: 2,
  },
  kvRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  kvKey: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: TEXT_1,
    width: 140,
  },
  kvValue: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: TEXT_2,
    textAlign: "right",
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  eventName: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: TEXT_1,
  },
  eventTime: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: TEXT_3,
    marginTop: 1,
  },
  eventData: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: TEXT_2,
    marginTop: 3,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: TEXT_3,
    textAlign: "center",
    paddingVertical: 12,
  },
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: RED,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: AMBER,
    paddingVertical: 11,
    borderRadius: 10,
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: BG,
  },
  buttonSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: 11,
    borderRadius: 10,
  },
  buttonSecondaryText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: TEXT_1,
  },
  buttonDanger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
    paddingVertical: 11,
    borderRadius: 10,
  },
  buttonDangerText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: RED,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
