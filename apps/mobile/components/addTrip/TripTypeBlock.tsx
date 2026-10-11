// "Business or personal?" on the add-trip form (PROPOSALS 0.5, decision F).
// Two big choices, nothing picked; leaving both is fine and the trip goes in
// To sort. Picking Business shows Which app (gig drivers) and Purpose
// (drivers who drive for an employer) straight away, one row each that opens
// a short list; Personal shows Category the same way. A driver who only
// tracks personal driving sees just "What for? (optional)".
//
// Business is soft amber with a briefcase, Personal is slate with a person,
// as on the Trips list.

import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BUSINESS_PURPOSES, GIG_PLATFORMS, TRIP_CATEGORY_META } from "@mileclear/shared";
import type { BusinessPurpose, PlatformTag, TripCategory, TripClassification } from "@mileclear/shared";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";
import { PickerSheet, type PickerOption } from "../trip/PickerSheet";

const NONE = "__none__";

function sentenceCase(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

interface Props {
  classification: TripClassification;
  onClassification: (c: TripClassification) => void;
  platformTag: PlatformTag | undefined;
  onPlatform: (p: PlatformTag | undefined) => void;
  businessPurpose: BusinessPurpose | undefined;
  onPurpose: (p: BusinessPurpose | undefined) => void;
  category: TripCategory | undefined;
  onCategory: (c: TripCategory | undefined) => void;
  isGigDriver: boolean;
  isEmployeeDriver: boolean;
  /** Only tracks personal driving: no Business or personal question. */
  personalOnly: boolean;
}

export function TripTypeBlock(p: Props) {
  const [sheet, setSheet] = useState<"app" | "purpose" | "category" | null>(null);
  const isBusiness = p.classification === "business";
  const isPersonal = p.classification === "personal";

  const appOptions: PickerOption[] = [{ key: NONE, label: "None" }, ...GIG_PLATFORMS.map((g) => ({ key: g.value, label: g.label }))];
  const purposeOptions: PickerOption[] = [
    { key: NONE, label: "None" },
    ...BUSINESS_PURPOSES.map((b) => ({ key: b.value, label: sentenceCase(b.label), icon: b.icon })),
  ];
  const categoryOptions: PickerOption[] = [
    { key: NONE, label: "None" },
    ...TRIP_CATEGORY_META.map((c) => ({ key: c.value, label: sentenceCase(c.label), icon: c.icon })),
  ];
  const appLabel = GIG_PLATFORMS.find((g) => g.value === p.platformTag)?.label;
  const purposeLabel = BUSINESS_PURPOSES.find((b) => b.value === p.businessPurpose)?.label;
  const categoryLabel = TRIP_CATEGORY_META.find((c) => c.value === p.category)?.label;

  const choice = (value: "business" | "personal") => {
    const on = p.classification === value;
    const business = value === "business";
    return (
      <TouchableOpacity
        key={value}
        style={[styles.choice, on && (business ? styles.businessOn : styles.personalOn)]}
        // A second tap takes the choice off again, back to To sort.
        onPress={() => p.onClassification(on ? "unclassified" : value)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={business ? "Business" : "Personal"}
        accessibilityState={{ selected: on }}
      >
        <Ionicons
          name={business ? (on ? "briefcase" : "briefcase-outline") : on ? "person" : "person-outline"}
          size={20}
          color={on && business ? colors.amber : colors.text1}
          accessible={false}
        />
        <Text style={[styles.choiceText, on && business && styles.businessText]} maxFontSizeMultiplier={fontScaleCap.body}>
          {business ? "Business" : "Personal"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrap}>
      {!p.personalOnly && (
        <>
          <Text style={styles.label} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.body}>
            Business or personal?
          </Text>
          <View style={styles.choices}>
            {choice("business")}
            {choice("personal")}
          </View>
          {p.classification === "unclassified" && (
            <Text style={styles.note} maxFontSizeMultiplier={fontScaleCap.body}>
              Not sure? Leave it and it goes in To sort.
            </Text>
          )}
        </>
      )}

      {isBusiness && p.isGigDriver && (
        <Row label="Which app" value={appLabel ?? "None"} onPress={() => setSheet("app")} />
      )}
      {isBusiness && p.isEmployeeDriver && (
        <Row label="Purpose" value={purposeLabel ? sentenceCase(purposeLabel) : "None"} onPress={() => setSheet("purpose")} />
      )}
      {(isPersonal || p.personalOnly) && (
        <Row
          label={p.personalOnly ? "What for? (optional)" : "Category"}
          value={categoryLabel ? sentenceCase(categoryLabel) : "None"}
          onPress={() => setSheet("category")}
        />
      )}

      <PickerSheet
        visible={sheet === "app"}
        title="Which app"
        options={appOptions}
        selectedKey={p.platformTag ?? NONE}
        onPick={(k) => p.onPlatform(k === NONE ? undefined : (k as PlatformTag))}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "purpose"}
        title="Purpose"
        options={purposeOptions}
        selectedKey={p.businessPurpose ?? NONE}
        onPick={(k) => p.onPurpose(k === NONE ? undefined : (k as BusinessPurpose))}
        onClose={() => setSheet(null)}
      />
      <PickerSheet
        visible={sheet === "category"}
        title={p.personalOnly ? "What for?" : "Category"}
        options={categoryOptions}
        selectedKey={p.category ?? NONE}
        onPick={(k) => p.onCategory(k === NONE ? undefined : (k as TripCategory))}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Double tap to change`}
    >
      <Text style={styles.rowLabel} maxFontSizeMultiplier={fontScaleCap.body}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>{value}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.text3} accessible={false} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 },
  label: { fontSize: 14, fontFamily: fonts.medium, color: colors.text2, marginBottom: 10, marginHorizontal: 4 },
  choices: { flexDirection: "row", gap: 12 },
  choice: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  businessOn: { backgroundColor: colors.amberDim, borderColor: colors.amberGlow },
  personalOn: { backgroundColor: colors.personal, borderColor: colors.personalEdge },
  choiceText: { fontSize: 17, fontFamily: fonts.semibold, color: colors.text1 },
  businessText: { color: colors.amber },
  note: { fontSize: 14, fontFamily: fonts.regular, color: colors.text2, marginTop: 10, marginHorizontal: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    marginTop: 10,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  rowLabel: { flex: 1, fontSize: 16, fontFamily: fonts.medium, color: colors.text1 },
  rowValue: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1, maxWidth: "55%" },
});
