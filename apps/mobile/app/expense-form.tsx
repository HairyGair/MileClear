import { useEffect, useState, useCallback, useMemo } from "react";
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
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from "../lib/api/expenses";
import { fetchVehicles } from "../lib/api/vehicles";
import { EXPENSE_CATEGORIES } from "@mileclear/shared";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { Button } from "../components/Button";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

const AMBER = colors.amber;
const BG = colors.bg;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const RED = colors.red;
const BORDER = "rgba(255,255,255,0.06)";

type VehicleLite = { id: string; make: string; model: string };

export default function ExpenseFormScreen() {
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

  const [category, setCategory] = useState<string>("");
  const [amount, setAmount] = useState(prefillAmount ?? "");
  const [date, setDate] = useState<Date | null>(
    prefillDate ? new Date(prefillDate) : new Date()
  );
  const [vendor, setVendor] = useState(prefillVendor ?? "");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [projectLabel, setProjectLabel] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<VehicleLite[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  // Load vehicles for the optional picker
  useEffect(() => {
    fetchVehicles()
      .then((res) => {
        const list = (res.data ?? []) as VehicleLite[];
        setVehicles(list);
      })
      .catch(() => setVehicles([]));
  }, []);

  // Load existing expense when editing
  useEffect(() => {
    if (!id) return;
    fetchExpenses({ pageSize: 1000 })
      .then((res) => {
        const found = (res.data ?? []).find((e: any) => e.id === id);
        if (!found) {
          Alert.alert("Not found", "This expense no longer exists.");
          router.back();
          return;
        }
        setCategory(found.category);
        setAmount((found.amountPence / 100).toFixed(2));
        setDate(new Date(found.date));
        setVendor(found.vendor ?? "");
        setDescription(found.description ?? "");
        setNotes(found.notes ?? "");
        setProjectLabel(((found as { projectLabel?: string }).projectLabel) ?? "");
        setVehicleId(found.vehicleId ?? null);
      })
      .catch((e) => {
        Alert.alert("Couldn't load expense", e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoadingExisting(false));
  }, [id, router]);

  const selectedCategory = useMemo(
    () => EXPENSE_CATEGORIES.find((c) => c.value === category),
    [category]
  );

  const handleSave = useCallback(async () => {
    if (!category) {
      Alert.alert("Pick a category", "Choose what kind of expense this is.");
      return;
    }
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      Alert.alert("Enter an amount", "Amount must be a positive number.");
      return;
    }
    if (!date) {
      Alert.alert("Pick a date", "When did this expense happen?");
      return;
    }
    const amountPence = Math.round(amountNum * 100);
    const payload = {
      category,
      amountPence,
      date: date.toISOString().slice(0, 10),
      vendor: vendor.trim() || undefined,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
      vehicleId: vehicleId || undefined,
      projectLabel: projectLabel.trim() || undefined,
    };
    setSaving(true);
    try {
      if (isEditing && id) {
        await updateExpense(id, payload);
      } else {
        await createExpense(payload);
      }
      haptic("success");
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    category,
    amount,
    date,
    vendor,
    description,
    notes,
    vehicleId,
    projectLabel,
    isEditing,
    id,
    router,
  ]);

  const handleDelete = useCallback(() => {
    if (!id) return;
    Alert.alert("Delete expense?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteExpense(id);
            haptic("success");
            router.back();
          } catch (e) {
            Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }, [id, router]);

  if (loadingExisting) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: isEditing ? "Edit Expense" : "Add Expense" }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={AMBER} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: isEditing ? "Edit Expense" : "Add Expense" }} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Receipt scan shortcut (only on new) */}
        {!isEditing ? (
          <TouchableOpacity
            style={styles.scanCta}
            onPress={() => router.push("/receipt-scan?target=expense")}
            activeOpacity={0.85}
          >
            <Ionicons name="scan-outline" size={18} color={AMBER} />
            <Text style={styles.scanCtaText}>Scan a receipt to auto-fill</Text>
            <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
          </TouchableOpacity>
        ) : null}

        {/* Category */}
        <Text style={styles.fieldLabel}>Category</Text>
        <TouchableOpacity
          style={styles.picker}
          onPress={() => setCategoryPickerOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.pickerText, !category && styles.placeholder]}>
            {selectedCategory ? selectedCategory.label : "Choose a category"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={TEXT_3} />
        </TouchableOpacity>
        {selectedCategory && "allowableNote" in selectedCategory ? (
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={16} color={AMBER} />
            <Text style={styles.noteText}>
              {(selectedCategory as { allowableNote: string }).allowableNote}
            </Text>
          </View>
        ) : null}

        {/* Amount */}
        <Text style={styles.fieldLabel}>Amount (GBP)</Text>
        <View style={styles.amountRow}>
          <Text style={styles.currencyPrefix}>£</Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={TEXT_3}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Date */}
        <DateTimePickerField
          label="Date"
          value={date}
          onChange={setDate}
        />

        {/* Vendor */}
        <Text style={styles.fieldLabel}>Vendor / Where</Text>
        <TextInput
          style={styles.input}
          value={vendor}
          onChangeText={setVendor}
          placeholder="e.g. Shell, NCP, Halfords"
          placeholderTextColor={TEXT_3}
        />

        {/* Description */}
        <Text style={styles.fieldLabel}>Description (optional)</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="What was it for?"
          placeholderTextColor={TEXT_3}
        />

        {/* Vehicle (optional) */}
        {vehicles.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>Vehicle (optional)</Text>
            <View style={styles.vehicleRow}>
              <TouchableOpacity
                style={[
                  styles.vehicleChip,
                  vehicleId === null && styles.vehicleChipActive,
                ]}
                onPress={() => setVehicleId(null)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.vehicleChipText,
                    vehicleId === null && styles.vehicleChipTextActive,
                  ]}
                >
                  None
                </Text>
              </TouchableOpacity>
              {vehicles.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.vehicleChip,
                    vehicleId === v.id && styles.vehicleChipActive,
                  ]}
                  onPress={() => setVehicleId(v.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.vehicleChipText,
                      vehicleId === v.id && styles.vehicleChipTextActive,
                    ]}
                  >
                    {v.make} {v.model}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        {/* Project / client (optional, freeform) */}
        <Text style={styles.fieldLabel}>Project / client (optional)</Text>
        <TextInput
          style={styles.input}
          value={projectLabel}
          onChangeText={setProjectLabel}
          placeholder="e.g. Theatre Royal tour, Acme Ltd"
          placeholderTextColor={TEXT_3}
        />

        {/* Notes */}
        <Text style={styles.fieldLabel}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything else you want to remember"
          placeholderTextColor={TEXT_3}
          multiline
          numberOfLines={3}
        />

        {/* Save */}
        <View style={styles.actions}>
          <Button
            title={isEditing ? "Save changes" : "Add expense"}
            onPress={handleSave}
            loading={saving}
            disabled={saving || deleting}
          />
          {isEditing ? (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleting}
              style={styles.deleteButton}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteText}>
                {deleting ? "Deleting..." : "Delete expense"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      {/* Category picker modal */}
      <Modal
        visible={categoryPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoryPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCategoryPickerOpen(false)}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose a category</Text>
            <ScrollView style={styles.modalList}>
              {EXPENSE_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[
                    styles.modalItem,
                    category === c.value && styles.modalItemActive,
                  ]}
                  onPress={() => {
                    setCategory(c.value);
                    setCategoryPickerOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.modalItemBody}>
                    <Text style={styles.modalItemLabel}>{c.label}</Text>
                    <Text style={styles.modalItemBox}>SA103S box {c.sa103sBox}</Text>
                  </View>
                  {category === c.value ? (
                    <Ionicons name="checkmark" size={20} color={AMBER} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 20, paddingBottom: 40 },

  scanCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: `${AMBER}14`,
    borderColor: AMBER,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  scanCtaText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: AMBER,
  },

  fieldLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginTop: 18,
    marginBottom: 8,
  },

  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  pickerText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: TEXT_1,
  },
  placeholder: { color: TEXT_3 },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: `${AMBER}10`,
    borderColor: `${AMBER}40`,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 18,
  },

  input: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: TEXT_1,
    borderWidth: 1,
    borderColor: BORDER,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencyPrefix: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginRight: 10,
  },
  amountInput: { flex: 1 },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  vehicleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vehicleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  vehicleChipActive: {
    backgroundColor: `${AMBER}26`,
    borderColor: AMBER,
  },
  vehicleChipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  vehicleChipTextActive: { color: AMBER },

  actions: {
    marginTop: 28,
    gap: 12,
  },
  deleteButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: RED,
  },

  // Category picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: "80%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: TEXT_3,
    opacity: 0.4,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 12,
  },
  modalList: { maxHeight: 480 },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  modalItemActive: {
    backgroundColor: `${AMBER}14`,
  },
  modalItemBody: { flex: 1, gap: 2 },
  modalItemLabel: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  modalItemBox: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
});
