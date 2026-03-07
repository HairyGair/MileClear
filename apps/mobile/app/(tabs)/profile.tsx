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
  Share,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../lib/auth/context";
import { useUser } from "../../lib/user/context";
import { fetchVehicles } from "../../lib/api/vehicles";
import { fetchProfile, updateProfile, exportUserData, deleteAccount } from "../../lib/api/user";
import {
  fetchBillingStatus,
  createCheckoutSession,
  cancelSubscription,
  validateApplePurchase,
} from "../../lib/api/billing";
import type { Vehicle, User, BillingStatus, WorkType } from "@mileclear/shared";
import { WORK_TYPES } from "@mileclear/shared";
import {
  isIapAvailable,
  purchaseSubscription,
  getSubscriptionProduct,
  restorePurchases,
} from "../../lib/iap/index";
import {
  isDriveDetectionEnabled,
  setDriveDetectionEnabled,
} from "../../lib/tracking/detection";
import { getDatabase } from "../../lib/db/index";
import {
  getNotificationPreferences,
  setNotificationPreferences,
  type NotificationPreferences,
} from "../../lib/notifications/preferences";
import { cacheVehicleBluetoothNames } from "../../lib/bluetooth/index";
import { AvatarPicker } from "../../components/avatars/AvatarPicker";
import { useLayoutPrefs, resetAllLayouts } from "../../lib/layout/index";
import { PremiumTeaser } from "../../components/PremiumGate";

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#4a5568";
const CARD_BG = "#0c1425";
const BG = "#030712";

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

