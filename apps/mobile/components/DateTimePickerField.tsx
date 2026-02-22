import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
  TextInput,
} from "react-native";

// Lazy import for Expo Go compatibility
let DateTimePicker: any = null;
try {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  // Fallback to text input in Expo Go
}

interface DateTimePickerFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  onClear?: () => void;
  disabled?: boolean;
  maximumDate?: Date;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function DateTimePickerField({
  label,
  value,
  onChange,
  onClear,
  disabled,
  maximumDate,
}: DateTimePickerFieldProps) {
  const [showModal, setShowModal] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value ?? new Date());
  // Android shows date first, then time
  const [androidMode, setAndroidMode] = useState<"date" | "time">("date");
  const [showAndroid, setShowAndroid] = useState(false);
  // Fallback text input for Expo Go
  const [fallbackText, setFallbackText] = useState(
    value ? formatFallback(value) : ""
  );

  function formatFallback(d: Date): string {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${mins}`;
  }

  function parseFallback(text: string): Date | null {
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

  const handleSetNow = () => {
    const now = new Date();
    onChange(now);
    setFallbackText(formatFallback(now));
  };

  // No native picker available — fallback text input
  if (!DateTimePicker) {
    return (
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <TouchableOpacity onPress={handleSetNow} disabled={disabled}>
            <Text style={styles.nowBtn}>Now</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.fieldRow}>
          <TextInput
            style={[styles.input, disabled && styles.inputDisabled]}
            value={fallbackText}
            onChangeText={(t) => {
              setFallbackText(t);
              const parsed = parseFallback(t);
              if (parsed) onChange(parsed);
            }}
            placeholder="DD/MM/YYYY HH:MM"
            placeholderTextColor="#6b7280"
            editable={!disabled}
          />
          {onClear && value && (
            <TouchableOpacity onPress={onClear} style={styles.clearBtn} disabled={disabled}>
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
          <TouchableOpacity onPress={handleSetNow} disabled={disabled}>
            <Text style={styles.nowBtn}>Now</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.field, disabled && styles.inputDisabled]}
          onPress={() => {
            if (!disabled) {
              setTempDate(value ?? new Date());
              setShowModal(true);
            }
          }}
          activeOpacity={0.7}
        >
          <Text style={value ? styles.fieldText : styles.fieldPlaceholder}>
            {value ? formatDateTime(value) : "Tap to set"}
          </Text>
          {onClear && value && (
            <TouchableOpacity onPress={onClear} hitSlop={8} disabled={disabled}>
              <Text style={styles.clearText}>x</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <Modal
          visible={showModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{label}</Text>
                <TouchableOpacity
                  onPress={() => {
                    onChange(tempDate);
                    setShowModal(false);
                  }}
                >
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="datetime"
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
        </Modal>
      </View>
    );
  }

  // ── Android: Native dialogs (date → time) ──
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity onPress={handleSetNow} disabled={disabled}>
          <Text style={styles.nowBtn}>Now</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.field, disabled && styles.inputDisabled]}
        onPress={() => {
          if (!disabled) {
            setTempDate(value ?? new Date());
            setAndroidMode("date");
            setShowAndroid(true);
          }
        }}
        activeOpacity={0.7}
      >
        <Text style={value ? styles.fieldText : styles.fieldPlaceholder}>
          {value ? formatDateTime(value) : "Tap to set"}
        </Text>
        {onClear && value && (
          <TouchableOpacity onPress={onClear} hitSlop={8} disabled={disabled}>
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
            if (androidMode === "date") {
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
  },
  nowBtn: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f59e0b",
  },
  field: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
  },
  fieldPlaceholder: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  input: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  inputDisabled: {
    opacity: 0.5,
  },
  clearBtn: {
    padding: 4,
  },
  clearText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#6b7280",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0c1425",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  modalDone: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f59e0b",
  },
});
