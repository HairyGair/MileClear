import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import {
  startPickupWait,
  endPickupWait,
  fetchActivePickupWait,
} from "../../lib/api/pickupWaits";
import type { PickupWait } from "@mileclear/shared";

const AMBER = "#f5a623";
const AMBER_FAINT = "rgba(245,166,35,0.10)";
const GREEN = "#10b981";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/**
 * Pickup-point wait stopwatch. Sits on the active-recording screen so a
 * courier can tap "Wait at pickup" when they arrive at a restaurant /
 * depot, then "Picked up" when the order's ready.
 *
 * State recovers across app launches via /pickup-waits/active - if the
 * driver killed the app mid-wait, the timer resumes correctly.
 */
export function WaitTimer() {
  const [active, setActive] = useState<PickupWait | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const startTimeRef = useRef<number | null>(null);

  // On mount: check for an in-flight wait so the UI restores correctly
  // after a kill-and-relaunch.
  useEffect(() => {
    fetchActivePickupWait()
      .then((res) => {
        if (res.data) {
          setActive(res.data);
          startTimeRef.current = new Date(res.data.startedAt).getTime();
        }
      })
      .catch(() => {});
  }, []);

  // Tick the elapsed counter while a wait is active.
  useEffect(() => {
    if (!active || active.endedAt) return;
    const tick = () => {
      if (startTimeRef.current) {
        setElapsedSeconds(
          Math.max(0, Math.round((Date.now() - startTimeRef.current) / 1000))
        );
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [active]);

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Best-effort location capture for later aggregation. Don't block on
      // permission - if location's denied, just save the wait without a
      // location and the user can still see their personal timer.
      let coords:
        | { locationLat: number; locationLng: number }
        | undefined;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          coords = {
            locationLat: pos.coords.latitude,
            locationLng: pos.coords.longitude,
          };
        }
      } catch {}

      const res = await startPickupWait(coords);
      setActive(res.data);
      startTimeRef.current = new Date(res.data.startedAt).getTime();
      setElapsedSeconds(0);
    } catch (err) {
      Alert.alert(
        "Could not start timer",
        err instanceof Error ? err.message : "Try again."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    if (busy || !active) return;
    setBusy(true);
    try {
      await endPickupWait(active.id);
      setActive(null);
      startTimeRef.current = null;
      setElapsedSeconds(0);
    } catch (err) {
      Alert.alert(
        "Could not stop timer",
        err instanceof Error ? err.message : "Try again."
      );
    } finally {
      setBusy(false);
    }
  };

  // Inactive state: simple "Wait at pickup" button.
  if (!active) {
    return (
      <TouchableOpacity
        onPress={handleStart}
        disabled={busy}
        style={s.idleCard}
        accessibilityRole="button"
        accessibilityLabel="Start pickup wait timer"
      >
        <Ionicons name="time-outline" size={18} color={AMBER} />
        <View style={{ flex: 1 }}>
          <Text style={s.idleTitle}>Wait at pickup</Text>
          <Text style={s.idleSub}>
            Tap when you arrive at a restaurant or depot. Tap again when picked up.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={TEXT_3} />
      </TouchableOpacity>
    );
  }

  // Active state: live counter + "Picked up" button.
  return (
    <View style={s.activeCard}>
      <View style={s.activeHead}>
        <View style={s.dot} />
        <Text style={s.activeLabel}>WAITING</Text>
      </View>
      <Text style={s.activeTimer}>{formatElapsed(elapsedSeconds)}</Text>
      <TouchableOpacity
        onPress={handleEnd}
        disabled={busy}
        style={s.endButton}
        accessibilityRole="button"
        accessibilityLabel="Picked up - end wait timer"
      >
        <Ionicons name="checkmark-circle-outline" size={16} color="#0a0f1a" />
        <Text style={s.endButtonText}>
          {busy ? "Saving..." : "Picked up"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  idleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  idleTitle: {
    color: TEXT_1,
    fontSize: 14,
    fontWeight: "600",
  },
  idleSub: {
    color: TEXT_2,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  activeCard: {
    backgroundColor: AMBER_FAINT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.20)",
    alignItems: "center",
  },
  activeHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: AMBER,
  },
  activeLabel: {
    color: AMBER,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  activeTimer: {
    color: TEXT_1,
    fontSize: 36,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.5,
    marginVertical: 6,
  },
  endButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: AMBER,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 6,
  },
  endButtonText: {
    color: "#0a0f1a",
    fontSize: 14,
    fontWeight: "700",
  },
});
