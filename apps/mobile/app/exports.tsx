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
import { Stack, useFocusEffect, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { getTaxYear } from "@mileclear/shared";
import { downloadAndShareExport } from "../lib/api/exports";
import { fetchProfile } from "../lib/api/user";
import { createCheckoutSession } from "../lib/api/billing";
import { isIapAvailable, purchaseSubscription } from "../lib/iap/index";
import { usePaywall } from "../components/paywall";

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
  const { showPaywall } = usePaywall();
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
      if (isIapAvailable()) {
        await purchaseSubscription();
      } else {
        const res = await createCheckoutSession();
        if (res.data.url) {
          const url = new URL(res.data.url);
          if (!url.hostname.endsWith("stripe.com")) {
            throw new Error("Invalid checkout URL");
          }
          await WebBrowser.openBrowserAsync(res.data.url);
          fetchProfile()
            .then((r) => setIsPremium(r.data.isPremium))
            .catch(() => {});
        }
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
          showPaywall("exports");
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
            onPress={() => showPaywall("exports")}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to MileClear Pro"
          >
            <Text style={styles.paywallTitle}>Pro Feature</Text>
            <Text style={styles.paywallText}>
              Tax exports require MileClear Pro. Upgrade to download HMRC-ready reports.
            </Text>
            <Text style={styles.paywallCta}>Upgrade Now</Text>
            <Text style={styles.paywallLegal}>
              Auto-renews monthly. Cancel anytime.
            </Text>
            <View style={styles.paywallLinks}>
              <Text style={styles.paywallLink} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/terms")}>Terms of Use</Text>
              <Text style={styles.paywallSep}>|</Text>
              <Text style={styles.paywallLink} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/privacy")}>Privacy Policy</Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.subtitle}>
          Professional HMRC-compliant reports with your mileage data, vehicle breakdown, and tax deduction summary.
        </Text>

        {/* Tax Year Picker */}
        <TouchableOpacity
          style={styles.yearPicker}
          onPress={pickTaxYear}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Tax year: ${selectedYear}. Tap to change`}
        >
          <Text style={styles.yearLabel}>Tax Year</Text>
          <Text style={styles.yearValue}>{selectedYear}</Text>
        </TouchableOpacity>

        {/* Self Assessment Wizard link */}
        <TouchableOpacity
          style={styles.saWizardRow}
          onPress={() => router.push("/self-assessment")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open Self Assessment Guide"
        >
          <View style={styles.saWizardIcon}>
            <Ionicons name="document-text-outline" size={20} color="#f5a623" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.saWizardTitle}>Self Assessment Guide</Text>
            <Text style={styles.saWizardDesc}>
              Step-by-step SA103 walkthrough with income, mileage, expenses and tax estimate
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6b7280" style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        {/* Download rows */}
        <Text style={styles.sectionTitle}>Downloads</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => handleDownload("self-assessment")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Download HMRC Self-Assessment PDF for tax year"
          accessibilityState={{ disabled: loadingKey !== null }}
        >
          <View style={styles.rowIconWrap}>
            <Ionicons name="shield-checkmark" size={20} color="#10b981" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.rowTitleRow}>
              <Text style={styles.rowTitle}>HMRC Self-Assessment</Text>
              <View style={styles.hmrcBadge}>
                <Text style={styles.hmrcBadgeText}>HMRC COMPLIANT</Text>
              </View>
            </View>
            <Text style={styles.rowDesc}>
              Complete tax report with vehicle breakdown, monthly summary, and HMRC rate explanation. Ready for your accountant.
            </Text>
          </View>
          {loadingKey === "self-assessment" ? (
            <ActivityIndicator color="#f5a623" accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#6b7280" style={{ marginLeft: 8 }} accessible={false} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => handleDownload("pdf")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Download Trip Report PDF for tax year"
          accessibilityState={{ disabled: loadingKey !== null }}
        >
          <View style={styles.rowIconWrap}>
            <Ionicons name="document-text" size={20} color="#f5a623" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Trip Report (PDF)</Text>
            <Text style={styles.rowDesc}>
              Branded trip-by-trip report with summary stats. Unique report reference for audit trail.
            </Text>
          </View>
          {loadingKey === "pdf" ? (
            <ActivityIndicator color="#f5a623" accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#6b7280" style={{ marginLeft: 8 }} accessible={false} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => handleDownload("csv")}
          disabled={loadingKey !== null}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Download Trip Data CSV for tax year"
          accessibilityState={{ disabled: loadingKey !== null }}
        >
          <View style={styles.rowIconWrap}>
            <Ionicons name="grid" size={20} color="#6b7280" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Trip Data (CSV)</Text>
            <Text style={styles.rowDesc}>
              Raw trip data with HMRC rates. Import into Excel or accounting software.
            </Text>
          </View>
          {loadingKey === "csv" ? (
            <ActivityIndicator color="#f5a623" accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#6b7280" style={{ marginLeft: 8 }} accessible={false} />
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
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
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
    lineHeight: 18,
  },
  hmrcBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  hmrcBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#10b981",
    letterSpacing: 0.5,
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
    backgroundColor: "#0a1120",
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
  paywallLegal: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    marginTop: 8,
  },
  paywallLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  paywallLink: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#3b82f6",
  },
  paywallSep: {
    fontSize: 11,
    color: "#4b5563",
  },
  saWizardRow: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.2)",
  },
  saWizardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(245,166,35,0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  saWizardTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
    marginBottom: 3,
  },
  saWizardDesc: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    lineHeight: 17,
  },
});
