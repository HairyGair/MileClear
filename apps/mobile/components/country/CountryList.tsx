import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COUNTRIES, SHORTLIST_COUNTRY_CODES, countryByCode, type Country } from "@mileclear/shared";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

type Row = { kind: "country"; country: Country } | { kind: "heading"; title: string };

/** The countries the driver can pick: the shortlist first, then all, with search. */
export function countryRows(query: string): Row[] {
  const q = query.trim().toLowerCase();
  if (q) {
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q).map((country) => ({
      kind: "country" as const,
      country,
    }));
  }
  const short = SHORTLIST_COUNTRY_CODES.map((code) => countryByCode(code)!).filter(Boolean);
  return [
    ...short.map((country) => ({ kind: "country" as const, country })),
    { kind: "heading" as const, title: "All countries" },
    ...COUNTRIES.map((country) => ({ kind: "country" as const, country })),
  ];
}

/**
 * Searchable country list. Used by Settings > Country and the one-off
 * "Where do you drive?" step.
 */
export function CountryList({
  selected,
  onPick,
  header,
}: {
  selected: string;
  onPick: (code: string) => void;
  header?: React.ReactElement;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => countryRows(query), [query]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(r, i) => (r.kind === "heading" ? `h-${r.title}` : `${r.country.code}-${i}`)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.text3} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search countries"
              placeholderTextColor={colors.text3}
              style={styles.input}
              autoCorrect={false}
              maxFontSizeMultiplier={fontScaleCap.body}
              accessibilityLabel="Search countries"
            />
          </View>
        </View>
      }
      renderItem={({ item }) => {
        if (item.kind === "heading") {
          return (
            <Text style={styles.heading} maxFontSizeMultiplier={fontScaleCap.body}>
              {item.title}
            </Text>
          );
        }
        const isSelected = item.country.code === selected;
        return (
          <TouchableOpacity
            style={styles.row}
            onPress={() => onPick(item.country.code)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={item.country.name}
          >
            <Text style={[styles.name, isSelected && styles.nameSelected]} maxFontSizeMultiplier={fontScaleCap.body}>
              {item.country.name}
            </Text>
            {isSelected && <Ionicons name="checkmark" size={18} color={colors.amber} />}
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.empty} maxFontSizeMultiplier={fontScaleCap.body}>
          No country matches "{query}".
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingBottom: spacing.xl,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingVertical: 10,
  },
  heading: {
    color: colors.text2,
    fontFamily: fonts.semibold,
    fontSize: 13,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceBorder,
  },
  name: {
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  nameSelected: {
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
  empty: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 14,
    marginTop: spacing.lg,
  },
});
