import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import { uploadCsvPreview, confirmCsvImport } from "../lib/api/earnings";

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

const PLATFORM_OPTIONS = [
  { value: "", label: "Auto-detect" },
  ...GIG_PLATFORMS,
];

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

export default function CsvImportScreen() {
  const router = useRouter();
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
      Alert.alert("Error", err.message || "Failed to parse CSV");
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
      Alert.alert("Import failed", err.message || "Failed to import earnings");
    } finally {
      setImporting(false);
    }
  };

  const renderRow = ({ item, index }: { item: CsvEarningRow; index: number }) => (
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
    backgroundColor: "#030712",
  },
  content: {
    padding: 20,
    flex: 1,
  },
  heading: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginBottom: 24,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
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
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  chipActive: {
    backgroundColor: "#f5a623",
    borderColor: "#f5a623",
  },
  chipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  chipTextActive: {
    color: "#030712",
  },
  fileLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#d1d5db",
    marginBottom: 16,
  },
  // Preview
  previewHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  previewTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    marginBottom: 4,
  },
  previewSubtitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginBottom: 4,
  },
  previewTotal: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#10b981",
  },
  listContent: {
    padding: 16,
  },
  rowCard: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1f2937",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
  },
  dupBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#9ca3af",
    backgroundColor: "#374151",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  rowAmount: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#10b981",
    marginBottom: 2,
  },
  rowAmountDup: {
    color: "#6b7280",
  },
  rowDate: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  footerButtons: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#10b981",
    marginBottom: 16,
  },
  resultStat: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
    marginBottom: 8,
  },
  resultSkipped: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginBottom: 24,
  },
});
