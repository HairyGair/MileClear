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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import {
  getRecentDetectionEvents,
  getDriveDetectionDiagnostics,
  clearDetectionEvents,
  restartDriveDetection,
  type DriveDetectionDiagnostics,
} from "../lib/tracking/detection";
import { useUser } from "../lib/user/context";

// ── Constants ──────────────────────────────────────────────────────────────

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const GREEN = "#34c759";
const RED = "#ef4444";
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
function computeHealth(d: DriveDetectionDiagnostics, events: DetectionEventRow[]): Health {
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

  // 3. Task should be running but isn't
  if (d.enabled && d.backgroundPermission === "granted" && !d.taskRunning && !d.activeShiftId) {
    problems.push({
      severity: "error",
      title: "Detection task isn't running",
      cause:
        "The background location subscription isn't registered with iOS. This usually means iOS killed the task after idle, a reboot, or a crash.",
      action: "Tap Restart detection below. If it keeps happening, reboot the phone.",
    });
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

export default function DriveDetectionDiagnosticsScreen() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DriveDetectionDiagnostics | null>(null);
  const [events, setEvents] = useState<DetectionEventRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [capturedAt, setCapturedAt] = useState<Date>(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [diag, ev] = await Promise.all([
        getDriveDetectionDiagnostics(),
        getRecentDetectionEvents(50),
      ]);
      setDiagnostics(diag);
      setEvents(ev);
      setCapturedAt(new Date());
    } catch (err) {
      console.error("Failed to load diagnostics", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const health = useMemo(
    () => (diagnostics ? computeHealth(diagnostics, events) : null),
    [diagnostics, events]
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
      Alert.alert("Error", (err as Error).message ?? "Failed to restart");
    } finally {
      setBusy(false);
    }
  }, [load]);

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
        <StatusRow label="Task running" value={String(d.taskRunning)} color={boolColor(d.taskRunning)} />
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

      {/* detection_events list */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>detection_events ({events.length})</Text>
        {events.length === 0 ? (
          <Text style={styles.emptyText}>
            No events logged yet. Drive detection hasn't fired.
          </Text>
        ) : (
          events.map((ev, i) => {
            const color = EVENT_COLORS[ev.event] ?? TEXT_2;
            return (
              <View key={`${ev.recorded_at}-${i}`} style={styles.eventRow}>
                <View style={[styles.eventDot, { backgroundColor: color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventName}>{ev.event}</Text>
                  <Text style={styles.eventTime}>{formatRelative(ev.recorded_at)}</Text>
                  {ev.data && <Text style={styles.eventData}>{ev.data}</Text>}
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
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 11,
    color: TEXT_3,
    width: 64,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerValue: {
    flex: 1,
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 2,
  },
  verdictHeadline: {
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
  },
  problemCause: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 12,
    color: TEXT_2,
    lineHeight: 17,
    marginLeft: 26,
  },
  problemAction: {
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 13,
    color: AMBER,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
    gap: 12,
  },
  statusLabel: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    color: TEXT_2,
    width: 130,
  },
  statusValue: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
    textAlign: "right",
  },
  statusHint: {
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 12,
    color: TEXT_1,
    width: 140,
  },
  kvValue: {
    flex: 1,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
    color: TEXT_1,
  },
  eventTime: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 11,
    color: TEXT_3,
    marginTop: 1,
  },
  eventData: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 11,
    color: TEXT_2,
    marginTop: 3,
  },
  emptyText: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    color: TEXT_3,
    textAlign: "center",
    paddingVertical: 12,
  },
  errorText: {
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_700Bold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
    color: RED,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
