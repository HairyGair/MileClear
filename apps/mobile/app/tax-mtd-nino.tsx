import { useCallback, useRef, useState } from "react";
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
import { isMtdTest } from "../lib/tax/mtdCopy";
import { useHmrcEnvironment } from "../lib/tax/useHmrcEnvironment";
import { colors, fonts } from "../lib/theme";
import { announce, useAnnounceError } from "../lib/a11y/announce";

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

const FORMAT_ADVICE = "A National Insurance number is 2 letters, 6 numbers, then A, B, C or D, for example QQ 12 34 56 C.";
const WRONG_MESSAGE = `That doesn't look right. ${FORMAT_ADVICE}`;
const EMPTY_MESSAGE = `Enter your National Insurance number. ${FORMAT_ADVICE}`;

// Resting outline for the field. #708096 measures 5.0:1 on the field's own
// background (#030712) and 4.7:1 on the card behind it (#0a1120), so the
// boundary clears the 3:1 minimum for UI components (WCAG 1.4.11).
const FIELD_OUTLINE = "#708096";

// Spaces and hyphens are dropped, so a number pasted as "QQ-12-34-56-C" works.
function normalise(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
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
  const [triedSave, setTriedSave] = useState(false);
  const test = isMtdTest(useHmrcEnvironment());

  const normalised = normalise(nino);
  const isValid = NINO_REGEX.test(normalised);

  // Say what is wrong in words (colour alone is not enough): after a Save press,
  // or once a full-length value has been typed and still does not fit.
  let errorText: string | null = null;
  if (!isValid) {
    if (normalised.length === 0) {
      if (triedSave) errorText = EMPTY_MESSAGE;
    } else if (triedSave || normalised.length >= 8) {
      errorText = WRONG_MESSAGE;
    }
  }
  useAnnounceError(errorText);

  // Blocks a second save from a quick double tap before the button re-renders.
  const submittingRef = useRef(false);

  const onSubmit = useCallback(async () => {
    setTriedSave(true);
    if (!isValid) {
      // If the same error is already on screen, nothing changes, so the hook
      // stays quiet: say it again so a VoiceOver user knows Save did not go.
      const message = normalised.length === 0 ? EMPTY_MESSAGE : WRONG_MESSAGE;
      if (message === errorText) announce(message);
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await setHmrcNino(normalised);
      router.back();
    } catch (err) {
      const msg = isApiError(err) ? err.message : err instanceof Error ? err.message : "Couldn't save your National Insurance number.";
      Alert.alert("Couldn't save", msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [normalised, isValid, errorText]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: BG }}
    >
      <Stack.Screen options={{ title: "National Insurance Number", headerStyle: { backgroundColor: BG }, headerTintColor: TEXT_1 }} />
      <ScrollView contentContainerStyle={styles.container}>
        {test && (
          <BetaBanner
            label="Test version"
            title="Quarterly updates are a test version"
            body="Nothing reaches your real tax account. This uses HMRC's test service while we wait to be allowed to send real updates. Your National Insurance Number is stored encrypted either way."
          />
        )}
        <View style={styles.card}>
          <Ionicons name="finger-print-outline" size={48} color={AMBER} style={{ alignSelf: "center" }} />
          <Text accessibilityRole="header" style={styles.title}>Your National Insurance number</Text>
          <Text style={styles.body}>
            {test
              ? "HMRC uses your National Insurance Number to identify your tax record. It's stored encrypted on MileClear's server and only used for the test connection."
              : "HMRC uses your National Insurance Number to identify your tax record. It's stored encrypted on MileClear's server and only used for your quarterly updates."}
          </Text>

          <Text style={styles.label}>NATIONAL INSURANCE NUMBER</Text>
          <TextInput
            style={[
              styles.input,
              isValid ? styles.inputValid : errorText ? styles.inputInvalid : null,
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
            accessibilityHint={errorText ?? "2 letters, 6 numbers, then A, B, C or D"}
          />
          {errorText ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {errorText}
            </Text>
          ) : null}
          <Text style={styles.hint}>
            Find it on your payslip, P60, or in your HMRC personal tax account.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            onPress={onSubmit}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Save National Insurance number"
            accessibilityState={{ disabled: submitting, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Save</Text>
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
    borderColor: FIELD_OUTLINE,
    marginTop: 6,
  },
  inputValid: { borderColor: AMBER },
  inputInvalid: { borderColor: RED },
  errorText: { color: "#f87171", fontSize: 13, lineHeight: 18, marginTop: 8, fontFamily: fonts.regular },
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