export default function ProfileScreen() {
  const { logout } = useAuth();
  const { refreshUser } = useUser();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [iapPrice, setIapPrice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [driveDetection, setDriveDetection] = useState(true);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    weeklySummary: true,
    unclassifiedNudge: true,
    shiftReminder: true,
    streakReminder: true,
    taxDeadline: true,
    milestoneAlerts: true,
    shiftSummary: true,
    monthlyRecap: true,
  });
  const [weeklyGoal, setWeeklyGoal] = useState<number | null>(null);
  const [workType, setWorkType] = useState<WorkType>("gig");
  const [employerRate, setEmployerRate] = useState<number | null>(null);
  const profileLayout = useLayoutPrefs("profile");

  const handleAvatarSelect = useCallback(async (avatarId: string | null) => {
    try {
      const res = await updateProfile({ avatarId });
      setUser(res.data);
      refreshUser();
    } catch {
      Alert.alert("Error", "Failed to update avatar");
    }
  }, [refreshUser]);

  const loadData = useCallback(async () => {
    try {
      const [profileRes, vehiclesRes, billingRes, detectionEnabled, notifPrefsLoaded, goalRow] = await Promise.all([
        fetchProfile(),
        fetchVehicles(),
        fetchBillingStatus().catch(() => null),
        isDriveDetectionEnabled(),
        getNotificationPreferences(),
        getDatabase().then((db) =>
          db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = 'personal_goal_miles'")
        ).catch(() => null),
      ]);
      setUser(profileRes.data);
      if (profileRes.data.workType) setWorkType(profileRes.data.workType as WorkType);
      setEmployerRate(profileRes.data.employerMileageRatePence ?? null);
      setVehicles(vehiclesRes.data);
      cacheVehicleBluetoothNames(vehiclesRes.data).catch(() => {});
      if (billingRes) setBilling(billingRes.data);
      setDriveDetection(detectionEnabled);
      setNotifPrefs(notifPrefsLoaded);
      if (goalRow) {
        const parsed = parseFloat(goalRow.value);
        setWeeklyGoal(parsed > 0 && isFinite(parsed) ? parsed : null);
      } else {
        setWeeklyGoal(null);
      }

      if (isIapAvailable()) {
        getSubscriptionProduct()
          .then((product) => { if (product) setIapPrice(product.localizedPrice); })
          .catch(() => {});
      }
    } catch {
      // Silently fail
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

  const handleLogout = useCallback(() => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  }, [logout]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const data = await exportUserData();
      const json = JSON.stringify(data, null, 2);
      await Share.share({
        message: json,
        title: "MileClear Data Export",
      });
    } catch (err: unknown) {
      Alert.alert("Export failed", err instanceof Error ? err.message : "Could not export data");
    } finally {
      setExporting(false);
    }
  }, []);

  const handleUpgrade = useCallback(async () => {
    try {
      if (isIapAvailable()) {
        await purchaseSubscription();
      } else {
        const res = await createCheckoutSession();
        if (res.data.url) {
          const url = new URL(res.data.url);
          if (!url.hostname.endsWith("stripe.com")) {
            throw new Error("Invalid checkout URL");
          }
          await WebBrowser.openBrowserAsync(res.data.url);
          loadData();
        }
      }
    } catch (err: unknown) {
      Alert.alert(
        "Upgrade failed",
        err instanceof Error ? err.message : "Could not start checkout"
      );
    }
  }, [loadData]);

  const handleRestorePurchases = useCallback(async () => {
    setRestoring(true);
    try {
      const transactionIds = await restorePurchases();
      if (transactionIds.length === 0) {
        Alert.alert("No Purchases Found", "No previous subscriptions were found for this Apple ID.");
        return;
      }
      for (const txId of transactionIds) {
        await validateApplePurchase(txId);
      }
      loadData();
      Alert.alert("Restored", "Your subscription has been restored successfully.");
    } catch (err: unknown) {
      Alert.alert("Restore Failed", err instanceof Error ? err.message : "Could not restore purchases");
    } finally {
      setRestoring(false);
    }
  }, [loadData]);

  const handleCancelSubscription = useCallback(() => {
    Alert.alert(
      "Cancel Subscription",
      "You'll keep Pro features until the end of your billing period. Are you sure?",
      [
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
      ]
    );
  }, [loadData]);

  const handleDeleteAccount = useCallback(() => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Delete Account",
        "This is permanent and cannot be undone. Enter your password to confirm.",
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
                Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete account");
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
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete account");
      setDeletingAccount(false);
    }
  }, [deletePassword, logout]);

  const handleWorkTypeChange = useCallback(async (wt: WorkType) => {
    setWorkType(wt);
    try {
      await updateProfile({ workType: wt });
      refreshUser();
    } catch {
      Alert.alert("Error", "Failed to update work type");
    }
  }, [refreshUser]);

  const handleEmployerRateChange = useCallback(() => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Employer Mileage Rate",
        "Enter the pence per mile your employer reimburses (0 if none).\nHMRC allows you to claim the difference up to 45p.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: async (value: string | undefined) => {
              if (!value?.trim()) return;
              const parsed = parseInt(value.trim(), 10);
              if (isNaN(parsed) || parsed < 0 || parsed > 100) {
                Alert.alert("Invalid", "Enter a value between 0 and 100.");
                return;
              }
              setEmployerRate(parsed);
              try {
                await updateProfile({ employerMileageRatePence: parsed || null });
                refreshUser();
              } catch {
                Alert.alert("Error", "Failed to save rate");
              }
            },
          },
        ],
        "plain-text",
        employerRate ? String(employerRate) : "",
        "number-pad"
      );
    } else {
      Alert.alert(
        "Employer Mileage Rate",
        `Current: ${employerRate ? `${employerRate}p/mile` : "Not set"}\n\nYour employer reimburses you per mile. HMRC lets you claim the gap up to 45p.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "0p (none)", onPress: async () => { setEmployerRate(null); await updateProfile({ employerMileageRatePence: null }).catch(() => {}); refreshUser(); } },
          { text: "10p", onPress: async () => { setEmployerRate(10); await updateProfile({ employerMileageRatePence: 10 }).catch(() => {}); refreshUser(); } },
          { text: "25p", onPress: async () => { setEmployerRate(25); await updateProfile({ employerMileageRatePence: 25 }).catch(() => {}); refreshUser(); } },
        ]
      );
    }
  }, [employerRate, refreshUser]);

  const handleWeeklyGoal = useCallback(() => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Weekly Miles Goal",
        "Set a target for your weekly driving (e.g. 50).\nLeave blank to remove.",
        [
          { text: "Cancel", style: "cancel" },
          ...(weeklyGoal !== null
            ? [{
                text: "Remove",
                style: "destructive" as const,
                onPress: async () => {
                  const db = await getDatabase();
                  await db.runAsync("DELETE FROM tracking_state WHERE key = 'personal_goal_miles'");
                  setWeeklyGoal(null);
                },
              }]
            : []),
          {
            text: "Save",
            onPress: async (value: string | undefined) => {
              if (!value?.trim()) return;
              const parsed = parseFloat(value.trim());
              if (!isFinite(parsed) || parsed <= 0) {
                Alert.alert("Invalid", "Enter a positive number of miles.");
                return;
              }
              const rounded = Math.round(parsed * 10) / 10;
              const db = await getDatabase();
              await db.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('personal_goal_miles', ?)",
                [String(rounded)]
              );
              setWeeklyGoal(rounded);
            },
          },
        ],
        "plain-text",
        weeklyGoal ? String(weeklyGoal) : "",
        "number-pad"
      );
    } else {
      Alert.alert(
        "Weekly Miles Goal",
        `Current: ${weeklyGoal ? `${weeklyGoal} miles` : "Not set"}`,
        [
          { text: "Cancel", style: "cancel" },
          ...(weeklyGoal !== null
            ? [{
                text: "Remove goal",
                style: "destructive" as const,
                onPress: async () => {
                  const db = await getDatabase();
                  await db.runAsync("DELETE FROM tracking_state WHERE key = 'personal_goal_miles'");
                  setWeeklyGoal(null);
                },
              }]
            : []),
          { text: "25 mi", onPress: async () => { const db = await getDatabase(); await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('personal_goal_miles', '25')"); setWeeklyGoal(25); } },
          { text: "50 mi", onPress: async () => { const db = await getDatabase(); await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('personal_goal_miles', '50')"); setWeeklyGoal(50); } },
          { text: "100 mi", onPress: async () => { const db = await getDatabase(); await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('personal_goal_miles', '100')"); setWeeklyGoal(100); } },
        ]
      );
    }
  }, [weeklyGoal]);

  // ── Notification toggle helper ──
  const toggleNotif = useCallback(
    (key: keyof NotificationPreferences, val: boolean) => {
      const updated = { ...notifPrefs, [key]: val };
      setNotifPrefs(updated);
      setNotificationPreferences({ [key]: val }).catch(console.error);
    },
    [notifPrefs]
  );

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={AMBER}
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

        {/* ── QUICK ACTIONS ── */}
        {profileLayout.isVisible("profile_actions") && (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>QUICK ACTIONS</Text>
            <View style={styles.groupCard}>
              <GroupItem
                icon="create-outline"
                label="Edit Profile"
                onPress={() => router.push("/profile-edit")}
              />
              <GroupItem
                icon="location-outline"
                label="Saved Locations"
                onPress={() => router.push("/saved-locations")}
                border
              />
              <GroupItem
                icon="grid-outline"
                label="Customize Layout"
                onPress={() => router.push("/customize-layout")}
                border
              />
            </View>
          </View>
        )}

        {/* Customize Layout fallback if actions hidden */}
        {!profileLayout.isVisible("profile_actions") && (
          <View style={styles.group}>
            <View style={styles.groupCard}>
              <GroupItem
                icon="grid-outline"
                label="Customize Layout"
                onPress={() => router.push("/customize-layout")}
              />
            </View>
          </View>
        )}

        {/* ── MY VEHICLES ── */}
        {profileLayout.isVisible("profile_vehicles") && (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>MY VEHICLES</Text>
            <View style={styles.groupCard}>
              {vehicles.length === 0 && !loading ? (
                <View style={styles.emptyVehicles}>
                  <Ionicons name="car-outline" size={28} color={TEXT_3} />
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
                  >
                    <View style={styles.iconCircle}>
                      <Ionicons name="car-outline" size={18} color={AMBER} />
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
                    <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
                  </TouchableOpacity>
                ))
              )}
              {/* Add Vehicle row */}
              <TouchableOpacity
                style={[styles.addVehicleRow, vehicles.length > 0 && styles.itemBorder]}
                onPress={() => router.push("/vehicle-form")}
                activeOpacity={0.6}
              >
                <View style={[styles.iconCircle, { backgroundColor: "rgba(16, 185, 129, 0.1)" }]}>
                  <Ionicons name="add" size={18} color="#10b981" />
                </View>
                <Text style={[styles.itemLabel, { color: "#10b981" }]}>Add Vehicle</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── SUBSCRIPTION ── */}
        {profileLayout.isVisible("profile_subscription") && (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>SUBSCRIPTION</Text>
            {!user?.isPremium ? (
              <>
                <TouchableOpacity
                  style={styles.upgradeCard}
                  onPress={handleUpgrade}
                  activeOpacity={0.7}
                >
                  <View style={styles.upgradeHeader}>
                    <Ionicons name="diamond-outline" size={22} color={AMBER} />
                    <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
                  </View>
                  <Text style={styles.upgradePrice}>{iapPrice ?? "£4.99"}/mo</Text>
                  <View style={styles.featureList}>
                    <View style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                      <Text style={styles.featureText}>HMRC tax exports (PDF, CSV, Xero)</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                      <Text style={styles.featureText}>Open Banking auto-import</Text>
                    </View>
                    <View style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#10b981" />
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
                  >
                    <Text style={styles.restoreButtonText}>
                      {restoring ? "Restoring..." : "Restore Purchases"}
                    </Text>
                  </TouchableOpacity>
                )}
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
                        onPress={() => {
                          const url = "https://apps.apple.com/account/subscriptions";
                          import("expo-web-browser").then((wb) =>
                            wb.openBrowserAsync(url)
                          );
                        }}
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
                          : "—"}
                      </Text>
                      <TouchableOpacity onPress={handleCancelSubscription}>
                        <Text style={styles.subLink}>Cancel subscription</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── SETTINGS ── */}
        {profileLayout.isVisible("profile_settings") && (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>SETTINGS</Text>
            <View style={styles.groupCard}>
              {/* Drive Detection */}
              <View style={[styles.settingItem, styles.itemBorder]}>
                <View style={styles.iconCircle}>
                  <Ionicons name="navigate-outline" size={18} color={AMBER} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>Drive Detection</Text>
                  <Text style={styles.itemHint}>
                    Get notified when driving without a shift
                  </Text>
                </View>
                <Switch
                  value={driveDetection}
                  onValueChange={(val) => {
                    setDriveDetection(val);
                    setDriveDetectionEnabled(val);
                  }}
                  trackColor={{ false: "#374151", true: AMBER }}
                  thumbColor="#fff"
                  style={styles.toggle}
                />
              </View>

              {/* Work Schedule */}
              <TouchableOpacity
                style={[styles.settingItem, styles.itemBorder]}
                onPress={() => router.push("/work-schedule" as any)}
                activeOpacity={0.6}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="time-outline" size={18} color={AMBER} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>Work Schedule</Text>
                  <Text style={styles.itemHint}>
                    Auto-classify trips during work hours
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#4a5568" />
              </TouchableOpacity>

              {/* Weekly Goal */}
              <TouchableOpacity
                style={styles.settingItem}
                onPress={handleWeeklyGoal}
                activeOpacity={0.6}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="flag-outline" size={18} color={AMBER} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>Weekly Goal</Text>
                  <Text style={styles.itemHint}>
                    {weeklyGoal ? `${weeklyGoal} miles per week` : "No goal set"}
                  </Text>
                </View>
                <Text style={styles.editLink}>
                  {weeklyGoal ? "Edit" : "Set"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── WORK SETTINGS ── */}
        {profileLayout.isVisible("profile_work_settings") && user && (user.userIntent === "work" || user.userIntent === "both") && (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>WORK SETTINGS</Text>
            <View style={styles.groupCard}>
              {/* Work Type */}
              <View style={[styles.settingItem, styles.itemBorder]}>
                <View style={styles.iconCircle}>
                  <Ionicons name="briefcase-outline" size={18} color={AMBER} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>Work Type</Text>
                  <Text style={styles.itemHint}>
                    {workType === "gig" ? "Gig / delivery platforms" : workType === "employee" ? "Employee using own vehicle" : "Gig work + employee driving"}
                  </Text>
                </View>
              </View>
              {/* Work type pills */}
              <View style={styles.pillRow}>
                {([
                  { value: "gig" as WorkType, label: "Gig" },
                  { value: "employee" as WorkType, label: "Employee" },
                  { value: "both" as WorkType, label: "Both" },
                ]).map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.pill,
                      workType === opt.value && styles.pillActive,
                    ]}
                    onPress={() => handleWorkTypeChange(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.pillText,
                      workType === opt.value && styles.pillTextActive,
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Employer Mileage Rate */}
              {(workType === "employee" || workType === "both") && (
                <TouchableOpacity
                  style={[styles.settingItem, styles.itemBorder]}
                  onPress={handleEmployerRateChange}
                  activeOpacity={0.6}
                >
                  <View style={styles.iconCircle}>
                    <Ionicons name="cash-outline" size={18} color={AMBER} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemLabel}>Employer Mileage Rate</Text>
                    <Text style={styles.itemHint}>
                      {employerRate ? `${employerRate}p/mi — claim ${Math.max(0, 45 - employerRate)}p gap` : "Not set — claim full 45p HMRC rate"}
                    </Text>
                  </View>
                  <Text style={styles.editLink}>
                    {employerRate ? "Edit" : "Set"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── NOTIFICATIONS ── */}
        {profileLayout.isVisible("profile_notifications") && (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>NOTIFICATIONS</Text>
            <View style={styles.groupCard}>
              {/* Free notifications */}
              <NotifToggle
                icon="alert-circle-outline"
                label="Trip Reminders"
                hint="Nudge to classify unreviewed trips"
                value={notifPrefs.unclassifiedNudge}
                onToggle={(v) => toggleNotif("unclassifiedNudge", v)}
                border
              />
              <NotifToggle
                icon="time-outline"
                label="Shift Alerts"
                hint="Warn if a shift runs over 12 hours"
                value={notifPrefs.shiftReminder}
                onToggle={(v) => toggleNotif("shiftReminder", v)}
                border
              />
              <NotifToggle
                icon="flame-outline"
                label="Streak Reminders"
                hint="Remind you to keep your streak going"
                value={notifPrefs.streakReminder}
                onToggle={(v) => toggleNotif("streakReminder", v)}
              />
            </View>

            {/* Premium notifications */}
            {user?.isPremium ? (
              <View style={[styles.groupCard, { marginTop: 8 }]}>
                <NotifToggle
                  icon="calendar-outline"
                  label="Weekly Summary"
                  hint="Mileage recap every Monday morning"
                  value={notifPrefs.weeklySummary}
                  onToggle={(v) => toggleNotif("weeklySummary", v)}
                  border
                />
                <NotifToggle
                  icon="stats-chart-outline"
                  label="Monthly Recap"
                  hint="Your month in review on the 1st"
                  value={notifPrefs.monthlyRecap}
                  onToggle={(v) => toggleNotif("monthlyRecap", v)}
                  border
                />
                <NotifToggle
                  icon="trophy-outline"
                  label="Milestone Alerts"
                  hint="Celebrate when you hit mileage milestones"
                  value={notifPrefs.milestoneAlerts}
                  onToggle={(v) => toggleNotif("milestoneAlerts", v)}
                  border
                />
                <NotifToggle
                  icon="receipt-outline"
                  label="Tax Deadline"
                  hint="Reminder before 5 April tax year end"
                  value={notifPrefs.taxDeadline}
                  onToggle={(v) => toggleNotif("taxDeadline", v)}
                  border
                />
                <NotifToggle
                  icon="clipboard-outline"
                  label="Shift Summary"
                  hint="Stats when you end a shift"
                  value={notifPrefs.shiftSummary}
                  onToggle={(v) => toggleNotif("shiftSummary", v)}
                />
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                <PremiumTeaser feature="5 more notification types" compact />
              </View>
            )}
          </View>
        )}

        {/* ── DATA & EXPORTS ── */}
        {profileLayout.isVisible("profile_actions") && (
          <View style={styles.group}>
            <Text style={styles.groupLabel}>DATA & EXPORTS</Text>
            <View style={styles.groupCard}>
              <GroupItem
                icon="download-outline"
                label={exporting ? "Exporting..." : "Export My Data"}
                onPress={handleExport}
                border
              />
              <GroupItem
                icon="document-text-outline"
                label="Tax Exports"
                badge="PRO"
                onPress={() => router.push("/exports")}
                border
              />
              <GroupItem
                icon="cloud-upload-outline"
                label="Sync Status"
                onPress={() => router.push("/sync-status")}
              />
            </View>
          </View>
        )}

        {/* ── ACCOUNT ── */}
        <View style={styles.group}>
          <Text style={styles.groupLabel}>ACCOUNT</Text>
          <View style={styles.groupCard}>
            <TouchableOpacity
              style={[styles.accountItem, styles.itemBorder]}
              onPress={() => {
                Alert.alert(
                  "Reset Layout",
                  "This will restore the default layout for all screens. Continue?",
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
              }}
              activeOpacity={0.6}
            >
              <View style={styles.iconCircle}>
                <Ionicons name="refresh-outline" size={18} color={TEXT_2} />
              </View>
              <Text style={styles.itemLabel}>Reset Layout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.accountItem, styles.itemBorder]}
              onPress={handleLogout}
              activeOpacity={0.6}
            >
              <View style={[styles.iconCircle, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}>
                <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              </View>
              <Text style={[styles.itemLabel, { color: "#ef4444" }]}>Log out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.accountItem}
              onPress={handleDeleteAccount}
              disabled={deletingAccount}
              activeOpacity={0.6}
            >
              <View style={[styles.iconCircle, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </View>
              <Text style={[styles.itemLabel, { color: "#ef4444" }]}>
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
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Account</Text>
            <Text style={styles.modalMessage}>
              This is permanent and cannot be undone. Enter your password to confirm.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Password"
              placeholderTextColor="#6b7280"
              secureTextEntry
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDelete, !deletePassword && styles.buttonDisabled]}
                onPress={confirmDeleteAndroid}
                disabled={!deletePassword || deletingAccount}
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

// ── Shared sub-components ──────────────────────────────────────────

function GroupItem({
  icon,
  label,
  badge,
  onPress,
  border,
}: {
  icon: string;
  label: string;
  badge?: string;
  onPress: () => void;
  border?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.groupItem, border && styles.itemBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={icon as any} size={18} color={AMBER} />
      </View>
      <Text style={[styles.itemLabel, { flex: 1 }]}>{label}</Text>
      {badge && (
        <View style={styles.badgeChip}>
          <Text style={styles.badgeChipText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
    </TouchableOpacity>
  );
}

function NotifToggle({
  icon,
  label,
  hint,
  value,
  onToggle,
  border,
}: {
  icon: string;
  label: string;
  hint: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  border?: boolean;
}) {
  return (
    <View style={[styles.settingItem, border && styles.itemBorder]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon as any} size={18} color={AMBER} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#374151", true: AMBER }}
        thumbColor="#fff"
        style={styles.toggle}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    padding: 16,
  },

  // Profile card
  profileCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  profileInfoCentered: {
    alignItems: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  displayName: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    flexShrink: 1,
  },
  proBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    backgroundColor: AMBER,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  email: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
  },
  memberSince: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 2,
  },

  // Groups
  group: {
    marginTop: 16,
  },
  groupLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_3,
    letterSpacing: 1,
    marginBottom: 6,
    marginLeft: 4,
  },
  groupCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  // Group items
  groupItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
  },
  itemLabel: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_1,
  },
  itemHint: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    marginTop: 2,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },

  // Badge chip
  badgeChip: {
    backgroundColor: AMBER,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeChipText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    letterSpacing: 0.3,
  },

  // Vehicles
  vehicleItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },
  vehicleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBadge: {
    backgroundColor: AMBER,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  primaryBadgeText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  vehicleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  metaChip: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#d1d5db",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  metaText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  emptyVehicles: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },
  addVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },

  // Settings items
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },
  editLink: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },
  toggle: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },

  // Work type pills
  pillRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 13,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
  },
  pillActive: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  pillText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  pillTextActive: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },

  // Subscription
  upgradeCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.4)",
    ...Platform.select({
      ios: {
        shadowColor: AMBER,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  upgradeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  upgradeTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  upgradePrice: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
    marginBottom: 14,
  },
  featureList: {
    gap: 10,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#d1d5db",
  },
  upgradeButton: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  upgradeButtonText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  restoreButtonText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#3b82f6",
  },
  subCard: {
    padding: 14,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  subTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  activeBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  activeBadgeText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#10b981",
    letterSpacing: 0.3,
  },
  subDetail: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginBottom: 4,
  },
  subLink: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#ef4444",
    marginTop: 8,
  },

  // Account
  accountItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },

  // Modal
  buttonDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#1f2937",
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#374151",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  modalDelete: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  modalDeleteText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
});
