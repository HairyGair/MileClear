// "Invite your manager" — the driver-side half of the Milesheet acquisition
// loop. A driver who claims mileage from an employer tells us the company
// name and their manager's email; the manager gets an invite email and
// sets up Milesheet from there. See components/NominateManagerCard.tsx for
// the prompt that opens this screen, and its comment on the shared local
// storage key that must never be shown again after a successful submit.

import { useCallback, useState } from "react";
import { NOMINATE_PROMPT_STATE_KEY } from "../components/NominateManagerCard";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { nominateManager } from "../lib/api/team";
import { describeError } from "../lib/api/apiError";
import { getDatabase } from "../lib/db";
import { useUser } from "../lib/user/context";
import { haptic } from "../lib/haptics";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;
const GREEN = colors.green;

// Must match components/NominateManagerCard.tsx's STATE_KEY — the two
// files intentionally don't share a helper module (each owns its own tiny
// bit of local persistence), but the string has to line up or the card
// keeps reappearing after a successful submission.
const STATE_KEY = NOMINATE_PROMPT_STATE_KEY;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NominateManagerScreen() {
  const { user } = useUser();
  const [companyName, setCompanyName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const markAnswered = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
        [STATE_KEY, "submitted"]
      );
    } catch {
      // Local write failed — worst case the prompt asks again. Harmless,
      // and the server itself will refuse a second nomination with a 409.
    }
  }, []);

  const onSubmit = useCallback(async () => {
    setError(null);

    const trimmedCompany = companyName.trim();
    const trimmedEmail = managerEmail.trim();

    if (!trimmedCompany) {
      setError("Enter your employer's name.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Enter a valid email address for your manager.");
      return;
    }
    if (user?.email && trimmedEmail.toLowerCase() === user.email.toLowerCase()) {
      setError("That's your own email address, enter your manager's instead.");
      return;
    }

    setSubmitting(true);
    try {
      await nominateManager(trimmedEmail, trimmedCompany);
      await markAnswered();
      haptic("success");
      setSubmitted(true);
    } catch (err) {
      haptic("error");
      const { message } = describeError(err, "Couldn't send the invite");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [companyName, managerEmail, user?.email, markAnswered]);

  if (submitted) {
    return (
      <View style={[styles.root, styles.center]}>
        <Stack.Screen
          options={{
            title: "Invite sent",
            headerStyle: { backgroundColor: BG },
            headerTintColor: TEXT_1,
            headerBackVisible: false,
          }}
        />
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={32} color={GREEN} accessible={false} />
        </View>
        <Text style={styles.successTitle}>Your manager's on their way in</Text>
        <Text style={styles.successBody}>
          We've emailed {managerEmail.trim()} to set up Milesheet for {companyName.trim()}.
          There's nothing else for you to do. Just keep driving as normal, and your manager
          will approve your mileage each month once they're set up.
        </Text>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
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
          title: "Invite your manager",
          headerStyle: { backgroundColor: BG },
          headerTintColor: TEXT_1,
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Milesheet is the company side of MileClear. Tell us who to invite, and here's exactly
          what happens next: your manager gets an email, sets up their team in a few minutes,
          and approves your mileage each month, no separate app, no extra sign-up for you.
        </Text>

        <Field label="YOUR EMPLOYER'S NAME">
          <TextInput
            style={styles.input}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="e.g. Swift Logistics Ltd"
            placeholderTextColor={TEXT_3}
            autoCapitalize="words"
            editable={!submitting}
            accessibilityLabel="Your employer's name"
          />
        </Field>

        <Field label="YOUR MANAGER'S EMAIL">
          <TextInput
            style={styles.input}
            value={managerEmail}
            onChangeText={setManagerEmail}
            placeholder="manager@company.co.uk"
            placeholderTextColor={TEXT_3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            accessibilityLabel="Your manager's email address"
          />
        </Field>

        {error && (
          <View style={styles.errorBox} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={16} color="#f87171" accessible={false} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitButton, submitting && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Send invite to your manager"
          accessibilityState={{ disabled: submitting, busy: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color={BG} accessibilityLabel="Sending" />
          ) : (
            <>
              <Ionicons name="mail-outline" size={18} color={BG} accessible={false} />
              <Text style={styles.submitButtonText}>Send invite</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footnote}>
          You'll keep tracking exactly as you do now. Nothing changes for you until your manager
          has finished setting things up.
        </Text>
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
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  intro: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
    marginBottom: 20,
  },
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
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    color: "#f87171",
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    backgroundColor: AMBER,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  submitButtonText: { color: BG, fontFamily: fonts.bold, fontSize: 16 },
  footnote: {
    color: TEXT_3,
    fontSize: 12,
    fontFamily: fonts.regular,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 16,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successTitle: {
    color: TEXT_1,
    fontSize: 20,
    fontFamily: fonts.bold,
    textAlign: "center",
    marginBottom: 10,
  },
  successBody: {
    color: TEXT_2,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 28,
  },
  doneButton: {
    minHeight: 52,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AMBER,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  doneButtonText: { color: BG, fontFamily: fonts.bold, fontSize: 16 },
});
