// The miles and the arrival, worked out and shown as a fact, not a field
// (PROPOSALS 0.6, decision G): "12.4 miles by road · Arrives about 09:01" with
// Change. Change opens the miles box and an "Arrived at" time. When the road
// distance can't be worked out (no signal, or the router has no answer) the
// line becomes the miles box and says why; the arrival is then start + typed
// miles at 30 mph, and says so.

import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import { clockTime } from "../../lib/trips/manualTimeRule";
import { TYPED_MILES_ASSUMED_MPH } from "../../lib/trips/missingReportRule";
import { TimeRow, type ClockValue } from "./TimeRow";
import { useDistanceUnit } from "../../lib/units/distanceUnit";

interface Props {
  hasFrom: boolean;
  hasTo: boolean;
  calculating: boolean;
  /** The miles the trip will save with. */
  distanceMiles: number | null;
  /** True when distanceMiles came from the road route. */
  routed: boolean;
  routeUnavailable: boolean;
  online: boolean;
  /** The driver is typing the miles. */
  typing: boolean;
  /** What the box holds, in the driver's unit (Distances in Settings). */
  milesText: string;
  onMilesText: (text: string) => void;
  onStartTyping: () => void;
  /** The typed figure can't be saved: the line saying why, or null. */
  rejectedText?: string | null;
  /** Back to the road distance, when there is one. */
  onUseRoad?: (() => void) | null;
  roadMiles?: number | null;
  departure: Date | null;
  arrival: Date | null;
  arrivalTouched: boolean;
  onArrival: (v: ClockValue) => void;
}

