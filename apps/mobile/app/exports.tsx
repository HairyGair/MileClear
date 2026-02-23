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
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { getTaxYear } from "@mileclear/shared";
import { downloadAndShareExport } from "../lib/api/exports";
import { fetchProfile } from "../lib/api/user";
import { createCheckoutSession } from "../lib/api/billing";

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
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchProfile()
        .then((res) => setIsPremium(res.data.isPremium))
        .catch(() => setIsPremium(false));
    }, [])
  );

  const handleUpgrade = useCallback(async () => {
    try {
      const res = await createCheckoutSession();
      if (res.data.url) {
        await WebBrowser.openBrowserAsync(res.data.url);
        // Refresh premium status after returning
        fetchProfile()
          .then((r) => setIsPremium(r.data.isPremium))
          .catch(() => {});
      }
    } catch (err: unknown) {
      Alert.alert(
        "Upgrade failed",
        err instanceof Error ? err.message : "Could not start checkout"
      );
    }
  }, []);

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
        if (msg === "Premium subscription required") {
          Alert.alert(
            "Pro Feature",
            "Tax exports require MileClear Pro (£4.99/mo).",
            [
              { text: "Not now", style: "cancel" },
              {
                text: "Upgrade — £4.99/mo",
                onPress: handleUpgrade,
              },
            ]
          );
          return;
        }
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
        {isPremium === false && (
          <TouchableOpacity
            style={styles.paywallBanner}
            onPress={handleUpgrade}
            activeOpacity={0.7}
          >
            <Text style={styles.paywallTitle}>Pro Feature</Text>
            <Text style={styles.paywallText}>
              Tax exports require MileClear Pro. Upgrade for £4.99/mo to download HMRC-ready reports.
            </Text>
            <Text style={styles.paywallCta}>Upgrade Now</Text>
          </TouchableOpacity>
        )}

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
            <ActivityIndicator color="#f5a623" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#6b7280" style={{ marginLeft: 8 }} />
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
            <ActivityIndicator color="#f5a623" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#6b7280" style={{ marginLeft: 8 }} />
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
            <ActivityIndicator color="#f5a623" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#6b7280" style={{ marginLeft: 8 }} />
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
    fontFamily: "PlusJakartaSans_400Regular",
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
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  yearLabel: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  yearValue: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
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
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
    marginBottom: 4,
  },
  rowDesc: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  comingSoonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  comingSoonBadge: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#9ca3af",
    backgroundColor: "#374151",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  paywallBanner: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f5a623",
  },
  paywallTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
    marginBottom: 4,
  },
  paywallText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    lineHeight: 20,
    marginBottom: 10,
  },
  paywallCta: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
  },
});
