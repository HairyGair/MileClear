// The Insurance miles card on Home (Nov 2026): miles driven this insurance
// year against the driver's yearly limit, whether they are ahead of or behind
// an even pace, and the miles a day left. Only shows once a limit is set
// (More > Insurance miles); tapping opens that screen to change or remove it.
// Free. Counts every trip, business or personal: insurance covers all driving.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { fetchTripSummary } from "../../lib/api/trips";
import {
  a11yText,
  dayKey,
  figureText,
  insurancePeriod,
  insuranceProgress,
  isBehind,
  paceLine,
  renewsText,
  startsLater,
  startsText,
  type InsuranceMilesSetting,
} from "../../lib/insurance/miles";
import { getInsuranceMiles, insuranceVersion } from "../../lib/insurance/store";
import { trackHomeTap } from "../../lib/home/trackHomeTap";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

const MIN_GAP_MS = 15_000;

interface Data {
  setting: InsuranceMilesSetting;
  /** Null for a policy that has not started yet (nothing to count). */
  usedMiles: number | null;
}

/**
 * The setting from this phone (for this account), then the insurance year's
 * miles from the server. The setting is re-read on every focus, so a save or
 * remove shows straight away; only the server read is spaced out. Each load
 * is numbered and only the newest may write, so a slow reply cannot bring an
 * old setting back.
 */
function useInsuranceMiles(userId: string | null | undefined, refreshKey: number, tripKey: string): Data | null {
  const [data, setData] = useState<Data | null>(null);
  const lastAt = useRef(0);
  const lastSeen = useRef("");
  const seq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (force: boolean) => {
      const mine = ++seq.current;
      const live = () => mounted.current && mine === seq.current;
      const setting = await getInsuranceMiles(userId);
      if (!live()) return;
      if (!setting) {
        lastSeen.current = "";
        setData(null);
        return;
      }
      const now = new Date();
      if (startsLater(setting.startDate, now)) {
        lastSeen.current = "";
        setData({ setting, usedMiles: null });
        return;
      }
      const period = insurancePeriod(setting.startDate, now);
      if (!period) {
        setData(null);
        return;
      }
      const seen = `${insuranceVersion()}|${JSON.stringify(setting)}|${dayKey(now)}`;
      if (!force && seen === lastSeen.current && Date.now() - lastAt.current < MIN_GAP_MS) return;
      try {
        const res = await fetchTripSummary({
          from: period.start.toISOString(),
          to: now.toISOString(),
          ...(setting.vehicleId ? { vehicleId: setting.vehicleId } : {}),
        });
        if (!live()) return;
        lastAt.current = Date.now();
        lastSeen.current = seen;
        setData({ setting, usedMiles: res.data.totalMiles });
      } catch {
        // Keep what is showing, unless the setting itself changed.
        if (live() && seen !== lastSeen.current) setData(null);
      }
    },
    [userId]
  );

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );
  useEffect(() => {
    if (refreshKey > 0 || tripKey) load(true);
  }, [refreshKey, tripKey, load]);

  return data;
}

interface Props {
  mode: "work" | "personal";
  state: string;
  refreshKey: number;
  tripKey: string;
  userId: string | null | undefined;
  /** Spacing from the card above; only applied when the card shows. */
  style?: StyleProp<ViewStyle>;
}

export function InsuranceMilesCard({ mode, state, refreshKey, tripKey, userId, style }: Props) {
  const router = useRouter();
  const data = useInsuranceMiles(userId, refreshKey, tripKey);
  if (!data) return null;
  const now = new Date();
  const open = () => {
    trackHomeTap("insurance_miles", mode, state);
    router.push("/insurance-miles" as never);
  };

  const later = startsLater(data.setting.startDate, now);
  if (later || data.usedMiles === null) {
    const limit = `${data.setting.limitMiles.toLocaleString("en-GB")} miles a year`;
    const when = later ? startsText(later) : "";
    return (
      <View style={[s.group, style]}>
        <Pressable
          onPress={open}
          style={({ pressed }) => [s.row, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Insurance miles. ${limit}. ${when}.`}
          accessibilityHint="Opens Insurance miles to change or remove your limit."
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.text2} accessible={false} />
          <View style={s.body}>
            <Text style={s.label} maxFontSizeMultiplier={fontScaleCap.body}>
              Insurance miles
            </Text>
            <Text style={s.figure} maxFontSizeMultiplier={fontScaleCap.heading}>
              {limit}
            </Text>
            <Text style={s.line} maxFontSizeMultiplier={fontScaleCap.body}>
              {when}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
        </Pressable>
      </View>
    );
  }

  const period = insurancePeriod(data.setting.startDate, now);
  if (!period) return null;
  const pr = insuranceProgress(data.setting.limitMiles, data.usedMiles ?? 0, period);
  const behind = isBehind(pr, period);
  const barColour = pr.overLimit ? colors.red : behind ? colors.amber : colors.green;

  return (
    <View style={[s.group, style]}>
      <Pressable
        onPress={open}
        style={({ pressed }) => [s.row, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={a11yText(pr, period)}
        accessibilityHint="Opens Insurance miles to change or remove your limit."
      >
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.text2} accessible={false} />
        <View style={s.body}>
          <Text style={s.label} maxFontSizeMultiplier={fontScaleCap.body}>
            Insurance miles
          </Text>
          <Text style={s.figure} maxFontSizeMultiplier={fontScaleCap.heading}>
            {figureText(pr)}
          </Text>
          <View style={s.track} accessible={false}>
            <View style={[s.fill, { width: `${Math.max(2, pr.fraction * 100)}%`, backgroundColor: barColour }]} />
            {/* Where an even pace would be today. */}
            <View style={[s.paceMark, { left: `${Math.min(100, (period.dayNumber / period.days) * 100)}%` }]} />
          </View>
          <Text style={[s.line, behind && s.lineBehind]} maxFontSizeMultiplier={fontScaleCap.body}>
            {paceLine(pr)}
          </Text>
          <Text style={s.small} maxFontSizeMultiplier={fontScaleCap.body}>
            {renewsText(period)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
      </Pressable>
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
  figure: { fontSize: 20, fontFamily: fonts.semibold, color: colors.text1, fontVariant: ["tabular-nums"], marginTop: 2 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 8,
    overflow: "visible",
  },
  fill: { height: 6, borderRadius: 3 },
  paceMark: { position: "absolute", top: -3, width: 2, height: 12, marginLeft: -1, backgroundColor: colors.text2 },
  line: { fontSize: 13, fontFamily: fonts.medium, color: colors.text2, marginTop: 8, lineHeight: 18 },
  lineBehind: { color: colors.amber },
  small: { fontSize: 12, fontFamily: fonts.regular, color: colors.text3, marginTop: 2 },
});
