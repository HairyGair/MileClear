// Miles by project (5 Oct 2026).
//
// A tax year's business trips totalled by the Project / client label the
// driver gave them (Trips, open a trip, Details, Project / client). Asked for
// by a driver who splits work between two employers and needs the miles for
// each. Figures come from GET /trips/project-totals, which values trips in
// date order so the 10,000-mile threshold lands on the right ones. Free.

import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect } from "expo-router";
import { safeBack } from "../lib/nav";
import { formatMiles, formatPence, getTaxYear } from "@mileclear/shared";
import { fetchProjectTotals, type ProjectTotalsResponse } from "../lib/api/trips";
import { describeError } from "../lib/api/apiError";
import { EmptyState } from "../components/EmptyState";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

function recentTaxYears(count: number): string[] {
  const startYear = parseInt(getTaxYear(new Date()).split("-")[0], 10);
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String(y + 1).slice(2)}`;
  });
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;
}

export default function ProjectTotalsScreen() {
  const taxYears = recentTaxYears(4);
  const [taxYear, setTaxYear] = useState(taxYears[0]);
  const [data, setData] = useState<ProjectTotalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (year: string) => {
    setError(null);
    try {
      const res = await fetchProjectTotals(year);
      setData(res);
    } catch (err) {
      const { title, message } = describeError(err, "Could not load your project totals", { savedLocally: false });
      setError(`${title}. ${message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(taxYear);
    }, [load, taxYear])
  );

  const pickTaxYear = useCallback(() => {
    Alert.alert("Select tax year", undefined, [
      ...taxYears.map((year) => ({ text: year, onPress: () => setTaxYear(year) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }, [taxYears]);

  const hasLabelled = !!data?.projects.some((p) => p.label !== null);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Miles by project",
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => safeBack()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Ionicons name="chevron-back" size={26} color={AMBER} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(taxYear);
            }}
            tintColor={AMBER}
          />
        }
      >
        <Text style={styles.subtitle}>
          Business trips this tax year, by the Project / client you gave them. Value is at the approved mileage rates.
        </Text>

        <TouchableOpacity
          style={styles.yearPicker}
          onPress={pickTaxYear}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Tax year: ${taxYear}. Tap to change`}
        >
          <Text style={styles.yearLabel}>Tax year</Text>
          <Text style={styles.yearValue}>{taxYear}</Text>
        </TouchableOpacity>

        {loading && !data ? (
          <ActivityIndicator color={AMBER} style={{ marginTop: 32 }} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); load(taxYear); }} accessibilityRole="button">
              <Text style={styles.retry}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : !data || !hasLabelled ? (
          <EmptyState
            icon="briefcase-outline"
            title={data && data.totals.trips > 0 ? "No projects yet this tax year" : "No business trips this tax year"}
            description={
              "To total your miles by project, tag your business trips: go to Trips, open a trip, tap Details and fill in Project / client. Use the same name each time, such as \"NHS\" or \"Private practice\"."
            }
          />
        ) : (
          <>
            <View style={styles.card}>
              {data.projects.map((p, i) => (
                <View
                  key={p.label ?? "__none__"}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                  accessible
                  accessibilityLabel={`${p.label ?? "No project"}: ${formatMiles(p.miles)}, ${plural(p.trips, "trip")}, ${formatPence(p.valuePence)}`}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.rowLabel, p.label === null && styles.rowLabelMuted]} numberOfLines={2}>
                      {p.label ?? "No project"}
                    </Text>
                    <Text style={styles.rowSub}>{plural(p.trips, "trip")}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.rowMiles}>{formatMiles(p.miles)}</Text>
                    <Text style={styles.rowValue}>{formatPence(p.valuePence)}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.card, styles.totalCard]}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>All business trips</Text>
                  <Text style={styles.rowSub}>{plural(data.totals.trips, "trip")}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.rowMiles}>{formatMiles(data.totals.miles)}</Text>
                  <Text style={[styles.rowValue, { color: AMBER }]}>{formatPence(data.totals.valuePence)}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.footnote}>
              The first 10,000 business miles in a tax year are paid at the higher rate, so each trip is valued in date order. Your Pro trip report and CSV include the project too.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 20, marginBottom: 16 },
  yearPicker: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
  },
  yearLabel: { fontSize: 15, fontFamily: fonts.regular, color: TEXT_2 },
  yearValue: { fontSize: 16, fontFamily: fonts.bold, color: AMBER },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.subtleBorder,
    paddingHorizontal: 16,
  },
  totalCard: { marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.subtleBorder },
  rowLabel: { fontSize: 15, fontFamily: fonts.semibold, color: colors.text1 },
  rowLabelMuted: { color: TEXT_2, fontFamily: fonts.medium },
  rowSub: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, marginTop: 2 },
  rowMiles: { fontSize: 15, fontFamily: fonts.bold, color: colors.text1 },
  rowValue: { fontSize: 13, fontFamily: fonts.medium, color: TEXT_2, marginTop: 2 },
  footnote: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, lineHeight: 17, marginTop: 14 },
  errorBox: { marginTop: 24, alignItems: "center" },
  errorText: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2, textAlign: "center" },
  retry: { fontSize: 14, fontFamily: fonts.semibold, color: AMBER, marginTop: 10 },
});
