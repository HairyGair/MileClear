// "Which day?" for the add-trip form (PROPOSALS 0.3): a calendar, Monday
// first, not a date wheel, so back-filling August is a few taps instead of
// seventy flicks. Future days are greyed and can't be picked; today is ringed.
// A dot under a day means MileClear already has a trip then, so the empty
// days stand out (the phone's trips, and the server's for months older than
// the phone holds).

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppModal } from "../AppModal";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import {
  calendarDayLine,
  isFutureDay,
  localDayKey,
  monthGrid,
  monthTitle,
  sameLocalDay,
  tripDayKeys,
  type DayTrip,
} from "../../lib/trips/pastTripRule";
import { shortDay } from "../../lib/tracking/pauseRule";

export interface MonthTrips {
  trips: DayTrip[];
  incomplete: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  visible: boolean;
  value: Date | null;
  now: Date;
  onUse: (day: Date) => void;
  onClose: () => void;
  /** The trips that start in [from, to), for the dots and the day's line.
   *  `incomplete` when some of them could not be checked (an older month
   *  with no signal, or the server didn't answer). */
  loadTrips?: (from: Date, to: Date) => Promise<MonthTrips>;
}

export function DayPickerSheet({ visible, value, now, onUse, onClose, loadTrips }: Props) {
  const start = value ?? now;
  const [year, setYear] = useState(start.getFullYear());
  const [month, setMonth] = useState(start.getMonth());
  const [picked, setPicked] = useState<Date | null>(value);

  useEffect(() => {
    if (!visible) return;
    const s = value ?? now;
    setYear(s.getFullYear());
    setMonth(s.getMonth());
    setPicked(value);
    // Only on opening: the driver moves months from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // This month's trips, for the dots. Kept per month while the sheet is open.
  const [monthTrips, setMonthTrips] = useState<{ key: string; trips: DayTrip[]; incomplete: boolean } | null>(null);
  const monthKey = `${year}-${month}`;
  useEffect(() => {
    if (!visible || !loadTrips) return;
    let cancelled = false;
    loadTrips(new Date(year, month, 1), new Date(year, month + 1, 1))
      .then((r) => {
        if (!cancelled) setMonthTrips({ key: `${year}-${month}`, trips: r.trips, incomplete: r.incomplete });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, loadTrips, year, month]);
  const loaded = monthTrips?.key === monthKey ? monthTrips : null;
  // Some of the month couldn't be checked: the dots it has are real, but an
  // empty day may not be empty, so the sheet says so and never "has none".
  const unchecked = loaded?.incomplete === true;
  const trips = loaded ? loaded.trips : null;
  const dots = trips ? tripDayKeys(trips) : null;

  const atThisMonth = year === now.getFullYear() && month === now.getMonth();
  const step = (n: number) => {
    const d = new Date(year, month + n, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  // Always six rows, so the sheet keeps its height from month to month and
  // the arrows stay under the driver's thumb while they tap back through
  // the months.
  const weeks = monthGrid(year, month);
  while (weeks.length < 6) weeks.push([null, null, null, null, null, null, null]);
  const pickedHere = picked != null && trips != null && picked.getMonth() === month && picked.getFullYear() === year;
  const pickedHasTrips = pickedHere && trips!.some((t) => sameLocalDay(new Date(t.startedAt), picked!));
  const dayLine = pickedHere && (!unchecked || pickedHasTrips) ? calendarDayLine(picked!, trips!) : null;

  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessible={false} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
            Which day?
          </Text>
          {loadTrips && (
            <Text style={styles.sub} accessibilityLiveRegion="polite" maxFontSizeMultiplier={fontScaleCap.body}>
              {unchecked
                ? "Couldn't check this month's trips just now."
                : "Days with a dot already have trips."}
            </Text>
          )}

          <View style={styles.monthRow}>
            <TouchableOpacity
              style={styles.monthBtn}
              onPress={() => step(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={20} color={colors.text1} accessible={false} />
            </TouchableOpacity>
            <Text style={styles.monthTitle} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
              {monthTitle(year, month)}
            </Text>
            <TouchableOpacity
              style={[styles.monthBtn, atThisMonth && styles.monthBtnOff]}
              onPress={() => step(1)}
              disabled={atThisMonth}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              accessibilityState={{ disabled: atThisMonth }}
            >
              <Ionicons name="chevron-forward" size={20} color={atThisMonth ? colors.text3 : colors.text1} accessible={false} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekday} maxFontSizeMultiplier={fontScaleCap.none}>
                {w}
              </Text>
            ))}
          </View>
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.weekRow}>
              {week.map((d, di) => {
                if (!d) return <View key={di} style={styles.cell} />;
                const future = isFutureDay(d, now);
                const isToday = sameLocalDay(d, now);
                const isPicked = picked != null && sameLocalDay(d, picked);
                const hasTrips = dots?.has(localDayKey(d)) ?? false;
                return (
                  <TouchableOpacity
                    key={di}
                    style={styles.cell}
                    onPress={() => setPicked(d)}
                    disabled={future}
                    accessibilityRole="button"
                    accessibilityLabel={`${shortDay(d)}${isToday ? ", today" : ""}${hasTrips ? ", has trips" : ""}`}
                    accessibilityState={{ selected: isPicked, disabled: future }}
                  >
                    <View style={[styles.dayCircle, isToday && styles.todayRing, isPicked && styles.pickedCircle]}>
                      <Text
                        style={[styles.dayText, future && styles.futureText, isPicked && styles.pickedText]}
                        maxFontSizeMultiplier={fontScaleCap.none}
                      >
                        {d.getDate()}
                      </Text>
                    </View>
                    <View style={[styles.dot, !hasTrips && styles.dotOff]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* The line's space is kept when it is empty, for the same reason. */}
          <Text
            style={styles.dayLine}
            accessible={dayLine != null}
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={fontScaleCap.body}
          >
            {dayLine ?? " "}
          </Text>
          <TouchableOpacity
            style={[styles.use, !picked && styles.useOff]}
            disabled={!picked}
            onPress={() => {
              if (picked) onUse(picked);
            }}
            accessibilityRole="button"
            accessibilityLabel={picked ? `Use ${shortDay(picked)}` : "Pick a day first"}
          >
            <Text style={styles.useText} maxFontSizeMultiplier={fontScaleCap.body}>
              {picked ? `Use ${shortDay(picked)}` : "Pick a day"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelText} maxFontSizeMultiplier={fontScaleCap.body}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.surfaceBorder,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 22, fontFamily: fonts.bold, color: colors.text1 },
  sub: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.text3, marginTop: 1 },
  dotOff: { backgroundColor: "transparent" },
  dayLine: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1, marginTop: 12 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 8 },
  monthBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  monthBtnOff: { opacity: 0.4 },
  monthTitle: { fontSize: 18, fontFamily: fonts.semibold, color: colors.text1 },
  weekRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 12, fontFamily: fonts.medium, color: colors.text2, paddingVertical: 6 },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 50 },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  todayRing: { borderWidth: 1, borderColor: colors.text3 },
  pickedCircle: { backgroundColor: colors.text1 },
  dayText: { fontSize: 16, fontFamily: fonts.medium, color: colors.text1, fontVariant: ["tabular-nums"] },
  futureText: { color: colors.text3, opacity: 0.5 },
  pickedText: { color: colors.bg, fontFamily: fonts.bold },
  use: { marginTop: 14, minHeight: 52, borderRadius: radii.md, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center" },
  useOff: { opacity: 0.5 },
  useText: { fontSize: 16, fontFamily: fonts.bold, color: colors.bg },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
  cancelText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text2 },
});
