// Add / edit a client (Get Paid, Jul 2026). Mirrors invoice-form's
// field styling. Delete archives when the client has invoices.

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
import {
  fetchClient,
  createClient,
  updateClient,
  deleteClient,
} from "../lib/api/clients";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_3 = colors.text3;
const BG = colors.bg;

export default function ClientFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState(0);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetchClient(id);
        const c = res.data;
        setName(c.name);
        setEmail(c.email ?? "");
        setPhone(c.phone ?? "");
        setAddressLine1(c.addressLine1 ?? "");
        setAddressLine2(c.addressLine2 ?? "");
        setCity(c.city ?? "");
        setPostcode(c.postcode ?? "");
        setNotes(c.notes ?? "");
        setInvoiceCount(c._count?.invoices ?? 0);
      } catch (err) {
        Alert.alert("Couldn't load", err instanceof Error ? err.message : "Try again.");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Who is this client?");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        addressLine1: addressLine1.trim() || null,
        addressLine2: addressLine2.trim() || null,
        city: city.trim() || null,
        postcode: postcode.trim() || null,
        notes: notes.trim() || null,
      };
      if (isEditing && id) await updateClient(id, payload);
      else await createClient(payload);
      haptic("success");
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : "Try again.");
      setSaving(false);
    }
  }, [name, email, phone, addressLine1, addressLine2, city, postcode, notes, isEditing, id]);

  const onDelete = useCallback(() => {
    if (!id) return;
    Alert.alert(
      "Delete client",
      invoiceCount > 0
        ? "This client has invoices, so they'll be archived rather than deleted — your invoice history keeps their details."
        : "Remove this client? This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: invoiceCount > 0 ? "Archive" : "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteClient(id);
              router.back();
            } catch (err) {
              Alert.alert("Couldn't delete", err instanceof Error ? err.message : "Try again.");
            }
          },
        },
      ]
    );
  }, [id, invoiceCount]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <Stack.Screen options={{ title: isEditing ? "Edit client" : "Add client", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
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
          title: isEditing ? "Edit client" : "Add client",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT_1,
          headerRight: () =>
            isEditing ? (
              <TouchableOpacity onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete client">
                <Ionicons name="trash-outline" size={20} color={TEXT_3} />
              </TouchableOpacity>
            ) : null,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
        <Field label="NAME">
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Acme Ltd"
            placeholderTextColor={TEXT_3}
            autoCapitalize="words"
            accessibilityLabel="Client name"
          />
        </Field>
        <Field label="EMAIL (used for invoices + chasing)">
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="accounts@acme.co.uk"
            placeholderTextColor={TEXT_3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Client email"
          />
        </Field>
        <Field label="PHONE (optional)">
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="07…"
            placeholderTextColor={TEXT_3}
            keyboardType="phone-pad"
            accessibilityLabel="Client phone"
          />
        </Field>
        <Field label="ADDRESS (appears on the invoice PDF)">
          <TextInput
            style={styles.input}
            value={addressLine1}
            onChangeText={setAddressLine1}
            placeholder="Address line 1"
            placeholderTextColor={TEXT_3}
            accessibilityLabel="Address line 1"
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={addressLine2}
            onChangeText={setAddressLine2}
            placeholder="Address line 2 (optional)"
            placeholderTextColor={TEXT_3}
            accessibilityLabel="Address line 2"
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TextInput
              style={[styles.input, { flex: 2 }]}
              value={city}
              onChangeText={setCity}
              placeholder="Town / city"
              placeholderTextColor={TEXT_3}
              accessibilityLabel="Town or city"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={postcode}
              onChangeText={setPostcode}
              placeholder="Postcode"
              placeholderTextColor={TEXT_3}
              autoCapitalize="characters"
              accessibilityLabel="Postcode"
            />
          </View>
        </Field>
        <Field label="NOTES (optional)">
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Rates, contacts, anything useful"
            placeholderTextColor={TEXT_3}
            multiline
            numberOfLines={3}
            accessibilityLabel="Notes"
          />
        </Field>

        <TouchableOpacity
          style={[styles.saveButton, saving && { opacity: 0.5 }]}
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? "Save changes" : "Add client"}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color="#000" />
              <Text style={styles.saveButtonText}>{isEditing ? "Save changes" : "Add client"}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  },
  notesInput: { minHeight: 84, textAlignVertical: "top", paddingTop: 12 },
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
  saveButtonText: { color: "#000", fontFamily: fonts.semibold, fontSize: 16 },
});
