import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchAdminUsers } from "../lib/api/admin";
import type { AdminUserSummary } from "@mileclear/shared";

const PAGE_SIZE = 20;

type SortBy = "createdAt" | "lastTripAt" | "lastLoginAt";

const SORT_OPTIONS: Array<{ v: SortBy; label: string }> = [
  { v: "createdAt", label: "Newest" },
  { v: "lastTripAt", label: "Last trip" },
  { v: "lastLoginAt", label: "Last login" },
];

function timeAgo(date: string | null | undefined): string {
  if (!date) return "—";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUsers = useCallback(async (searchQuery: string, pageNum: number, append: boolean, sort: SortBy) => {
    try {
      const res = await fetchAdminUsers({ q: searchQuery || undefined, page: pageNum, pageSize: PAGE_SIZE, sortBy: sort });
      if (append) {
        setUsers((prev) => [...prev, ...res.data]);
      } else {
        setUsers(res.data);
      }
      setTotalPages(res.totalPages);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadUsers(query, 1, false, sortBy);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, sortBy, loadUsers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    loadUsers(query, 1, false, sortBy);
  }, [query, sortBy, loadUsers]);

  const onEndReached = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    loadUsers(query, nextPage, true, sortBy);
  }, [loadingMore, page, totalPages, query, sortBy, loadUsers]);

  const renderUser = useCallback(({ item }: { item: AdminUserSummary }) => {
    const dateStr = new Date(item.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return (
      <TouchableOpacity
        style={s.userCard}
        onPress={() => router.push(`/admin-user-detail?userId=${item.id}`)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`User: ${item.displayName || item.email}${item.isPremium ? ", Pro" : ""}${item.isAdmin ? ", Admin" : ""}`}
      >
        <View style={s.userTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.userEmail} numberOfLines={1}>{item.email}</Text>
            {item.displayName && (
              <Text style={s.userName} numberOfLines={1}>{item.displayName}</Text>
            )}
          </View>
          <View style={s.badgeRow}>
            {item.diagnosticDump && item.diagnosticDump.verdict !== "healthy" && (
              <View
                style={[
                  s.diagDot,
                  {
                    backgroundColor:
                      item.diagnosticDump.verdict === "error"
                        ? "#ef4444"
                        : item.diagnosticDump.verdict === "warning"
                          ? AMBER
                          : "#3b82f6",
                  },
                ]}
                accessibilityLabel={`Drive detection ${item.diagnosticDump.verdict}`}
              />
            )}
            {item.isAdmin && (
              <View style={s.adminBadge}>
                <Text style={s.adminBadgeText}>ADMIN</Text>
              </View>
            )}
            {item.isPremium && (
              <View style={s.proBadge}>
                <Text style={s.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
        </View>
        <View style={s.userBottom}>
          <Text style={s.userMeta}>Joined {dateStr}</Text>
          <Text style={s.userMeta}>{item._count.trips} trips</Text>
        </View>
        <View style={s.userBottom}>
          <Text style={s.userMeta}>Last trip: {timeAgo(item.lastTripAt)}</Text>
          <Text style={s.userMeta}>Login: {timeAgo(item.lastLoginAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  return (
    <View style={s.container}>
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={18} color={TEXT_3} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by email or name..."
          placeholderTextColor={TEXT_3}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search users by email or name"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={TEXT_3} />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.sortRow}>
        {SORT_OPTIONS.map((opt) => {
          const active = sortBy === opt.v;
          return (
            <TouchableOpacity
              key={opt.v}
              onPress={() => setSortBy(opt.v)}
              style={[s.sortChip, active && s.sortChipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Sort by ${opt.label}`}
            >
              <Text style={[s.sortChipText, active && s.sortChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Loading users" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={AMBER} style={{ padding: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyText}>No users found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 10,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
  },
  sortRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  sortChipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  sortChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  sortChipTextActive: {
    color: "#030712",
    fontFamily: "PlusJakartaSans_700Bold",
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  userCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  userTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  userEmail: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  userName: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  diagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 2,
  },
  proBadge: {
    backgroundColor: AMBER,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  proBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    letterSpacing: 0.3,
  },
  adminBadge: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  adminBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    letterSpacing: 0.3,
  },
  userBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  userMeta: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 40,
  },
});
