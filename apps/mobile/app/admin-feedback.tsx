import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../lib/user/context";
import {
  fetchFeedbackList,
  fetchFeedbackStats,
  updateFeedbackStatus,
  deleteFeedback,
  postFeedbackReply,
  deleteFeedbackReply,
  updateKnownIssue,
} from "../lib/api/feedback";
import type { FeedbackListParams } from "../lib/api/feedback";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, KNOWN_ISSUE_STATUSES } from "@mileclear/shared";
import type { FeedbackWithVoted, FeedbackStatus, FeedbackReply, KnownIssueStatus } from "@mileclear/shared";

const AMBER = "#f5a623";
const BG = "#030712";
const CARD_BG = "#0a1120";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const CARD_BORDER = "rgba(255,255,255,0.05)";

const CATEGORY_COLORS: Record<string, string> = {
  feature_request: "#3b82f6",
  bug_report: "#ef4444",
  improvement: "#a855f7",
  other: "#8494a7",
};

type StatusFilter = "all" | FeedbackStatus;

export default function AdminFeedbackScreen() {
  const { user } = useUser();
  const [items, setItems] = useState<FeedbackWithVoted[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Client-side admin guard
  if (!user?.isAdmin) {
    return (
      <View style={[s.container, s.centered]}>
        <Ionicons name="shield-outline" size={48} color={TEXT_3} />
        <Text style={s.emptyText}>Admin access required</Text>
      </View>
    );
  }

  const loadData = useCallback(async (p = 1, append = false) => {
    try {
      setError(false);
      const params: FeedbackListParams = { page: p, pageSize: 30, sort: "newest" };
      if (statusFilter !== "all") params.status = statusFilter;

      if (p === 1) {
        const [listRes, statsRes] = await Promise.all([
          fetchFeedbackList(params),
          fetchFeedbackStats(),
        ]);
        setItems(listRes.data);
        setTotalPages(listRes.totalPages);
        setStats(statsRes.data.byStatus);
        setTotal(statsRes.data.total);
      } else {
        const listRes = await fetchFeedbackList(params);
        if (append) {
          setItems((prev) => [...prev, ...listRes.data]);
        }
        setTotalPages(listRes.totalPages);
      }
      setPage(p);
    } catch {
      if (!append) setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [statusFilter]);

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

  const handleStatusChange = async (id: string, newStatus: FeedbackStatus) => {
    setUpdatingId(id);
    try {
      await updateFeedbackStatus(id, newStatus);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: newStatus } : item
        )
      );
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

  const handleSendReply = async (feedbackId: string) => {
    const body = replyText.trim();
    if (!body) return;
    setSendingReply(true);
    try {
      const res = await postFeedbackReply(feedbackId, body);
      setItems((prev) =>
        prev.map((item) =>
          item.id === feedbackId
            ? {
                ...item,
                replyCount: item.replyCount + 1,
                replies: [...item.replies, res.data],
              }
            : item
        )
      );
      setReplyText("");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteReply = (feedbackId: string, reply: FeedbackReply) => {
    Alert.alert("Delete Reply", "Delete this reply?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteFeedbackReply(reply.id);
            setItems((prev) =>
              prev.map((item) =>
                item.id === feedbackId
                  ? {
                      ...item,
                      replyCount: Math.max(0, item.replyCount - 1),
                      replies: item.replies.filter((r) => r.id !== reply.id),
                    }
                  : item
              )
            );
          } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to delete reply");
          }
        },
      },
    ]);
  };

  const formatReplyDate = (iso: string) => {
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

  const handleToggleKnownIssue = async (id: string, currentlyKnown: boolean) => {
    const newIsKnown = !currentlyKnown;
    try {
      await updateKnownIssue(id, newIsKnown, newIsKnown ? "investigating" : null);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, isKnownIssue: newIsKnown, knownIssueStatus: newIsKnown ? "investigating" : null }
            : item
        )
      );
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update");
    }
  };

  const handleKnownIssueStatus = async (id: string, status: KnownIssueStatus) => {
    try {
      await updateKnownIssue(id, true, status);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, isKnownIssue: true, knownIssueStatus: status }
            : item
        )
      );
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update");
    }
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
    ...FEEDBACK_STATUSES.map((st) => ({
      key: st.value as StatusFilter,
      label: `${st.label} (${stats[st.value] || 0})`,
    })),
  ];

  const renderItem = ({ item }: { item: FeedbackWithVoted }) => {
    const expanded = expandedId === item.id;
    const catColor = CATEGORY_COLORS[item.category] ?? TEXT_3;
    const statusMeta = FEEDBACK_STATUSES.find((st) => st.value === item.status);

    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => {
          setExpandedId(expanded ? null : item.id);
          if (!expanded) setReplyText("");
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.upvoteCount} votes. Tap to ${expanded ? "collapse" : "expand"}`}
      >
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
            {item.isKnownIssue && (
              <View style={[s.pill, { backgroundColor: "#ef4444" + "20" }]}>
                <Text style={[s.pillText, { color: "#ef4444" }]}>Known Issue</Text>
              </View>
            )}
          </View>
          <View style={s.chipRow}>
            {item.replyCount > 0 && (
              <View style={s.replyChip}>
                <Ionicons name="chatbubble" size={10} color="#10b981" />
                <Text style={s.replyChipText}>{item.replyCount}</Text>
              </View>
            )}
            <View style={s.voteChip}>
              <Ionicons name="arrow-up" size={12} color={AMBER} />
              <Text style={s.voteChipText}>{item.upvoteCount}</Text>
            </View>
          </View>
        </View>

        <Text style={s.cardTitle} numberOfLines={expanded ? undefined : 1}>{item.title}</Text>

        <View style={s.cardMeta}>
          <Text style={s.metaText}>{item.displayName || "Anonymous"}</Text>
          <View style={s.dot} />
          <Text style={s.metaText}>{formatDate(item.createdAt)}</Text>
        </View>

        {expanded && (
          <View style={s.expandedSection}>
            <Text style={s.bodyText}>{item.body}</Text>

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
                    accessibilityRole="button"
                    accessibilityLabel={`Set status to ${st.label}`}
                    accessibilityState={{ selected: active, disabled: updatingId === item.id }}
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

            {/* Known Issue toggle */}
            <Text style={s.sectionLabel}>Known Issue</Text>
            <View style={s.knownIssueRow}>
              <TouchableOpacity
                style={[s.kiToggle, item.isKnownIssue && s.kiToggleActive]}
                onPress={() => handleToggleKnownIssue(item.id, item.isKnownIssue)}
                activeOpacity={0.7}
                accessibilityRole="switch"
                accessibilityState={{ checked: item.isKnownIssue }}
                accessibilityLabel="Mark as known issue"
              >
                <Ionicons name={item.isKnownIssue ? "bug" : "bug-outline"} size={14} color={item.isKnownIssue ? "#ef4444" : TEXT_2} />
                <Text style={[s.kiToggleText, item.isKnownIssue && { color: "#ef4444" }]}>
                  {item.isKnownIssue ? "Known Issue" : "Not flagged"}
                </Text>
              </TouchableOpacity>
              {item.isKnownIssue && (
                <View style={s.kiStatusRow}>
                  {KNOWN_ISSUE_STATUSES.map((st) => {
                    const active = item.knownIssueStatus === st.value;
                    return (
                      <TouchableOpacity
                        key={st.value}
                        style={[
                          s.statusPill,
                          { borderColor: active ? st.color : "rgba(255,255,255,0.08)" },
                          active && { backgroundColor: st.color + "20" },
                        ]}
                        onPress={() => handleKnownIssueStatus(item.id, st.value as KnownIssueStatus)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Set known issue status to ${st.label}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Ionicons name={st.icon as any} size={11} color={active ? st.color : TEXT_2} />
                        <Text style={[s.statusPillText, { color: active ? st.color : TEXT_2 }]}>{st.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Replies */}
            {item.replies && item.replies.length > 0 && (
              <View style={s.repliesSection}>
                <Text style={s.sectionLabel}>Replies</Text>
                {item.replies.map((r) => (
                  <View key={r.id} style={s.replyCard}>
                    <View style={s.replyHeader}>
                      <View style={s.replyAdminBadge}>
                        <Ionicons name="shield-checkmark" size={10} color={AMBER} />
                        <Text style={s.replyAdminName}>{r.adminName}</Text>
                      </View>
                      <Text style={s.replyDate}>{formatReplyDate(r.createdAt)}</Text>
                    </View>
                    <Text style={s.replyBody}>{r.body}</Text>
                    <TouchableOpacity
                      style={s.replyDeleteBtn}
                      onPress={() => handleDeleteReply(item.id, r)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Delete reply"
                    >
                      <Ionicons name="close-circle-outline" size={14} color={TEXT_3} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Reply input */}
            <View style={s.replyInputRow}>
              <TextInput
                style={s.replyInput}
                placeholder="Write a reply..."
                placeholderTextColor={TEXT_3}
                value={expandedId === item.id ? replyText : ""}
                onChangeText={setReplyText}
                multiline
                maxLength={2000}
                accessibilityLabel="Reply text"
              />
              <TouchableOpacity
                style={[s.replySendBtn, (!replyText.trim() || sendingReply) && s.replySendBtnDisabled]}
                onPress={() => handleSendReply(item.id)}
                disabled={!replyText.trim() || sendingReply}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Send reply"
              >
                {sendingReply ? (
                  <ActivityIndicator size={16} color="#030712" />
                ) : (
                  <Ionicons name="send" size={16} color="#030712" />
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={s.deleteButton}
              onPress={() => handleDelete(item.id, item.title)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Delete feedback: ${item.title}`}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={s.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const statsRow = FEEDBACK_STATUSES.map((st) => ({
    label: st.label,
    count: stats[st.value] || 0,
    color: st.color,
  }));

  return (
    <View style={s.container}>
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading feedback" />
        </View>
      ) : error ? (
        <View style={s.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={TEXT_3} />
          <Text style={s.emptyText}>Could not load feedback</Text>
          <Text style={[s.emptyText, { fontSize: 12 }]}>Pull down to try again</Text>
        </View>
      ) : (
        <>
          <View style={s.statsRow}>
            {statsRow.map((st) => (
              <View key={st.label} style={s.statBox}>
                <Text style={[s.statCount, { color: st.color }]}>{st.count}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>

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
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${opt.label}`}
                accessibilityState={{ selected: statusFilter === opt.key }}
              >
                <Text style={[s.filterChipText, statusFilter === opt.key && s.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )}
          />

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
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
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
    fontSize: 11,
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
  knownIssueRow: {
    marginBottom: 14,
  },
  kiToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  kiToggleActive: {
    borderColor: "rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  kiToggleText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  kiStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  replyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#10b981" + "15",
  },
  replyChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#10b981",
  },
  repliesSection: {
    marginBottom: 14,
  },
  replyCard: {
    backgroundColor: "rgba(245,166,35,0.06)",
    borderLeftWidth: 2,
    borderLeftColor: AMBER,
    borderRadius: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    padding: 10,
    marginBottom: 6,
    position: "relative" as const,
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },
  replyDate: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  replyBody: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 18,
    paddingRight: 20,
  },
  replyDeleteBtn: {
    position: "absolute" as const,
    bottom: 8,
    right: 8,
  },
  replyInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 14,
  },
  replyInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
    maxHeight: 80,
  },
  replySendBtn: {
    backgroundColor: AMBER,
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  replySendBtnDisabled: {
    opacity: 0.4,
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
