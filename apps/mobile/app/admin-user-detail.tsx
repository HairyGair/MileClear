import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { fetchAdminUserDetail, toggleUserPremium, deleteAdminUser } from "../lib/api/admin";
import { formatPence } from "@mileclear/shared";
import type { AdminUserDetail } from "@mileclear/shared";

export default function AdminUserDetailScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetchAdminUserDetail(userId);
      setUser(res.data);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleTogglePremium = useCallback(async () => {
    if (!user) return;
    setToggling(true);
    try {
      await toggleUserPremium(user.id, !user.isPremium);
      await loadData();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update premium status");
    } finally {
      setToggling(false);
    }
  }, [user, loadData]);

  const handleDelete = useCallback(() => {
    if (!user) return;
    Alert.alert(
      "Delete User",
      `Are you sure you want to delete ${user.email}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAdminUser(user.id);
              router.back();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to delete user");
            }
          },
        },
      ]
    );
  }, [user, router]);

  if (loading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={AMBER} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={s.emptyText}>User not found</Text>
      </View>
    );
  }

  const dateStr = new Date(user.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hasApple = !!user.appleId;
  const hasGoogle = !!user.googleId;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />
      }
    >
      {/* Profile Card */}
      <View style={s.card}>
        <View style={s.profileRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {(user.displayName || user.email)[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{user.displayName || "No name"}</Text>
            <Text style={s.profileEmail}>{user.email}</Text>
            <View style={s.authIcons}>
              {hasApple && <Ionicons name="logo-apple" size={14} color={TEXT_2} />}
              {hasGoogle && <Ionicons name="logo-google" size={14} color={TEXT_2} />}
              {user.emailVerified && <Ionicons name="checkmark-circle" size={14} color="#34c759" />}
            </View>
          </View>
          <View style={s.badgeCol}>
            {user.isAdmin && (
              <View style={s.adminBadge}>
                <Text style={s.adminBadgeText}>ADMIN</Text>
              </View>
            )}
            {user.isPremium && (
              <View style={s.proBadge}>
                <Text style={s.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={s.joinDate}>Joined {dateStr}</Text>
      </View>

      {/* Subscription Card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Subscription</Text>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Premium</Text>
          <Text style={[s.detailValue, { color: user.isPremium ? "#34c759" : TEXT_3 }]}>
            {user.isPremium ? "Active" : "Inactive"}
          </Text>
        </View>
        {user.premiumExpiresAt && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Expires</Text>
            <Text style={s.detailValue}>
              {new Date(user.premiumExpiresAt).toLocaleDateString("en-GB")}
            </Text>
          </View>
        )}
        {user.stripeCustomerId && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Stripe Customer</Text>
            <Text style={s.detailValueMono} numberOfLines={1}>{user.stripeCustomerId}</Text>
          </View>
        )}
        {user.stripeSubscriptionId && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Stripe Sub</Text>
            <Text style={s.detailValueMono} numberOfLines={1}>{user.stripeSubscriptionId}</Text>
          </View>
        )}
      </View>

      {/* Stats Row */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statNum}>{user.totalMiles.toFixed(1)}</Text>
          <Text style={s.statUnit}>miles</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>{user._count.trips}</Text>
          <Text style={s.statUnit}>trips</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>{formatPence(user.totalEarningsPence)}</Text>
          <Text style={s.statUnit}>earnings</Text>
        </View>
      </View>

      {/* Vehicles */}
      {user.vehicles.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Vehicles ({user.vehicles.length})</Text>
          {user.vehicles.map((v) => (
            <View key={v.id} style={s.listCard}>
              <Text style={s.listPrimary}>{v.make} {v.model}</Text>
              <Text style={s.listSecondary}>{v.vehicleType} - {v.fuelType}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent Trips */}
      {user.trips.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent Trips ({user._count.trips} total)</Text>
          {user.trips.map((t) => (
            <View key={t.id} style={s.listCard}>
              <View style={s.tripRow}>
                <Text style={s.listPrimary}>
                  {t.distanceMiles.toFixed(1)} mi
                </Text>
                <View style={s.tripBadge}>
                  <Text style={s.tripBadgeText}>{t.classification}</Text>
                </View>
              </View>
              <View style={s.tripRow}>
                <Text style={s.listSecondary}>
                  {new Date(t.startedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
                {t.platformTag && <Text style={s.listSecondary}>{t.platformTag}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={s.actions}>
        <TouchableOpacity
          style={[s.actionBtn, user.isPremium ? s.actionBtnDestructive : s.actionBtnPrimary]}
          onPress={handleTogglePremium}
          activeOpacity={0.7}
          disabled={toggling}
        >
          {toggling ? (
            <ActivityIndicator size="small" color={user.isPremium ? "#ef4444" : AMBER} />
          ) : (
            <>
              <Ionicons
                name={user.isPremium ? "star-outline" : "star"}
                size={18}
                color={user.isPremium ? "#ef4444" : AMBER}
              />
              <Text style={[s.actionBtnText, user.isPremium ? s.actionTextDestructive : s.actionTextPrimary]}>
                {user.isPremium ? "Revoke Premium" : "Grant Premium"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actionBtn, s.actionBtnGhost]}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={[s.actionBtnText, s.actionTextDestructive]}>Delete User</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
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
  centered: { justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  emptyText: { fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", color: TEXT_3 },

  // Cards
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Profile
  profileRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AMBER,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  profileName: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
  },
  authIcons: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  badgeCol: { gap: 4, alignItems: "flex-end" },
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
  joinDate: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 10,
  },

  // Detail rows
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
  },
  detailValueMono: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    maxWidth: 160,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  statNum: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    letterSpacing: -0.5,
  },
  statUnit: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
  },

  // Sections
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 8,
  },
  listCard: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  listPrimary: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
  },
  listSecondary: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 2,
  },
  tripRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripBadge: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tripBadgeText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },

  // Actions
  actions: {
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnPrimary: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
  },
  actionBtnDestructive: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  actionBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.15)",
  },
  actionBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  actionTextPrimary: { color: AMBER },
  actionTextDestructive: { color: "#ef4444" },
});
