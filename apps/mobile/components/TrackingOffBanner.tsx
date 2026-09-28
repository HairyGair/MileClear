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
//
// A PAUSE is not "off" (26 Sep 2026). isDriveDetectionEnabled() reads false
// during a pause too, so a paused phone used to get "Auto-tracking is off"
// with a Turn on that flipped the permanent switch and left the pause
// running: the banner vanished and recording stayed off until the pause
// ended. The switch and the pause are now read apart. Paused shows the
// paused line with Resume (hidden where the screen already shows it), and
// Turn on also clears any pause.
//
// Off is a choice, not a fault (28 Sep 2026). A shift-only driver switches
// Automatic trips off on purpose, and the dashboard now carries the switch
// itself, so the loud "Auto-tracking is off" warning and its "I'm tracking
// manually" acknowledgement are gone. Off shows one quiet line with Turn on,
// wherever this banner is used (the Trips list), so a missing drive is still
// explained. Turn on goes through the same permission flow as the switch.
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, fonts } from "../lib/theme";
import { getDrivePauseUntil, resumeDriveDetection } from "../lib/tracking/detection";
import { readAutomaticTrips, setAutomaticTrips } from "../lib/tracking/automaticTrips";
import { isPauseActive } from "../lib/tracking/pauseRule";
import { PauseRecordingRow } from "./PauseRecordingRow";

const AMBER = colors.amber;

async function readActivePause(): Promise<number | null> {
  const until = await getDrivePauseUntil();
  return isPauseActive(until, Date.now()) ? until : null;
}

/** hidePause: the screen already shows the paused line (the dashboard). */
export function TrackingOffBanner({ hidePause = false }: { hidePause?: boolean } = {}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([readAutomaticTrips(), readActivePause()])
      .then(([on, paused]) => {
        setEnabled(on);
        setPausedUntil(on ? paused : null);
      })
      .catch(() => {});
  }, []);

  useFocusEffect(refresh);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      await setAutomaticTrips(true); // also restarts detection
      // "Turn on" means recording, so it ends any pause as well.
      if ((await readActivePause()) !== null) await resumeDriveDetection("manual");
      setEnabled(true);
      setPausedUntil(null);
    } catch {
      // best-effort: the dashboard switch is the fallback
    } finally {
      setBusy(false);
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      await resumeDriveDetection("manual");
    } catch {
      // best-effort: the dashboard Resume is the fallback
    }
    refresh();
  }, [refresh]);

  if (enabled === true && pausedUntil !== null) {
    if (hidePause) return null;
    return (
      <PauseRecordingRow pausedUntil={pausedUntil} now={Date.now()} onPause={() => {}} onResume={resume} />
    );
  }

  if (enabled !== false) return null;

  return (
    <View style={styles.pill} accessibilityRole="text">
      <Ionicons name="hand-left-outline" size={13} color={colors.text3} />
      <Text style={styles.pillText}>Automatic trips off. Only shifts and Start Trip record.</Text>
      <TouchableOpacity
        onPress={turnOn}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Turn automatic trips back on"
      >
        <Text style={styles.pillLink}>{busy ? "..." : "Turn on"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillText: { color: colors.text3, fontFamily: fonts.medium, fontSize: 11.5, flexShrink: 1 },
  pillLink: { color: AMBER, fontFamily: fonts.semibold, fontSize: 11.5, marginLeft: 4 },
});
