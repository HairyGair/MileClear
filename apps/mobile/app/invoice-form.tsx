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
  Modal,
  FlatList,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  fetchInvoiceWithLines,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoiceToClient,
  type Invoice,
  type PotentialEarningMatch,
  type LineItemInput,
} from "../lib/api/invoices";
import { fetchClients, type Client } from "../lib/api/clients";
import { fetchProfile } from "../lib/api/user";
import { downloadAndShareExport } from "../lib/api/exports";
import { isApiError } from "../lib/api";
import { usePaywall } from "../components/paywall";
import { useUser } from "../lib/user/context";
import { LinkEarningSheet } from "../components/invoices/LinkEarningSheet";
import { computeInvoiceTotals, formatInvoiceNumber, formatPence } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string; // pounds
}

function parseLineDrafts(drafts: LineDraft[]): LineItemInput[] {
  return drafts
    .filter((d) => d.description.trim() && parseFloat(d.quantity) > 0 && parseFloat(d.unitPrice) >= 0)
    .map((d) => ({
      description: d.description.trim(),
      quantity: parseFloat(d.quantity),
      unitPricePence: Math.round(parseFloat(d.unitPrice) * 100),
    }));
}

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
  const { user } = useUser();
  const isPremium = user?.isPremium === true;

  const [company, setCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [reference, setReference] = useState("");
  const [amountInput, setAmountInput] = useState(""); // pounds.pence string

  // Builder state (Get Paid, Jul 2026)
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [vatRate, setVatRate] = useState<20 | 5 | 0 | null>(null);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState<number | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    fetchClients()
      .then((res) => setClients(res.data))
      .catch(() => {});
    fetchProfile()
      .then((res) => setVatRegistered(res.data.vatRegistered === true))
      .catch(() => {});
  }, []);
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
        const res = await fetchInvoiceWithLines(id);
        const inv = res.data;
        setCompany(inv.company);
        setClientId(inv.clientId ?? null);
        setClientEmail(inv.clientEmail ?? "");
        setReference(inv.reference ?? "");
        // Show the NET amount for direct-entry VAT invoices — the API
        // treats amountPence input as net when vatRate is set with no lines.
        setAmountInput(((inv.subtotalPence ?? inv.amountPence) / 100).toFixed(2));
        setVatRate((inv.vatRate as 20 | 5 | 0 | null) ?? null);
        setInvoiceNumber(inv.invoiceNumber ?? null);
        setLines(
          (inv.lineItems ?? []).map((l) => ({
            description: l.description,
            quantity: String(Number(l.quantity)),
            unitPrice: (l.unitPricePence / 100).toFixed(2),
          }))
        );
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
    if (!company.trim() && !clientId) {
      Alert.alert("Missing client", "Pick a client or enter a company name.");
      return;
    }
    const parsedLines = parseLineDrafts(lines);
    const pounds = parseFloat(amountInput);
    if (parsedLines.length === 0 && (!Number.isFinite(pounds) || pounds <= 0)) {
      Alert.alert("Missing amount", "Enter an amount or add at least one line item.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        company: company.trim() || undefined,
        clientId,
        clientEmail: clientEmail.trim() || null,
        reference: reference.trim() || null,
        ...(parsedLines.length > 0
          ? { lineItems: parsedLines }
          : {
              amountPence: Math.round(pounds * 100),
              // Editing an invoice that HAD lines down to none: clear them.
              ...(isEditing ? { lineItems: [] as LineItemInput[] } : {}),
            }),
        vatRate,
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
  }, [company, clientId, clientEmail, reference, amountInput, lines, vatRate, sentDate, dueDate, paidDate, notes, isEditing, id, initialPaidAt, showPaywall]);

  // Branded PDF share (Pro). Uses the exports download+share pipeline.
  const onSharePdf = useCallback(async () => {
    if (!id) return;
    if (!isPremium) {
      showPaywall("invoice_pdf");
      return;
    }
    setPdfBusy(true);
    try {
      const filename = invoiceNumber != null ? `${formatInvoiceNumber(invoiceNumber)}.pdf` : "invoice.pdf";
      await downloadAndShareExport(`/invoices/${id}/pdf`, filename, "application/pdf");
    } catch (err) {
      Alert.alert("Couldn't create PDF", err instanceof Error ? err.message : "Try again.");
    } finally {
      setPdfBusy(false);
    }
  }, [id, isPremium, invoiceNumber, showPaywall]);

  // Email the branded PDF to the client (Pro).
  const [sendBusy, setSendBusy] = useState(false);
  const onSendToClient = useCallback(() => {
    if (!id) return;
    if (!isPremium) {
      showPaywall("invoice_send");
      return;
    }
    const to = clientEmail.trim() || clients.find((c) => c.id === clientId)?.email || null;
    if (!to) {
      Alert.alert("No client email", "Add a client email to this invoice first.");
      return;
    }
    Alert.alert(
      "Email this invoice?",
      `Send the branded PDF to ${to}? Replies come straight back to your email.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            setSendBusy(true);
            try {
              const res = await sendInvoiceToClient(id);
              haptic("success");
              Alert.alert("Sent", `Invoice emailed to ${res.data.toEmail}.`);
            } catch (err) {
              Alert.alert("Couldn't send", err instanceof Error ? err.message : "Try again.");
            } finally {
              setSendBusy(false);
            }
          },
        },
      ]
    );
  }, [id, isPremium, clientEmail, clientId, clients, showPaywall]);

  // Live totals preview
  const parsedPreviewLines = parseLineDrafts(lines);
  const preview =
    parsedPreviewLines.length > 0
      ? computeInvoiceTotals(parsedPreviewLines, vatRate)
      : (() => {
          const net = Math.round((parseFloat(amountInput) || 0) * 100);
          const vat = vatRate ? Math.round((net * vatRate) / 100) : 0;
          return { subtotalPence: net, vatPence: vat, amountPence: net + vat, lines: [] };
        })();

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
        {clients.length > 0 && (
          <Field label="SAVED CLIENT">
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowClientPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Pick a saved client"
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={clientId ? styles.dateText : styles.placeholderText}>
                  {clientId
                    ? clients.find((c) => c.id === clientId)?.name ?? "Saved client"
                    : "Pick a client (optional)"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={TEXT_3} />
              </View>
            </TouchableOpacity>
          </Field>
        )}

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

        {/* Line items (optional) — when present, totals come from these */}
        <View style={styles.field}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={styles.fieldLabel}>LINE ITEMS (optional)</Text>
            <TouchableOpacity
              onPress={() => setLines((ls) => [...ls, { description: "", quantity: "1", unitPrice: "" }])}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add line item"
            >
              <Text style={styles.addLineText}>+ Add line</Text>
            </TouchableOpacity>
          </View>
          {lines.map((line, i) => (
            <View key={i} style={styles.lineRow}>
              <TextInput
                style={[styles.input, styles.lineDesc]}
                value={line.description}
                onChangeText={(v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: v } : l)))}
                placeholder="Description"
                placeholderTextColor={TEXT_3}
                accessibilityLabel={`Line ${i + 1} description`}
              />
              <TextInput
                style={[styles.input, styles.lineSmall]}
                value={line.quantity}
                onChangeText={(v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: v } : l)))}
                placeholder="Qty"
                placeholderTextColor={TEXT_3}
                keyboardType="decimal-pad"
                accessibilityLabel={`Line ${i + 1} quantity`}
              />
              <TextInput
                style={[styles.input, styles.lineSmall]}
                value={line.unitPrice}
                onChangeText={(v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, unitPrice: v } : l)))}
                placeholder="Unit £"
                placeholderTextColor={TEXT_3}
                keyboardType="decimal-pad"
                accessibilityLabel={`Line ${i + 1} unit price in pounds`}
              />
              <TouchableOpacity
                onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove line ${i + 1}`}
              >
                <Ionicons name="close-circle-outline" size={20} color={TEXT_3} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {parsedPreviewLines.length === 0 && (
          <Field label={vatRate != null ? "AMOUNT BEFORE VAT (£)" : "AMOUNT (£)"}>
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
        )}

        {vatRegistered && (
          <Field label="VAT">
            <View style={styles.vatRow}>
              {([
                { v: null, label: "None" },
                { v: 20, label: "20%" },
                { v: 5, label: "5%" },
                { v: 0, label: "0%" },
              ] as Array<{ v: 20 | 5 | 0 | null; label: string }>).map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.vatChip, vatRate === opt.v && styles.vatChipActive]}
                  onPress={() => setVatRate(opt.v)}
                  accessibilityRole="button"
                  accessibilityLabel={`VAT ${opt.label}`}
                >
                  <Text style={[styles.vatChipText, vatRate === opt.v && styles.vatChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        )}

        {(parsedPreviewLines.length > 0 || vatRate != null) && preview.amountPence > 0 && (
          <View style={styles.totalsPreview}>
            <Text style={styles.totalsText}>Subtotal {formatPence(preview.subtotalPence)}</Text>
            {vatRate != null && <Text style={styles.totalsText}>VAT {formatPence(preview.vatPence)}</Text>}
            <Text style={styles.totalsStrong}>Total {formatPence(preview.amountPence)}</Text>
          </View>
        )}

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

        {isEditing && (
          <TouchableOpacity
            style={[styles.pdfButton, sendBusy && styles.saveButtonDisabled]}
            onPress={onSendToClient}
            disabled={sendBusy}
            accessibilityRole="button"
            accessibilityLabel="Email this invoice to the client"
          >
            {sendBusy ? (
              <ActivityIndicator color={AMBER} />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color={AMBER} />
                <Text style={styles.pdfButtonText}>
                  {isPremium ? "Email to client" : "Email to client (Pro)"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isEditing && (
          <TouchableOpacity
            style={[styles.pdfButton, pdfBusy && styles.saveButtonDisabled]}
            onPress={onSharePdf}
            disabled={pdfBusy}
            accessibilityRole="button"
            accessibilityLabel="Download or share the branded invoice PDF"
          >
            {pdfBusy ? (
              <ActivityIndicator color={AMBER} />
            ) : (
              <>
                <Ionicons name="document-attach-outline" size={18} color={AMBER} />
                <Text style={styles.pdfButtonText}>
                  {isPremium ? "Share invoice PDF" : "Share invoice PDF (Pro)"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

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

      {/* Saved-client picker. overFullScreen + statusBarTranslucent per the
          iPad modal hit-testing rules (build 60 rejection). */}
      <Modal
        visible={showClientPicker}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setShowClientPicker(false)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setShowClientPicker(false)}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Pick a client</Text>
            <FlatList
              data={clients}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    setClientId(item.id);
                    setCompany(item.name);
                    if (!clientEmail && item.email) setClientEmail(item.email);
                    setShowClientPicker(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Use client ${item.name}`}
                >
                  <Text style={styles.pickerRowText}>{item.name}</Text>
                  {clientId === item.id && <Ionicons name="checkmark" size={18} color={AMBER} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.pickerRow}
              onPress={() => {
                setClientId(null);
                setShowClientPicker(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="No saved client"
            >
              <Text style={[styles.pickerRowText, { color: TEXT_3 }]}>No saved client — type a name</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pickerManage}
              onPress={() => {
                setShowClientPicker(false);
                router.push("/clients");
              }}
              accessibilityRole="button"
              accessibilityLabel="Manage clients"
            >
              <Ionicons name="people-outline" size={16} color={AMBER} />
              <Text style={styles.pickerManageText}>Manage clients</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  placeholderText: { color: TEXT_3, fontSize: 16, fontFamily: fonts.regular },
  addLineText: { color: AMBER, fontSize: 13, fontFamily: fonts.semibold },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  lineDesc: { flex: 3, minHeight: 42, paddingVertical: 10 },
  lineSmall: { flex: 1, minHeight: 42, paddingVertical: 10 },
  vatRow: { flexDirection: "row", gap: 8 },
  vatChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: CARD_BG,
  },
  vatChipActive: { backgroundColor: AMBER },
  vatChipText: { color: TEXT_3, fontSize: 13, fontFamily: fonts.semibold },
  vatChipTextActive: { color: "#000" },
  totalsPreview: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 14,
    marginBottom: 14,
  },
  totalsText: { color: TEXT_3, fontSize: 13, fontFamily: fonts.regular },
  totalsStrong: { color: TEXT_1, fontSize: 13, fontFamily: fonts.bold },
  pdfButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.35)",
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  pdfButtonText: { color: AMBER, fontFamily: fonts.semibold, fontSize: 15 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  pickerSheet: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
  },
  pickerTitle: { color: TEXT_1, fontSize: 16, fontFamily: fonts.bold, marginBottom: 10 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  pickerRowText: { color: TEXT_1, fontSize: 15, fontFamily: fonts.regular },
  pickerManage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 14,
  },
  pickerManageText: { color: AMBER, fontSize: 14, fontFamily: fonts.semibold },
});
