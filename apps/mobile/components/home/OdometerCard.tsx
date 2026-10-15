// The Odometer card on Home (15 Oct 2026): the running odometer of each
// vehicle with a reading (up to three, primary first), so a driver who fills
// in an employer's mileage form can read it without leaving Home. Same look as
// the shortcut rows below it. Tap opens the Odometer log for that vehicle;
// press and hold to hide it (Settings > Home screen brings it back).
// Free: readings and the log are free, only the odometer CSV is Pro.

import { useCallback } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { homeOdometerA11y, homeOdometerFigure, homeOdometerLine, type HomeOdometerRow } from "../../lib/home/odometerCard";
import { trackHomeTap } from "../../lib/home/trackHomeTap";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

interface Props {
  rows: HomeOdometerRow[];
  mode: "work" | "personal";
  state: string;
  onHide: () => void;
}

export function OdometerCard({ rows, mode, state, onHide }: Props) {
  const router = useRouter();

  const confirmHide = useCallback(() => {
    trackHomeTap("door_hide", mode, state);
    Alert.alert(
      "Hide the odometer?",
      "You can bring it back any time in Settings, under Home screen.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Hide it", style: "destructive", onPress: onHide },
      ]
    );
  }, [mode, state, onHide]);

  if (rows.length === 0) return null;
  const now = new Date();

  return (
    <View style={s.group}>
      {rows.map((row, i) => {
        const line = homeOdometerLine(row, now);
        return (
          <View key={row.vehicleId}>
            {i > 0 ? <View style={s.divider} /> : null}
            <Pressable
              onPress={() => {
                trackHomeTap("door_odometer", mode, state);
                router.push(`/odometer-log?vehicleId=${encodeURIComponent(row.vehicleId)}` as never);
              }}
              onLongPress={confirmHide}
              delayLongPress={450}
              style={({ pressed }) => [s.row, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={homeOdometerA11y(row, now)}
              accessibilityHint="Opens the odometer log. Press and hold to hide it."
              accessibilityActions={[{ name: "hide", label: "Hide the odometer" }]}
              onAccessibilityAction={confirmHide}
            >
              <Ionicons name="speedometer-outline" size={20} color={colors.text2} accessible={false} />
              <View style={s.body}>
                <Text style={s.label} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                  {row.name} odometer
                </Text>
                <View style={s.figureRow}>
                  <Text style={s.figure} maxFontSizeMultiplier={fontScaleCap.heading}>
                    {homeOdometerFigure(row.miles)}
                  </Text>
                  {row.isEstimated ? (
                    <Text style={s.est} maxFontSizeMultiplier={fontScaleCap.body}>
                      est.
                    </Text>
                  ) : null}
                </View>
                {line ? (
                  <Text style={s.line} maxFontSizeMultiplier={fontScaleCap.body}>
                    {line}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  body: { flex: 1 },
  label: { fontSize: 13, fontFamily: fonts.medium, color: colors.text2 },
  figureRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 },
  figure: { fontSize: 20, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"] },
  est: { fontSize: 13, fontFamily: fonts.medium, color: colors.text2 },
  line: { fontSize: 13, fontFamily: fonts.regular, color: colors.text3, marginTop: 2, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 52 },
});
