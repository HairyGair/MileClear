// Business Profile settings (Get Paid, Jul 2026). Everything printed on
// generated invoice PDFs: trading name, address, VAT registration, accent
// colour, payment terms and the bank details clients pay into (encrypted
// at rest server-side). Logo uploads via expo-image-picker — already in
// the binary (receipt-scan uses it), so this whole screen is OTA-safe.

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { SettingsScreen } from "../../components/settings/SettingsScreen";
import {
  fetchProfile,
  updateProfile,
  uploadLogo,
  fetchLogoDataUri,
  deleteLogo,
} from "../../lib/api/user";
import { colors, fonts } from "../../lib/theme";
import { haptic } from "../../lib/haptics";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_3 = colors.text3;
const BG = colors.bg;

const ACCENTS: Array<{ value: string | null; label: string; swatch: string }> = [
  { value: null, label: "Amber", swatch: "#f5a623" },
  { value: "#10b981", label: "Emerald", swatch: "#10b981" },
  { value: "#3b82f6", label: "Blue", swatch: "#3b82f6" },
  { value: "#8b5cf6", label: "Violet", swatch: "#8b5cf6" },
  { value: "#ef4444", label: "Red", swatch: "#ef4444" },
  { value: "#030712", label: "Navy", swatch: "#0f172a" },
];

