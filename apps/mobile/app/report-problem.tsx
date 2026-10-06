import { useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { submitProblemReport } from "../lib/api/support";
import { uploadDiagnosticDump } from "../lib/api/diagnostics";
import { showSupportAlert } from "../lib/support";
import { toUploads, type PickedScreenshot } from "../lib/supportScreenshots";
import { ScreenshotPicker } from "../components/SupportScreenshots";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const BG = colors.bg;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const CARD_BORDER = "rgba(255,255,255,0.08)";

const DUMP_WAIT_MS = 8000;

/**
 * Private problem report (6 Oct 2026). Lands in the admin Inbox as a
 * conversation, with this phone's details attached server-side from a fresh
 * diagnostics upload, so support can answer without a back-and-forth.
 */
export default function ReportProblemScreen() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [shots, setShots] = useState<PickedScreenshot[]>([]);
  const [sending, setSending] = useState(false);

  const canSend = body.trim().length >= 5 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      // Fresh phone details first, so the report shows how the phone is now.
      // Never blocks the report for long, and a failure is ignored.
      await Promise.race([
        uploadDiagnosticDump().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, DUMP_WAIT_MS)),
      ]);
      const res = await submitProblemReport({ body: body.trim(), screenshots: toUploads(shots) });
      router.replace(`/support-thread?key=${encodeURIComponent(res.data.threadKey)}` as never);
    } catch (e: unknown) {
      showSupportAlert("Couldn't send your report", e instanceof Error && e.message ? e.message : "Try again in a moment.");
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.introCard}>
          <Ionicons name="lock-closed-outline" size={16} color={AMBER} />
          <Text style={s.introText}>
            This goes privately to the MileClear team, not on the public board. We usually reply within a few hours, here and by email.
          </Text>
        </View>

        <Text style={s.label}>What happened?</Text>
        <TextInput
          style={s.input}
          value={body}
          onChangeText={setBody}
          placeholder="For example: my drive to work this morning around 8am didn't record."
          placeholderTextColor={TEXT_3}
          maxLength={4000}
          multiline
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoFocus
          editable={!sending}
          accessibilityLabel="What happened? When, and what were you doing?"
        />
        <Text style={s.hint}>When it happened and what you were doing helps us find it quickly.</Text>

        <Text style={[s.label, s.labelGap]}>Screenshots (optional)</Text>
        <ScreenshotPicker shots={shots} onChange={setShots} disabled={sending} />

        <View style={s.attachNote}>
          <Ionicons name="phone-portrait-outline" size={14} color={TEXT_3} />
          <Text style={s.attachNoteText}>
            We'll attach your phone's details (app version, permissions, battery mode and your last few trips) so we can help faster.
          </Text>
        </View>

        <TouchableOpacity
          style={[s.sendButton, !canSend && s.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Send report"
          accessibilityState={{ disabled: !canSend }}
        >
          {sending ? <ActivityIndicator color={BG} accessibilityLabel="Sending" /> : <Text style={s.sendText}>Send report</Text>}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  introCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: AMBER + "18",
    borderLeftWidth: 3,
    borderLeftColor: AMBER,
  },
  introText: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 19 },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: TEXT_1, marginBottom: 8 },
  labelGap: { marginTop: 20 },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 140,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_1,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  hint: { fontSize: 11, fontFamily: fonts.regular, color: TEXT_3, marginTop: 6 },
  attachNote: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 20, marginBottom: 16 },
  attachNoteText: { flex: 1, fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, lineHeight: 17 },
  sendButton: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendText: { fontSize: 15, fontFamily: fonts.bold, color: BG },
});
