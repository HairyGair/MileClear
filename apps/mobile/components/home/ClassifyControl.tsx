// Home's Business / Personal control (SPEC-VISUAL 5.5): one 40 pt track, two
// halves, a briefcase and a person. Shared by the Last trip card on Home and
// the unsorted rows on Trips, so the same choice looks the same everywhere.
// Unsorted, the track has an amber edge and neither half is filled; the
// suggestion, if any, is written above it by the caller, never shown as an
// amber half.

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TripChoice } from "../../lib/home/lastTrip";
import { colors, fonts, fontScaleCap } from "../../lib/theme";

interface Props {
  choice: TripChoice;
  /** Show "Auto" in the chosen half (a rule picked it, not the driver). */
  autoTag?: boolean;
  onChoose: (c: "business" | "personal") => void;
  /** Read out for the whole control. */
  label: string;
  /** Words in the halves, when they say more than "Business" ("Business (3)"). */
  businessText?: string;
  personalText?: string;
  /** A save is running: the halves stop taking taps and show a spinner. */
  busy?: boolean;
}

export function ClassifyControl({
  choice,
  autoTag = false,
  onChoose,
  label,
  businessText = "Business",
  personalText = "Personal",
  busy = false,
}: Props) {
  const unsorted = choice === "unclassified";
  const business = choice === "business";
  const personal = choice === "personal";
  return (
    <View
      style={[s.track, unsorted && { borderColor: colors.amberGlow }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
    >
      <Pressable
        onPress={() => onChoose("business")}
        disabled={busy}
        style={[s.half, business && s.halfBusiness]}
        hitSlop={{ top: 2, bottom: 2 }}
        accessibilityRole="radio"
        accessibilityLabel={businessText}
        accessibilityState={{ selected: business, checked: business, disabled: busy }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.text2} accessibilityLabel="Saving" />
        ) : (
          <>
            <Ionicons
              name={business ? "briefcase" : "briefcase-outline"}
              size={16}
              color={business ? colors.bg : colors.text2}
              accessible={false}
            />
            <Text style={[s.halfText, business && s.halfTextBusiness]} maxFontSizeMultiplier={fontScaleCap.body}>
              {businessText}
            </Text>
            {business && autoTag ? <Text style={s.auto}>Auto</Text> : null}
          </>
        )}
      </Pressable>
      <Pressable
        onPress={() => onChoose("personal")}
        disabled={busy}
        style={[s.half, personal && s.halfPersonal]}
        hitSlop={{ top: 2, bottom: 2 }}
        accessibilityRole="radio"
        accessibilityLabel={personalText}
        accessibilityState={{ selected: personal, checked: personal, disabled: busy }}
      >
        {busy ? null : (
          <>
            <Ionicons
              name={personal ? "person" : "person-outline"}
              size={16}
              color={personal ? colors.text1 : colors.text2}
              accessible={false}
            />
            <Text style={[s.halfText, personal && s.halfTextPersonal]} maxFontSizeMultiplier={fontScaleCap.body}>
              {personalText}
            </Text>
            {personal && autoTag ? <Text style={[s.auto, { color: colors.text1 }]}>Auto</Text> : null}
          </>
        )}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    padding: 2,
    gap: 2,
  },
  half: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  halfBusiness: { backgroundColor: colors.amber, borderColor: colors.amber },
  halfPersonal: { backgroundColor: colors.personal, borderColor: colors.personalEdge },
  halfText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  halfTextBusiness: { color: colors.bg, fontFamily: fonts.bold },
  halfTextPersonal: { color: colors.text1, fontFamily: fonts.bold },
  auto: { fontSize: 11, fontFamily: fonts.bold, color: colors.bg },
});