export default function BusinessProfileSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tradingName, setTradingName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState("");
  const [accent, setAccent] = useState<string | null>(null);
  const [termsDays, setTermsDays] = useState("30");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");

  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchProfile();
        const p = res.data;
        setTradingName(p.tradingName ?? "");
        setBusinessAddress(p.businessAddress ?? "");
        setVatRegistered(p.vatRegistered === true);
        setVatNumber(p.vatNumber ?? "");
        setAccent(p.invoiceAccentColor ?? null);
        setTermsDays(String(p.invoicePaymentTermsDays ?? 30));
        setBankAccountName(p.bankAccountName ?? "");
        setBankSortCode(p.bankSortCode ?? "");
        setBankAccountNumber(p.bankAccountNumber ?? "");
      } catch (err) {
        console.warn("[settings/business] profile load failed:", err);
      }
      try {
        setLogoUri(await fetchLogoDataUri());
      } catch {
        /* no logo */
      }
      setLoading(false);
    })();
  }, []);

  const onSave = useCallback(async () => {
    const sort = bankSortCode.replace(/[\s-]/g, "");
    const acct = bankAccountNumber.replace(/\s/g, "");
    if (sort && !/^\d{6}$/.test(sort)) {
      Alert.alert("Check sort code", "Sort codes are 6 digits, like 12-34-56.");
      return;
    }
    if (acct && !/^\d{8}$/.test(acct)) {
      Alert.alert("Check account number", "Account numbers are 8 digits.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        tradingName: tradingName.trim() || null,
        businessAddress: businessAddress.trim() || null,
        vatRegistered,
        vatNumber: vatRegistered ? vatNumber.trim() || null : null,
        invoiceAccentColor: accent,
        invoicePaymentTermsDays: Math.min(90, Math.max(1, parseInt(termsDays, 10) || 30)),
        bankAccountName: bankAccountName.trim() || null,
        bankSortCode: sort || null,
        bankAccountNumber: acct || null,
      });
      haptic("success");
      Alert.alert("Saved", "Your business profile will appear on generated invoices.");
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }, [tradingName, businessAddress, vatRegistered, vatNumber, accent, termsDays, bankAccountName, bankSortCode, bankAccountNumber]);

  const onPickLogo = useCallback(async () => {
    setLogoBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType === "image/png" ? "image/png" : "image/jpeg";
      await uploadLogo(asset.uri, mime);
      setLogoUri(await fetchLogoDataUri());
      haptic("success");
    } catch (err) {
      Alert.alert("Couldn't upload logo", err instanceof Error ? err.message : "Try again.");
    } finally {
      setLogoBusy(false);
    }
  }, []);

  const onRemoveLogo = useCallback(async () => {
    setLogoBusy(true);
    try {
      await deleteLogo();
      setLogoUri(null);
    } catch (err) {
      Alert.alert("Couldn't remove logo", err instanceof Error ? err.message : "Try again.");
    } finally {
      setLogoBusy(false);
    }
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: BG }]}>
        <Stack.Screen options={{ title: "Business Profile", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
        <ActivityIndicator color={AMBER} />
      </View>
    );
  }

  return (
    <SettingsScreen>
      <Stack.Screen options={{ title: "Business Profile", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />

      <Text style={styles.intro}>
        These details appear on your generated invoice PDFs. Bank details are stored encrypted.
      </Text>

      {/* Logo */}
      <Text style={styles.label}>LOGO</Text>
      <View style={styles.logoRow}>
        <View style={styles.logoBox}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
          ) : (
            <Text style={styles.logoEmpty}>No logo</Text>
          )}
        </View>
        <TouchableOpacity style={styles.logoButton} onPress={onPickLogo} disabled={logoBusy} accessibilityRole="button" accessibilityLabel="Upload logo">
          {logoBusy ? (
            <ActivityIndicator color={AMBER} />
          ) : (
            <Text style={styles.logoButtonText}>{logoUri ? "Replace" : "Upload"}</Text>
          )}
        </TouchableOpacity>
        {logoUri && !logoBusy && (
          <TouchableOpacity onPress={onRemoveLogo} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove logo">
            <Text style={styles.logoRemove}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.label}>TRADING NAME</Text>
      <TextInput
        style={styles.input}
        value={tradingName}
        onChangeText={setTradingName}
        placeholder="e.g. L Joyce Bookkeeping"
        placeholderTextColor={TEXT_3}
        accessibilityLabel="Trading name"
      />

      <Text style={styles.label}>BUSINESS ADDRESS</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={businessAddress}
        onChangeText={setBusinessAddress}
        placeholder={"1 High Street\nSlough\nSL1 1AA"}
        placeholderTextColor={TEXT_3}
        multiline
        numberOfLines={3}
        accessibilityLabel="Business address"
      />

      {/* VAT */}
      <TouchableOpacity
        style={styles.vatToggle}
        onPress={() => setVatRegistered((v) => !v)}
        accessibilityRole="switch"
        accessibilityState={{ checked: vatRegistered }}
        accessibilityLabel="VAT registered"
      >
        <Ionicons
          name={vatRegistered ? "checkbox" : "square-outline"}
          size={20}
          color={vatRegistered ? AMBER : TEXT_3}
        />
        <Text style={styles.vatToggleText}>I'm VAT registered</Text>
      </TouchableOpacity>
      {vatRegistered && (
        <>
          <Text style={styles.label}>VAT NUMBER</Text>
          <TextInput
            style={styles.input}
            value={vatNumber}
            onChangeText={setVatNumber}
            placeholder="GB123456789"
            placeholderTextColor={TEXT_3}
            autoCapitalize="characters"
            accessibilityLabel="VAT number"
          />
        </>
      )}

      {/* Accent colour */}
      <Text style={styles.label}>INVOICE ACCENT COLOUR</Text>
      <View style={styles.accentRow}>
        {ACCENTS.map((a) => (
          <TouchableOpacity
            key={a.label}
            style={[styles.accentSwatch, { backgroundColor: a.swatch }, accent === a.value && styles.accentActive]}
            onPress={() => setAccent(a.value)}
            accessibilityRole="button"
            accessibilityLabel={`Accent colour ${a.label}`}
          >
            {accent === a.value && <Ionicons name="checkmark" size={16} color="#fff" />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Bank details */}
      <Text style={styles.label}>ACCOUNT NAME</Text>
      <TextInput
        style={styles.input}
        value={bankAccountName}
        onChangeText={setBankAccountName}
        placeholder="L Joyce"
        placeholderTextColor={TEXT_3}
        accessibilityLabel="Bank account name"
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>SORT CODE</Text>
          <TextInput
            style={styles.input}
            value={bankSortCode}
            onChangeText={setBankSortCode}
            placeholder="12-34-56"
            placeholderTextColor={TEXT_3}
            keyboardType="number-pad"
            accessibilityLabel="Sort code"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>ACCOUNT NUMBER</Text>
          <TextInput
            style={styles.input}
            value={bankAccountNumber}
            onChangeText={setBankAccountNumber}
            placeholder="12345678"
            placeholderTextColor={TEXT_3}
            keyboardType="number-pad"
            accessibilityLabel="Account number"
          />
        </View>
      </View>

      <Text style={styles.label}>DEFAULT PAYMENT TERMS (DAYS)</Text>
      <TextInput
        style={styles.input}
        value={termsDays}
        onChangeText={setTermsDays}
        keyboardType="number-pad"
        placeholder="30"
        placeholderTextColor={TEXT_3}
        accessibilityLabel="Default payment terms in days"
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && { opacity: 0.5 }]}
        onPress={onSave}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Save business profile"
      >
        {saving ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Ionicons name="checkmark" size={18} color="#000" />
            <Text style={styles.saveButtonText}>Save business profile</Text>
          </>
        )}
      </TouchableOpacity>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  intro: { color: TEXT_3, fontSize: 13, fontFamily: fonts.regular, marginBottom: 16, lineHeight: 18 },
  label: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 12,
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
  multiline: { minHeight: 84, textAlignVertical: "top", paddingTop: 12 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBox: {
    width: 120,
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  logoEmpty: { color: TEXT_3, fontSize: 11, fontFamily: fonts.regular },
  logoButton: {
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  logoButtonText: { color: AMBER, fontSize: 13, fontFamily: fonts.semibold },
  logoRemove: { color: TEXT_3, fontSize: 13, fontFamily: fonts.regular },
  vatToggle: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  vatToggleText: { color: TEXT_1, fontSize: 15, fontFamily: fonts.regular },
  accentRow: { flexDirection: "row", gap: 10 },
  accentSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  accentActive: { borderWidth: 2, borderColor: "#fff" },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AMBER,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  saveButtonText: { color: "#000", fontFamily: fonts.semibold, fontSize: 16 },
});
