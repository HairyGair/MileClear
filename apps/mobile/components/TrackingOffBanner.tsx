// Safety banner: shown whenever auto drive-detection is switched OFF, so a user
// can't silently disable capture and lose drives without realising. Prompted by
// a real case (a driver turned detection off, drove to Baslow, and the trip was
// never recorded — every "missing trip" symptom traced back to that one toggle).
//
// Two states (9 Jul 2026, Lloyd Ayers feedback — some users WANT manual-only):
//   - Loud warning with "Turn on" + "I'm tracking manually". The second
//     acknowledges the choice and collapses the banner to…
//   - A quiet one-line pill ("Manual mode") with a small Turn-on link. Never
//     fully invisible — the safety purpose survives — but no longer a nag
//     that tells a deliberate manual user their choice is wrong.
// The acknowledgement clears itself whenever detection comes back on, so the
// NEXT time it's turned off the loud banner shows again.
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, fonts } from "../lib/theme";
import { isDriveDetectionEnabled, setDriveDetectionEnabled } from "../lib/tracking/detection";
import { getDatabase } from "../lib/db";

const AMBER = colors.amber;
const ACK_KEY = "manual_mode_ack";

export function TrackingOffBanner() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [acked, setAcked] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    isDriveDetectionEnabled()
      .then(async (on) => {
        setEnabled(on);
        const db = await getDatabase();
        if (on) {
          // Detection is back on: reset the acknowledgement so a future
          // turn-off shows the loud banner again.
          await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [ACK_KEY]);
          setAcked(false);
        } else {
          const row = await db.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = ?",
            [ACK_KEY]
          );
          setAcked(row?.value === "1");
        }
      })
      .catch(() => {});
  }, []);

  useFocusEffect(refresh);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      await setDriveDetectionEnabled(true); // also restarts detection
      setEnabled(true);
      const db = await getDatabase();
      await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [ACK_KEY]);
      setAcked(false);
    } catch {
      // best-effort — the settings toggle is the fallback
    } finally {
      setBusy(false);
    }
  }, []);

  const acknowledge = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, '1')",
        [ACK_KEY]
      );
      setAcked(true);
    } catch {
      /* stays loud — safe default */
    }
  }, []);

  if (enabled !== false) return null;

  if (acked) {
    return (
      <View style={styles.pill} accessibilityRole="text">
        <Ionicons name="hand-left-outline" size={13} color="#94a3b8" />
        <Text style={styles.pillText}>Manual mode — auto-tracking off</Text>
        <TouchableOpacity
          onPress={turnOn}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Turn auto-tracking back on"
        >
          <Text style={styles.pillLink}>{busy ? "…" : "Turn on"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="warning" size={18} color={AMBER} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>Auto-tracking is off</Text>
        <Text style={styles.subtitle}>New drives won&apos;t be recorded until you turn it back on.</Text>
        <TouchableOpacity
          onPress={acknowledge}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="I'm tracking manually — show a smaller reminder"
        >
          <Text style={styles.ackLink}>I&apos;m tracking manually — got it</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.btn}
        onPress={turnOn}
        disabled={busy}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Turn auto-tracking back on"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <Text style={styles.btnText}>Turn on</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(245,166,35,0.1)",
    borderColor: "rgba(245,166,35,0.32)",
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  textWrap: { flex: 1, marginLeft: 10 },
  title: { fontFamily: fonts.bold, fontSize: 13.5, color: AMBER },
  subtitle: { color: "#94a3b8", fontFamily: fonts.medium, fontSize: 11.5, marginTop: 2 },
  ackLink: {
    color: "#94a3b8",
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    marginTop: 6,
    textDecorationLine: "underline",
  },
  btn: {
    marginLeft: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: AMBER,
  },
  btnText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 13 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillText: { color: "#94a3b8", fontFamily: fonts.medium, fontSize: 11.5 },
  pillLink: { color: AMBER, fontFamily: fonts.semibold, fontSize: 11.5, marginLeft: 4 },
});
