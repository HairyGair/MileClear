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
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useUser } from "../../lib/user/context";
import { fetchProfile } from "../../lib/api/user";
import {
  fetchBillingStatus,
  cancelSubscription,
  validateApplePurchase,
} from "../../lib/api/billing";
import type { User, BillingStatus } from "@mileclear/shared";
import { formatPence, calculateHmrcDeduction } from "@mileclear/shared";
import { fetchGamificationStats } from "../../lib/api/gamification";
import {
  isIapAvailable,
  getSubscriptionProduct,
  restorePurchases,
  iapStore,
  PLAY_SUBSCRIPTIONS_URL,
} from "../../lib/iap/index";
import { validateGooglePurchase } from "../../lib/api/billingGoogle";
import { billingCopyFor, billingChannelFor } from "../../lib/paywall/lead";
import { usePaywall } from "../../components/paywall";
import { colors, fonts, radii, spacing } from "../../lib/theme";

/**
 * Your plan: what you are on, where it renews, how to manage or cancel it,
 * and Restore purchase. Moved here from the old Profile tab (Oct 2026
 * Settings redesign) so "cancel my subscription" lives in Settings.
 */
export default function PlanSettings() {
  const { refreshUser } = useUser();
  const { showPaywall } = usePaywall();

  const [user, setUser] = useState<User | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [iapPrice, setIapPrice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [profileRes, billingRes] = await Promise.all([
        fetchProfile(),
        fetchBillingStatus().catch(() => null),
      ]);
      setUser(profileRes.data);
      if (billingRes) setBilling(billingRes.data);
      refreshUser();
      if (isIapAvailable()) {
        getSubscriptionProduct()
          .then((product) => { if (product) setIapPrice(product.localizedPrice); })
          .catch(() => {});
      }
    } catch {
      // Silently fail; pull to refresh and the focus effect retry.
    } finally {
      setRefreshing(false);
    }
  }, [refreshUser]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ── Subscription actions ─────────────────────────────────────────
  const handleRestorePurchases = useCallback(async () => {
    setRestoring(true);
    try {
      const tokens = await restorePurchases();
      if (tokens.length === 0) {
        Alert.alert(
          "Nothing to restore",
          iapStore() === "google"
            ? "No previous subscription was found for this Google account."
            : "No previous subscription was found for this Apple ID."
        );
        return;
      }
      const isGoogle = iapStore() === "google";
      for (const token of tokens) {
        if (isGoogle) {
          await validateGooglePurchase(token);
        } else {
          await validateApplePurchase(token);
        }
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
    Alert.alert("Cancel subscription", message, [
      { text: "Keep Pro", style: "cancel" },
      {
        text: "Cancel subscription",
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

  // Where this user's Pro comes from. A team or referral Pro user has no
  // subscription of their own, so the card must not offer renew/cancel/manage.
  // Billing status is fresher; the profile carries the same fields.
  const premiumSource = billing?.premiumSource ?? user?.premiumSource;
  const referralProUntil = billing?.referralProUntil ?? user?.referralProUntil ?? null;


  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.amber} />
      }
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
        {/* ── SUBSCRIPTION ── */}
        <View style={styles.group}>
          <Text style={styles.groupLabel} accessibilityRole="header">YOUR PLAN</Text>
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
                    <Text style={styles.featureText}>Self Assessment PDF & mileage exports</Text>
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
                    {restoring ? "Restoring..." : "Restore purchase"}
                  </Text>
                </TouchableOpacity>
              )}
              <Text style={styles.subLegalText}>
                {billingCopyFor(billingChannelFor(iapStore(), Platform.OS)).smallPrint}
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
                {premiumSource === "team" ? (
                  // Team Pro is the organisation's plan, not this user's:
                  // nothing here to renew, cancel or manage.
                  <Text style={styles.subDetail}>Pro through your team</Text>
                ) : premiumSource === "referral" ? (
                  // Banked referral credit: no subscription behind it, so no
                  // cancel button (the Stripe cancel would have nothing to cancel).
                  <Text style={styles.subDetail}>
                    {referralProUntil
                      ? `Pro from referrals, until ${new Date(referralProUntil).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}`
                      : "Pro from referrals"}
                  </Text>
                ) : billing?.subscriptionPlatform === "none" ? (
                  // Pro with no Apple, Google or Stripe subscription behind it:
                  // a complimentary grant (the server reports these with source
                  // "subscription", so the platform is the only reliable tell).
                  // Nothing to renew or cancel. Found on the demo account in
                  // the simulator, 30 Sep 2026: it showed "Renews -" and a
                  // Cancel button that could never work.
                  <Text style={styles.subDetail}>
                    Pro is on for your account. There's no subscription to renew or cancel.
                  </Text>
                ) : billing?.subscriptionPlatform === "apple" ? (
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
                ) : billing?.subscriptionPlatform === "google" ||
                  (Platform.OS === "android" && billing?.subscriptionPlatform !== "stripe") ? (
                  <>
                    <Text style={styles.subDetail}>Managed by Google Play</Text>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(PLAY_SUBSCRIPTIONS_URL).catch(() => {})}
                      accessibilityRole="link"
                      accessibilityLabel="Manage subscription in Google Play"
                    >
                      <Text style={[styles.subLink, { color: "#3b82f6" }]}>
                        Manage in Google Play
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : Platform.OS === "android" ? (
                  // Stripe-billed user on Android: Play policy means no link
                  // to the website from here, just say where it is managed.
                  <Text style={styles.subDetail}>
                    This subscription was bought on the website. Manage or cancel it from your account at mileclear.com.
                  </Text>
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
          {user?.isPremium && isIapAvailable() && (
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestorePurchases}
              disabled={restoring}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={restoring ? "Restoring purchase" : "Restore previous purchase"}
              accessibilityState={{ disabled: restoring, busy: restoring }}
            >
              <Text style={styles.restoreButtonText}>
                {restoring ? "Restoring..." : "Restore purchase"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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

});
