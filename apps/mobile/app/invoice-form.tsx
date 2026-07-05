import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  fetchInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  type Invoice,
  type PotentialEarningMatch,
} from "../lib/api/invoices";
import { isApiError } from "../lib/api";
import { usePaywall } from "../components/paywall";
import { LinkEarningSheet } from "../components/invoices/LinkEarningSheet";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function InvoiceFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const { showPaywall } = usePaywall();

  const [company, setCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [reference, setReference] = useState("");
  const [amountInput, setAmountInput] = useState(""); // pounds.pence string
  const [sentDate, setSentDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  });
  const [paidDate, setPaidDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [activePicker, setActivePicker] = useState<"sent" | "due" | "paid" | null>(null);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Track the initial paid state so we know on save whether this is a
  // "marking paid" transition — only then do we show the link-earning
  // sheet. Editing an already-paid invoice's amount shouldn't re-nag.
  const [initialPaidAt, setInitialPaidAt] = useState<Date | null>(null);
  const [linkSheet, setLinkSheet] = useState<{ invoice: Invoice; matches: PotentialEarningMatch[] } | null>(null);

  // Auto-update due date when sent date changes (unless user has already overridden)
  const [dueDateOverridden, setDueDateOverridden] = useState(false);
  useEffect(() => {
    if (!dueDateOverridden) {
      const d = new Date(sentDate);
      d.setDate(d.getDate() + 30);
      setDueDate(d);
    }
  }, [sentDate, dueDateOverridden]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetchInvoice(id);
        const inv = res.data;
        setCompany(inv.company);
        setClientEmail(inv.clientEmail ?? "");
        setReference(inv.reference ?? "");
        setAmountInput((inv.amountPence / 100).toFixed(2));
        setSentDate(new Date(inv.sentAt));
        setDueDate(new Date(inv.dueAt));
        setPaidDate(inv.paidAt ? new Date(inv.paidAt) : null);
        setInitialPaidAt(inv.paidAt ? new Date(inv.paidAt) : null);
        setNotes(inv.notes ?? "");
        setDueDateOverridden(true); // assume any loaded due date is intentional
      } catch (err) {
        Alert.alert("Couldn't load", err instanceof Error ? err.message : "Try again.");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onSave = useCallback(async () => {
    if (!company.trim()) {
      Alert.alert("Missing company", "Who is this invoice for?");
      return;
    }
    const pounds = parseFloat(amountInput);
    if (!Number.isFinite(pounds) || pounds <= 0) {
      Alert.alert("Missing amount", "Enter the invoice amount in pounds.");
      return;
    }
    const amountPence = Math.round(pounds * 100);

    setSaving(true);
    try {
      const payload = {
        company: company.trim(),
        clientEmail: clientEmail.trim() || null,
        reference: reference.trim() || null,
        amountPence,
        sentAt: dateOnly(sentDate),
        dueAt: dateOnly(dueDate),
        paidAt: paidDate ? dateOnly(paidDate) : null,
        notes: notes.trim() || null,
      };
      const res = isEditing && id
        ? await updateInvoice(id, payload)
        : await createInvoice(payload);
      haptic("success");

      // Show the link-earning sheet only on a real "marking paid"
      // transition: new invoice saved as paid, OR existing unpaid
      // invoice just flipped to paid. The server returns
      // potentialEarningMatches on exactly these transitions.
      const wasPaidBefore = initialPaidAt !== null;
      const isPaidNow = !!paidDate;
      const transitionedToPaid = !wasPaidBefore && isPaidNow;
      const matches = res.potentialEarningMatches ?? [];

      if (transitionedToPaid && matches.length > 0) {
        setLinkSheet({ invoice: res.data, matches });
        setSaving(false);
        return; // stay on screen until the sheet resolves
      }
      router.back();
    } catch (err) {
      // Free-tier monthly cap (3 invoices/month) returns PREMIUM_REQUIRED.
      // Surface the paywall instead of a generic error so the user gets
      // a clear next step — and we get a conversion moment in the right
      // place: at the point they're trying to do more than the free
      // tier supports.
      if (isApiError(err) && err.code === "PREMIUM_REQUIRED") {
        setSaving(false);
        Alert.alert(
          "Free plan limit reached",
          err.message ?? "Free plan tracks 3 invoices per month. Upgrade to Pro for unlimited.",
          [
            { text: "Maybe later", style: "cancel" },
            {
              text: "See Pro",
              style: "default",
              onPress: () => showPaywall("invoice_tracker"),
            },
          ]
        );
        return;
      }
      Alert.alert("Couldn't save", err instanceof Error ? err.message : "Try again.");
      setSaving(false);
    }
  }, [company, clientEmail, reference, amountInput, sentDate, dueDate, paidDate, notes, isEditing, id, initialPaidAt, showPaywall]);

  const onDelete = useCallback(() => {
    if (!id) return;
    Alert.alert("Delete invoice", "Remove this invoice? This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteInvoice(id);
            router.back();
          } catch (err) {
            Alert.alert("Couldn't delete", err instanceof Error ? err.message : "Try again.");
            setDeleting(false);
          }
        },
      },
    ]);
  }, [id]);

  const onMarkPaidToggle = useCallback(() => {
    if (paidDate) {
      setPaidDate(null);
    } else {
      setPaidDate(new Date());
    }
  }, [paidDate]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <Stack.Screen options={{ title: isEditing ? "Edit invoice" : "Add invoice", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
        <ActivityIndicator color={AMBER} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: BG }}
    >
      <Stack.Screen
        options={{
          title: isEditing ? "Edit invoice" : "Add invoice",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT_1,
          headerRight: () =>
            isEditing ? (
              <TouchableOpacity onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete invoice">
                <Ionicons name="trash-outline" size={20} color={TEXT_3} />
              </TouchableOpacity>
            ) : null,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
        <Field label="COMPANY / CLIENT">
          <TextInput
            style={styles.input}
            value={company}
            onChangeText={setCompany}
            placeholder="Who's the invoice to?"
            placeholderTextColor={TEXT_3}
            autoCapitalize="words"
            autoCorrect={false}
            accessibilityLabel="Company or client"
          />
        </Field>

        <Field label="CLIENT EMAIL (optional)">
          <TextInput
            style={styles.input}
            value={clientEmail}
            onChangeText={setClientEmail}
            placeholder="Pre-fills the chase email if they pay late"
            placeholderTextColor={TEXT_3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Client email, optional"
          />
        </Field>

        <Field label="AMOUNT (£)">
          <TextInput
            style={styles.input}
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder="0.00"
            placeholderTextColor={TEXT_3}
            keyboardType="decimal-pad"
            inputMode="decimal"
            accessibilityLabel="Amount in pounds"
          />
        </Field>

        <Field label="REFERENCE (optional)">
          <TextInput
            style={styles.input}
            value={reference}
            onChangeText={setReference}
            placeholder="PO number, job ID..."
            placeholderTextColor={TEXT_3}
            autoCapitalize="characters"
            accessibilityLabel="Reference, optional"
          />
        </Field>

        <Field label="DATE SENT">
          <TouchableOpacity
            style={styles.input}
            onPress={() => setActivePicker("sent")}
            accessibilityRole="button"
            accessibilityLabel={`Date sent, ${formatHuman(sentDate)}`}
          >
            <Text style={styles.dateText}>{formatHuman(sentDate)}</Text>
          </TouchableOpacity>
        </Field>

        <Field label="DUE DATE (auto-set to 30 days)">
          <TouchableOpacity
            style={styles.input}
            onPress={() => setActivePicker("due")}
            accessibilityRole="button"
            accessibilityLabel={`Due date, ${formatHuman(dueDate)}`}
          >
            <Text style={styles.dateText}>{formatHuman(dueDate)}</Text>
          </TouchableOpacity>
        </Field>

        <View style={styles.paidToggle}>
          <TouchableOpacity
            style={[
              styles.paidToggleButton,
              paidDate ? styles.paidToggleButtonActive : null,
            ]}
            onPress={onMarkPaidToggle}
            accessibilityRole="button"
            accessibilityLabel={paidDate ? "Mark as unpaid" : "Mark as paid"}
          >
            <Ionicons
              name={paidDate ? "checkmark-circle" : "checkmark-circle-outline"}
              size={18}
              color={paidDate ? "#000" : GREEN}
            />
            <Text
              style={[
                styles.paidToggleText,
                paidDate ? { color: "#000" } : { color: GREEN },
              ]}
            >
              {paidDate ? `Paid ${formatHuman(paidDate)}` : "Mark as paid"}
            </Text>
          </TouchableOpacity>
          {paidDate && (
            <TouchableOpacity
              onPress={() => setActivePicker("paid")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Change paid date"
            >
              <Text style={styles.editPaidDate}>Change date</Text>
            </TouchableOpacity>
          )}
        </View>

        <Field label="NOTES (optional)">
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything to remember for your accountant?"
            placeholderTextColor={TEXT_3}
            multiline
            numberOfLines={3}
            accessibilityLabel="Notes, optional"
          />
        </Field>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={onSave}
          disabled={saving || deleting}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? "Save changes" : "Add invoice"}
          accessibilityState={{ disabled: saving || deleting }}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color="#000" />
              <Text style={styles.saveButtonText}>{isEditing ? "Save changes" : "Add invoice"}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {activePicker && (
        <DateTimePicker
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          value={
            activePicker === "sent" ? sentDate :
            activePicker === "due" ? dueDate :
            paidDate ?? new Date()
          }
          onChange={(_event, selected) => {
            setActivePicker(null);
            if (!selected) return;
            if (activePicker === "sent") setSentDate(selected);
            else if (activePicker === "due") { setDueDate(selected); setDueDateOverridden(true); }
            else if (activePicker === "paid") setPaidDate(selected);
          }}
          themeVariant="dark"
        />
      )}

      <LinkEarningSheet
        visible={linkSheet !== null}
        invoice={linkSheet?.invoice ?? null}
        matches={linkSheet?.matches ?? []}
        onResolved={() => {
          setLinkSheet(null);
          router.back();
        }}
        onClose={() => {
          setLinkSheet(null);
          router.back();
        }}
      />
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function formatHuman(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { alignItems: "center", justifyContent: "center" },
  field: { marginBottom: 14 },
  fieldLabel: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    backgroundColor: CARD_BG,
    color: TEXT_1,
    fontSize: 16,
    fontFamily: fonts.regular,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    minHeight: 46,
    justifyContent: "center",
  },
  notesInput: {
    minHeight: 84,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  dateText: { color: TEXT_1, fontSize: 16, fontFamily: fonts.regular },
  paidToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  paidToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(16, 185, 129, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.30)",
  },
  paidToggleButtonActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  paidToggleText: { fontSize: 14, fontFamily: fonts.semibold },
  editPaidDate: { color: TEXT_3, fontSize: 12, fontFamily: fonts.semibold },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AMBER,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: "#000", fontFamily: fonts.semibold, fontSize: 16 },
});
