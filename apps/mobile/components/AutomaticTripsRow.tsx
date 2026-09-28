// AutomaticTripsRow: the Automatic trips switch, on the dashboard.
//
// 28 Sep 2026, a shift-only driver: "I have it set for manual tracking and
// only want it to track whilst I have a shift started", yet drives and walks
// outside her shifts kept turning up. The only switch was three screens deep
// (Settings > Tracking & Locations) and did not really switch anything off.
// Now it does (lib/tracking/detectionOffRule.ts) and it sits on the home
// screen in both modes, as one compact row rather than a card, so it never
// competes with the mileage for the space above it.
//
// Same setting as Settings > Tracking & Locations > Automatic trips. Re-read
// on focus, so flipping it in one place shows in the other.

import { useCallback, useState } from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { colors, fonts } from "../lib/theme";
import { readAutomaticTrips, setAutomaticTrips } from "../lib/tracking/automaticTrips";

interface Props {
  /** Told after each change, so the dashboard can refresh what depends on it. */
  onChange?: (on: boolean) => void;
}

export function AutomaticTripsRow({ onChange }: Props) {
  // null until read, so a switched-off phone never flashes "on".
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      readAutomaticTrips()
        .then((v) => {
          if (live) setOn(v);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [])
  );

  const toggle = useCallback(
    async (next: boolean) => {
      if (busy) return;
      setBusy(true);
      setOn(next); // show the choice at once; the work below is slower
      try {
        await setAutomaticTrips(next);
      } catch {
        // Stored or not, show what is really there.
      }
      try {
        const actual = await readAutomaticTrips();
        setOn(actual);
        onChange?.(actual);
      } catch {
        onChange?.(next);
      } finally {
        setBusy(false);
      }
    },
    [busy, onChange]
  );

  if (on === null) return null;

  return (
    <View style={s.row}>
      <Ionicons
        name={on ? "car-sport-outline" : "hand-left-outline"}
        size={18}
        color={on ? colors.amber : colors.text3}
        accessible={false}
      />
      <View style={s.body}>
        <Text style={s.label}>Automatic trips</Text>
        <Text style={s.hint}>{on ? "Drives record by themselves." : "Only shifts and Start Trip record."}</Text>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        disabled={busy}
        trackColor={{ false: "#374151", true: colors.amber }}
        thumbColor="#fff"
        ios_backgroundColor="#374151"
        accessibilityRole="switch"
        accessibilityLabel="Automatic trips"
        accessibilityHint={on ? "Drives record by themselves." : "Only shifts and Start Trip record."}
        accessibilityState={{ checked: on, disabled: busy }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  body: { flex: 1 },
  label: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  hint: { fontSize: 12, fontFamily: fonts.medium, color: colors.text3, marginTop: 1 },
});
