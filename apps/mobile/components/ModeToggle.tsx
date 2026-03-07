import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMode } from "../lib/mode/context";
import type { AppMode } from "../lib/mode/index";

const SEGMENTS: { label: string; value: AppMode }[] = [
  { label: "Work", value: "work" },
  { label: "Personal", value: "personal" },
];

interface ModeToggleProps {
  onInfoPress?: () => void;
}

export function ModeToggle({ onInfoPress }: ModeToggleProps) {
  const { mode, setMode } = useMode();

  return (
    <View style={styles.row}>
      <View style={styles.container}>
        {SEGMENTS.map((seg) => {
          const active = mode === seg.value;
          return (
            <TouchableOpacity
              key={seg.value}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setMode(seg.value)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={`${seg.label} mode`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.label, active && styles.labelActive]}>
                {seg.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {onInfoPress && (
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={onInfoPress}
          activeOpacity={0.6}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="What is Work mode?"
        >
          <Ionicons name="information-circle-outline" size={20} color="#64748b" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  container: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 3,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  segment: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  segmentActive: {
    backgroundColor: "#f5a623",
  },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  labelActive: {
    color: "#030712",
  },
  infoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
});
