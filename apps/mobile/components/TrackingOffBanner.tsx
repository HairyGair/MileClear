// Safety banner: shown whenever auto drive-detection is switched OFF, so a user
// can't silently disable capture and lose drives without realising. Prompted by
// a real case (a driver turned detection off, drove to Baslow, and the trip was
// never recorded — every "missing trip" symptom traced back to that one toggle).
//
// Deliberately NOT dismissable: it only appears when the core feature is off, and
// it carries a one-tap "Turn on" so fixing it is immediate. Renders nothing when
// detection is on, so it's invisible in the normal case. Re-checks on focus.
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, fonts } from "../lib/theme";
import { isDriveDetectionEnabled, setDriveDetectionEnabled } from "../lib/tracking/detection";

const AMBER = colors.amber;

export function TrackingOffBanner() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    isDriveDetectionEnabled().then(setEnabled).catch(() => {});
  }, []);

  useFocusEffect(refresh);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      await setDriveDetectionEnabled(true); // also restarts detection
      setEnabled(true);
    } catch {
      // best-effort — the settings toggle is the fallback
    } finally {
      setBusy(false);
    }
  }, []);

  if (enabled !== false) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="warning" size={18} color={AMBER} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>Auto-tracking is off</Text>
        <Text style={styles.subtitle}>New drives won&apos;t be recorded until you turn it back on.</Text>
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
  btn: {
    marginLeft: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: AMBER,
  },
  btnText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 13 },
});
