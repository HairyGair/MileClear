import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { AppModal } from "../AppModal";
import { Button } from "../Button";
import { DateTimePickerField } from "../DateTimePickerField";
import { OdometerFigure, StatusChip } from "./OdometerFigure";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import {
  addOdometerReading,
  fetchVehicleOdometer,
  ReadingConflictError,
  type VehicleOdometer,
} from "../../lib/api/odometer";
import { fetchMotHistory } from "../../lib/api/vehicles";
import {
  checkReading,
  earliestReadAt,
  formatOdo,
  isNetworkError,
  classifyConflict,
  higherThanLaterAlert,
  type ReadingConflict,
  liveHint,
  basisText,
  latestAcceptedBefore,
  lowerThanEarlierAlert,
  motHintText,
  parseReadingInput,
  pickMotHint,
  sanitiseReadingInput,
  saveOutcomeMessage,
  type MotHint,
} from "../../lib/odometer/logic";

export interface UpdateReadingVehicle {
  id: string;
  /** "Ford Focus" */
  name: string;
  registrationPlate?: string | null;
  createdAt?: string | null;
}

interface Props {
  visible: boolean;
  vehicle: UpdateReadingVehicle | null;
  onClose: () => void;
  /** Called after a successful save with the outcome line for the card. */
  onSaved: (message: string) => void;
  /** "See readings" in the lower-than-earlier alert. */
  onSeeReadings?: () => void;
}

const MOT_TIMEOUT_MS = 2000;

