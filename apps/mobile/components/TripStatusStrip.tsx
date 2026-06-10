// Persistent trip-status surface for the dashboard — the always-there answer
// to "what happened to my trip?". Phase 1 of the reliability work (status
// clarity, point 10): a trip's fate must never be a mystery.
//
// States, in priority order:
//   1. Recording          → renders nothing (ActiveRecordingBanner owns it)
//   2. Saving trip…       → finalize in progress (tracking_state.finalizing_trip_at)
//   3. Last trip saved    → within 12h: miles, route, and that trip's REAL sync
//                           state (synced ✓ / uploading / waiting for connection /
//                           couldn't sync — needs you)
//   4. Ready              → quiet one-liner that auto-detection is armed
//   5. Nothing            → permissions broken (the dashboard's red blockers
//                           already own that state — never stack two surfaces)
//
// Polls local SQLite on a short interval like the sibling banners. Everything
// is best-effort and read-only.

import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getDatabase } from "../lib/db/index";
import { readPersistedLastSavedTrip, type LastSavedTrip } from "../lib/events/lastTrip";
import { getLocationPermissionStatus } from "../lib/permissions/location";
import { isOnline } from "../lib/network";
import { formatMiles } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

const QUICK_TRIP_SHIFT_ID = "__quick_trip__";
const SAVED_WINDOW_MS = 12 * 60 * 60 * 1000; // show "last trip" for 12h
const FINALIZING_STALE_MS = 2 * 60 * 1000; // ignore a finalizing flag older than 2min

const EMERALD = "#10b981";
const RED = "#ef4444";
const AMBER = colors.amber;

type SyncState = "synced" | "uploading" | "waiting" | "failed" | "unknown";

interface StripState {
  kind: "hidden" | "saving" | "saved" | "ready";
  lastTrip?: LastSavedTrip;
  sync?: SyncState;
}

