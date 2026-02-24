import { useCallback, useState } from "react";
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
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchFeedbackList,
  fetchFeedbackStats,
  updateFeedbackStatus,
  deleteFeedback,
} from "../lib/api/feedback";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "@mileclear/shared";
import type { FeedbackWithVoted, FeedbackStatus } from "@mileclear/shared";

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

type StatusFilter = "all" | FeedbackStatus;

export default function AdminFeedbackScreen() {
  const [items, setItems] = useState<FeedbackWithVoted[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params: Record<string, unknown> = { pageSize: 50, sort: "newest" };
      if (statusFilter !== "all") params.status = statusFilter;
      const [listRes, statsRes] = await Promise.all([
        fetchFeedbackList(params as any),
        fetchFeedbackStats(),
      ]);
      setItems(listRes.data);
      setStats(statsRes.data.byStatus);
      setTotal(statsRes.data.total);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleStatusChange = async (id: string, newStatus: FeedbackStatus) => {
    setUpdatingId(id);
    try {
      await updateFeedbackStatus(id, newStatus);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: newStatus } : item
        )
      );
      // Update stats locally
      setStats((prev) => {
        const old = items.find((i) => i.id === id);
        if (!old) return prev;
        const updated = { ...prev };
        updated[old.status] = (updated[old.status] || 1) - 1;
        updated[newStatus] = (updated[newStatus] || 0) + 1;
        return updated;
      });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      "Delete Feedback",
      `Delete "${title}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFeedback(id);
              setItems((prev) => prev.filter((i) => i.id !== id));
              setTotal((t) => t - 1);
              if (expandedId === id) setExpandedId(null);
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete");
            }
          },
        },
      ]
    );
  };

  const getCategoryLabel = (cat: string) =>
    FEEDBACK_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: `All (${total})` },
    ...FEEDBACK_STATUSES.map((s) => ({
      key: s.value as StatusFilter,
      label: `${s.label} (${stats[s.value] || 0})`,
    })),
  ];

  const renderItem = ({ item }: { item: FeedbackWithVoted }) => {
    const expanded = expandedId === item.id;
    const catColor = CATEGORY_COLORS[item.category] ?? TEXT_3;
    const statusMeta = FEEDBACK_STATUSES.find((s) => s.value === item.status);

    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => setExpandedId(expanded ? null : item.id)}
        activeOpacity={0.7}
      >
        {/* Header row */}
        <View style={s.cardHeader}>
          <View style={s.cardBadges}>
            <View style={[s.pill, { backgroundColor: catColor + "20" }]}>
              <Text style={[s.pillText, { color: catColor }]}>{getCategoryLabel(item.category)}</Text>
            </View>
            {statusMeta && (
              <View style={[s.pill, { backgroundColor: statusMeta.color + "20" }]}>
                <Text style={[s.pillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
              </View>
            )}
          </View>
          <View style={s.voteChip}>
            <Ionicons name="arrow-up" size={12} color={AMBER} />
            <Text style={s.voteChipText}>{item.upvoteCount}</Text>
          </View>
        </View>

        <Text style={s.cardTitle} numberOfLines={expanded ? undefined : 1}>{item.title}</Text>

        <View style={s.cardMeta}>
          <Text style={s.metaText}>{item.displayName || "Anonymous"}</Text>
          <View style={s.dot} />
          <Text style={s.metaText}>{formatDate(item.createdAt)}</Text>
        </View>

        {/* Expanded detail */}
        {expanded && (
          <View style={s.expandedSection}>
            <Text style={s.bodyText}>{item.body}</Text>

            {/* Status picker */}
            <Text style={s.sectionLabel}>Status</Text>
            <View style={s.statusRow}>
              {FEEDBACK_STATUSES.map((st) => {
                const active = item.status === st.value;
                return (
                  <TouchableOpacity
                    key={st.value}
                    style={[
                      s.statusPill,
                      { borderColor: active ? st.color : "rgba(255,255,255,0.08)" },
                      active && { backgroundColor: st.color + "20" },
                    ]}
                    onPress={() => {
                      if (!active) handleStatusChange(item.id, st.value as FeedbackStatus);
                    }}
                    disabled={updatingId === item.id}
                    activeOpacity={0.7}
                  >
                    {updatingId === item.id ? (
                      <ActivityIndicator size={10} color={st.color} />
                    ) : (
                      <View style={[s.statusDot, { backgroundColor: st.color }]} />
                    )}
                    <Text style={[s.statusPillText, { color: active ? st.color : TEXT_2 }]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Delete */}
            <TouchableOpacity
              style={s.deleteButton}
              onPress={() => handleDelete(item.id, item.title)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={s.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Stats summary row
  const statsRow = FEEDBACK_STATUSES.map((st) => ({
    label: st.label,
    count: stats[st.value] || 0,
    color: st.color,
  }));

  return (
    <View style={s.container}>
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={AMBER} />
        </View>
      ) : (
        <>
          {/* Stats row */}
          <View style={s.statsRow}>
            {statsRow.map((st) => (
              <View key={st.label} style={s.statBox}>
                <Text style={[s.statCount, { color: st.color }]}>{st.count}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>

          {/* Filter chips */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={statusFilters}
            keyExtractor={(item) => item.key}
            contentContainerStyle={s.filterScroll}
            renderItem={({ item: opt }) => (
              <TouchableOpacity
                style={[s.filterChip, statusFilter === opt.key && s.filterChipActive]}
                onPress={() => setStatusFilter(opt.key)}
                activeOpacity={0.7}
              >
                <Text style={[s.filterChipText, statusFilter === opt.key && s.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )}
          />

          {/* List */}
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />
            }
            ListEmptyComponent={
              <View style={s.centered}>
                <Ionicons name="chatbox-ellipses-outline" size={40} color={TEXT_3} />
                <Text style={s.emptyText}>No feedback yet</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },

  // Stats
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 6,
  },
  statBox: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  statCount: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  statLabel: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // Filters
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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

  // List
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardBadges: {
    flexDirection: "row",
    gap: 6,
    flex: 1,
  },
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pillText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  voteChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: AMBER + "15",
  },
  voteChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TEXT_3,
  },

  // Expanded
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  bodyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 19,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 14,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  deleteButtonText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#ef4444",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    marginTop: 8,
  },
});