/** Update odometer sheet (SPEC-UX 1.3). Used by the vehicle screen, the log and the Home prompt. */
export function UpdateReadingSheet({ visible, vehicle, onClose, onSaved, onSeeReadings }: Props) {
  const [text, setText] = useState("");
  const [readAt, setReadAt] = useState<Date>(() => new Date());
  const [touchedTime, setTouchedTime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [odo, setOdo] = useState<VehicleOdometer | null>(null);
  const [mot, setMot] = useState<MotHint | null>(null);
  const loadRef = useRef<Promise<VehicleOdometer | null> | null>(null);
  const vehicleId = vehicle?.id ?? null;
  const plate = vehicle?.registrationPlate ?? null;

  useEffect(() => {
    if (!visible || !vehicleId) return;
    setText("");
    setReadAt(new Date());
    setTouchedTime(false);
    setError(null);
    setSaving(false);
    setOdo(null);
    setMot(null);
    let cancelled = false;
    const p = fetchVehicleOdometer(vehicleId)
      .then((res) => {
        if (!cancelled) setOdo(res.data);
        return res.data;
      })
      .catch(() => null);
    loadRef.current = p;
    if (plate) {
      // The MOT hint must never slow the sheet: give up after two seconds.
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), MOT_TIMEOUT_MS));
      Promise.race([fetchMotHistory(vehicleId).then((r) => r.data), timeout])
        .then((data) => {
          if (!cancelled && data) setMot(pickMotHint(data.motTests));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [visible, vehicleId, plate]);

  const hint = liveHint({
    text,
    estimateMiles: odo?.current?.miles ?? null,
    earlier: latestAcceptedBefore(odo?.readings ?? [], touchedTime ? readAt : new Date()),
  });
  const hasReading = !!odo?.current;

  const showBlocked = useCallback((earlier: { miles: number; at: Date } | null) => {
    const copy = earlier
      ? lowerThanEarlierAlert(earlier.miles, earlier.at)
      : {
          title: "That's lower than an earlier reading",
          body: "Odometers don't go backwards. If the earlier reading was wrong, delete it first.",
        };
    Alert.alert(copy.title, copy.body, [
      { text: "Check the number", style: "cancel" },
      {
        text: "See readings",
        onPress: () => {
          onClose();
          onSeeReadings?.();
        },
      },
    ]);
  }, [onClose, onSeeReadings]);

  const finishSave = useCallback(
    async (miles: number, at: Date) => {
      if (!vehicleId) return;
      setSaving(true);
      try {
        const res = await addOdometerReading(vehicleId, { readingMiles: miles, readAt: at.toISOString() });
        // The server reports the figure our trips gave just before this reading.
        const message = saveOutcomeMessage(res.data.estimatedMiles ?? null, miles);
        setSaving(false);
        onSaved(message);
        onClose();
      } catch (err) {
        setSaving(false);
        if (err instanceof ReadingConflictError) {
          // The 409 body is dropped by apiRequest: re-read the list to tell
          // which rule refused it and to name the other reading.
          let conflict: ReadingConflict | null = null;
          try {
            const fresh = await fetchVehicleOdometer(vehicleId);
            conflict = classifyConflict(fresh.data.readings, miles, at);
          } catch {}
          if (conflict?.kind === "higher") {
            const copy = higherThanLaterAlert(conflict.otherMiles, conflict.otherAt);
            Alert.alert(copy.title, copy.body, [
              { text: "Check the number", style: "cancel" },
              {
                text: "See readings",
                onPress: () => {
                  onClose();
                  onSeeReadings?.();
                },
              },
            ]);
          } else {
            showBlocked(conflict ? { miles: conflict.otherMiles, at: conflict.otherAt } : null);
          }
          return;
        }
        if (isNetworkError(err)) {
          Alert.alert(
            "You're offline",
            "Connect to the internet and try again. Your trips are still being recorded."
          );
        } else {
          Alert.alert("Couldn't save that", "Please try again in a moment.");
        }
      }
    },
    [vehicleId, onSaved, onClose, onSeeReadings, showBlocked]
  );

  const handleSave = useCallback(async () => {
    if (saving || !vehicle) return;
    // Wait for the estimate so the checks have something to compare with.
    const data = odo ?? (await loadRef.current);
    const now = new Date();
    const at = touchedTime ? readAt : now;
    if (at.getTime() < earliestReadAt(vehicle.createdAt, now).getTime()) {
      setError("That date is too far back.");
      return;
    }
    const estimateNow = data?.current?.miles ?? null;
    const result = checkReading({
      text,
      readAt: at,
      now: new Date(now.getTime() + 60_000), // a minute of slack for the picker's seconds
      estimateMiles: estimateNow,
      readings: data?.readings ?? [],
      mot,
    });
    if (result.kind === "error") {
      setError(result.message);
      return;
    }
    setError(null);
    const parsed = parseReadingInput(text);
    if (parsed.kind !== "ok") return;
    if (result.kind === "blocked") {
      showBlocked({ miles: result.earlierMiles, at: result.earlierAt });
      return;
    }
    if (result.kind === "confirm") {
      Alert.alert(result.title, result.body, [
        { text: "Fix it", style: "cancel" },
        { text: "Yes, it's right", onPress: () => finishSave(parsed.miles, at) },
      ]);
      return;
    }
    await finishSave(parsed.miles, at);
  }, [saving, vehicle, odo, touchedTime, readAt, text, mot, finishSave, showBlocked]);

  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.heading}>
              Update odometer
            </Text>
            {vehicle ? (
              <Text style={styles.vehicle} maxFontSizeMultiplier={fontScaleCap.body}>
                {vehicle.name}
              </Text>
            ) : null}

            <Text style={styles.label} maxFontSizeMultiplier={fontScaleCap.body}>Reading</Text>
            <View style={[styles.inputWrap, error ? styles.inputWrapError : hint?.tone === "warn" ? styles.inputWrapWarn : null]}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={(t) => {
                  setText(sanitiseReadingInput(t));
                  if (error) setError(null);
                }}
                keyboardType="decimal-pad"
                inputMode="decimal"
                returnKeyType="done"
                maxLength={9}
                autoFocus
                autoComplete="off"
                textContentType="none"
                placeholder="e.g. 45100"
                placeholderTextColor={colors.text3}
                accessibilityLabel="Odometer reading in miles"
                accessibilityHint="What your dashboard shows now"
                maxFontSizeMultiplier={fontScaleCap.display}
              />
              <Text style={styles.suffix} maxFontSizeMultiplier={fontScaleCap.body}>miles</Text>
            </View>
            {error ? (
              <Text style={styles.error} accessibilityLiveRegion="polite" accessibilityRole="alert" maxFontSizeMultiplier={fontScaleCap.body}>
                {error}
              </Text>
            ) : null}
            {odo?.current ? (
              <View style={styles.panel}>
                <Text style={styles.panelLabel} maxFontSizeMultiplier={fontScaleCap.body}>
                  {odo.current.isEstimated ? "We estimate" : "Your last reading"}
                </Text>
                <View style={styles.panelRow}>
                  <OdometerFigure
                    size="compact"
                    miles={odo.current.miles}
                    accessibilityLabel={
                      odo.current.isEstimated
                        ? `We estimate about ${formatOdo(odo.current.miles)} miles`
                        : `Your last reading, ${formatOdo(odo.current.miles)} miles, recorded`
                    }
                  />
                  <StatusChip recorded={!odo.current.isEstimated} source={odo.current.basis.source} />
                </View>
                <Text style={styles.panelAsOf} maxFontSizeMultiplier={fontScaleCap.body} numberOfLines={2}>
                  {basisText(odo.current)}
                </Text>
              </View>
            ) : null}
            {hint.message ? (
              <View style={styles.hintRow} accessibilityLiveRegion="polite">
                <Ionicons
                  name={
                    hint.tone === "close"
                      ? "checkmark-circle-outline"
                      : hint.tone === "error"
                      ? "alert-circle-outline"
                      : hint.tone === "warn"
                      ? "warning-outline"
                      : "swap-vertical-outline"
                  }
                  size={14}
                  color={hint.tone === "error" ? colors.red : hint.tone === "warn" ? colors.amber : colors.text2}
                  accessible={false}
                />
                <Text
                  style={[
                    styles.hintLine,
                    hint.tone === "error" && { color: colors.red },
                    (hint.tone === "info" || hint.tone === "warn") && { color: colors.text1 },
                  ]}
                  maxFontSizeMultiplier={fontScaleCap.body}
                >
                  {hint.message}
                </Text>
              </View>
            ) : null}
            {!hasReading && mot ? (
              <Text style={styles.hint} maxFontSizeMultiplier={fontScaleCap.body}>{motHintText(mot)}</Text>
            ) : null}

            <View style={styles.dateWrap}>
              <DateTimePickerField
                label="When did you read it?"
                value={readAt}
                maximumDate={new Date()}
                onChange={(d) => {
                  setReadAt(d);
                  setTouchedTime(true);
                  if (error) setError(null);
                }}
              />
            </View>
            <Text style={styles.hint} maxFontSizeMultiplier={fontScaleCap.body}>
              Best read when the car is parked.
            </Text>

            <Button
              title="Save reading"
              onPress={handleSave}
              loading={saving}
              style={{ marginTop: 20 }}
            />
            <Button variant="ghost" title="Cancel" onPress={onClose} disabled={saving} style={{ marginTop: 8 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderBottomWidth: 0,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.text3,
    opacity: 0.4,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: { color: colors.text1, fontFamily: fonts.bold, fontSize: 18 },
  vehicle: { color: colors.text2, fontFamily: fonts.regular, fontSize: 14, marginTop: 2 },
  label: { color: colors.text2, fontFamily: fonts.semibold, fontSize: 13, marginTop: 18, marginBottom: 6 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: 14,
  },
  inputWrapError: { borderColor: colors.red },
  inputWrapWarn: { borderColor: colors.amber },
  panel: { backgroundColor: colors.bg, borderRadius: radii.md, padding: 12, marginTop: 14 },
  panelLabel: { fontSize: 12, fontFamily: fonts.regular, color: colors.text2 },
  panelRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" },
  panelAsOf: { fontSize: 12, fontFamily: fonts.regular, color: colors.text2, marginTop: 6 },
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 8 },
  hintLine: { flex: 1, fontSize: 14, lineHeight: 19, fontFamily: fonts.medium, color: colors.text2, fontVariant: ["tabular-nums"] },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 22,
    fontFamily: fonts.semibold,
    color: colors.text1,
    fontVariant: ["tabular-nums"],
  },
  suffix: { color: colors.text2, fontFamily: fonts.semibold, fontSize: 16, marginLeft: 8 },
  error: { color: colors.red, fontFamily: fonts.medium, fontSize: 14, marginTop: 8 },
  hint: { color: colors.text3, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 8 },
  dateWrap: { marginTop: 8 },
});
