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
import { fetchEarning } from "../lib/api/earnings";
import {
  syncCreateEarning,
  syncUpdateEarning,
  syncDeleteEarning,
} from "../lib/sync/actions";
import { GIG_PLATFORMS } from "@mileclear/shared";

export default function EarningFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [platform, setPlatform] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);

  useEffect(() => {
    if (!id) {
      // Pre-fill dates for new earning
      const today = new Date().toISOString().slice(0, 10);
      setPeriodStart(today);
      setPeriodEnd(today);
      return;
    }
    fetchEarning(id)
      .then((res) => {
        const earning = res.data;
        setPlatform(earning.platform);
        setAmount((earning.amountPence / 100).toFixed(2));
        setPeriodStart(earning.periodStart.slice(0, 10));
        setPeriodEnd(earning.periodEnd.slice(0, 10));
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
    if (!periodStart.trim() || !periodEnd.trim()) {
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
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        });
      } else {
        await syncCreateEarning({
          platform,
          amountPence,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        });
      }
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save earning");
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
        <ActivityIndicator size="large" color="#f59e0b" />
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
          <Text style={styles.currencyPrefix}>£</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#6b7280"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Period Start */}
        <Text style={styles.label}>Period Start *</Text>
        <TextInput
          style={styles.input}
          value={periodStart}
          onChangeText={setPeriodStart}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#6b7280"
        />

        {/* Period End */}
        <Text style={styles.label}>Period End *</Text>
        <TextInput
          style={styles.input}
          value={periodEnd}
          onChangeText={setPeriodEnd}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#6b7280"
        />

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving || deleting}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator color="#030712" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditing ? "Save Changes" : "Add Earning"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Delete — edit mode only */}
        {isEditing && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={saving || deleting}
            activeOpacity={0.7}
          >
            {deleting ? (
              <ActivityIndicator color="#ef4444" />
            ) : (
              <Text style={styles.deleteText}>Delete Earning</Text>
            )}
          </TouchableOpacity>
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
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1f2937",
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
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  platformChipActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
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
  // Buttons
  saveButton: {
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  deleteButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  deleteText: {
    fontSize: 15,
    color: "#ef4444",
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
});
