// "Set off at" on the add-trip form (PROPOSALS 0.3): an hour and minute
// wheel only, the day is the chips above. Nothing is set until the driver
// picks, so there is no "now" to undo. Also used for "Arrived at" when the
// driver changes the worked-out arrival.
//
// iOS: a sheet with the time wheel (same sheet as DateTimePickerField).
// Android: the clock dialog, opened imperatively for the reasons given in
// DateTimePickerField (a re-render must not reset a dialog that is up).
// Expo Go without the native picker: a typed HH:MM.

import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap } from "../../lib/theme";
import { AppModal } from "../AppModal";
import { isPickerSet } from "../../lib/dateTimePick";
import { clockTime } from "../../lib/trips/manualTimeRule";

let DateTimePicker: any = null;
let DateTimePickerAndroid: any = null;
try {
  const mod = require("@react-native-community/datetimepicker");
  DateTimePicker = mod.default;
  DateTimePickerAndroid = mod.DateTimePickerAndroid ?? null;
} catch {
  // Expo Go: typed fallback below.
}

export interface ClockValue {
  hours: number;
  minutes: number;
}

interface Props {
  label: string;
  value: ClockValue | null;
  onChange: (v: ClockValue) => void;
  /** Where the wheel starts when nothing is set yet. */
  startAt: Date;
  /** The latest time the wheel offers (today: now). */
  maximum?: Date | null;
  placeholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  /** A grey line under the row ("after 09:01"). */
  hint?: string | null;
}

function parseClock(text: string): ClockValue | null {
  const m = text.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function asDate(base: Date, v: ClockValue): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), v.hours, v.minutes, 0, 0);
}

export function TimeRow({ label, value, onChange, startAt, maximum, placeholder = "Choose a time", icon = "time-outline", disabled, hint }: Props) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<Date>(startAt);
  const [typed, setTyped] = useState(value ? clockTime(asDate(startAt, value)) : "");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const androidOpen = useRef(false);
  useEffect(
    () => () => {
      if (androidOpen.current && DateTimePickerAndroid) DateTimePickerAndroid.dismiss("time");
    },
    []
  );

  const shown = value ? clockTime(asDate(startAt, value)) : null;

  const openPicker = () => {
    if (disabled) return;
    const start = value ? asDate(startAt, value) : startAt;
    if (Platform.OS === "android" && DateTimePickerAndroid) {
      androidOpen.current = true;
      DateTimePickerAndroid.open({
        value: start,
        mode: "time",
        display: "default",
        is24Hour: true,
        onChange: (event: { type?: string }, time?: Date) => {
          androidOpen.current = false;
          if (!isPickerSet(event, time)) return;
          onChangeRef.current({ hours: time.getHours(), minutes: time.getMinutes() });
        },
      });
      return;
    }
    setTemp(start);
    setOpen(true);
  };

  if (!DateTimePicker) {
    return (
      <View style={styles.row}>
        <Ionicons name={icon} size={22} color={colors.text2} accessible={false} />
        <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
        <TextInput
          style={styles.typed}
          value={typed}
          onChangeText={(t) => {
            setTyped(t);
            const v = parseClock(t);
            if (v) onChange(v);
          }}
          placeholder="HH:MM"
          placeholderTextColor={colors.text3}
          editable={!disabled}
          accessibilityLabel={`${label}, hours and minutes`}
        />
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.row, disabled && styles.disabled]}
        onPress={openPicker}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown ?? "not set"}. Double tap to ${shown ? "change" : "choose"}`}
      >
        <Ionicons name={icon} size={22} color={colors.text2} accessible={false} />
        <View style={styles.labelWrap}>
          <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
          {hint ? (
            <Text style={styles.hint} maxFontSizeMultiplier={fontScaleCap.body}>{hint}</Text>
          ) : null}
        </View>
        <Text
          style={shown ? styles.value : styles.placeholder}
          maxFontSizeMultiplier={shown ? fontScaleCap.display : fontScaleCap.body}
        >
          {shown ?? placeholder}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={colors.text3} accessible={false} />
      </TouchableOpacity>

      {Platform.OS === "ios" && (
        <AppModal visible={open} onRequestClose={() => setOpen(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet} accessibilityViewIsModal>
              <View style={styles.handle} />
              <View style={styles.header}>
                <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Cancel">
                  <Text style={styles.cancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{label}</Text>
                <TouchableOpacity
                  onPress={() => {
                    onChange({ hours: temp.getHours(), minutes: temp.getMinutes() });
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Set ${label} to ${clockTime(temp)}`}
                >
                  <Text style={styles.done}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={temp}
                mode="time"
                display="spinner"
                is24Hour
                locale="en-GB"
                onChange={(_: unknown, d?: Date) => {
                  if (d) setTemp(d);
                }}
                maximumDate={maximum ?? undefined}
                themeVariant="dark"
                textColor="#ffffff"
              />
            </View>
          </View>
        </AppModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 10 },
  disabled: { opacity: 0.5 },
  labelWrap: { flex: 1 },
  label: { fontSize: 16, fontFamily: fonts.medium, color: colors.text1 },
  hint: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  value: { fontSize: 22, fontFamily: fonts.bold, color: colors.text1, fontVariant: ["tabular-nums"] },
  placeholder: { fontSize: 16, fontFamily: fonts.regular, color: colors.text2 },
  typed: {
    marginLeft: "auto",
    minWidth: 90,
    textAlign: "right",
    fontSize: 18,
    fontFamily: fonts.semibold,
    color: colors.text1,
    paddingVertical: 6,
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderBottomWidth: 0,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cancel: { fontSize: 16, fontFamily: fonts.regular, color: colors.text3 },
  title: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  done: { fontSize: 16, fontFamily: fonts.bold, color: colors.amber },
});
