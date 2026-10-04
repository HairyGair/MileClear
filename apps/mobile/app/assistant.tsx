/**
 * Ask MileClear (Pro, Oct 2026).
 *
 * A driver asks a question about their own records ("How much did I make on
 * Uber in September?") and gets a short answer with the period it covers.
 * The server (POST /assistant/ask) works out the figures from MileClear and
 * has Anthropic write the answer. Nothing is kept: the conversation lives
 * only on this screen and the last few turns are sent back with each question.
 *
 * Before the first question a one-time notice explains what is sent to
 * Anthropic (the question and the figures needed, never GPS routes or
 * addresses), remembered on this device.
 *
 * Hidden entirely while /assistant/status says unavailable (no API key on
 * the server yet).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  askAssistant,
  hasSeenAssistantNotice,
  markAssistantNoticeSeen,
  useAssistantAvailable,
  type AssistantTurn,
} from "../lib/api/assistant";
import { isApiError } from "../lib/api";
import { useUser } from "../lib/user/context";
import { usePaywall } from "../components/paywall";
import { Button } from "../components/Button";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

const BG = colors.bg;
const CARD_BG = colors.surface;
const BORDER = colors.surfaceBorder;
const AMBER = colors.amber;
const RED = colors.red;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

const PRIVACY_URL = "https://mileclear.com/privacy#ask-mileclear";
const MAX_QUESTION = 500;

const SUGGESTIONS = [
  "How much did I make on Uber last month?",
  "Which week was my best this tax year?",
  "How many business miles this tax year?",
  "How much have I spent on fuel since April?",
  "Can I claim my phone?",
];

const PREVIEW_QUESTIONS = SUGGESTIONS.slice(0, 3);

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  periods?: string[];
  error?: boolean;
}

let nextId = 0;
const newId = () => `m${++nextId}`;

export default function AssistantScreen() {
  const { user } = useUser();
  const { showPaywall } = usePaywall();
  const available = useAssistantAvailable();
  const isPremium = !!user?.isPremium;

  const [noticeSeen, setNoticeSeen] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    hasSeenAssistantNotice().then(setNoticeSeen);
  }, []);

  const acceptNotice = useCallback(() => {
    setNoticeSeen(true);
    haptic("selection");
    markAssistantNoticeSeen();
  }, []);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim().slice(0, MAX_QUESTION);
      if (!question || asking) return;
      // Earlier turns only; error bubbles are not part of the conversation.
      const history: AssistantTurn[] = messages
        .filter((m) => !m.error)
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));
      setMessages((prev) => [...prev, { id: newId(), role: "user", text: question }]);
      setInput("");
      setAsking(true);
      try {
        const res = await askAssistant(question, history);
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "assistant", text: res.data.answer, periods: res.data.periods },
        ]);
        setRemainingToday(res.data.remainingToday);
        haptic("success");
      } catch (err) {
        if (isApiError(err) && err.code === "PREMIUM_REQUIRED") {
          showPaywall("ask_mileclear");
        }
        const text =
          isApiError(err) && (err.statusCode === 429 || err.statusCode === 503 || err.statusCode === 400)
            ? err.message
            : "Sorry, that didn't go through. Check your connection and try again.";
        setMessages((prev) => [...prev, { id: newId(), role: "assistant", text, error: true }]);
      } finally {
        setAsking(false);
      }
    },
    [asking, messages, showPaywall]
  );

  // ── Gates ───────────────────────────────────────────────────────────────

  if (!user || noticeSeen === null || available === null) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Ask MileClear" }} />
        <View style={styles.centreBox}>
          <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
        </View>
      </View>
    );
  }

  if (!available) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Ask MileClear" }} />
        <View style={styles.centreBox}>
          <Text style={styles.centreTitle}>Not available yet</Text>
          <Text style={styles.centreBody}>Ask MileClear isn't switched on yet. Check back soon.</Text>
        </View>
      </View>
    );
  }

  if (!isPremium) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Ask MileClear" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.lockBadge, { alignSelf: "center", marginTop: 12 }]}>
            <Ionicons name="chatbubbles-outline" size={28} color={AMBER} />
          </View>
          <Text style={styles.centreTitle}>Ask about your own figures</Text>
          <Text style={styles.centreBody}>
            Ask a question in your own words and get a short answer from the trips, earnings, expenses
            and fuel you have recorded in MileClear, with the dates it covers.
          </Text>
          <View style={styles.card}>
            <Text style={styles.exampleTag}>YOU COULD ASK</Text>
            {PREVIEW_QUESTIONS.map((q) => (
              <View key={q} style={styles.previewRow}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={AMBER} />
                <Text style={styles.previewText}>{q}</Text>
              </View>
            ))}
          </View>
          <Button title="See Pro" icon="star" onPress={() => showPaywall("ask_mileclear")} style={{ marginTop: 20 }} />
          <Text style={styles.smallPrint}>General guidance only, from your MileClear records.</Text>
        </ScrollView>
      </View>
    );
  }

  if (!noticeSeen) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Ask MileClear" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.lockBadge, { alignSelf: "center", marginTop: 12 }]}>
            <Ionicons name="lock-closed-outline" size={28} color={AMBER} />
          </View>
          <Text style={styles.centreTitle}>Before you ask</Text>
          <View style={styles.card}>
            <Text style={styles.noticeText}>
              Ask MileClear uses Anthropic, an AI company, to write its answers.
            </Text>
            <Text style={styles.noticeText}>
              When you ask a question, we send Anthropic your question and the figures needed to answer
              it, such as your earnings, miles or expense totals for the dates you asked about.
            </Text>
            <Text style={styles.noticeText}>
              We never send your GPS routes, addresses or contact details. Anthropic handles this for us
              and does not use it to train its models.
            </Text>
            <Text style={styles.noticeText}>Nothing is sent unless you ask a question.</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(PRIVACY_URL)}
              accessibilityRole="link"
              style={{ marginTop: 4 }}
            >
              <Text style={styles.link}>Read the privacy policy</Text>
            </TouchableOpacity>
          </View>
          <Button title="OK, got it" onPress={acceptNotice} style={{ marginTop: 20 }} />
        </ScrollView>
      </View>
    );
  }

  // ── Chat ────────────────────────────────────────────────────────────────

  const canSend = input.trim().length > 0 && !asking;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Ask MileClear" }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <>
              <Text style={styles.heading}>Ask about your records</Text>
              <Text style={styles.subheading}>
                Earnings, miles, expenses, fuel and your tax year so far. Try one of these:
              </Text>
              <View style={styles.chipRow}>
                {SUGGESTIONS.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.chip}
                    onPress={() => ask(q)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask: ${q}`}
                  >
                    <Text style={styles.chipText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <View key={m.id} style={[styles.bubble, styles.userBubble]}>
                <Text style={styles.userText}>{m.text}</Text>
              </View>
            ) : (
              <View key={m.id} style={[styles.bubble, styles.answerBubble, m.error && styles.errorBubble]}>
                <Text style={[styles.answerText, m.error && { color: TEXT_2 }]}>{m.text}</Text>
                {!m.error && m.periods && m.periods.length > 0 && (
                  <Text style={styles.period}>Covers {m.periods.join("; ")}</Text>
                )}
                {!m.error && (
                  <Text style={styles.footnote}>General guidance only, from your MileClear records.</Text>
                )}
              </View>
            )
          )}

          {asking && (
            <View style={[styles.bubble, styles.answerBubble, styles.thinkingRow]}>
              <ActivityIndicator size="small" color={AMBER} />
              <Text style={styles.thinkingText}>Checking your records</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          {remainingToday != null && remainingToday <= 5 && (
            <Text style={styles.remaining}>
              {remainingToday === 0
                ? "That was your last question for today."
                : `${remainingToday} question${remainingToday === 1 ? "" : "s"} left today`}
            </Text>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask about your earnings, miles or costs"
              placeholderTextColor={TEXT_3}
              value={input}
              onChangeText={setInput}
              maxLength={MAX_QUESTION}
              multiline
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={() => ask(input)}
              accessibilityLabel="Your question"
            />
            <TouchableOpacity
              style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
              onPress={() => ask(input)}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send question"
            >
              <Ionicons name="arrow-up" size={20} color={canSend ? BG : TEXT_3} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 24 },
  centreBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28 },
  lockBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  centreTitle: { fontSize: 20, fontFamily: fonts.bold, color: TEXT_1, textAlign: "center", marginBottom: 10 },
  centreBody: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2, textAlign: "center", lineHeight: 21, marginBottom: 20 },
  heading: { fontSize: 22, fontFamily: fonts.bold, color: TEXT_1, marginTop: 8, marginBottom: 6 },
  subheading: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 21, marginBottom: 12 },
  card: { backgroundColor: CARD_BG, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16 },
  exampleTag: { fontSize: 11, fontFamily: fonts.bold, color: TEXT_3, letterSpacing: 1, marginBottom: 8 },
  previewRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6 },
  previewText: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: TEXT_1, lineHeight: 21 },
  noticeText: { fontSize: 15, fontFamily: fonts.regular, color: TEXT_1, lineHeight: 22, marginBottom: 10 },
  link: { fontSize: 14, fontFamily: fonts.semibold, color: AMBER, textDecorationLine: "underline" },
  smallPrint: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, lineHeight: 18, marginTop: 10, textAlign: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipText: { fontSize: 13, fontFamily: fonts.medium, color: TEXT_1 },
  bubble: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginTop: 10, maxWidth: "88%" },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.amberDim, borderWidth: 1, borderColor: AMBER },
  userText: { fontSize: 15, fontFamily: fonts.medium, color: TEXT_1, lineHeight: 21 },
  answerBubble: { alignSelf: "flex-start", backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER },
  errorBubble: { borderColor: RED },
  answerText: { fontSize: 15, fontFamily: fonts.regular, color: TEXT_1, lineHeight: 22 },
  period: { fontSize: 12, fontFamily: fonts.semibold, color: AMBER, marginTop: 8 },
  footnote: { fontSize: 11, fontFamily: fonts.regular, color: TEXT_3, marginTop: 6 },
  thinkingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  thinkingText: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_2 },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
    backgroundColor: BG,
  },
  remaining: { fontSize: 12, fontFamily: fonts.medium, color: TEXT_3, marginBottom: 6, textAlign: "center" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 110,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: TEXT_1,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AMBER,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER },
});
