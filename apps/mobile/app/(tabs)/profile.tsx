import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
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
import { fetchVehicles } from "../../lib/api/vehicles";
import { fetchProfile, updateProfile, exportUserData, deleteAccount } from "../../lib/api/user";
import {
  fetchBillingStatus,
  createCheckoutSession,
  cancelSubscription,
} from "../../lib/api/billing";
import type { Vehicle, User, BillingStatus } from "@mileclear/shared";
import {
  isDriveDetectionEnabled,
  setDriveDetectionEnabled,
} from "../../lib/tracking/detection";
import {
  getNotificationPreferences,
  setNotificationPreferences,
  type NotificationPreferences,
} from "../../lib/notifications/preferences";
import { Button } from "../../components/Button";
import { AvatarPicker } from "../../components/avatars/AvatarPicker";

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
  const [driveDetection, setDriveDetection] = useState(true);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    weeklySummary: true,
    unclassifiedNudge: true,
    shiftReminder: true,
    streakReminder: true,
    taxDeadline: true,
  });

  const handleAvatarSelect = useCallback(async (avatarId: string | null) => {
    try {
      const res = await updateProfile({ avatarId });
      setUser(res.data);
    } catch {
      Alert.alert("Error", "Failed to update avatar");
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [profileRes, vehiclesRes, billingRes, detectionEnabled, notifPrefsLoaded] = await Promise.all([
        fetchProfile(),
        fetchVehicles(),
        fetchBillingStatus().catch(() => null),
        isDriveDetectionEnabled(),
        getNotificationPreferences(),
      ]);
      setUser(profileRes.data);
      setVehicles(vehiclesRes.data);
      if (billingRes) setBilling(billingRes.data);
      setDriveDetection(detectionEnabled);
      setNotifPrefs(notifPrefsLoaded);
    } catch {
      // Silently fail — will show empty state
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
      const res = await createCheckoutSession();
      if (res.data.url) {
        // Validate checkout URL points to Stripe
        const url = new URL(res.data.url);
        if (!url.hostname.endsWith("stripe.com")) {
          throw new Error("Invalid checkout URL");
        }
        await WebBrowser.openBrowserAsync(res.data.url);
        // Refresh billing status after returning from browser
        loadData();
      }
    } catch (err: unknown) {
      Alert.alert(
        "Upgrade failed",
        err instanceof Error ? err.message : "Could not start checkout"
      );
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
            onPress: async (password) => {
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

  const renderVehicle = ({ item }: { item: Vehicle }) => (
    <TouchableOpacity
      style={styles.vehicleCard}
      onPress={() => router.push(`/vehicle-form?id=${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.vehicleRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.vehicleHeader}>
            <Text style={styles.vehicleName}>
              {item.make} {item.model}
            </Text>
            {item.isPrimary && <Text style={styles.primaryBadge}>Primary</Text>}
          </View>
          <View style={styles.vehicleMeta}>
            <Text style={styles.badge}>{VEHICLE_TYPE_LABELS[item.vehicleType]}</Text>
            <Text style={styles.metaText}>{FUEL_TYPE_LABELS[item.fuelType]}</Text>
            {item.year && <Text style={styles.metaText}>{item.year}</Text>}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#6b7280" style={{ marginLeft: 8 }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        renderItem={renderVehicle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#f5a623"
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* Profile Card */}
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

            {/* Action Rows */}
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push("/profile-edit")}
              activeOpacity={0.7}
            >
              <View style={styles.actionRowLeft}>
                <Ionicons name="create-outline" size={18} color="#8494a7" />
                <Text style={styles.actionText}>Edit Profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleExport}
              disabled={exporting}
              activeOpacity={0.7}
            >
              <View style={styles.actionRowLeft}>
                <Ionicons name="download-outline" size={18} color="#8494a7" />
                <Text style={styles.actionText}>
                  {exporting ? "Exporting..." : "Export My Data"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push("/exports")}
              activeOpacity={0.7}
            >
              <View style={styles.actionRowLeft}>
                <Ionicons name="document-text-outline" size={18} color="#8494a7" />
                <Text style={styles.actionText}>Tax Exports</Text>
                <Text style={styles.proBadge}>PRO</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push("/sync-status")}
              activeOpacity={0.7}
            >
              <View style={styles.actionRowLeft}>
                <Ionicons name="cloud-upload-outline" size={18} color="#8494a7" />
                <Text style={styles.actionText}>Sync Status</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            </TouchableOpacity>

            {/* Settings Section */}
            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Settings</Text>
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>Drive Detection</Text>
                <Text style={styles.settingHint}>
                  Get notified when you start driving without a shift
                </Text>
              </View>
              <Switch
                value={driveDetection}
                onValueChange={(val) => {
                  setDriveDetection(val);
                  setDriveDetectionEnabled(val);
                }}
                trackColor={{ false: "#374151", true: "#f5a623" }}
                thumbColor="#fff"
              />
            </View>

            {/* Notifications Section */}
            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Notifications</Text>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>Weekly Summary</Text>
                <Text style={styles.settingHint}>
                  Mileage recap every Monday morning
                </Text>
              </View>
              <Switch
                value={notifPrefs.weeklySummary}
                onValueChange={(val) => {
                  const updated = { ...notifPrefs, weeklySummary: val };
                  setNotifPrefs(updated);
                  setNotificationPreferences({ weeklySummary: val }).catch(console.error);
                }}
                trackColor={{ false: "#374151", true: "#f5a623" }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>Trip Reminders</Text>
                <Text style={styles.settingHint}>
                  Nudge to classify unreviewed trips
                </Text>
              </View>
              <Switch
                value={notifPrefs.unclassifiedNudge}
                onValueChange={(val) => {
                  const updated = { ...notifPrefs, unclassifiedNudge: val };
                  setNotifPrefs(updated);
                  setNotificationPreferences({ unclassifiedNudge: val }).catch(console.error);
                }}
                trackColor={{ false: "#374151", true: "#f5a623" }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>Shift Alerts</Text>
                <Text style={styles.settingHint}>
                  Warn if a shift runs over 12 hours
                </Text>
              </View>
              <Switch
                value={notifPrefs.shiftReminder}
                onValueChange={(val) => {
                  const updated = { ...notifPrefs, shiftReminder: val };
                  setNotifPrefs(updated);
                  setNotificationPreferences({ shiftReminder: val }).catch(console.error);
                }}
                trackColor={{ false: "#374151", true: "#f5a623" }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>Streak Reminders</Text>
                <Text style={styles.settingHint}>
                  Remind you to keep your streak going
                </Text>
              </View>
              <Switch
                value={notifPrefs.streakReminder}
                onValueChange={(val) => {
                  const updated = { ...notifPrefs, streakReminder: val };
                  setNotifPrefs(updated);
                  setNotificationPreferences({ streakReminder: val }).catch(console.error);
                }}
                trackColor={{ false: "#374151", true: "#f5a623" }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>Tax Deadline</Text>
                <Text style={styles.settingHint}>
                  Reminder before 5 April tax year end
                </Text>
              </View>
              <Switch
                value={notifPrefs.taxDeadline}
                onValueChange={(val) => {
                  const updated = { ...notifPrefs, taxDeadline: val };
                  setNotifPrefs(updated);
                  setNotificationPreferences({ taxDeadline: val }).catch(console.error);
                }}
                trackColor={{ false: "#374151", true: "#f5a623" }}
                thumbColor="#fff"
              />
            </View>

            {/* Subscription Section */}
            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Subscription</Text>
            {!user?.isPremium ? (
              <TouchableOpacity
                style={styles.upgradeCard}
                onPress={handleUpgrade}
                activeOpacity={0.7}
              >
                <View style={styles.upgradeHeader}>
                  <Ionicons name="diamond-outline" size={22} color="#f5a623" />
                  <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
                </View>
                <Text style={styles.upgradePrice}>£4.99/mo</Text>
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
            ) : (
              <View style={styles.subscriptionCard}>
                <View style={styles.subscriptionHeader}>
                  <Text style={styles.subscriptionTitle}>MileClear Pro</Text>
                  <Text style={styles.proBadge}>ACTIVE</Text>
                </View>
                {billing?.cancelAtPeriodEnd ? (
                  <Text style={styles.subscriptionDetail}>
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
                    <Text style={styles.subscriptionDetail}>
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
                      <Text style={styles.cancelLink}>Cancel subscription</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>My Vehicles</Text>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="car-outline" size={40} color="#4a5568" />
              </View>
              <Text style={styles.emptyTitle}>No vehicles yet</Text>
              <Text style={styles.emptyText}>
                Add one to start tracking your mileage
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              title="Add Vehicle"
              icon="add"
              onPress={() => router.push("/vehicle-form")}
            />
            <Button
              variant="ghost"
              danger
              title="Log out"
              icon="log-out-outline"
              onPress={handleLogout}
            />
            <Button
              variant="ghost"
              title="Delete Account"
              onPress={handleDeleteAccount}
              loading={deletingAccount}
            />
          </View>
        }
      />

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  listContent: {
    padding: 16,
  },
  profileCard: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#f5a623",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  profileInfo: {
    flex: 1,
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
    color: "#fff",
    flexShrink: 1,
  },
  proBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    backgroundColor: "#f5a623",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  email: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginTop: 2,
  },
  memberSince: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    marginTop: 2,
  },
  actionRow: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  actionRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  actionText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#fff",
  },
  settingRow: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  settingHint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
    marginBottom: 16,
  },
  vehicleCard: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  vehicleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  vehicleName: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
  },
  primaryBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
    backgroundColor: "#f5a623",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  vehicleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#d1d5db",
    backgroundColor: "#1f2937",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  metaText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  footer: {
    marginTop: 16,
    gap: 12,
    paddingBottom: 20,
  },
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
    color: "#fff",
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginBottom: 16,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
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
    color: "#fff",
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
    color: "#fff",
  },
  upgradeCard: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.4)",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#f5a623",
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
    color: "#fff",
  },
  upgradePrice: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
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
    backgroundColor: "#f5a623",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  upgradeButtonText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  subscriptionCard: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  subscriptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  subscriptionTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
  },
  subscriptionDetail: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginBottom: 4,
  },
  cancelLink: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#ef4444",
    marginTop: 8,
  },
});
