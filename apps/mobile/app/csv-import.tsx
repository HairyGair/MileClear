import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import { uploadCsvPreview, confirmCsvImport } from "../lib/api/earnings";
import { useUser } from "../lib/user/context";
import { isIapAvailable, purchaseSubscription } from "../lib/iap/index";
import { createCheckoutSession } from "../lib/api/billing";
import * as WebBrowser from "expo-web-browser";

// expo-document-picker native module may not be available in Expo Go
let DocumentPicker: typeof import("expo-document-picker") | null = null;
try {
  DocumentPicker = require("expo-document-picker");
} catch {
  // Will show user-friendly error when they try to pick a file
}
import { Button } from "../components/Button";
import { GIG_PLATFORMS, formatPence } from "@mileclear/shared";
import type { CsvEarningRow, CsvParsePreview } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;

const PLATFORM_OPTIONS = [
  { value: "", label: "Auto-detect" },
  ...GIG_PLATFORMS,
];

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

export default function CsvImportScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [preview, setPreview] = useState<CsvParsePreview | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const pickFile = async () => {
    if (!DocumentPicker || !FileSystem) {
      Alert.alert(
        "Not Available",
        "CSV import requires a development build. It is not supported in Expo Go."
      );
      return;
    }

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "*/*"],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;

      const file = res.assets[0];
      setFilename(file.name);
      setLoading(true);
      setPreview(null);
      setResult(null);

      const csvContent = await FileSystem.readAsStringAsync(file.uri);

      const response = await uploadCsvPreview(
        csvContent,
        selectedPlatform || undefined
      );
      setPreview(response.data);
    } catch (err: any) {
      Alert.alert("Couldn't read the CSV", err.message || "Check the file and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;

    const nonDuplicates = preview.rows.filter((r) => !r.isDuplicate);
    if (nonDuplicates.length === 0) {
      Alert.alert("Nothing to import", "All rows are duplicates of existing earnings.");
      return;
    }

    setImporting(true);
    try {
      const response = await confirmCsvImport(
        preview.rows,
        filename || undefined
      );
      setResult(response.data);
      setPreview(null);
    } catch (err: any) {
      Alert.alert("Import didn't go through", err.message || "Try again in a moment.");
    } finally {
      setImporting(false);
    }
  };

  const renderRow = ({ item, index: _index }: { item: CsvEarningRow; index: number }) => (
    <View style={[styles.rowCard, item.isDuplicate && styles.rowDuplicate]}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowPlatform}>
          {PLATFORM_LABELS[item.platform] ?? item.platform}
        </Text>
        {item.isDuplicate && (
          <Text style={styles.dupBadge}>Duplicate</Text>
        )}
      </View>
      <Text style={[styles.rowAmount, item.isDuplicate && styles.rowAmountDup]}>
        {formatPence(item.amountPence)}
      </Text>
      <Text style={styles.rowDate}>{item.periodStart}</Text>
    </View>
  );

  // Result screen
  if (result) {
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Import Complete</Text>
          <Text style={styles.resultStat}>
            {result.imported} earning{result.imported !== 1 ? "s" : ""} imported
          </Text>
          {result.skipped > 0 && (
            <Text style={styles.resultSkipped}>
              {result.skipped} duplicate{result.skipped !== 1 ? "s" : ""} skipped
            </Text>
          )}
          <Button
            title="Back to Earnings"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  // Preview screen
  if (preview) {
    const newCount = preview.rows.filter((r) => !r.isDuplicate).length;
    return (
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewTitle}>
            {preview.rows.length} row{preview.rows.length !== 1 ? "s" : ""} found
          </Text>
          <Text style={styles.previewSubtitle}>
            Platform: {PLATFORM_LABELS[preview.platform] ?? preview.platform}
            {preview.duplicateCount > 0 &&
              ` | ${preview.duplicateCount} duplicate${preview.duplicateCount !== 1 ? "s" : ""}`}
          </Text>
          <Text style={styles.previewTotal}>
            New total: {formatPence(preview.totalAmountPence)}
          </Text>
        </View>

        <FlatList
          data={preview.rows}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
        />

        <View style={styles.footerButtons}>
          <Button
            variant="secondary"
            title="Cancel"
            onPress={() => setPreview(null)}
            style={{ flex: 1 }}
          />
          <Button
            title={`Import ${newCount} Earning${newCount !== 1 ? "s" : ""}`}
            onPress={handleImport}
            loading={importing}
            disabled={newCount === 0}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    );
  }

  // Premium gate
  if (!user?.isPremium) {
    const handleUpgrade = async () => {
      try {
        if (isIapAvailable()) {
          await purchaseSubscription("monthly", user?.id);
        } else {
          const res = await createCheckoutSession();
          if (res.data?.url) await WebBrowser.openBrowserAsync(res.data.url);
        }
      } catch (err: any) {
        if (!err.message?.includes("cancel")) {
          Alert.alert("Upgrade didn't go through", err.message || "Try again in a moment.");
        }
      }
    };

    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.heading}>Import CSV</Text>
          <Text style={styles.description}>
            CSV import is a Pro feature. Upgrade to bulk-import earnings from Uber, Deliveroo, Amazon Flex, and more.
          </Text>
          <Button title="Upgrade to Pro" onPress={handleUpgrade} />
          <Text style={{ fontSize: 11, fontFamily: fonts.regular, color: TEXT_3, textAlign: "center", marginTop: 10 }}>
            Auto-renews monthly. Cancel anytime.
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontFamily: fonts.medium, color: "#3b82f6" }} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/terms")}>Terms of Use</Text>
            <Text style={{ fontSize: 11, color: TEXT_3 }}>|</Text>
            <Text style={{ fontSize: 11, fontFamily: fonts.medium, color: "#3b82f6" }} onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/privacy")}>Privacy Policy</Text>
          </View>
          <Button
            variant="ghost"
            title="Go Back"
            onPress={() => router.back()}
            style={{ marginTop: 12 }}
          />
        </View>
      </View>
    );
  }

  // File picker screen
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.heading}>Import CSV</Text>
        <Text style={styles.description}>
          Upload an earnings CSV downloaded from your driver portal (Uber, Deliveroo, Amazon Flex, etc.)
        </Text>

        {/* Platform override */}
        <Text style={styles.label}>Platform (optional)</Text>
        <View style={styles.chipRow}>
          {PLATFORM_OPTIONS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[
                styles.chip,
                selectedPlatform === p.value && styles.chipActive,
              ]}
              onPress={() => setSelectedPlatform(p.value)}
              accessibilityRole="button"
              accessibilityLabel={`Platform: ${p.label}`}
              accessibilityState={{ selected: selectedPlatform === p.value }}
            >
              <Text
                style={[
                  styles.chipText,
                  selectedPlatform === p.value && styles.chipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filename && (
          <Text style={styles.fileLabel}>Selected: {filename}</Text>
        )}

        <Button
          title={filename ? "Pick Different File" : "Select CSV File"}
          icon="document-outline"
          onPress={pickFile}
          loading={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 20,
    flex: 1,
  },
  heading: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: "#fff",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 24,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  chipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  chipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  chipTextActive: {
    color: BG,
  },
  fileLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 16,
  },
  // Preview
  previewHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  previewTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: "#fff",
    marginBottom: 4,
  },
  previewSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 4,
  },
  previewTotal: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: GREEN,
  },
  listContent: {
    padding: 16,
  },
  rowCard: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowDuplicate: {
    opacity: 0.5,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  rowPlatform: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: "#fff",
  },
  dupBadge: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: TEXT_2,
    backgroundColor: "#374151",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  rowAmount: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: GREEN,
    marginBottom: 2,
  },
  rowAmountDup: {
    color: TEXT_3,
  },
  rowDate: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  footerButtons: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  // Result
  resultCard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  resultTitle: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: GREEN,
    marginBottom: 16,
  },
  resultStat: {
    fontSize: 18,
    fontFamily: fonts.semibold,
    color: "#fff",
    marginBottom: 8,
  },
  resultSkipped: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 24,
  },
});
