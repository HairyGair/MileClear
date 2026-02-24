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

export default function AdminUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUsers = useCallback(async (searchQuery: string, pageNum: number, append: boolean) => {
    try {
      const res = await fetchAdminUsers({ q: searchQuery || undefined, page: pageNum, pageSize: PAGE_SIZE });
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
      loadUsers(query, 1, false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, loadUsers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    loadUsers(query, 1, false);
  }, [query, loadUsers]);

  const onEndReached = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setLoadingMore(true);
    loadUsers(query, nextPage, true);
  }, [loadingMore, page, totalPages, query, loadUsers]);

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
      >
        <View style={s.userTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.userEmail} numberOfLines={1}>{item.email}</Text>
            {item.displayName && (
              <Text style={s.userName} numberOfLines={1}>{item.displayName}</Text>
            )}
          </View>
          <View style={s.badgeRow}>
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
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={TEXT_3} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={AMBER} />
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
const TEXT_3 = "#4a5568";
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
    gap: 4,
  },
  proBadge: {
    backgroundColor: AMBER,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  proBadgeText: {
    fontSize: 9,
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
    fontSize: 9,
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
