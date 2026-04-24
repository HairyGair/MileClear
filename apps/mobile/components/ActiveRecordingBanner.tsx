// In-app banner that appears at the top of the dashboard whenever an
// auto-detected trip is being recorded. Tap to open the canonical
// Active Recording screen.
//
// Polls the local SQLite tracking_state table on a short interval so the
// banner appears within ~2s of a recording starting and disappears within
// ~2s of it finalising. Distance is haversine-summed from the buffered
// detection_coordinates; duration ticks live every second.

import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getDatabase } from "../lib/db/index";
import { haversineDistance, formatMiles } from "@mileclear/shared";

interface State {
  active: boolean;
  startedAt: number | null;
  distanceMiles: number;
}

const EMPTY: State = { active: false, startedAt: null, distanceMiles: 0 };

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ActiveRecordingBanner() {
  const router = useRouter();
  const [state, setState] = useState<State>(EMPTY);
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
      );
      const active = row?.value === "1";
      if (!mountedRef.current) return;

      if (!active) {
        setState(EMPTY);
        return;
      }

      const coords = await db.getAllAsync<{
        lat: number;
        lng: number;
        recorded_at: string;
      }>(
        "SELECT lat, lng, recorded_at FROM detection_coordinates ORDER BY recorded_at ASC"
      );

      let distance = 0;
      for (let i = 1; i < coords.length; i++) {
        distance += haversineDistance(
          coords[i - 1].lat,
          coords[i - 1].lng,
          coords[i].lat,
          coords[i].lng
        );
      }
      const startedAt =
        coords.length > 0 ? new Date(coords[0].recorded_at).getTime() : null;

      if (!mountedRef.current) return;
      setState({ active: true, startedAt, distanceMiles: distance });
    } catch {
      // Silent failure - the banner is best-effort
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (!state.active) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [state.active]);

  if (!state.active) return null;

  const elapsedMs = state.startedAt != null ? now - state.startedAt : 0;

  return (
    <TouchableOpacity
      onPress={() => router.push("/active-recording")}
      activeOpacity={0.8}
      style={styles.banner}
      accessibilityRole="button"
      accessibilityLabel={`Trip recording. ${formatMiles(state.distanceMiles)} so far over ${formatDuration(elapsedMs)}. Tap to view or end.`}
    >
      <View style={styles.dot} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>Recording trip</Text>
        <Text style={styles.subtitle}>
          {formatMiles(state.distanceMiles)} · {formatDuration(elapsedMs)}
        </Text>
      </View>
      <View style={styles.arrowWrap}>
        <Text style={styles.arrowLabel}>View</Text>
        <Ionicons name="chevron-forward" size={16} color="#030712" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5a623",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: "#f5a623",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#030712",
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: "#030712",
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 14,
    lineHeight: 18,
  },
  subtitle: {
    color: "#030712",
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 12,
    opacity: 0.85,
    marginTop: 2,
  },
  arrowWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(3,7,18,0.12)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    gap: 4,
  },
  arrowLabel: {
    color: "#030712",
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 12,
  },
});
