import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
} from "react-native";
import { colors, fonts } from "../lib/theme";
import { AppModal } from "./AppModal";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

// Lazy import for Expo Go compatibility
let DateTimePicker: any = null;
try {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  // Fallback to text input in Expo Go
}

type PickerMode = "date" | "datetime";

interface DateTimePickerFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  onClear?: () => void;
  disabled?: boolean;
  maximumDate?: Date;
  /** "date" asks for a calendar day only (no time step on Android, no time
   *  wheel on iOS, DD/MM/YYYY in the Expo Go fallback). Default "datetime". */
  mode?: PickerMode;
}

/** Coerce any value into a real Date instance (handles strings from JSON). */
function toDate(v: any): Date {
  if (v instanceof Date) return v;
  if (v) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function formatDateTime(date: Date | any, mode: PickerMode = "datetime"): string {
  if (!date) return "";
  if (!(date instanceof Date)) date = new Date(date);
  if (isNaN(date.getTime())) return "";
  if (mode === "date") {
    return date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatFallback(d: Date | null | undefined, mode: PickerMode = "datetime"): string {
  if (!d) return "";
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  if (mode === "date") return `${day}/${month}/${year}`;
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

function parseFallback(text: string, mode: PickerMode = "datetime"): Date | null {
  if (mode === "date") {
    // DD/MM/YYYY
    const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY HH:MM
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const d = new Date(
    parseInt(match[3]),
    parseInt(match[2]) - 1,
    parseInt(match[1]),
    parseInt(match[4]),
    parseInt(match[5])
  );
  return isNaN(d.getTime()) ? null : d;
}

export function DateTimePickerField({
  label,
  value,
  onChange,
  onClear,
  disabled,
  maximumDate,
  mode = "datetime",
}: DateTimePickerFieldProps) {
  const [showModal, setShowModal] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => toDate(value));
  // Android shows date first, then time (date mode stops after the date)
  const [androidMode, setAndroidMode] = useState<"date" | "time">("date");
  const [showAndroid, setShowAndroid] = useState(false);
  // Fallback text input for Expo Go
  const [fallbackText, setFallbackText] = useState(
    formatFallback(value, mode)
  );
  const nowLabel = mode === "date" ? "Today" : "Now";
  const fallbackPlaceholder = mode === "date" ? "DD/MM/YYYY" : "DD/MM/YYYY HH:MM";
  const fallbackHint = mode === "date" ? "format: day month year" : "format: day month year hour minute";
  const shownValue = value ? formatDateTime(value, mode) : "";

  const handleSetNow = () => {
    const now = new Date();
    onChange(now);
    setFallbackText(formatFallback(now, mode));
  };

  // No native picker available — fallback text input
  if (!DateTimePicker) {
    return (
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <TouchableOpacity
            onPress={handleSetNow}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Set ${label} to ${nowLabel.toLowerCase()}`}
          >
            <Text style={styles.nowBtn}>{nowLabel}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.fieldRow}>
          <TextInput
            style={[styles.input, disabled && styles.inputDisabled]}
            value={fallbackText}
            onChangeText={(t) => {
              setFallbackText(t);
              const parsed = parseFallback(t, mode);
              if (parsed) onChange(parsed);
            }}
            placeholder={fallbackPlaceholder}
            placeholderTextColor={TEXT_3}
            editable={!disabled}
            accessibilityLabel={`${label}, ${fallbackHint}`}
          />
          {onClear && value && (
            <TouchableOpacity
              onPress={onClear}
              style={styles.clearBtn}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label}`}
            >
              <Text style={styles.clearText}>x</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── iOS: Modal with inline picker ──
  if (Platform.OS === "ios") {
    return (
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <TouchableOpacity
            onPress={handleSetNow}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Set ${label} to ${nowLabel.toLowerCase()}`}
          >
            <Text style={styles.nowBtn}>{nowLabel}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.field, disabled && styles.inputDisabled]}
          onPress={() => {
            if (!disabled) {
              setTempDate(toDate(value));
              setShowModal(true);
            }
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${shownValue || "not set"}. Tap to change`}
        >
          <Text style={value ? styles.fieldText : styles.fieldPlaceholder}>
            {shownValue || "Tap to set"}
          </Text>
          {onClear && value && (
            <TouchableOpacity
              onPress={onClear}
              hitSlop={8}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label}`}
            >
              <Text style={styles.clearText}>x</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <AppModal
          visible={showModal}
          animationType="slide"
          onRequestClose={() => setShowModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet} accessibilityViewIsModal>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => setShowModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{label}</Text>
                <TouchableOpacity
                  onPress={() => {
                    onChange(tempDate);
                    setShowModal(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={mode === "date" ? "Confirm date" : "Confirm date and time"}
                >
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode={mode}
                display="spinner"
                onChange={(_: any, date?: Date) => {
                  if (date) setTempDate(date);
                }}
                maximumDate={maximumDate}
                themeVariant="dark"
                textColor="#ffffff"
              />
            </View>
          </View>
        </AppModal>
      </View>
    );
  }

  // ── Android: Native dialogs (date → time; date mode stops after the date) ──
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          onPress={handleSetNow}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Set ${label} to ${nowLabel.toLowerCase()}`}
        >
          <Text style={styles.nowBtn}>{nowLabel}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.field, disabled && styles.inputDisabled]}
        onPress={() => {
          if (!disabled) {
            setTempDate(toDate(value));
            setAndroidMode("date");
            setShowAndroid(true);
          }
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shownValue || "not set"}. Tap to change`}
      >
        <Text style={value ? styles.fieldText : styles.fieldPlaceholder}>
          {shownValue || "Tap to set"}
        </Text>
        {onClear && value && (
          <TouchableOpacity
            onPress={onClear}
            hitSlop={8}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
          >
            <Text style={styles.clearText}>x</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {showAndroid && (
        <DateTimePicker
          value={tempDate}
          mode={androidMode}
          display="default"
          onChange={(_: any, date?: Date) => {
            if (!date) {
              setShowAndroid(false);
              return;
            }
            if (androidMode === "date" && mode === "datetime") {
              setTempDate(date);
              setAndroidMode("time");
            } else {
              onChange(date);
              setShowAndroid(false);
            }
          }}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  nowBtn: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  field: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: "#fff",
  },
  fieldPlaceholder: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  input: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  inputDisabled: {
    opacity: 0.5,
  },
  clearBtn: {
    padding: 4,
  },
  clearText: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: TEXT_3,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderBottomWidth: 0,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalCancel: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  modalDone: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: AMBER,
  },
});
