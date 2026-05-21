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
import { usePaywall } from "../components/paywall";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
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
    [selectedYear, showPaywall]
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Tax Exports",
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Ionicons name="chevron-back" size={26} color={AMBER} />
            </TouchableOpacity>
          ),
        }}
      />
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
            <Ionicons name="document-text-outline" size={20} color={AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.saWizardTitle}>Self Assessment Guide</Text>
            <Text style={styles.saWizardDesc}>
              Step-by-step SA103 walkthrough with income, mileage, expenses and tax estimate
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} />
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
            <Ionicons name="shield-checkmark" size={20} color={GREEN} />
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
            <ActivityIndicator color={AMBER} accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} accessible={false} />
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
            <Ionicons name="document-text" size={20} color={AMBER} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Trip Report (PDF)</Text>
            <Text style={styles.rowDesc}>
              Branded trip-by-trip report with summary stats. Unique report reference for audit trail.
            </Text>
          </View>
          {loadingKey === "pdf" ? (
            <ActivityIndicator color={AMBER} accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} accessible={false} />
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
            <Ionicons name="grid" size={20} color={TEXT_3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Trip Data (CSV)</Text>
            <Text style={styles.rowDesc}>
              Raw trip data with HMRC rates. Import into Excel or accounting software.
            </Text>
          </View>
          {loadingKey === "csv" ? (
            <ActivityIndicator color={AMBER} accessibilityLabel="Loading" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={TEXT_3} style={{ marginLeft: 8 }} accessible={false} />
          )}
        </TouchableOpacity>

        {/* Coming Soon rows */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>
          Accounting Integrations
        </Text>

        {["Xero", "FreeAgent"].map((name) => (
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
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 24,
  },
  yearPicker: {
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  yearValue: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: "#fff",
    marginBottom: 12,
  },
  row: {
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.semibold,
    color: "#fff",
    marginBottom: 4,
  },
  rowDesc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_3,
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
    fontFamily: fonts.bold,
    color: GREEN,
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
    fontFamily: fonts.bold,
    color: TEXT_2,
    backgroundColor: "#374151",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  paywallBanner: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AMBER,
  },
  paywallTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: AMBER,
    marginBottom: 4,
  },
  paywallText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 20,
    marginBottom: 10,
  },
  paywallCta: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  paywallLegal: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
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
    fontFamily: fonts.medium,
    color: "#3b82f6",
  },
  paywallSep: {
    fontSize: 11,
    color: TEXT_3,
  },
  saWizardRow: {
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.semibold,
    color: "#fff",
    marginBottom: 3,
  },
  saWizardDesc: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 17,
  },
});
