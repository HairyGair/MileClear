// "When" on the add-trip form (PROPOSALS 0.3, A.1 row 4): day chips (Today,
// Yesterday, Pick a day) and then "Set off at" with an hour and minute wheel.
// Nothing is chosen when the form opens: 61% of hand-added trips are from an
// earlier day, so a default of "now" was wrong far more often than right.

import { useState, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import {
  addLocalDays,
  dayLabel,
  departureFor,
  isFutureDeparture,
  selectedDayChip,
  startOfLocalDay,
  type DayTrip,
} from "../../lib/trips/pastTripRule";
import { shortDay } from "../../lib/tracking/pauseRule";
import { DayPickerSheet } from "./DayPickerSheet";
import { TimeRow, type ClockValue } from "./TimeRow";

interface Props {
  day: Date | null;
  onDay: (day: Date) => void;
  time: ClockValue | null;
  onTime: (v: ClockValue) => void;
  now: Date;
  /** Where the time wheel starts when nothing is set ("after 09:01"). */
  timeStartsAt?: Date | null;
  /** A grey line under "Set off at". */
  timeHint?: string | null;
  disabled?: boolean;
  /** Lines under the time: the overlap line, what else is on that day. */
  children?: ReactNode;
  /** For the calendar's dots. */
  loadTrips?: (from: Date, to: Date) => Promise<DayTrip[]>;
}

export function WhenCard({ day, onDay, time, onTime, now, timeStartsAt, timeHint, disabled, children, loadTrips }: Props) {
  const [calendar, setCalendar] = useState(false);
  const today = startOfLocalDay(now);
  const yesterday = addLocalDays(today, -1);
  const chip = selectedDayChip(day, now);

  const base = day ?? today;
  const wheelStart = timeStartsAt ?? (chip === "today" || !day ? roundedDown(now) : departureFor(base, 9, 0));
  const departure = day && time ? departureFor(day, time.hours, time.minutes) : null;
  const future = departure ? isFutureDeparture(departure, now) : false;

  const dayChip = (key: "today" | "yesterday", d: Date) => {
    const on = chip === key;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.chip, on && styles.chipOn]}
        onPress={() => onDay(d)}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${dayLabel(d, now)}, ${shortDay(d)}`}
        accessibilityState={{ selected: on }}
      >
        <Text style={[styles.chipText, on && styles.chipTextOn]} maxFontSizeMultiplier={fontScaleCap.body}>
          {dayLabel(d, now)}
        </Text>
      </TouchableOpacity>
    );
  };

  const pickedOn = chip === "picked" && day != null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>When</Text>
      <View style={styles.chipRow}>
        {dayChip("today", today)}
        {dayChip("yesterday", yesterday)}
        <TouchableOpacity
          style={[styles.chip, pickedOn ? styles.chipOn : styles.chipQuiet]}
          onPress={() => setCalendar(true)}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={pickedOn ? `${shortDay(day!)}, picked. Double tap to pick another day` : "Pick a day"}
          accessibilityState={{ selected: pickedOn }}
        >
          <Ionicons name="calendar-outline" size={16} color={pickedOn ? colors.bg : colors.text2} accessible={false} />
          <Text
            style={[styles.chipText, pickedOn ? styles.chipTextOn : styles.chipTextQuiet]}
            maxFontSizeMultiplier={fontScaleCap.body}
          >
            {pickedOn ? shortDay(day!) : "Pick a day"}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.divider} />
      <TimeRow
        label="Set off at"
        value={time}
        onChange={onTime}
        startAt={wheelStart}
        maximum={chip === "today" ? now : null}
        hint={timeHint}
        disabled={disabled}
      />
      {future && (
        <Text style={styles.warn} accessibilityLiveRegion="polite" maxFontSizeMultiplier={fontScaleCap.body}>
          That&apos;s later than now. Pick when you set off.
        </Text>
      )}
      {children}

      <DayPickerSheet
        visible={calendar}
        value={day}
        now={now}
        loadTrips={loadTrips}
        onClose={() => setCalendar(false)}
        onUse={(d) => {
          setCalendar(false);
          onDay(startOfLocalDay(d));
        }}
      />
    </View>
  );
}

/** Now, to the five minutes below, so the wheel opens on a round time. */
function roundedDown(now: Date): Date {
  const d = new Date(now);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 12, paddingBottom: 4 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  chipQuiet: { backgroundColor: "transparent" },
  chipOn: { backgroundColor: colors.text1, borderColor: colors.text1 },
  chipText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1 },
  chipTextQuiet: { color: colors.text2 },
  chipTextOn: { color: colors.bg },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginTop: 14 },
  warn: { fontSize: 13, fontFamily: fonts.medium, color: colors.amber, marginBottom: 8 },
});
