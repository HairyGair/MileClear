import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../lib/auth/context";
import { useUser } from "../../lib/user/context";
import { fetchVehicles } from "../../lib/api/vehicles";
import { fetchProfile, updateProfile, deleteAccount } from "../../lib/api/user";
import {
  fetchBillingStatus,
  cancelSubscription,
  validateApplePurchase,
} from "../../lib/api/billing";
import type { Vehicle, User, BillingStatus } from "@mileclear/shared";
import { formatPence, calculateHmrcDeduction } from "@mileclear/shared";
import { fetchGamificationStats } from "../../lib/api/gamification";
import {
  isIapAvailable,
  getSubscriptionProduct,
  restorePurchases,
} from "../../lib/iap/index";
import { AvatarPicker } from "../../components/avatars/AvatarPicker";
import { useLayoutPrefs, resetAllLayouts } from "../../lib/layout/index";
import { usePaywall } from "../../components/paywall";
import { colors, fonts, radii, spacing } from "../../lib/theme";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car: "Car",
  motorbike: "Motorbike",
  van: "Van",
};

const FUEL_TYPE_LABELS: Record<string, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  electric: "Electric",
  hybrid: "Hybrid",
};

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/**
 * Profile tab - slimmed in build 62. Identity, vehicles, subscription,
 * single doorway into the settings hub, and account-level actions.
 * Everything else (notifications, work + tax, tracking, exports, help,
 * legal, visibility) lives under /settings/* now.
 */
