import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setHmrcNino } from "../lib/api/hmrc";
import { isApiError } from "../lib/api";
import { BetaBanner } from "../components/BetaBanner";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const RED = colors.red;

// UK NINO regex — same one the API enforces. Mirrored client-side so
// invalid entries don't make the round-trip.
const NINO_REGEX = /^[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}\d{6}[A-D]?$/i;

function normalise(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Format a NINO as "AB 12 34 56 C" for display while typing. */
function formatForDisplay(raw: string): string {
  const n = normalise(raw);
  const parts = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6), n.slice(6, 8), n.slice(8, 9)];
  return parts.filter((p) => p.length > 0).join(" ");
}

export default function TaxMtdNinoScreen() {
  const [nino, setNino] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalised = normalise(nino);
  const isValid = NINO_REGEX.test(normalised);

  const onSubmit = useCallback(async () => {
    if (!isValid) {
      Alert.alert("Check your NINO", "That doesn't look like a valid UK National Insurance Number.");
      return;
    }
    setSubmitting(true);
    try {
      await setHmrcNino(normalised);
      router.back();
    } catch (err) {
      const msg = isApiError(err) ? err.message : err instanceof Error ? err.message : "Couldn't save your NINO.";
      Alert.alert("Couldn't save", msg);
    } finally {
      setSubmitting(false);
    }
  }, [normalised, isValid]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: BG }}
    >
      <Stack.Screen options={{ title: "National Insurance Number", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
      <ScrollView contentContainerStyle={styles.container}>
        <BetaBanner
          label="Beta · Sandbox"
          title="HMRC integration is in beta"
          body="MTD submissions currently go to HMRC's test system while we finish production accreditation. Your NINO is stored encrypted either way."
        />
        <View style={styles.card}>
          <Ionicons name="finger-print-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
          <Text style={styles.title}>Your NINO</Text>
          <Text style={styles.body}>
            HMRC uses your National Insurance Number to identify your tax record. It's
            stored encrypted on MileClear's server and only sent to HMRC during
            submissions.
          </Text>

          <Text style={styles.label}>NATIONAL INSURANCE NUMBER</Text>
          <TextInput
            style={[
              styles.input,
              isValid ? styles.inputValid : nino.length > 0 ? styles.inputInvalid : null,
            ]}
            value={formatForDisplay(nino)}
            onChangeText={(text) => setNino(text)}
            placeholder="AB 12 34 56 C"
            placeholderTextColor={TEXT_3}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            maxLength={13}
            accessibilityLabel="National Insurance Number"
          />
          <Text style={styles.hint}>
            Find it on your payslip, P60, or in your HMRC personal tax account.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, (!isValid || submitting) && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={!isValid || submitting}
            accessibilityRole="button"
            accessibilityLabel="Save NINO"
            accessibilityState={{ disabled: !isValid || submitting }}
          >
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Save NINO</Text>
                <Ionicons name="checkmark" size={18} color="#000" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 64 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    gap: 8,
  },
  title: {
    color: TEXT_1,
    fontSize: 22,
    fontFamily: fonts.bold,
    textAlign: "center",
    marginTop: 8,
  },
  body: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 12,
  },
  label: {
    color: TEXT_3,
    fontSize: 11,
    fontFamily: fonts.semibold,
    letterSpacing: 0.6,
    marginTop: 8,
  },
  input: {
    backgroundColor: BG,
    color: TEXT_1,
    fontFamily: fonts.semibold,
    fontSize: 18,
    letterSpacing: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    marginTop: 6,
  },
  inputValid: { borderColor: AMBER },
  inputInvalid: { borderColor: RED },
  hint: { color: TEXT_3, fontSize: 12, marginTop: 8, fontFamily: fonts.regular },
  primaryButton: {
    backgroundColor: AMBER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#000", fontFamily: fonts.semibold, fontSize: 16 },
});
