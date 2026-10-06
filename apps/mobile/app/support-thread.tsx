import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { SupportThreadDetail } from "@mileclear/shared";
import { fetchSupportThread, replyToSupportThread } from "../lib/api/support";
import { uploadDiagnosticDump } from "../lib/api/diagnostics";
import { showSupportAlert } from "../lib/support";
import { MAX_SCREENSHOTS, pickScreenshot, toUploads, type PickedScreenshot } from "../lib/supportScreenshots";
import { AttachmentThumbs, ScreenshotPicker } from "../components/SupportScreenshots";
import { ErrorState } from "../components/ErrorState";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const BG = colors.bg;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_3 = colors.text3;
const CARD_BORDER = "rgba(255,255,255,0.08)";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * One private conversation with the MileClear team (6 Oct 2026): the
 * driver's report and our replies, oldest first, with a reply box.
 */
export default function SupportThreadScreen() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const threadKey = typeof key === "string" ? key : "";
  const [thread, setThread] = useState<SupportThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState("");
  const [shots, setShots] = useState<PickedScreenshot[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!threadKey) {
      setError(true);
      setLoading(false);
      return;
    }
    try {
      setError(false);
      const res = await fetchSupportThread(threadKey);
      setThread(res.data);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [threadKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canSend = reply.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      // Same as a new report: refresh the phone's details, never for long.
      await Promise.race([
        uploadDiagnosticDump().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
      await replyToSupportThread(threadKey, { body: reply.trim(), screenshots: toUploads(shots) });
      setReply("");
      setShots([]);
      await load();
    } catch (e: unknown) {
      showSupportAlert("Couldn't send your reply", e instanceof Error && e.message ? e.message : "Try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
      </View>
    );
  }

  if (error || !thread) {
    return (
      <View style={[s.container, s.centered]}>
        <ErrorState
          title="Couldn't open this conversation"
          description="Check your connection and try again."
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={100}
    >
      <Stack.Screen options={{ title: "Conversation" }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={AMBER}
          />
        }
      >
        <Text style={s.subject} numberOfLines={2}>{thread.subject}</Text>
        <View style={s.privateNote}>
          <Ionicons name="lock-closed-outline" size={12} color={TEXT_3} />
          <Text style={s.privateText}>Private between you and the MileClear team</Text>
        </View>

        {thread.messages.map((m) => {
          const ours = m.direction === "out";
          return (
            <View
              key={m.id}
              style={[s.bubble, ours ? s.bubbleOurs : s.bubbleTheirs]}
              accessible
              accessibilityLabel={`${ours ? m.fromName || "MileClear" : "You"}, ${formatWhen(m.at)}: ${m.body}`}
            >
              <Text style={[s.who, ours && s.whoOurs]}>
                {ours ? m.fromName || "MileClear" : "You"} · {formatWhen(m.at)}
              </Text>
              <Text style={s.body} selectable>{m.body}</Text>
              <AttachmentThumbs attachments={m.attachments} />
            </View>
          );
        })}

        {thread.messages.length > 0 && thread.messages[thread.messages.length - 1].direction === "in" && (
          <Text style={s.waiting}>We'll reply here and by email.</Text>
        )}
      </ScrollView>

      <View style={s.composer}>
        {shots.length > 0 ? (
          <View style={s.composerShots}>
            <ScreenshotPicker shots={shots} onChange={setShots} disabled={sending} />
          </View>
        ) : null}
        <View style={s.composerRow}>
          <TouchableOpacity
            style={s.attachButton}
            onPress={async () => {
              if (shots.length >= MAX_SCREENSHOTS) return;
              const shot = await pickScreenshot();
              if (shot) setShots((prev) => [...prev, shot]);
            }}
            disabled={sending || shots.length >= MAX_SCREENSHOTS}
            accessibilityRole="button"
            accessibilityLabel="Add a screenshot"
          >
            <Ionicons name="image-outline" size={22} color={shots.length >= MAX_SCREENSHOTS ? TEXT_3 : AMBER} />
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={reply}
            onChangeText={setReply}
            placeholder="Write a reply"
            placeholderTextColor={TEXT_3}
            maxLength={4000}
            multiline
            editable={!sending}
            accessibilityLabel="Your reply"
          />
          <TouchableOpacity
            style={[s.sendButton, !canSend && s.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send reply"
            accessibilityState={{ disabled: !canSend }}
          >
            {sending ? <ActivityIndicator color={BG} size="small" accessibilityLabel="Sending" /> : <Ionicons name="arrow-up" size={18} color={BG} />}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  scroll: { padding: 16, paddingBottom: 24 },
  subject: { fontSize: 17, fontFamily: fonts.bold, color: TEXT_1, marginBottom: 4 },
  privateNote: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 16 },
  privateText: { fontSize: 11, fontFamily: fonts.regular, color: TEXT_3 },
  bubble: { maxWidth: "88%", borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1 },
  bubbleOurs: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(245,166,35,0.06)",
    borderColor: AMBER + "30",
  },
  bubbleTheirs: {
    alignSelf: "flex-end",
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
  },
  who: { fontSize: 11, fontFamily: fonts.semibold, color: TEXT_3, marginBottom: 4 },
  whoOurs: { color: AMBER },
  body: { fontSize: 14, fontFamily: fonts.regular, color: TEXT_1, lineHeight: 20 },
  waiting: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, textAlign: "right", marginTop: 2 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
    backgroundColor: BG,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
  },
  composerShots: { marginBottom: 10 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_1,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  attachButton: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AMBER,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.4 },
});
