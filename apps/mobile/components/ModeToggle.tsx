import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useMode } from "../lib/mode/context";
import type { AppMode } from "../lib/mode/index";

const SEGMENTS: { label: string; value: AppMode }[] = [
  { label: "Work", value: "work" },
  { label: "Personal", value: "personal" },
];

export function ModeToggle() {
  const { mode, setMode } = useMode();

  return (
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
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 3,
    marginBottom: 16,
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
});