export default function ProfileScreen() {
  const { logout } = useAuth();
  const { refreshUser } = useUser();
  const { showPaywall } = usePaywall();
  const router = useRouter();
  const profileLayout = useLayoutPrefs("profile");

  const [user, setUser] = useState<User | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [iapPrice, setIapPrice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Account deletion (Android needs an inline modal because Alert.prompt is iOS-only)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [profileRes, vehiclesRes, billingRes] = await Promise.all([
        fetchProfile(),
        fetchVehicles(),
        fetchBillingStatus().catch(() => null),
      ]);
      setUser(profileRes.data);
      setVehicles(vehiclesRes.data);
      if (billingRes) setBilling(billingRes.data);

      if (isIapAvailable()) {
        getSubscriptionProduct()
          .then((product) => { if (product) setIapPrice(product.localizedPrice); })
          .catch(() => {});
      }
    } catch {
      // Silently fail; refreshControl + focus effect will retry.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ── Avatar (inline picker on the hero card) ──────────────────────
  const handleAvatarSelect = useCallback(async (avatarId: string | null) => {
    try {
      const res = await updateProfile({ avatarId });
      setUser(res.data);
      refreshUser();
    } catch {
      Alert.alert("Couldn't update your avatar", "Try again in a moment.");
    }
  }, [refreshUser]);

  // ── Subscription actions ─────────────────────────────────────────
  const handleRestorePurchases = useCallback(async () => {
    setRestoring(true);
    try {
      const transactionIds = await restorePurchases();
      if (transactionIds.length === 0) {
        Alert.alert("Nothing to restore", "No previous subscription was found for this Apple ID.");
        return;
      }
      for (const txId of transactionIds) {
        await validateApplePurchase(txId);
      }
      loadData();
      Alert.alert("Subscription restored", "Pro is back on this device.");
    } catch (err: unknown) {
      Alert.alert(
        "Couldn't restore purchases",
        err instanceof Error ? err.message : "Try again in a moment."
      );
    } finally {
      setRestoring(false);
    }
  }, [loadData]);

  const handleCancelSubscription = useCallback(async () => {
    let message = "You'll keep Pro features until the end of your billing period. Are you sure?";
    try {
      const res = await fetchGamificationStats();
      const s = res.data;
      if (s.totalTrips > 0) {
        const deduction = calculateHmrcDeduction("car", s.businessMiles);
        message = `You've tracked ${s.totalTrips} trips and ${s.totalMiles.toFixed(0)} miles worth ${formatPence(deduction)} in HMRC deductions.\n\nYou'll keep Pro features until the end of your billing period. Are you sure?`;
      }
    } catch {}
    Alert.alert("Cancel Subscription", message, [
      { text: "Keep Pro", style: "cancel" },
      {
        text: "Cancel Subscription",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelSubscription();
            loadData();
          } catch (err: unknown) {
            Alert.alert(
              "Error",
              err instanceof Error ? err.message : "Could not cancel subscription"
            );
          }
        },
      },
    ]);
  }, [loadData]);

  // ── Account actions ──────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logout() },
    ]);
  }, [logout]);

  const handleDeleteAccount = useCallback(async () => {
    let message = "This is permanent and cannot be undone. Enter your password to confirm.";
    try {
      const res = await fetchGamificationStats();
      const s = res.data;
      if (s.totalTrips > 0) {
        message = `You've tracked ${s.totalTrips} trips and ${s.totalMiles.toFixed(0)} miles. This is permanent and cannot be undone. Enter your password to confirm.`;
      }
    } catch {}
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Delete Account",
        message,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async (password: string | undefined) => {
              if (!password) return;
              setDeletingAccount(true);
              try {
                await deleteAccount(password);
                await logout();
              } catch (err: unknown) {
                Alert.alert(
                  "Couldn't delete your account",
                  err instanceof Error ? err.message : "Try again in a moment."
                );
                setDeletingAccount(false);
              }
            },
          },
        ],
        "secure-text"
      );
    } else {
      setDeletePassword("");
      setShowDeleteModal(true);
    }
  }, [logout]);

  const confirmDeleteAndroid = useCallback(async () => {
    if (!deletePassword) return;
    setDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      setShowDeleteModal(false);
      await logout();
    } catch (err: unknown) {
      Alert.alert(
        "Couldn't delete your account",
        err instanceof Error ? err.message : "Try again in a moment."
      );
      setDeletingAccount(false);
    }
  }, [deletePassword, logout]);

  const handleResetLayout = useCallback(() => {
    Alert.alert(
      "Reset all layouts?",
      "This restores the default order and visibility for the dashboard, profile, and avatar menu. Your data is unaffected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetAllLayouts();
            profileLayout.reset();
            Alert.alert("Done", "All layouts have been reset to default.");
          },
        },
      ]
    );
  }, [profileLayout]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.amber}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile Card ── */}
        {user && (
          <View style={styles.profileCard}>
            <AvatarPicker
              currentAvatarId={user.avatarId}
              onSelect={handleAvatarSelect}
            />
            <View style={styles.profileInfoCentered}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName} numberOfLines={1}>
                  {user.displayName || "Driver"}
                </Text>
                {user.isPremium && <Text style={styles.proBadge}>PRO</Text>}
              </View>
              <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
              <Text style={styles.memberSince}>
                Member since {formatDate(user.createdAt)}
              </Text>
            </View>
          </View>
        )}

        {/* ── MY VEHICLES ── */}
        <View style={styles.group}>
          <Text style={styles.groupLabel} accessibilityRole="header">MY VEHICLES</Text>
          <View style={styles.groupCard}>
            {vehicles.length === 0 && !loading ? (
              <View style={styles.emptyVehicles}>
                <Ionicons name="car-outline" size={28} color={colors.text3} />
                <Text style={styles.emptyText}>No vehicles yet</Text>
              </View>
            ) : (
              vehicles.map((v, idx) => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.vehicleItem,
                    idx < vehicles.length - 1 && styles.itemBorder,
                  ]}
                  onPress={() => router.push(`/vehicle-form?id=${v.id}`)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`${v.make} ${v.model}${v.isPrimary ? ", primary vehicle" : ""}, ${VEHICLE_TYPE_LABELS[v.vehicleType] ?? v.vehicleType}, ${FUEL_TYPE_LABELS[v.fuelType] ?? v.fuelType}${v.year ? `, ${v.year}` : ""}. Tap to edit.`}
                >
                  <View style={styles.iconCircle}>
                    <Ionicons name="car-outline" size={18} color={colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.vehicleHeader}>
                      <Text style={styles.itemLabel}>
                        {v.make} {v.model}
                      </Text>
                      {v.isPrimary && (
                        <View style={styles.primaryBadge}>
                          <Text style={styles.primaryBadgeText}>Primary</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.vehicleMeta}>
                      <Text style={styles.metaChip}>{VEHICLE_TYPE_LABELS[v.vehicleType]}</Text>
                      <Text style={styles.metaText}>{FUEL_TYPE_LABELS[v.fuelType]}</Text>
                      {v.year && <Text style={styles.metaText}>{v.year}</Text>}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              style={[styles.addVehicleRow, vehicles.length > 0 && styles.itemBorder]}
              onPress={() => router.push("/vehicle-form")}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Add vehicle"
            >
              <View style={[styles.iconCircle, { backgroundColor: "rgba(16, 185, 129, 0.1)" }]}>
                <Ionicons name="add" size={18} color={colors.green} />
              </View>
              <Text style={[styles.itemLabel, { color: colors.green }]}>Add Vehicle</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SUBSCRIPTION ── */}
        <View style={styles.group}>
          <Text style={styles.groupLabel} accessibilityRole="header">SUBSCRIPTION</Text>
          {!user?.isPremium ? (
            <>
              <TouchableOpacity
                style={styles.upgradeCard}
                onPress={() => showPaywall("profile")}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Upgrade to MileClear Pro${iapPrice ? `, ${iapPrice} per month` : ""}`}
                accessibilityHint="Opens the upgrade checkout"
              >
                <View style={styles.upgradeHeader}>
                  <Ionicons name="diamond-outline" size={22} color={colors.amber} />
                  <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
                </View>
                <Text style={styles.upgradePrice}>{iapPrice ? `${iapPrice}/mo` : "Pro"}</Text>
                <View style={styles.featureList}>
                  <View style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                    <Text style={styles.featureText}>HMRC tax exports (PDF, CSV)</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                    <Text style={styles.featureText}>Open Banking auto-import</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                    <Text style={styles.featureText}>Advanced analytics & insights</Text>
                  </View>
                </View>
                <View style={styles.upgradeButton}>
                  <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
                </View>
              </TouchableOpacity>
              {isIapAvailable() && (
                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={handleRestorePurchases}
                  disabled={restoring}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={restoring ? "Restoring purchases" : "Restore previous purchases"}
                  accessibilityState={{ disabled: restoring, busy: restoring }}
                >
                  <Text style={styles.restoreButtonText}>
                    {restoring ? "Restoring..." : "Restore Purchases"}
                  </Text>
                </TouchableOpacity>
              )}
              <Text style={styles.subLegalText}>
                MileClear Pro auto-renews monthly. Cancel anytime in Settings.
              </Text>
              <View style={styles.subLegalLinks}>
                <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/terms")}>
                  <Text style={styles.subLegalLink}>Terms of Use</Text>
                </TouchableOpacity>
                <Text style={styles.subLegalSep}>|</Text>
                <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync("https://mileclear.com/privacy")}>
                  <Text style={styles.subLegalLink}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.groupCard}>
              <View style={styles.subCard}>
                <View style={styles.subHeader}>
                  <Text style={styles.subTitle}>MileClear Pro</Text>
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                </View>
                {billing?.subscriptionPlatform === "apple" ? (
                  <>
                    <Text style={styles.subDetail}>Managed by App Store</Text>
                    <TouchableOpacity
                      onPress={() => WebBrowser.openBrowserAsync("https://apps.apple.com/account/subscriptions")}
                      accessibilityRole="link"
                      accessibilityLabel="Manage subscription in App Store"
                    >
                      <Text style={[styles.subLink, { color: "#3b82f6" }]}>
                        Manage in App Store
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : billing?.cancelAtPeriodEnd ? (
                  <Text style={styles.subDetail}>
                    Cancels on{" "}
                    {billing.currentPeriodEnd
                      ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "end of period"}
                  </Text>
                ) : (
                  <>
                    <Text style={styles.subDetail}>
                      Renews{" "}
                      {billing?.currentPeriodEnd
                        ? new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "-"}
                    </Text>
                    <TouchableOpacity
                      onPress={handleCancelSubscription}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel subscription"
                    >
                      <Text style={styles.subLink}>Cancel subscription</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── Settings doorway ── */}
        <View style={styles.group}>
          <View style={styles.groupCard}>
            <TouchableOpacity
              style={styles.settingsDoor}
              onPress={() => router.push("/settings" as never)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              accessibilityHint="Open the settings hub"
            >
              <View style={styles.iconCircle}>
                <Ionicons name="settings-outline" size={18} color={colors.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>Settings</Text>
                <Text style={styles.itemHint}>
                  Notifications, work & tax, tracking, exports, and more
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text3} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── ACCOUNT ── */}
        <View style={styles.group}>
          <Text style={styles.groupLabel} accessibilityRole="header">ACCOUNT</Text>
          <View style={styles.groupCard}>
            <TouchableOpacity
              style={[styles.accountItem, styles.itemBorder]}
              onPress={handleResetLayout}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Reset Layout"
              accessibilityHint="Restores the default layout for all screens"
            >
              <View style={styles.iconCircle}>
                <Ionicons name="refresh-outline" size={18} color={colors.text2} />
              </View>
              <Text style={styles.itemLabel}>Reset Layout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.accountItem, styles.itemBorder]}
              onPress={handleLogout}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <View style={[styles.iconCircle, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}>
                <Ionicons name="log-out-outline" size={18} color={colors.red} accessible={false} />
              </View>
              <Text style={[styles.itemLabel, { color: colors.red }]}>Log out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.accountItem}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={deletingAccount ? "Deleting account" : "Delete Account"}
              accessibilityHint="Permanently deletes your account. This cannot be undone."
              accessibilityState={{ disabled: deletingAccount, busy: deletingAccount }}
            >
              <View style={[styles.iconCircle, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}>
                <Ionicons name="trash-outline" size={18} color={colors.red} />
              </View>
              <Text style={[styles.itemLabel, { color: colors.red }]}>
                {deletingAccount ? "Deleting..." : "Delete Account"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Android delete confirmation modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} accessibilityViewIsModal={true}>
            <Text style={styles.modalTitle} accessibilityRole="header">Delete Account</Text>
            <Text style={styles.modalMessage}>
              This is permanent and cannot be undone. Enter your password to confirm.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={deletePassword}
              accessibilityLabel="Password"
              onChangeText={setDeletePassword}
              placeholder="Password"
              placeholderTextColor={colors.text3}
              secureTextEntry
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowDeleteModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDelete, !deletePassword && styles.buttonDisabled]}
                onPress={confirmDeleteAndroid}
                disabled={!deletePassword || deletingAccount}
                accessibilityRole="button"
                accessibilityLabel={deletingAccount ? "Deleting account" : "Confirm delete account"}
                accessibilityState={{ disabled: !deletePassword || deletingAccount, busy: deletingAccount }}
              >
                <Text style={styles.modalDeleteText}>
                  {deletingAccount ? "Deleting..." : "Delete"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
  },

  // Profile card
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  profileInfoCentered: {
    alignItems: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  displayName: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.text1,
    flexShrink: 1,
  },
  proBadge: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.bg,
    backgroundColor: colors.amber,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  email: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
  memberSince: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: 2,
  },

  // Groups
  group: {
    marginTop: spacing.lg,
  },
  groupLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.text3,
    letterSpacing: 1,
    marginBottom: 6,
    marginLeft: 4,
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },

  // Generic row
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
  },
  itemLabel: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text1,
  },
  itemHint: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.text3,
    marginTop: 2,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },

  // Vehicles
  vehicleItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: spacing.md,
  },
  vehicleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  vehicleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  metaChip: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.amber,
    backgroundColor: colors.amberDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  metaText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.text3,
  },
  primaryBadge: {
    backgroundColor: colors.greenDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.green,
  },
  emptyVehicles: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text3,
  },
  addVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: spacing.md,
  },

  // Subscription - free user upgrade card
  upgradeCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.amberDim,
  },
  upgradeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  upgradeTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text1,
  },
  upgradePrice: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.amber,
    marginBottom: 12,
  },
  featureList: {
    gap: 8,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    flex: 1,
  },
  upgradeButton: {
    backgroundColor: colors.amber,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  upgradeButtonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.bg,
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  restoreButtonText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.amber,
  },
  subLegalText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.text3,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  subLegalLinks: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  subLegalLink: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  subLegalSep: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.text3,
  },

  // Subscription - active Pro card
  subCard: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  subTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text1,
  },
  activeBadge: {
    backgroundColor: colors.greenDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  activeBadgeText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.green,
  },
  subDetail: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginTop: 2,
  },
  subLink: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.red,
    marginTop: 8,
  },

  // Settings doorway
  settingsDoor: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: spacing.md,
  },

  // Account
  accountItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: spacing.md,
  },

  // Delete-account modal (Android)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text1,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text1,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radii.md,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text2,
  },
  modalDelete: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: colors.red,
    borderRadius: radii.md,
    alignItems: "center",
  },
  modalDeleteText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
