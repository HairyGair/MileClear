// Drive Detection Diagnostics Screen
// On-device dump of drive detection state, permissions, recent events, and
// tracking_state so we can diagnose "autotrips aren't picking up" reports
// without needing Xcode / DBeaver access to the device's SQLite file.

import { useCallback, useState } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import {
  getRecentDetectionEvents,
  getDriveDetectionDiagnostics,
  clearDetectionEvents,
  restartDriveDetection,
  type DriveDetectionDiagnostics,
} from "../lib/tracking/detection";

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

// ── Screen ─────────────────────────────────────────────────────────────────

export default function DriveDetectionDiagnosticsScreen() {
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DriveDetectionDiagnostics | null>(null);
  const [events, setEvents] = useState<DetectionEventRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [diag, ev] = await Promise.all([
        getDriveDetectionDiagnostics(),
        getRecentDetectionEvents(50),
      ]);
      setDiagnostics(diag);
      setEvents(ev);
    } catch (err) {
      console.error("Failed to load diagnostics", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleShare = useCallback(async () => {
    if (!diagnostics) return;
    const lines: string[] = [];
    lines.push("MileClear Drive Detection Diagnostics");
    lines.push(`Captured: ${new Date().toISOString()}`);
    lines.push(`Platform: ${Platform.OS} ${Platform.Version}`);
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
  }, [diagnostics, events]);

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
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
