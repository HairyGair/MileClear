import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { useAuth } from "../lib/auth/context";
import { fetchFeedbackList, fetchKnownIssues, toggleFeedbackVote } from "../lib/api/feedback";
import type { FeedbackListParams } from "../lib/api/feedback";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, KNOWN_ISSUE_STATUSES } from "@mileclear/shared";
import type { FeedbackWithVoted, FeedbackCategory } from "@mileclear/shared";
import { colors, fonts } from "../lib/theme";

const AMBER = colors.amber;
const BG = colors.bg;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const RED = colors.red;
const CARD_BORDER = "rgba(255,255,255,0.05)";

const CATEGORY_COLORS: Record<string, string> = {
  feature_request: "#3b82f6",
  bug_report: RED,
  improvement: "#a855f7",
  other: TEXT_2,
};

type SortOption = "most_voted" | "newest";
type FilterOption = "all" | FeedbackCategory;

export default function FeedbackScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<FeedbackWithVoted[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [sort, setSort] = useState<SortOption>("most_voted");
  const [error, setError] = useState(false);
  const [knownIssues, setKnownIssues] = useState<FeedbackWithVoted[]>([]);
  const votingIds = useRef(new Set<string>());

  const loadData = useCallback(
    async (p = 1, append = false) => {
      try {
        setError(false);
        const params: FeedbackListParams = { page: p, pageSize: 15, sort };
        if (filter !== "all") params.category = filter;

        if (p === 1 && !append) {
          const [listRes, kiRes] = await Promise.all([
            fetchFeedbackList(params),
            fetchKnownIssues(),
          ]);
          setItems(listRes.data);
          setTotalPages(listRes.totalPages);
          setKnownIssues(kiRes.data);
        } else {
          const res = await fetchFeedbackList(params);
          if (append) {
            setItems((prev) => [...prev, ...res.data]);
          } else {
            setItems(res.data);
          }
          setTotalPages(res.totalPages);
        }
        setPage(p);
      } catch {
        if (!append) setError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filter, sort]
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData(1);
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(1);
  }, [loadData]);

  const onEndReached = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    loadData(page + 1, true);
  }, [loadingMore, page, totalPages, loadData]);

  const handleVote = useCallback(
    async (id: string) => {
      if (!isAuthenticated) {
        Alert.alert("Sign In Required", "You need to be signed in to vote.", [
          { text: "OK" },
        ]);
        return;
      }
      if (votingIds.current.has(id)) return;
      votingIds.current.add(id);

      // Capture original state before mutation (check both lists)
      const original = items.find((i) => i.id === id) ?? knownIssues.find((i) => i.id === id);
      if (!original) { votingIds.current.delete(id); return; }
      const origVoted = original.hasVoted;
      const origCount = original.upvoteCount;

      const applyOptimistic = (list: FeedbackWithVoted[]) =>
        list.map((item) => {
          if (item.id !== id) return item;
          return { ...item, hasVoted: !origVoted, upvoteCount: origCount + (origVoted ? -1 : 1) };
        });

      const applyRevert = (list: FeedbackWithVoted[]) =>
        list.map((item) => {
          if (item.id !== id) return item;
          return { ...item, hasVoted: origVoted, upvoteCount: origCount };
        });

      setItems(applyOptimistic);
      setKnownIssues(applyOptimistic);

      try {
        await toggleFeedbackVote(id);
      } catch {
        setItems(applyRevert);
        setKnownIssues(applyRevert);
      } finally {
        votingIds.current.delete(id);
      }
    },
    [isAuthenticated, items, knownIssues]
  );

  const getStatusMeta = (status: string) =>
    FEEDBACK_STATUSES.find((s) => s.value === status);

  const getCategoryLabel = (cat: string) =>
    FEEDBACK_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  const filterOptions: { key: FilterOption; label: string }[] = [
    { key: "all", label: "All" },
    ...FEEDBACK_CATEGORIES.map((c) => ({ key: c.value as FilterOption, label: c.label })),
  ];

  const renderItem = ({ item }: { item: FeedbackWithVoted }) => {
    const statusMeta = getStatusMeta(item.status);
    const catColor = CATEGORY_COLORS[item.category] ?? TEXT_3;

    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.categoryPill, { backgroundColor: catColor + "20" }]}>
            <Text style={[s.categoryPillText, { color: catColor }]}>
              {getCategoryLabel(item.category)}
            </Text>
          </View>
          {item.status !== "new" && statusMeta && (
            <View style={[s.statusPill, { backgroundColor: statusMeta.color + "20" }]}>
              <Text style={[s.statusPillText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
          )}
        </View>

        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.cardBody} numberOfLines={item.replies?.length > 0 ? undefined : 2}>{item.body}</Text>

        {item.replies && item.replies.length > 0 && (
          <View style={s.repliesSection}>
            {item.replies.map((r) => (
              <View key={r.id} style={s.replyCard}>
                <View style={s.replyHeader}>
                  <View style={s.replyAdminBadge}>
                    <Ionicons name="shield-checkmark" size={10} color={AMBER} />
                    <Text style={s.replyAdminName}>{r.adminName}</Text>
                  </View>
                  <Text style={s.replyDate}>{formatDate(r.createdAt)}</Text>
                </View>
                <Text style={s.replyBody}>{r.body}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.cardBottom}>
          <View style={s.cardMeta}>
            <Text style={s.cardAuthor}>{item.displayName || "Anonymous"}</Text>
            <View style={s.dot} />
            <Text style={s.cardDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <TouchableOpacity
            style={[s.voteButton, item.hasVoted && s.voteButtonActive]}
            onPress={() => handleVote(item.id)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`${item.hasVoted ? "Remove upvote" : "Upvote"}: ${item.title}, ${item.upvoteCount} votes`}
            accessibilityState={{ selected: item.hasVoted }}
          >
            <Ionicons
              name={item.hasVoted ? "arrow-up" : "arrow-up-outline"}
              size={16}
              color={item.hasVoted ? BG : TEXT_2}
            />
            <Text style={[s.voteCount, item.hasVoted && s.voteCountActive]}>
              {item.upvoteCount}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* Community banner */}
      <View style={s.banner}>
        <Text style={s.bannerHeading}>Help shape MileClear</Text>
        <Text style={s.bannerText}>
          Every suggestion is personally reviewed. Vote on ideas you want to see, or share your own — the most popular get built next.
        </Text>
        <TouchableOpacity
          style={s.submitButton}
          onPress={() => router.push("/feedback-form")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Share your idea"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={BG} />
          <Text style={s.submitButtonText}>Share Your Idea</Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <View style={s.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterOptions}
          keyExtractor={(item) => item.key}
          contentContainerStyle={s.filterScroll}
          renderItem={({ item: opt }) => (
            <TouchableOpacity
              style={[s.filterChip, filter === opt.key && s.filterChipActive]}
              onPress={() => setFilter(opt.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${opt.label}`}
              accessibilityState={{ selected: filter === opt.key }}
            >
              <Text style={[s.filterChipText, filter === opt.key && s.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity
          style={s.sortToggle}
          onPress={() => setSort((v) => (v === "most_voted" ? "newest" : "most_voted"))}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${sort === "most_voted" ? "newest" : "most voted"}`}
        >
          <Ionicons
            name={sort === "most_voted" ? "trending-up" : "time-outline"}
            size={18}
            color={AMBER}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading" />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <ErrorState
            title="Could not load suggestions"
            description="Pull down to try again"
            onRetry={() => { setLoading(true); loadData(1); }}
          />
        </View>
      ) : items.length === 0 ? (
        <View style={s.centered}>
          <EmptyState
            icon="bulb-outline"
            title="No suggestions yet"
            description={"You could be the first! Tell us what would make MileClear better for you."}
            iconColor={colors.amber}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            knownIssues.length > 0 ? (
              <View style={s.knownIssuesSection}>
                <View style={s.knownIssuesHeader}>
                  <Ionicons name="bug-outline" size={16} color={RED} />
                  <Text style={s.knownIssuesTitle}>Known Issues</Text>
                </View>
                {knownIssues.map((ki) => {
                  const statusMeta = KNOWN_ISSUE_STATUSES.find((st) => st.value === ki.knownIssueStatus);
                  return (
                    <View key={ki.id} style={s.kiCard}>
                      <View style={s.kiTop}>
                        {statusMeta && (
                          <View style={[s.kiStatusPill, { backgroundColor: statusMeta.color + "20" }]}>
                            <Ionicons name={statusMeta.icon as any} size={11} color={statusMeta.color} />
                            <Text style={[s.kiStatusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.kiTitle}>{ki.title}</Text>
                      <Text style={s.kiBody} numberOfLines={2}>{ki.body}</Text>
                      {ki.replies && ki.replies.length > 0 && (
                        <View style={s.kiReply}>
                          <Ionicons name="shield-checkmark" size={10} color={AMBER} />
                          <Text style={s.kiReplyText} numberOfLines={2}>{ki.replies[ki.replies.length - 1].body}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={[s.kiMeToo, ki.hasVoted && s.kiMeTooActive]}
                        onPress={() => handleVote(ki.id)}
                        activeOpacity={0.6}
                        accessibilityRole="button"
                        accessibilityLabel={`${ki.hasVoted ? "Remove affected vote" : "Mark as affected"}: ${ki.title}`}
                      >
                        <Ionicons
                          name={ki.hasVoted ? "hand-left" : "hand-left-outline"}
                          size={14}
                          color={ki.hasVoted ? BG : TEXT_2}
                        />
                        <Text style={[s.kiMeTooText, ki.hasVoted && s.kiMeTooTextActive]}>
                          {ki.hasVoted ? "Affected" : "Me too"} ({ki.upvoteCount})
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : null
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={AMBER} />
            ) : null
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8, paddingHorizontal: 32 },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: AMBER + "18",
    borderLeftWidth: 3,
    borderLeftColor: AMBER,
  },
  bannerHeading: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: AMBER,
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 19,
    marginBottom: 12,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: AMBER,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  submitButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: BG,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: {
    backgroundColor: AMBER + "20",
    borderColor: AMBER + "60",
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  filterChipTextActive: {
    color: AMBER,
    fontFamily: fonts.semibold,
  },
  sortToggle: {
    padding: 12,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardTop: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryPillText: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 4,
    lineHeight: 20,
  },
  cardBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  cardAuthor: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: TEXT_3,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TEXT_3,
  },
  cardDate: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  voteButtonActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  voteCount: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  voteCountActive: {
    color: BG,
  },
  knownIssuesSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  knownIssuesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  knownIssuesTitle: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: RED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kiCard: {
    backgroundColor: "rgba(239,68,68,0.06)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.12)",
  },
  kiTop: {
    flexDirection: "row",
    marginBottom: 6,
  },
  kiStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  kiStatusText: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  kiTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 4,
  },
  kiBody: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
    marginBottom: 8,
  },
  kiReply: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    backgroundColor: "rgba(245,166,35,0.06)",
    borderLeftWidth: 2,
    borderLeftColor: AMBER,
    borderRadius: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  kiReplyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
  },
  kiMeToo: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  kiMeTooActive: {
    backgroundColor: RED,
    borderColor: RED,
  },
  kiMeTooText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  kiMeTooTextActive: {
    color: BG,
  },
  repliesSection: {
    marginBottom: 10,
  },
  replyCard: {
    backgroundColor: "rgba(245,166,35,0.06)",
    borderLeftWidth: 2,
    borderLeftColor: AMBER,
    borderRadius: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  replyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  replyAdminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  replyAdminName: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  replyDate: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  replyBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 18,
  },
});