function relativeTime(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function TripStatusStrip() {
  const router = useRouter();
  const [state, setState] = useState<StripState>({ kind: "hidden" });
  const [detectionArmed, setDetectionArmed] = useState(false);
  const mountedRef = useRef(true);

  // Permission tier + detection toggle change rarely — read once on mount,
  // not on every poll tick.
  useEffect(() => {
    (async () => {
      try {
        const [{ tier }, db] = await Promise.all([
          getLocationPermissionStatus(),
          getDatabase(),
        ]);
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'drive_detection_enabled'"
        );
        const enabled = row ? row.value === "1" : true;
        if (mountedRef.current) setDetectionArmed(tier === "always" && enabled);
      } catch {
        // best-effort
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();

      // 1) Recording? The ActiveRecordingBanner owns that state — hide.
      const [autoRow, shiftRow] = await Promise.all([
        db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
        ),
        db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
        ),
      ]);
      if (autoRow?.value === "1" || shiftRow?.value === QUICK_TRIP_SHIFT_ID) {
        if (mountedRef.current) setState({ kind: "hidden" });
        return;
      }

      // 2) Finalize in progress?
      const finRow = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'finalizing_trip_at'"
      );
      const finAt = finRow ? Number(finRow.value) : NaN;
      if (Number.isFinite(finAt) && Date.now() - finAt < FINALIZING_STALE_MS) {
        if (mountedRef.current) setState({ kind: "saving" });
        return;
      }

      // 3) Recently saved trip → show it with its real sync state.
      const lastTrip = await readPersistedLastSavedTrip();
      if (lastTrip && Date.now() - lastTrip.savedAt < SAVED_WINDOW_MS) {
        let sync: SyncState = "unknown";
        if (lastTrip.tripId) {
          const tripRow = await db.getFirstAsync<{ synced_at: string | null }>(
            "SELECT synced_at FROM trips WHERE id = ?",
            [lastTrip.tripId]
          );
          if (tripRow?.synced_at) {
            sync = "synced";
          } else if (tripRow) {
            const q = await db.getFirstAsync<{ status: string }>(
              "SELECT status FROM sync_queue WHERE entity_id = ? ORDER BY updated_at DESC LIMIT 1",
              [lastTrip.tripId]
            );
            if (q?.status === "permanently_failed") sync = "failed";
            else if (q?.status === "synced") sync = "synced";
            else sync = isOnline() ? "uploading" : "waiting";
          } else {
            // Row not found under the recorded id — it was re-keyed to the
            // server id on sync success, which only happens after upload.
            sync = "synced";
          }
        } else {
          // Saved offline without an id — fall back to aggregate queue state.
          const pending = await db.getFirstAsync<{ n: number }>(
            "SELECT COUNT(*) AS n FROM sync_queue WHERE entity_type = 'trip' AND status IN ('pending', 'failed')"
          );
          if ((pending?.n ?? 0) > 0) sync = isOnline() ? "uploading" : "waiting";
          else sync = "synced";
        }
        if (mountedRef.current) setState({ kind: "saved", lastTrip, sync });
        return;
      }

      // 4) Idle. Quiet "armed" reassurance only when detection can actually
      // run — broken permissions are the red blockers' job, not ours.
      if (mountedRef.current) setState({ kind: detectionArmed ? "ready" : "hidden" });
    } catch {
      // best-effort
    }
  }, [detectionArmed]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, 2500);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  if (state.kind === "hidden") return null;

  if (state.kind === "saving") {
    return (
      <View style={[styles.strip, styles.stripNeutral]}>
        <ActivityIndicator size="small" color={AMBER} />
        <Text style={styles.savingText}>Saving trip…</Text>
      </View>
    );
  }

  if (state.kind === "saved" && state.lastTrip) {
    const t = state.lastTrip;
    const route =
      t.startAddress && t.endAddress
        ? `${t.startAddress} → ${t.endAddress}`
        : t.endAddress ?? t.startAddress ?? null;
    const sync = state.sync ?? "unknown";

    const chip: { label: string; color: string; icon: keyof typeof Ionicons.glyphMap } =
      sync === "synced"
        ? { label: "Synced", color: EMERALD, icon: "checkmark-circle" }
        : sync === "failed"
          ? { label: "Needs attention", color: RED, icon: "warning" }
          : sync === "waiting"
            ? { label: "Waiting for connection", color: AMBER, icon: "cloud-offline-outline" }
            : { label: "Uploading", color: AMBER, icon: "cloud-upload-outline" };

    return (
      <TouchableOpacity
        onPress={() => router.push(sync === "failed" ? "/sync-status" : "/(tabs)/trips")}
        activeOpacity={0.8}
        style={[styles.strip, styles.stripNeutral]}
        accessibilityRole="button"
        accessibilityLabel={`Last trip saved ${relativeTime(t.savedAt)}. ${formatMiles(t.distanceMiles)}${route ? `, ${route}` : ""}. Sync status: ${chip.label}. Tap for details.`}
      >
        <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.text2} />
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            Trip saved · {formatMiles(t.distanceMiles)}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {route ? `${route} · ` : ""}
            {relativeTime(t.savedAt)}
          </Text>
        </View>
        <View style={[styles.chip, { borderColor: chip.color }]}>
          <Ionicons name={chip.icon} size={12} color={chip.color} />
          <Text style={[styles.chipText, { color: chip.color }]} numberOfLines={1}>
            {chip.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Ready — slim, quiet, single line.
  return (
    <View style={[styles.strip, styles.stripQuiet]}>
      <View style={styles.readyDot} />
      <Text style={styles.readyText}>ClearTrack is on — drives record automatically</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  stripNeutral: {
    backgroundColor: "rgba(148,163,184,0.08)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
  },
  stripQuiet: {
    backgroundColor: "transparent",
    paddingVertical: 4,
  },
  savingText: {
    color: colors.text2,
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  textWrap: { flex: 1 },
  title: {
    color: colors.text1,
    fontFamily: fonts.bold,
    fontSize: 13.5,
  },
  subtitle: {
    color: colors.text3,
    fontFamily: fonts.medium,
    fontSize: 11.5,
    marginTop: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 8,
    maxWidth: 150,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: EMERALD,
  },
  readyText: {
    color: colors.text3,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
});
