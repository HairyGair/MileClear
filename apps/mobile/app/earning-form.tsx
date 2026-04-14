import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { showSupportAlert } from "../lib/support";
import { fetchEarning } from "../lib/api/earnings";
import { getLocalEarning } from "../lib/db/queries";
import {
  syncCreateEarning,
  syncUpdateEarning,
  syncDeleteEarning,
} from "../lib/sync/actions";
import { GIG_PLATFORMS } from "@mileclear/shared";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { Button } from "../components/Button";
import { isOcrAvailable } from "../lib/ocr";

export default function EarningFormScreen() {
  const router = useRouter();
  const {
    id,
    prefillAmount,
    prefillDate,
    prefillVendor,
  } = useLocalSearchParams<{
    id?: string;
    prefillAmount?: string;
    prefillDate?: string;
    prefillVendor?: string;
  }>();
  const isEditing = !!id;

  const [platform, setPlatform] = useState<string>("");
  const [amount, setAmount] = useState(prefillAmount ?? "");
  const [periodStart, setPeriodStart] = useState<Date | null>(
    prefillDate ? new Date(prefillDate) : new Date()
  );
  const [periodEnd, setPeriodEnd] = useState<Date | null>(
    prefillDate ? new Date(prefillDate) : new Date()
  );
  const [notes, setNotes] = useState(prefillVendor ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);

  useEffect(() => {
    if (!id) return;
    const populateEarning = (earning: {
      platform: string; amountPence: number;
      periodStart: string; periodEnd: string;
    }) => {
      setPlatform(earning.platform);
      setAmount((earning.amountPence / 100).toFixed(2));
      setPeriodStart(new Date(earning.periodStart));
      setPeriodEnd(new Date(earning.periodEnd));
    };

    fetchEarning(id)
      .then((res) => {
        populateEarning(res.data);
        // Clear any scan pre-fills when loading an existing record
        setNotes("");
      })
      .catch(async () => {
        const local = await getLocalEarning(id);
        if (local) {
          populateEarning(local);
          setNotes("");
        }
      })
      .finally(() => setLoadingExisting(false));
  }, [id]);

  const handleSave = useCallback(async () => {
    if (!platform) {
      Alert.alert("Missing fields", "Please select a platform.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Please enter an amount greater than 0.");
      return;
    }
    if (!periodStart || !periodEnd) {
      Alert.alert("Missing fields", "Both period dates are required.");
      return;
    }
    if (periodEnd < periodStart) {
      Alert.alert("Invalid dates", "Period end must be on or after period start.");
      return;
    }

    const amountPence = Math.round(parsedAmount * 100);

    setSaving(true);
    try {
      if (isEditing) {
        await syncUpdateEarning(id, {
          platform,
          amountPence,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      } else {
        await syncCreateEarning({
          platform,
          amountPence,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      }
      router.back();
    } catch (err: unknown) {
      showSupportAlert("Save Failed", err instanceof Error ? err.message : "Failed to save earning.");
    } finally {
      setSaving(false);
    }
  }, [isEditing, id, platform, amount, periodStart, periodEnd, router]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete earning", "Remove this earning? This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await syncDeleteEarning(id!);
            router.back();
          } catch (err: unknown) {
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
            setDeleting(false);
          }
        },
      },
    ]);
  }, [id, router]);

  if (loadingExisting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f5a623" accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{ title: isEditing ? "Edit Earning" : "Add Earning" }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Scan Receipt — only shown when adding a new earning on a native build */}
        {!isEditing && isOcrAvailable() && (
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => router.push("/receipt-scan")}
            accessibilityRole="button"
            accessibilityLabel="Scan a receipt to pre-fill this form"
          >
            <Text style={styles.scanButtonText}>Scan Receipt</Text>
          </TouchableOpacity>
        )}

        {/* Platform */}
        <Text style={styles.label}>Platform *</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.platformRow}
        >
          {GIG_PLATFORMS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[
                styles.platformChip,
                platform === p.value && styles.platformChipActive,
              ]}
              onPress={() => setPlatform(p.value)}
              accessibilityRole="button"
              accessibilityLabel={`${p.label} platform`}
              accessibilityState={{ selected: platform === p.value }}
            >
              <Text
                style={[
                  styles.platformChipText,
                  platform === p.value && styles.platformChipTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Amount */}
        <Text style={styles.label}>Amount *</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencyPrefix} accessible={false}>£</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#6b7280"
            keyboardType="decimal-pad"
            accessibilityLabel="Amount in pounds"
          />
        </View>

        {/* Notes / Vendor (pre-filled from receipt scan) */}
        {notes.trim().length > 0 && (
          <View>
            <Text style={styles.label}>Notes (from scan)</Text>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Tesco Petrol"
              placeholderTextColor="#6b7280"
              accessibilityLabel="Notes or vendor from receipt scan"
            />
          </View>
        )}

        {/* Period Start */}
        <DateTimePickerField
          label="Period Start *"
          value={periodStart}
          onChange={setPeriodStart}
          maximumDate={new Date()}
        />

        {/* Period End */}
        <DateTimePickerField
          label="Period End *"
          value={periodEnd}
          onChange={setPeriodEnd}
          maximumDate={new Date()}
        />

        {/* Save */}
        <Button
          title={isEditing ? "Save Changes" : "Add Earning"}
          icon="checkmark"
          onPress={handleSave}
          loading={saving}
          disabled={deleting}
          style={{ marginTop: 28 }}
        />

        {/* Delete — edit mode only */}
        {isEditing && (
          <Button
            variant="ghost"
            danger
            title="Delete Earning"
            onPress={handleDelete}
            loading={deleting}
            disabled={saving}
            style={{ marginTop: 12 }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#030712",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#0a1120",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  // Scan receipt button
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,166,35,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f5a623",
    paddingVertical: 12,
    marginBottom: 20,
  },
  scanButtonText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
  // Platform chips
  platformRow: {
    gap: 8,
    paddingVertical: 2,
  },
  platformChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  platformChipActive: {
    backgroundColor: "#f5a623",
    borderColor: "#f5a623",
  },
  platformChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  platformChipTextActive: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  // Amount row
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyPrefix: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
  },
});
