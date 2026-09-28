// "When did you make this drive?" A gap offer only knows the drive happened
// somewhere between two trips, so before it is added the driver says when
// they set off, with the picker held inside the window. The rules (bounds,
// words, the trip's times) are in lib/trips/missedJourneyWindow.ts.
//
// Nothing is picked for the driver. The old flow quietly used the start of
// the window, which is the one moment the drive cannot have been (Elisa
// Barone, 28 Sep 2026: saved at 07:07, driven at 17:30). The Continue button
// waits until a time has been chosen.
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from "react-native";
import { colors, fonts } from "../lib/theme";
import { AppModal } from "./AppModal";
import { clockTime } from "../lib/trips/manualTimeRule";
import { shortDay } from "../lib/tracking/pauseRule";
import {
  checkChosenStart,
  describeStartRange,
  describeTravel,
  describeWindow,
  startBounds,
  type OfferWindow,
} from "../lib/trips/missedJourneyWindow";

// Lazy import for Expo Go compatibility, the same guard DateTimePickerField uses.
let DateTimePicker: any = null;
try {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  // No native picker: the sheet falls back to 15-minute steps.
}

const STEP_MS = 15 * 60 * 1000;

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function whenLabel(d: Date): string {
  return `${clockTime(d)} on ${shortDay(d)}`;
}

export interface MissedJourneyTimeSheetProps {
  visible: boolean;
  fromLabel: string;
  toLabel: string;
  window: OfferWindow;
  travelMs: number;
  /** True while the parent checks for a clash and opens the form. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (start: Date) => void;
}

export function MissedJourneyTimeSheet({
  visible,
  fromLabel,
  toLabel,
  window,
  travelMs,
  busy,
  onCancel,
  onConfirm,
}: MissedJourneyTimeSheetProps) {
  const depMs = window.departedAt.getTime();
  const arrMs = window.arrivedAt.getTime();
  const bounds = useMemo(
    () => startBounds({ departedAt: new Date(depMs), arrivedAt: new Date(arrMs) }, travelMs),
    [depMs, arrMs, travelMs]
  );
  const [chosen, setChosen] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iosOpen, setIosOpen] = useState(false);
  const [androidStep, setAndroidStep] = useState<null | "date" | "time">(null);
  const [androidDay, setAndroidDay] = useState<Date | null>(null);

  // A fresh question every time the sheet opens for an offer.
  useEffect(() => {
    if (visible) {
      setChosen(null);
      setError(null);
      setIosOpen(false);
      setAndroidStep(null);
      setAndroidDay(null);
    }
  }, [visible, depMs, arrMs]);

  const rangeText = describeStartRange(bounds);
  // rangeText reads "any time from 07:08 to 17:15" (see describeStartRange).
  const outsideText = `That time doesn't fit. You can set off ${rangeText}.`;

  const take = (d: Date) => {
    if (checkChosenStart(d, bounds) === "ok") {
      setChosen(d);
      setError(null);
    } else {
      setChosen(null);
      setError(outsideText);
    }
  };

  const openPicker = () => {
    if (!DateTimePicker) {
      if (!chosen) take(bounds.earliest);
      return;
    }
    if (Platform.OS === "ios") {
      setIosOpen(true);
      // The spinner shows a time as soon as it opens; opening it is the
      // driver choosing to set one, so that is what we hold.
      if (!chosen) take(bounds.earliest);
      return;
    }
    setAndroidDay(null);
    setAndroidStep(sameLocalDay(bounds.earliest, bounds.latest) ? "time" : "date");
  };

  const step = (dir: 1 | -1) => {
    const base = chosen ?? bounds.earliest;
    const next = new Date(
      Math.min(bounds.latest.getTime(), Math.max(bounds.earliest.getTime(), base.getTime() + dir * STEP_MS))
    );
    take(next);
  };

  const onAndroidChange = (event: { type?: string }, date?: Date) => {
    if (!date || event?.type === "dismissed") {
      setAndroidStep(null);
      return;
    }
    if (androidStep === "date") {
      setAndroidDay(date);
      setAndroidStep("time");
      return;
    }
    const day = androidDay ?? bounds.earliest;
    const picked = new Date(day.getFullYear(), day.getMonth(), day.getDate(), date.getHours(), date.getMinutes());
    setAndroidStep(null);
    take(picked);
  };

  return (
    <AppModal visible={visible} onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.title}>When did you make this drive?</Text>
          <Text style={styles.body}>
            You drove from {fromLabel} to {toLabel} {describeWindow(window)}, but we don't know exactly when.
            Pick the time you set off and we'll add it then.
          </Text>
          <Text style={styles.hint}>
            The drive takes {describeTravel(travelMs)}, so it can start {rangeText}.
          </Text>

          <Text style={styles.label}>Set off at</Text>
          {DateTimePicker ? (
            <TouchableOpacity
              style={styles.field}
              onPress={openPicker}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={chosen ? `Set off at ${whenLabel(chosen)}. Tap to change` : "Choose a time"}
            >
              <Text style={chosen ? styles.fieldText : styles.fieldPlaceholder}>
                {chosen ? whenLabel(chosen) : "Choose a time"}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.stepRow}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => step(-1)} accessibilityLabel="15 minutes earlier">
                <Text style={styles.stepText}>- 15 min</Text>
              </TouchableOpacity>
              <Text style={[styles.fieldText, styles.stepValue]}>{chosen ? whenLabel(chosen) : "Choose a time"}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => step(1)} accessibilityLabel="15 minutes later">
                <Text style={styles.stepText}>+ 15 min</Text>
              </TouchableOpacity>
            </View>
          )}

          {DateTimePicker && Platform.OS === "ios" && iosOpen && (
            <DateTimePicker
              value={chosen ?? bounds.earliest}
              mode="datetime"
              display="spinner"
              minimumDate={bounds.earliest}
              maximumDate={bounds.latest}
              onChange={(_: unknown, date?: Date) => {
                if (date) take(date);
              }}
              themeVariant="dark"
              textColor="#ffffff"
            />
          )}
          {DateTimePicker && Platform.OS !== "ios" && androidStep && (
            <DateTimePicker
              value={androidStep === "date" ? bounds.earliest : (chosen ?? bounds.earliest)}
              mode={androidStep}
              display="default"
              minimumDate={androidStep === "date" ? bounds.earliest : undefined}
              maximumDate={androidStep === "date" ? bounds.latest : undefined}
              onChange={onAndroidChange}
            />
          )}

          {error != null && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primary, (!chosen || busy) && styles.primaryDisabled]}
              onPress={() => chosen && onConfirm(chosen)}
              disabled={!chosen || busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: !chosen || !!busy }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Text style={styles.primaryText}>Continue</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={onCancel} activeOpacity={0.7} accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    color: colors.text1,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  body: {
    color: colors.text2,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  hint: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 8,
  },
  label: {
    color: colors.text2,
    fontFamily: fonts.semibold,
    fontSize: 14,
    marginTop: 18,
    marginBottom: 6,
  },
  field: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  fieldText: {
    color: colors.text1,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  fieldPlaceholder: {
    color: colors.amber,
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  stepText: {
    color: colors.text2,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  stepValue: {
    flex: 1,
    textAlign: "center",
  },
  error: {
    color: colors.red,
    fontFamily: fonts.medium,
    fontSize: 13,
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  primary: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.amber,
  },
  primaryDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    color: colors.bg,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  secondary: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  secondaryText: {
    color: colors.text2,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
});