export function WorkedOutLine(p: Props) {
  const [open, setOpen] = useState(false);
  const dist = useDistanceUnit();
  // "Miles" on a miles phone, "Kilometres" on a km one.
  const Unit = dist.isKm ? "Kilometres" : "Miles";
  const unit = dist.isKm ? "kilometres" : "miles";
  const noRoute = p.hasTo && !p.calculating && p.routeUnavailable && !p.routed;
  const boxShown = open || p.typing || noRoute;

  if (!p.hasFrom && !p.hasTo && !p.typing) {
    return (
      <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
        {Unit} and arrival time are worked out once you&apos;ve said where and when.
      </Text>
    );
  }

  if (p.hasFrom && !p.hasTo && !p.typing) {
    return (
      <View style={styles.noteRow}>
        <Text style={[styles.note, styles.noteFlex]} maxFontSizeMultiplier={fontScaleCap.body}>
          Pick where you went and the {unit} are worked out for you.
        </Text>
        <TouchableOpacity onPress={p.onStartTyping} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Type the ${unit} instead`}>
          <Text style={styles.link} maxFontSizeMultiplier={fontScaleCap.body}>Type the {unit}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (p.calculating && !p.typing) {
    return (
      <View style={[styles.card, styles.row]} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.text2} />
        <Text style={styles.sub} maxFontSizeMultiplier={fontScaleCap.body}>Working out the road distance</Text>
      </View>
    );
  }

  const arrivalWords = p.arrival ? `Arrives about ${clockTime(p.arrival)}` : null;

  if (!boxShown && p.routed && p.distanceMiles != null) {
    const miles = dist.num(p.distanceMiles, { fixed: true });
    return (
      <View
        style={[styles.card, styles.row]}
        accessible
        accessibilityLabel={`${miles} ${dist.label("spoken")} by road${arrivalWords ? `, ${arrivalWords.toLowerCase()}` : ""}`}
        accessibilityActions={[{ name: "activate", label: "Change" }]}
        onAccessibilityAction={() => setOpen(true)}
        accessibilityHint={`Double tap to change the ${unit} or the arrival time`}
      >
        <Ionicons name="navigate-outline" size={22} color={colors.text2} accessible={false} />
        <View style={{ flex: 1 }}>
          <Text style={styles.main} maxFontSizeMultiplier={fontScaleCap.display}>
            <Text style={styles.miles}>{miles} {dist.label("word")}</Text>
            <Text style={styles.by}> by road</Text>
          </Text>
          {arrivalWords && (
            <Text style={styles.sub} maxFontSizeMultiplier={fontScaleCap.body}>{arrivalWords}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => setOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Change the ${unit} or the arrival time`}>
          <Text style={styles.change} maxFontSizeMultiplier={fontScaleCap.body}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const why = p.rejectedText
    ? p.rejectedText
    : !p.online
    ? "No signal, so we couldn't work out the road distance"
    : noRoute
      ? "We couldn't work out the road distance"
      : !p.hasTo
        ? "No end place, so type how far you drove"
        : null;

  return (
    <View style={styles.card}>
      <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>{Unit}</Text>
      <View style={styles.milesRow}>
        <TextInput
          style={styles.input}
          value={p.milesText}
          onChangeText={p.onMilesText}
          onFocus={() => {
            if (!p.typing) p.onStartTyping();
          }}
          keyboardType="decimal-pad"
          placeholder={p.roadMiles != null ? dist.value(p.roadMiles).toFixed(1) : "e.g. 12.5"}
          placeholderTextColor={colors.text3}
          maxLength={7}
          accessibilityLabel={why ? `${Unit}. ${why}` : `${Unit} driven`}
        />
        {why ? (
          <Text style={[styles.sub, styles.why]} maxFontSizeMultiplier={fontScaleCap.body}>{why}</Text>
        ) : p.routed && p.distanceMiles != null && !p.typing ? (
          <Text style={[styles.sub, styles.why]} maxFontSizeMultiplier={fontScaleCap.body}>
            {dist.fmt(p.distanceMiles, { fixed: true, style: "word" })} by road
          </Text>
        ) : null}
      </View>
      {p.typing && p.onUseRoad && p.roadMiles != null && (
        <TouchableOpacity onPress={p.onUseRoad} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Use the road distance, ${dist.fmt(p.roadMiles, { fixed: true, style: "spoken" })}`}>
          <Text style={[styles.link, { marginTop: 8 }]} maxFontSizeMultiplier={fontScaleCap.body}>
            Use the road distance ({dist.fmt(p.roadMiles, { fixed: true })})
          </Text>
        </TouchableOpacity>
      )}
      {p.departure && (
        <>
          <View style={styles.divider} />
          <TimeRow
            label="Arrived at"
            icon="flag-outline"
            value={p.arrival ? { hours: p.arrival.getHours(), minutes: p.arrival.getMinutes() } : null}
            onChange={p.onArrival}
            startAt={p.arrival ?? p.departure}
            placeholder="Choose a time"
            hint={
              p.arrival && !p.arrivalTouched && !p.routed
                ? `Worked out at ${TYPED_MILES_ASSUMED_MPH} mph. Change it if you know`
                : null
            }
          />
        </>
      )}
      {open && !p.typing && !noRoute && (
        <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Done changing">
          <Text style={[styles.link, { marginTop: 4 }]} maxFontSizeMultiplier={fontScaleCap.body}>Done</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  main: { color: colors.text1 },
  miles: { fontSize: 18, fontFamily: fonts.bold, color: colors.text1, fontVariant: ["tabular-nums"] },
  by: { fontSize: 16, fontFamily: fonts.regular, color: colors.text2 },
  sub: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  change: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text2 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, marginBottom: 8 },
  milesRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: {
    width: 130,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.amberGlow,
    backgroundColor: colors.bg,
    color: colors.text1,
    fontFamily: fonts.semibold,
    fontSize: 18,
    paddingHorizontal: 14,
  },
  why: { flex: 1, marginTop: 0 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginTop: 14 },
  link: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text2 },
  note: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, color: colors.text2, marginTop: 14, marginHorizontal: 4 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginHorizontal: 4 },
  noteFlex: { flex: 1, marginTop: 0, marginHorizontal: 0 },
});
