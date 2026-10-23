// "More details" on the add-trip form (A.1 row 8, decision K): the car, a
// note, Project or client, and odometer readings, closed by default with one
// line saying what is set ("Toyota Prius · no note").

import { LayoutAnimation, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

interface Props {
  open: boolean;
  onToggle: (open: boolean) => void;
  vehicleName: string | null;
  hasVehicles: boolean;
  onPickVehicle: () => void;
  notes: string;
  onNotes: (t: string) => void;
  projectLabel: string;
  onProjectLabel: (t: string) => void;
  projectOptions: string[] | null;
  odometerStart: string;
  onOdometerStart: (t: string) => void;
  odometerEnd: string;
  onOdometerEnd: (t: string) => void;
  /** What the car's odometer reads in: the boxes are typed in it. Default miles. */
  odometerUnit?: "miles" | "km";
}

/** "Toyota Prius · no note", "No car · note added · 2 readings". */
export function moreDetailsSummary(args: {
  vehicleName: string | null;
  hasVehicles: boolean;
  notes: string;
  projectLabel: string;
  odometerStart: string;
  odometerEnd: string;
}): string {
  const parts: string[] = [];
  if (args.vehicleName) parts.push(args.vehicleName);
  else if (args.hasVehicles) parts.push("No car");
  parts.push(args.notes.trim() ? "note added" : "no note");
  if (args.projectLabel.trim()) parts.push(args.projectLabel.trim());
  if (args.odometerStart.trim() || args.odometerEnd.trim()) parts.push("odometer");
  return parts.join(" · ");
}

export function MoreDetails(p: Props) {
  const summary = moreDetailsSummary(p);
  const odoStart = parseFloat(p.odometerStart);
  const odoEnd = parseFloat(p.odometerEnd);
  const typed = p.projectLabel.trim().toLowerCase();
  const projectMatches = (p.projectOptions ?? [])
    .filter((l) => l.toLowerCase() !== typed && (!typed || l.toLowerCase().includes(typed)))
    .slice(0, 12);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          p.onToggle(!p.open);
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`More details: ${summary}`}
        accessibilityState={{ expanded: p.open }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.title} maxFontSizeMultiplier={fontScaleCap.body}>More details</Text>
          <Text style={styles.summary} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>{summary}</Text>
        </View>
        <Ionicons name={p.open ? "chevron-up" : "chevron-forward"} size={20} color={colors.text3} accessible={false} />
      </TouchableOpacity>

      {p.open && (
        <View style={styles.body}>
          {p.hasVehicles && (
            <TouchableOpacity
              style={styles.row}
              onPress={p.onPickVehicle}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Car: ${p.vehicleName ?? "none"}. Double tap to change`}
            >
              <Ionicons name="car-outline" size={20} color={colors.text2} accessible={false} />
              <Text style={styles.rowLabel} maxFontSizeMultiplier={fontScaleCap.body}>Car</Text>
              <Text style={styles.rowValue} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                {p.vehicleName ?? "None"}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.text3} accessible={false} />
            </TouchableOpacity>
          )}

          <Text style={styles.fieldLabel} maxFontSizeMultiplier={fontScaleCap.body}>Note</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={p.notes}
            onChangeText={p.onNotes}
            placeholder="Anything to remember about this trip"
            placeholderTextColor={colors.text3}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            accessibilityLabel="Note about this trip"
          />

          <Text style={styles.fieldLabel} maxFontSizeMultiplier={fontScaleCap.body}>Project or client</Text>
          <TextInput
            style={styles.input}
            value={p.projectLabel}
            onChangeText={p.onProjectLabel}
            placeholder="e.g. Theatre Royal tour, Acme Ltd"
            placeholderTextColor={colors.text3}
            accessibilityLabel="Project or client"
          />
          {projectMatches.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
              {projectMatches.map((l) => (
                <TouchableOpacity
                  key={l}
                  style={styles.chip}
                  onPress={() => p.onProjectLabel(l)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use project ${l}`}
                >
                  <Text style={styles.chipText} maxFontSizeMultiplier={fontScaleCap.body}>{l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={styles.fieldLabel} maxFontSizeMultiplier={fontScaleCap.body}>
            {p.odometerUnit === "km" ? "Odometer readings in km (optional)" : "Odometer readings (optional)"}
          </Text>
          <View style={styles.odoRow}>
            <TextInput
              style={[styles.input, styles.odo]}
              value={p.odometerStart}
              onChangeText={(t) => p.onOdometerStart(t.replace(/[^0-9.]/g, ""))}
              placeholder="At the start"
              placeholderTextColor={colors.text3}
              keyboardType="decimal-pad"
              accessibilityLabel={p.odometerUnit === "km" ? "Odometer reading at the start, in km" : "Odometer reading at the start"}
            />
            <Ionicons name="arrow-forward" size={16} color={colors.text3} accessible={false} />
            <TextInput
              style={[styles.input, styles.odo]}
              value={p.odometerEnd}
              onChangeText={(t) => p.onOdometerEnd(t.replace(/[^0-9.]/g, ""))}
              placeholder="At the end"
              placeholderTextColor={colors.text3}
              keyboardType="decimal-pad"
              accessibilityLabel={p.odometerUnit === "km" ? "Odometer reading at the end, in km" : "Odometer reading at the end"}
            />
          </View>
          {p.odometerStart && p.odometerEnd && odoEnd > odoStart && (
            <Text style={styles.hint} maxFontSizeMultiplier={fontScaleCap.body}>
              Odometer shows {(odoEnd - odoStart).toFixed(1)} {p.odometerUnit === "km" ? "km" : "miles"}
            </Text>
          )}
        </View>
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
    marginTop: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64 },
  title: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  summary: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  rowLabel: { flex: 1, fontSize: 16, fontFamily: fonts.medium, color: colors.text1 },
  rowValue: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1, maxWidth: "55%" },
  fieldLabel: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notes: { minHeight: 80 },
  chips: { gap: 8, marginTop: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    justifyContent: "center",
  },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.text1 },
  odoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  odo: { flex: 1 },
  hint: { fontSize: 13, fontFamily: fonts.regular, color: colors.text2, marginTop: 6 },
});
