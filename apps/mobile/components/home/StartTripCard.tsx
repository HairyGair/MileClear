// Home's "Trip in progress" card (rules in lib/home/startTripCard.ts): while a
// Start Trip runs, the trip and its I've Arrived stay on Home until it is
// finished. The card opens the trip's own screen; I've Arrived asks that
// screen to run its Arrived, so there is one save path.

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StartTripCardModel } from "../../lib/home/startTripCard";
import { colors, fonts, fontScaleCap, heroCard } from "../../lib/theme";

interface Props {
  model: StartTripCardModel;
  onOpen: () => void;
  onArrived: () => void;
}

export function StartTripCard({ model, onOpen, onArrived }: Props) {
  return (
    <View style={s.card}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [s.main, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={model.a11yLabel}
        accessibilityHint="Opens the trip being recorded"
      >
        <View style={s.textWrap}>
          <Text style={s.title} maxFontSizeMultiplier={fontScaleCap.body}>
            {model.title}
          </Text>
          <Text style={s.detail} maxFontSizeMultiplier={fontScaleCap.body}>
            {model.detail}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
      </Pressable>
      <Pressable
        onPress={onArrived}
        style={({ pressed }) => [s.arrive, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel="I've Arrived"
        accessibilityHint="Opens the trip to finish and save it"
      >
        <Text style={s.arriveText} maxFontSizeMultiplier={fontScaleCap.body}>
          I've Arrived
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 12,
    backgroundColor: heroCard.tint,
    borderColor: heroCard.border,
    borderWidth: 1,
    borderRadius: heroCard.radius,
    padding: 16,
    gap: 12,
  },
  main: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  pressed: { opacity: 0.85 },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2 },
  detail: {
    marginTop: 2,
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.text1,
    fontVariant: ["tabular-nums"],
  },
  arrive: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  arriveText: { fontSize: 16, fontFamily: fonts.bold, color: colors.bg },
});
