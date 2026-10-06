import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ErrorState } from "../components/ErrorState";
import { useAuth } from "../lib/auth/context";
import { fetchFeedbackBoard, fetchKnownIssues } from "../lib/api/feedback";
import { fetchSupportThreads } from "../lib/api/support";
import { KNOWN_ISSUE_STATUSES } from "@mileclear/shared";
import type {
  FeedbackBoard,
  FeedbackItem,
  FeedbackShipped,
  FeedbackStatus,
  FeedbackWithVoted,
  SupportThreadSummary,
} from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const BG = colors.bg;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const RED = colors.red;
const GREEN = "#34c759";
const BLUE = "#3b82f6";
const CARD_BORDER = "rgba(255,255,255,0.05)";

type BoardItem = FeedbackItem & FeedbackShipped;

// Plain words for where an idea has got to (6 Oct 2026 redesign).
const STATUS_META: Record<FeedbackStatus, { label: string; color: string }> = {
  new: { label: "Received", color: TEXT_2 },
  planned: { label: "On the list", color: BLUE },
  in_progress: { label: "Being built", color: AMBER },
  done: { label: "Built", color: GREEN },
  declined: { label: "Not for now", color: TEXT_3 },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diffH = Math.floor((Date.now() - d.getTime()) / 3600000);
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Feedback (redesigned 6 Oct 2026). Problems are private conversations with
 * the team; ideas are public, shown as "You asked, we built" rather than a
 * voting list. See docs/feedback-redesign-oct2026.md.
 */
export default function FeedbackScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [board, setBoard] = useState<FeedbackBoard | null>(null);
  const [threads, setThreads] = useState<SupportThreadSummary[]>([]);
  const [knownIssues, setKnownIssues] = useState<FeedbackWithVoted[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const [boardRes, threadRes, kiRes] = await Promise.all([
        fetchFeedbackBoard(),
        isAuthenticated ? fetchSupportThreads().catch(() => ({ data: [] as SupportThreadSummary[] })) : Promise.resolve({ data: [] as SupportThreadSummary[] }),
        fetchKnownIssues().catch(() => ({ data: [] as FeedbackWithVoted[] })),
      ]);
      setBoard(boardRes.data);
      setThreads(threadRes.data);
      setKnownIssues(kiRes.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const renderIdea = (item: BoardItem, showStatus: boolean) => {
    const meta = STATUS_META[item.status];
    const lastReply = item.replies?.length ? item.replies[item.replies.length - 1] : null;
    return (
      <View key={item.id} style={s.card}>
        {showStatus && meta && (
          <View style={[s.pill, { backgroundColor: meta.color + "20" }]}>
            <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        )}
        <Text style={s.cardTitle}>{item.title}</Text>
        {item.status === "done" && item.shippedNote ? (
          <View style={s.shipped}>
            <Ionicons name="checkmark-circle" size={14} color={GREEN} />
            <Text style={s.shippedText}>{item.shippedNote}</Text>
          </View>
        ) : (
          <Text style={s.cardBody} numberOfLines={3}>{item.body}</Text>
        )}
        {lastReply && item.status !== "done" ? (
          <View style={s.reply}>
            <Ionicons name="shield-checkmark" size={10} color={AMBER} />
            <Text style={s.replyText} numberOfLines={3}>{lastReply.body}</Text>
          </View>
        ) : null}
        <Text style={s.cardMeta}>
          {item.displayName || "A driver"} · {formatDate(item.status === "done" && item.shippedAt ? item.shippedAt : item.createdAt)}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.scroll}
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
      {/* Two ways in */}
      <TouchableOpacity
        style={[s.action, s.actionProblem]}
        onPress={() => router.push("/report-problem" as never)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Something's not right. Tell us privately"
      >
        <View style={[s.actionIcon, { backgroundColor: RED + "18" }]}>
          <Ionicons name="alert-circle-outline" size={22} color={RED} />
        </View>
        <View style={s.actionTextCol}>
          <Text style={s.actionTitle}>Something's not right</Text>
          <Text style={s.actionSub}>Tell us privately. We'll look at your phone's details and reply.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={TEXT_3} />
      </TouchableOpacity>

      <TouchableOpacity
        style={s.action}
        onPress={() => router.push("/feedback-form" as never)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Suggest an idea"
      >
        <View style={[s.actionIcon, { backgroundColor: AMBER + "18" }]}>
          <Ionicons name="bulb-outline" size={22} color={AMBER} />
        </View>
        <View style={s.actionTextCol}>
          <Text style={s.actionTitle}>Suggest an idea</Text>
          <Text style={s.actionSub}>Something you'd like MileClear to do, or do better.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={TEXT_3} />
      </TouchableOpacity>

      {/* Private conversations */}
      {threads.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Your messages</Text>
          {threads.map((t) => (
            <TouchableOpacity
              key={t.threadKey}
              style={s.threadRow}
              onPress={() => router.push(`/support-thread?key=${encodeURIComponent(t.threadKey)}` as never)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t.subject}${t.unread ? ", new reply" : ""}, ${formatDate(t.lastAt)}`}
            >
              {t.unread ? <View style={s.unreadDot} /> : <Ionicons name="chatbubble-outline" size={14} color={TEXT_3} />}
              <View style={s.threadTextCol}>
                <Text style={[s.threadSubject, t.unread && s.threadSubjectUnread]} numberOfLines={1}>{t.subject}</Text>
                <Text style={s.threadMeta}>
                  {t.unread ? "New reply" : t.lastDirection === "out" ? "We replied" : "Waiting for our reply"} · {formatDate(t.lastAt)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Known issues (read-only) */}
      {knownIssues.length > 0 && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: RED }]}>Known issues</Text>
          {knownIssues.map((ki) => {
            const meta = KNOWN_ISSUE_STATUSES.find((st) => st.value === ki.knownIssueStatus);
            return (
              <View key={ki.id} style={[s.card, s.kiCard]}>
                {meta && (
                  <View style={[s.pill, { backgroundColor: meta.color + "20" }]}>
                    <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                )}
                <Text style={s.cardTitle}>{ki.title}</Text>
                <Text style={s.cardBody} numberOfLines={3}>{ki.body}</Text>
              </View>
            );
          })}
        </View>
      )}

      {error || !board ? (
        <View style={s.errorWrap}>
          <ErrorState
            title="Couldn't load the board"
            description="Pull down to try again"
            onRetry={() => {
              setLoading(true);
              load();
            }}
          />
        </View>
      ) : (
        <>
          <View style={s.section}>
            <Text style={s.sectionTitle}>You asked, we built</Text>
            <Text style={s.sectionIntro}>Ideas from drivers that we've picked up, and what came of them.</Text>
            {board.onTheList.length === 0 && board.built.length === 0 ? (
              <Text style={s.empty}>Nothing here yet. Your idea could be the first.</Text>
            ) : null}
            {board.onTheList.map((i) => renderIdea(i, true))}
            {board.built.map((i) => renderIdea(i, true))}
          </View>

          {board.mine.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Your ideas</Text>
              {board.mine.map((i) => renderIdea(i, true))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  scroll: { padding: 16, paddingBottom: 32 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  actionProblem: { borderColor: RED + "30" },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionTextCol: { flex: 1 },
  actionTitle: { fontSize: 15, fontFamily: fonts.semibold, color: TEXT_1, marginBottom: 2 },
  actionSub: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 17 },
  section: { marginTop: 22 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionIntro: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, marginTop: -6, marginBottom: 10 },
  empty: { fontSize: 13, fontFamily: fonts.regular, color: TEXT_3, paddingVertical: 8 },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: AMBER },
  threadTextCol: { flex: 1 },
  threadSubject: { fontSize: 14, fontFamily: fonts.medium, color: TEXT_1 },
  threadSubjectUnread: { fontFamily: fonts.bold },
  threadMeta: { fontSize: 11, fontFamily: fonts.regular, color: TEXT_3, marginTop: 2 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  kiCard: { backgroundColor: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.12)" },
  pill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 8 },
  pillText: { fontSize: 10, fontFamily: fonts.semibold, letterSpacing: 0.3, textTransform: "uppercase" },
  cardTitle: { fontSize: 15, fontFamily: fonts.semibold, color: TEXT_1, marginBottom: 4, lineHeight: 20 },
  cardBody: { fontSize: 13, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 18, marginBottom: 8 },
  shipped: { flexDirection: "row", gap: 6, alignItems: "flex-start", marginBottom: 8 },
  shippedText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: TEXT_1, lineHeight: 18 },
  reply: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    backgroundColor: "rgba(245,166,35,0.06)",
    borderLeftWidth: 2,
    borderLeftColor: AMBER,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  replyText: { flex: 1, fontSize: 12, fontFamily: fonts.regular, color: TEXT_2, lineHeight: 17 },
  cardMeta: { fontSize: 11, fontFamily: fonts.regular, color: TEXT_3 },
  errorWrap: { marginTop: 24, alignItems: "center" },
});
