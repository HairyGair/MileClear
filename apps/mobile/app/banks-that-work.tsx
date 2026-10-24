import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  OPEN_BANKING_BANKS,
  OPEN_BANKING_BUSINESS_BANKS,
  MISSING_BANK_MAX_LENGTH,
} from "@mileclear/shared";
import { Button } from "../components/Button";
import { reportMissingBank } from "../lib/api/earnings";
import { useUser } from "../lib/user/context";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const CARD_BORDER = "rgba(255,255,255,0.08)";
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

/**
 * Which banks the bank link works with, and "My bank isn't listed".
 * Opened from Link your bank, for free drivers before the paywall too, so
 * nobody pays for Pro to find their bank missing (Jason Clarke, 24 Oct 2026).
 */
export default function BanksThatWorkScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [bank, setBank] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const send = async () => {
    const name = bank.trim();
    if (name.length < 2) {
      setProblem("Type your bank's name.");
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      await reportMissingBank(name);
      setSent(name);
      setBank("");
    } catch (err: any) {
      setProblem(err.message || "That didn't send. Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.body}>
          You can link a personal account at any of these banks. MileClear only reads your
          payments and can't move money.
        </Text>

        <View style={styles.card}>
          {OPEN_BANKING_BANKS.map((name, i) => (
            <View key={name} style={[styles.bankRow, i > 0 && styles.bankRowDivider]}>
              <Ionicons name="checkmark-circle-outline" size={18} color={TEXT_2} />
              <Text style={styles.bankName}>{name}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.hint}>
          Business accounts work too at {OPEN_BANKING_BUSINESS_BANKS.join(", ")}.
        </Text>

        <Text style={styles.sectionTitle}>My bank isn't listed</Text>
        {sent ? (
          <View style={styles.card}>
            <Text style={styles.sentTitle}>Thanks, we've noted {sent}</Text>
            <Text style={styles.sentBody}>
              We'll ask our banking partner, TrueLayer, to add it. Until then, these bring your
              earnings in without a bank link:
            </Text>
            <Text style={styles.sentBody}>
              {"•"} Snap a statement{user?.isPremium ? "" : " (Pro)"}: choose a screenshot of
              your earnings from Uber, Deliveroo, Just Eat or similar, and MileClear reads the total.
            </Text>
            <Text style={styles.sentBody}>
              {"•"} Import CSV from platform{user?.isPremium ? "" : " (Pro)"}: adds a platform's
              earnings file in one go.
            </Text>
            <Text style={styles.sentBody}>{"•"} Add manually, on the Earnings screen.</Text>
            <Button
              variant="secondary"
              title="Go to Earnings"
              icon="cash-outline"
              onPress={() => router.navigate("/(tabs)/earnings")}
              style={{ marginTop: 12 }}
            />
          </View>
        ) : (
          <>
            <Text style={styles.body}>
              Tell us which bank and we'll ask our banking partner, TrueLayer, to add it.
            </Text>
            <TextInput
              style={styles.input}
              value={bank}
              onChangeText={(t) => {
                setBank(t);
                if (problem) setProblem(null);
              }}
              placeholder="e.g. Co-operative Bank"
              placeholderTextColor={TEXT_3}
              maxLength={MISSING_BANK_MAX_LENGTH}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
              accessibilityLabel="Your bank's name"
            />
            {problem && (
              <Text style={styles.problem} accessibilityRole="alert">
                {problem}
              </Text>
            )}
            <Button
              title="Send"
              icon="send-outline"
              onPress={() => void send()}
              loading={sending}
              disabled={bank.trim().length < 2}
              style={{ marginTop: 12 }}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  body: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 20,
    marginBottom: 12,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  bankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  bankRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceBorder,
  },
  bankName: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_1,
  },
  hint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_3,
    lineHeight: 18,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginTop: 28,
    marginBottom: 8,
  },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_1,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  problem: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.red,
    marginTop: 8,
  },
  sentTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: AMBER,
    marginTop: 8,
    marginBottom: 8,
  },
  sentBody: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 20,
    marginBottom: 6,
  },
});
