import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getTaxYear } from "@mileclear/shared";
import {
  fetchHmrcStatus,
  fetchHmrcPeriods,
  fetchCalculations,
  type HmrcPeriodSummaryListItem,
  type HmrcCalculationListItem,
} from "../lib/api/hmrc";
import { isApiError } from "../lib/api";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;

function generateTaxYears(count: number): string[] {
  const current = getTaxYear(new Date());
  const startYear = parseInt(current.split("-")[0], 10);
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String(y + 1).slice(2)}`;
  });
}

export default function TaxMtdHistoryScreen() {
  const taxYears = generateTaxYears(4);
  const [selectedYear, setSelectedYear] = useState<string>(taxYears[0]);
  const [periods, setPeriods] = useState<HmrcPeriodSummaryListItem[]>([]);
  const [calculations, setCalculations] = useState<HmrcCalculationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await fetchHmrcStatus();
      if (!status.data.connected || !status.data.businessId) {
        setError("Connect to HMRC and confirm your trade to see submission history.");
        setPeriods([]);
        setCalculations([]);
        setLoading(false);
        return;
      }

      // Fetch in parallel — both are tied to the selected tax year and
      // independent of each other.
      const [periodsRes, calcsRes] = await Promise.all([
        fetchHmrcPeriods(status.data.businessId, selectedYear).catch((err) => {
          if (isApiError(err) && err.statusCode === 400) return null;
          throw err;
        }),
        fetchCalculations(selectedYear).catch((err) => {
          if (isApiError(err) && err.statusCode === 400) return null;
          throw err;
        }),
      ]);

      setPeriods(periodsRes?.data.periods ?? []);
      setCalculations(calcsRes?.data.calculations ?? []);
      setLoading(false);
    } catch (err) {
      setError(
        isApiError(err) ? err.message : err instanceof Error ? err.message : "Couldn't load history."
      );
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
      refreshControl={<RefreshControl tintColor={AMBER} refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: "Submission history", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />

      <View style={styles.tabs}>
        {taxYears.map((y) => (
          <TouchableOpacity
            key={y}
            style={[styles.tab, selectedYear === y && styles.tabActive]}
            onPress={() => setSelectedYear(y)}
            accessibilityRole="button"
            accessibilityLabel={`Tax year ${y}`}
            accessibilityState={{ selected: selectedYear === y }}
          >
            <Text style={[styles.tabLabel, selectedYear === y && styles.tabLabelActive]}>{y}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={AMBER} />
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color={TEXT_3} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <Section title="Quarterly periods">
            {periods.length === 0 ? (
              <Text style={styles.emptyText}>No quarterly submissions for {selectedYear} yet.</Text>
            ) : (
              periods.map((p) => (
                <View key={p.periodId} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {formatPeriod(p.periodStartDate, p.periodEndDate)}
                    </Text>
                    {p.creationDate && (
                      <Text style={styles.rowSub}>Submitted {formatDate(p.creationDate)}</Text>
                    )}
                  </View>
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={14} color="#000" />
                  </View>
                </View>
              ))
            )}
          </Section>

          <Section title="HMRC calculations">
            {calculations.length === 0 ? (
              <Text style={styles.emptyText}>No calculations triggered for {selectedYear} yet.</Text>
            ) : (
              calculations.map((c) => (
                <View key={c.calculationId} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {formatCalcType(c.calculationType)}
                      {c.crystallised && " · finalised"}
                    </Text>
                    <Text style={styles.rowSub}>
                      {formatDate(c.calculationTimestamp)}
                      {c.totalIncomeTaxAndNicsDue !== undefined &&
                        ` · £${c.totalIncomeTaxAndNicsDue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} due`}
                    </Text>
                  </View>
                  {c.crystallised && (
                    <View style={[styles.checkBadge, { backgroundColor: GREEN }]}>
                      <Ionicons name="lock-closed" size={12} color="#000" />
                    </View>
                  )}
                </View>
              ))
            )}
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function formatPeriod(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMonth = start.toLocaleDateString("en-GB", { month: "short" });
  const endMonth = end.toLocaleDateString("en-GB", { month: "short" });
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
  }
  return `${start.getDate()} ${startMonth} ${start.getFullYear()} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatCalcType(t: string): string {
  if (t === "in-year") return "In-year estimate";
  if (t === "intent-to-finalise") return "Intent to finalise";
  if (t === "intent-to-amend") return "Amendment";
  return t;
}

const styles = StyleSheet.create({
  center: { padding: 32, alignItems: "center" },

  tabs: {
    flexDirection: "row",
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: { backgroundColor: AMBER },
  tabLabel: { color: TEXT_3, fontFamily: fonts.semibold, fontSize: 13 },
  tabLabelActive: { color: "#000" },

  errorCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  errorText: { color: TEXT_2, fontSize: 13, fontFamily: fonts.regular, flex: 1 },

  section: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  emptyText: {
    color: TEXT_3,
    fontSize: 13,
    fontFamily: fonts.regular,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  rowTitle: { color: TEXT_1, fontSize: 14, fontFamily: fonts.semibold },
  rowSub: { color: TEXT_3, fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: AMBER,
    alignItems: "center",
    justifyContent: "center",
  },
});
