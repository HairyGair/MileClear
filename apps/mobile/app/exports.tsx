import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Stack } from "expo-router";
import { getTaxYear } from "@mileclear/shared";
import { downloadAndShareExport } from "../lib/api/exports";

function generateTaxYears(count: number): string[] {
  const current = getTaxYear(new Date());
  const startYear = parseInt(current.split("-")[0], 10);
  return Array.from({ length: count }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String(y + 1).slice(2)}`;
  });
}

type LoadingKey = "csv" | "pdf" | "self-assessment" | null;

export default function ExportsScreen() {
  const taxYears = generateTaxYears(4);
  const [selectedYear, setSelectedYear] = useState(taxYears[0]);
  const [loadingKey, setLoadingKey] = useState<LoadingKey>(null);

  const pickTaxYear = useCallback(() => {
    Alert.alert(
      "Select Tax Year",
      undefined,
      [
        ...taxYears.map((year) => ({
          text: year,
          onPress: () => setSelectedYear(year),
        })),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  }, [taxYears]);

  const handleDownload = useCallback(
    async (type: "csv" | "pdf" | "self-assessment") => {
      setLoadingKey(type);
      try {
        const ext = type === "csv" ? "csv" : "pdf";
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const filename = `mileclear-${type}-${selectedYear}-${date}.${ext}`;
        const mime =
          type === "csv" ? "text/csv" : "application/pdf";

        const param =
          type === "self-assessment"
            ? `taxYear=${selectedYear}`
            : `taxYear=${selectedYear}`;

        await downloadAndShareExport(
          `/exports/${type}?${param}`,
          filename,
          mime
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Download failed";
        Alert.alert("Export failed", msg);
      } finally {
        setLoadingKey(null);
      }
    },
    [selectedYear]
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Tax Exports" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Download your mileage data for HMRC self-assessment.
        </Text>

        {/* Tax Year Picker */}
        <TouchableOpacity
          style={styles.yearPicker}
          onPress={pickTaxYear}
          activeOpacity={0.7}
        >
          <Text style={styles.yearLabel}>Tax Year</Text>
          <Text style={styles.yearValue}>{selectedYear}</Text>
        </TouchableOpacity>

        {/* Download rows */}
        <Text style={styles.sectionTitle}>Downloads</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => handleDownload("csv")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Trip Data (CSV)</Text>
            <Text style={styles.rowDesc}>
              All trips with HMRC rates. Import into Excel.
            </Text>
          </View>
          {loadingKey === "csv" ? (
            <ActivityIndicator color="#f59e0b" />
          ) : (
            <Text style={styles.chevron}>›</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => handleDownload("pdf")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Trip Report (PDF)</Text>
            <Text style={styles.rowDesc}>
              Formatted trip report with summary stats.
            </Text>
          </View>
          {loadingKey === "pdf" ? (
            <ActivityIndicator color="#f59e0b" />
          ) : (
            <Text style={styles.chevron}>›</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => handleDownload("self-assessment")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Self-Assessment (PDF)</Text>
            <Text style={styles.rowDesc}>
              HMRC mileage summary with vehicle breakdown.
            </Text>
          </View>
          {loadingKey === "self-assessment" ? (
            <ActivityIndicator color="#f59e0b" />
          ) : (
            <Text style={styles.chevron}>›</Text>
          )}
        </TouchableOpacity>

        {/* Coming Soon rows */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>
          Accounting Integrations
        </Text>

        {["Xero", "FreeAgent", "QuickBooks"].map((name) => (
          <View key={name} style={[styles.row, { opacity: 0.5 }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.comingSoonRow}>
                <Text style={styles.rowTitle}>{name}</Text>
                <Text style={styles.comingSoonBadge}>Coming Soon</Text>
              </View>
              <Text style={styles.rowDesc}>
                Direct export to {name} — available soon.
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 24,
  },
  yearPicker: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  yearLabel: {
    fontSize: 15,
    color: "#9ca3af",
  },
  yearValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f59e0b",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  row: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  rowDesc: {
    fontSize: 13,
    color: "#6b7280",
  },
  chevron: {
    fontSize: 22,
    color: "#6b7280",
    marginLeft: 8,
  },
  comingSoonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  comingSoonBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    backgroundColor: "#374151",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
});
