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
import { useAuth } from "../lib/auth/context";
import { fetchFeedbackList, toggleFeedbackVote } from "../lib/api/feedback";
import type { FeedbackListParams } from "../lib/api/feedback";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "@mileclear/shared";
import type { FeedbackWithVoted, FeedbackCategory } from "@mileclear/shared";

const AMBER = "#f5a623";
const BG = "#030712";
const CARD_BG = "#0a1120";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";
const CARD_BORDER = "rgba(255,255,255,0.05)";

const CATEGORY_COLORS: Record<string, string> = {
  feature_request: "#3b82f6",
  bug_report: "#ef4444",
  improvement: "#a855f7",
  other: "#8494a7",
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
  const votingIds = useRef(new Set<string>());

  const loadData = useCallback(
    async (p = 1, append = false) => {
      try {
        setError(false);
        const params: FeedbackListParams = { page: p, pageSize: 15, sort };
        if (filter !== "all") params.category = filter;
        const res = await fetchFeedbackList(params);
        if (append) {
          setItems((prev) => [...prev, ...res.data]);
        } else {
          setItems(res.data);
        }
        setTotalPages(res.totalPages);
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
        Alert.alert("Sign In Required", "You need to be signed in to upvote suggestions.", [
          { text: "OK" },
        ]);
        return;
      }
      if (votingIds.current.has(id)) return;
      votingIds.current.add(id);

      // Capture original state before mutation
      const original = items.find((i) => i.id === id);
      if (!original) { votingIds.current.delete(id); return; }
      const origVoted = original.hasVoted;
      const origCount = original.upvoteCount;

      // Optimistic update
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            hasVoted: !origVoted,
            upvoteCount: origCount + (origVoted ? -1 : 1),
          };
        })
      );

      try {
        await toggleFeedbackVote(id);
      } catch {
        // Revert to captured original state
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== id) return item;
            return { ...item, hasVoted: origVoted, upvoteCount: origCount };
          })
        );
      } finally {
        votingIds.current.delete(id);
      }
    },
    [isAuthenticated]
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
        <Text style={s.cardBody} numberOfLines={2}>{item.body}</Text>

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
          >
            <Ionicons
              name={item.hasVoted ? "arrow-up" : "arrow-up-outline"}
              size={16}
              color={item.hasVoted ? "#030712" : TEXT_2}
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
      {/* Toolbar */}
      <View style={s.toolbar}>
        <TouchableOpacity
          style={s.submitButton}
          onPress={() => router.push("/feedback-form")}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={18} color="#030712" />
          <Text style={s.submitButtonText}>Submit Idea</Text>
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
          <ActivityIndicator size="large" color={AMBER} />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={TEXT_3} />
          <Text style={s.emptyTitle}>Could not load suggestions</Text>
          <Text style={s.emptySubtitle}>Pull down to try again</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="bulb-outline" size={48} color={TEXT_3} />
          <Text style={s.emptyTitle}>No suggestions yet</Text>
          <Text style={s.emptySubtitle}>Be the first to share an idea!</Text>
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
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: AMBER,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  submitButtonText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
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
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  filterChipTextActive: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  sortToggle: {
    padding: 8,
    borderRadius: 20,
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 4,
    lineHeight: 20,
  },
  cardBody: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
  },
  voteCountActive: {
    color: "#030712",
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
});
