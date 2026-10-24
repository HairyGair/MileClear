// "Which car is MY FORD?" - asked once per Bluetooth name, after a recorded
// trip, when the driver has 2+ cars and none is linked to what the phone was
// connected to. The answer links that Bluetooth to the chosen car, or
// "None of these" so we never ask about it again.
//
// Usage:
//   <WhichCarSheet question={q} cars={vehicles} onDone={() => setQ(null)} />
//
// Plain TouchableOpacity rows, not <Button>: same iPad hit-testing reason as
// the Work explainer in the dashboard.

import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, AccessibilityInfo } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Vehicle } from "@mileclear/shared";
import { AppModal } from "../AppModal";
import { answerCarQuestion, linksFromCars, snoozeCarQuestion, type CarQuestion } from "../../lib/vehicles/carBluetooth";
import { haptic } from "../../lib/haptics";
import { colors, fonts } from "../../lib/theme";
import CarBluetoothArt from "./CarBluetoothArt";

interface WhichCarSheetProps {
  /** The question to ask; null keeps the sheet closed. */
  question: CarQuestion | null;
  cars: Pick<Vehicle, "id" | "make" | "model" | "registrationPlate" | "isPrimary" | "bluetoothName" | "bluetoothId">[];
  /** Called once the answer is saved (or the sheet is dismissed after it). */
  onDone: () => void;
}

export function WhichCarSheet({ question, cars, onDone }: WhichCarSheetProps) {
  const [failed, setFailed] = useState(false);
  // A ref, not state: two quick taps both see the same render's state.
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (question) setFailed(false);
  }, [question]);

  const answer = useCallback(
    async (vehicleId: string | null) => {
      if (!question || busy.current) return;
      busy.current = true;
      haptic(vehicleId ? "success" : "selection");
      try {
        await answerCarQuestion(question, vehicleId);
        busy.current = false;
        onDone();
      } catch {
        // Not saved: stay open and say so; Close snoozes so we ask another day.
        await snoozeCarQuestion().catch(() => {});
        busy.current = false;
        if (mounted.current) {
          setFailed(true);
          haptic("error");
          AccessibilityInfo.announceForAccessibility("Couldn't save that. We'll ask again later.");
        } else {
          onDone();
        }
      }
    },
    [question, onDone]
  );

  // Not now, Close and Android back: no answer, asked again another day.
  const snooze = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    snoozeCarQuestion()
      .catch(() => {})
      .finally(() => {
        busy.current = false;
        onDone();
      });
  }, [onDone]);

  const links = linksFromCars(cars);

  const pick = useCallback(
    (car: WhichCarSheetProps["cars"][number], label: string, linkedTo: string | null) => {
      if (!linkedTo) {
        void answer(car.id);
        return;
      }
      Alert.alert(`This replaces ${linkedTo} on your ${label}.`, undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Replace", onPress: () => void answer(car.id) },
      ]);
    },
    [answer]
  );

  const name = question?.name ?? "";

  return (
    <AppModal visible={!!question} animationType="slide" onRequestClose={snooze}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.artWrap}>
            <CarBluetoothArt size={84} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Which car is {name}?
          </Text>
          <Text style={styles.body}>
            From now on, trips the app picks up on its own while {name} is connected go on the car you pick.
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {cars.map((car) => {
              const label = `${car.make} ${car.model}`.trim();
              const plate = car.registrationPlate ? `, ${car.registrationPlate}` : "";
              const linkedTo = links.find((l) => l.vehicleId === car.id)?.name ?? null;
              return (
                <TouchableOpacity
                  key={car.id}
                  style={styles.row}
                  onPress={() => pick(car, label, linkedTo)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${name} is my ${label}${plate}${car.isPrimary ? ", main car" : ""}${linkedTo ? `, already linked to ${linkedTo}` : ""}`}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="car-sport" size={20} color={colors.amber} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {label}
                    </Text>
                    {car.registrationPlate || car.isPrimary ? (
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {[car.registrationPlate, car.isPrimary ? "Main car" : null].filter(Boolean).join("  \u00b7  ")}
                      </Text>
                    ) : null}
                    {linkedTo ? (
                      <Text style={styles.rowLinked} numberOfLines={1}>
                        Linked to {linkedTo}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.text2} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {failed ? (
            <>
              <Text style={styles.failed} accessibilityRole="alert" accessibilityLiveRegion="polite">
                Couldn't save that. We'll ask again later.
              </Text>
              <TouchableOpacity
                style={styles.none}
                onPress={snooze}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.noneText}>Close</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.none}
                  onPress={snooze}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Not now"
                  accessibilityHint="We will ask again another day"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.noneText}>Not now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.none}
                  onPress={() => answer(null)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="None of these"
                  accessibilityHint={`We will not ask about ${name} again`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.noneText}>None of these</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.footnote}>Pick None of these and we won't ask about {name} again.</Text>
            </>
          )}
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    // A fixed ceiling a definite parent can't give a percentage; the list
    // below scrolls, so a long car list never pushes "None of these" away.
    maxHeight: 640,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 12,
  },
  artWrap: { alignItems: "center", marginBottom: 6 },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.text1,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.text2,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  list: { flexGrow: 0, flexShrink: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    minHeight: 56,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowText: { flex: 1, marginRight: 8 },
  rowTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  rowSub: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.text2,
    letterSpacing: 1,
    marginTop: 2,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-around" },
  rowLinked: { fontSize: 12, fontFamily: fonts.medium, color: colors.amber, marginTop: 2 },
  none: { alignItems: "center", paddingVertical: 12, marginTop: 2 },
  noneText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text2 },
  failed: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.amber,
    textAlign: "center",
  },
  footnote: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text3,
    textAlign: "center",
  },
});
