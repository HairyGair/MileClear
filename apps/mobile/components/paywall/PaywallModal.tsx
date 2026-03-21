import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { calculateHmrcDeduction, formatPence } from "@mileclear/shared";
import { fetchGamificationStats } from "../../lib/api/gamification";
import { createCheckoutSession } from "../../lib/api/billing";
import {
  isIapAvailable,
  purchaseSubscription,
  getSubscriptionProducts,
  restorePurchases,
  type SubscriptionProduct,
} from "../../lib/iap/index";
import { validateApplePurchase } from "../../lib/api/billing";
import { useUser } from "../../lib/user/context";
import type { GamificationStats } from "@mileclear/shared";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const BG = "#030712";
const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const AMBER_DIM = "rgba(245, 166, 35, 0.1)";
const AMBER_BORDER = "rgba(245, 166, 35, 0.25)";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";
const SUCCESS = "#10b981";

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  source?: string;
}

export function PaywallModal({ visible, onClose, source }: PaywallModalProps) {
  const scrollRef = useRef<ScrollView>(null);
  const { refreshUser } = useUser();
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState<string>("£4.99");
  const [annualPrice, setAnnualPrice] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("monthly");
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const price = selectedPlan === "annual" && annualPrice ? annualPrice : monthlyPrice;

  // Load stats + prices when modal opens
  useEffect(() => {
    if (!visible) {
      setPage(0);
      return;
    }
    fetchGamificationStats()
      .then((res) => setStats(res.data))
      .catch(() => {});
    if (isIapAvailable()) {
      getSubscriptionProducts()
        .then((products) => {
          if (products.monthly) setMonthlyPrice(products.monthly.localizedPrice);
          if (products.annual) setAnnualPrice(products.annual.localizedPrice);
        })
        .catch(() => {});
    }
  }, [visible]);

  const handleScroll = useCallback((event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    setPage(Math.round(x / SCREEN_WIDTH));
  }, []);

  const goToPage = useCallback((p: number) => {
    scrollRef.current?.scrollTo({ x: p * SCREEN_WIDTH, animated: true });
    setPage(p);
  }, []);

  const handlePurchase = useCallback(async () => {
    setPurchasing(true);
    try {
      if (isIapAvailable()) {
        await purchaseSubscription(selectedPlan);
        // Purchase listener in _layout.tsx handles validation + refreshUser
      } else {
        const res = await createCheckoutSession();
        if (res.data.url) {
          const url = new URL(res.data.url);
          if (!url.hostname.endsWith("stripe.com")) {
            throw new Error("Invalid checkout URL");
          }
          await WebBrowser.openBrowserAsync(res.data.url);
          await refreshUser();
        }
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("user-cancelled")) return;
      Alert.alert(
        "Purchase failed",
        err instanceof Error ? err.message : "Could not complete purchase"
      );
    } finally {
      setPurchasing(false);
    }
  }, [onClose, refreshUser]);

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const txIds = await restorePurchases();
      if (txIds.length === 0) {
        Alert.alert("No Purchases Found", "No previous subscriptions found for this Apple ID.");
        return;
      }
      for (const txId of txIds) {
        await validateApplePurchase(txId);
      }
      await refreshUser();
      Alert.alert("Restored", "Your subscription has been restored.");
      onClose();
    } catch (err: unknown) {
      Alert.alert("Restore Failed", err instanceof Error ? err.message : "Could not restore.");
    } finally {
      setRestoring(false);
    }
  }, [onClose, refreshUser]);

  // Calculate personalised deduction value
  const totalMiles = stats?.totalMiles ?? 0;
  const deductionPence = calculateHmrcDeduction("car", totalMiles);
  const deductionFormatted = formatPence(deductionPence);
  const milesFormatted = totalMiles.toFixed(0);

  const TOTAL_PAGES = 4;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Close button */}
          <TouchableOpacity
            style={s.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={TEXT_2} />
          </TouchableOpacity>

          {/* Page dots */}
          <View style={s.dots}>
            {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
              <View key={i} style={[s.dot, page === i && s.dotActive]} />
            ))}
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            style={s.scroller}
          >
            {/* ── Screen 1: Value ── */}
            <View style={[s.page, { width: SCREEN_WIDTH }]}>
              <ScrollView contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
                <View style={s.valueIconWrap}>
                  <Ionicons name="trending-up" size={36} color={AMBER} />
                </View>

                <Text style={s.valueHeading}>
                  You've tracked {milesFormatted} miles
                </Text>
                <Text style={s.valueSubheading}>
                  That's worth up to{" "}
                  <Text style={s.valueHighlight}>{deductionFormatted}</Text>
                  {" "}in HMRC deductions
                </Text>

                <View style={s.valueCard}>
                  <View style={s.valueRow}>
                    <Text style={s.valueLabel}>Business miles</Text>
                    <Text style={s.valueAmount}>{milesFormatted} mi</Text>
                  </View>
                  <View style={s.valueDivider} />
                  <View style={s.valueRow}>
                    <Text style={s.valueLabel}>HMRC rate (45p/mi)</Text>
                    <Text style={s.valueAmount}>{deductionFormatted}</Text>
                  </View>
                  <View style={s.valueDivider} />
                  <View style={s.valueRow}>
                    <Text style={s.valueLabel}>Pro cost</Text>
                    <Text style={[s.valueAmount, { color: TEXT_3 }]}>from {monthlyPrice}/mo</Text>
                  </View>
                </View>

                <Text style={s.valueFooter}>
                  Most drivers save 10x what Pro costs in recovered deductions.
                </Text>

                <TouchableOpacity style={s.nextBtn} onPress={() => goToPage(1)} activeOpacity={0.7}>
                  <Text style={s.nextBtnText}>See what's included</Text>
                  <Ionicons name="arrow-forward" size={18} color={AMBER} />
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* ── Screen 2: Trust ── */}
            <View style={[s.page, { width: SCREEN_WIDTH }]}>
              <ScrollView contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
                <View style={s.valueIconWrap}>
                  <Ionicons name="shield-checkmark" size={36} color={SUCCESS} />
                </View>

                <Text style={s.trustHeading}>Try risk-free</Text>
                <Text style={s.trustSubheading}>
                  Cancel anytime from your Apple or Google account. No hidden fees, no lock-in.
                </Text>

                <View style={s.trustCards}>
                  <View style={s.trustCard}>
                    <Ionicons name="notifications-outline" size={22} color={AMBER} />
                    <View style={s.trustCardBody}>
                      <Text style={s.trustCardTitle}>Renewal reminder</Text>
                      <Text style={s.trustCardText}>
                        We'll notify you 2 days before your next billing date.
                      </Text>
                    </View>
                  </View>
                  <View style={s.trustCard}>
                    <Ionicons name="lock-closed-outline" size={22} color={AMBER} />
                    <View style={s.trustCardBody}>
                      <Text style={s.trustCardTitle}>Your data stays yours</Text>
                      <Text style={s.trustCardText}>
                        All trips and data remain even if you downgrade.
                      </Text>
                    </View>
                  </View>
                  <View style={s.trustCard}>
                    <Ionicons name="card-outline" size={22} color={AMBER} />
                    <View style={s.trustCardBody}>
                      <Text style={s.trustCardTitle}>Simple pricing</Text>
                      <Text style={s.trustCardText}>
                        From {monthlyPrice}/month{annualPrice ? `, or ${annualPrice}/year` : ""}. Cancel anytime.
                      </Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity style={s.nextBtn} onPress={() => goToPage(2)} activeOpacity={0.7}>
                  <Text style={s.nextBtnText}>See Pro features</Text>
                  <Ionicons name="arrow-forward" size={18} color={AMBER} />
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* ── Screen 3: Features ── */}
            <View style={[s.page, { width: SCREEN_WIDTH }]}>
              <ScrollView contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
                <View style={s.valueIconWrap}>
                  <Ionicons name="diamond" size={36} color={AMBER} />
                </View>

                <Text style={s.featuresHeading}>Everything in Pro</Text>

                <View style={s.featureGrid}>
                  {FEATURES.map((f) => (
                    <View key={f.label} style={s.featureItem}>
                      <View style={s.featureIconWrap}>
                        <Ionicons name={f.icon as any} size={20} color={AMBER} />
                      </View>
                      <View style={s.featureBody}>
                        <Text style={s.featureLabel}>{f.label}</Text>
                        <Text style={s.featureDesc}>{f.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={s.socialProof}>
                  <Ionicons name="people" size={18} color={TEXT_3} />
                  <Text style={s.socialProofText}>
                    Trusted by gig workers and drivers across the UK
                  </Text>
                </View>

                <TouchableOpacity style={s.nextBtn} onPress={() => goToPage(3)} activeOpacity={0.7}>
                  <Text style={s.nextBtnText}>Get started</Text>
                  <Ionicons name="arrow-forward" size={18} color={AMBER} />
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* ── Screen 4: Purchase ── */}
            <View style={[s.page, { width: SCREEN_WIDTH }]}>
              <ScrollView contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
                <View style={s.purchaseIconWrap}>
                  <Ionicons name="diamond" size={44} color={AMBER} />
                </View>

                <Text style={s.purchaseHeading}>MileClear Pro</Text>

                {/* Plan toggle — only show if annual is available */}
                {annualPrice ? (
                  <View style={s.planToggle}>
                    <TouchableOpacity
                      style={[s.planOption, selectedPlan === "monthly" && s.planOptionActive]}
                      onPress={() => setSelectedPlan("monthly")}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.planLabel, selectedPlan === "monthly" && s.planLabelActive]}>Monthly</Text>
                      <Text style={[s.planPrice, selectedPlan === "monthly" && s.planPriceActive]}>{monthlyPrice}/mo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.planOption, selectedPlan === "annual" && s.planOptionActive]}
                      onPress={() => setSelectedPlan("annual")}
                      activeOpacity={0.7}
                    >
                      <View style={s.saveBadge}><Text style={s.saveBadgeText}>Save 25%</Text></View>
                      <Text style={[s.planLabel, selectedPlan === "annual" && s.planLabelActive]}>Annual</Text>
                      <Text style={[s.planPrice, selectedPlan === "annual" && s.planPriceActive]}>{annualPrice}/yr</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={s.purchasePrice}>{price}<Text style={s.purchasePeriod}>/month</Text></Text>
                )}

                <View style={s.purchaseChecks}>
                  {["HMRC tax exports (PDF & CSV)", "CSV earnings import", "Business insights & shift grades", "Monthly & yearly recaps", "Advanced analytics & journey map", "Unlimited saved locations", "Open Banking auto-import"].map((item) => (
                    <View key={item} style={s.purchaseCheck}>
                      <Ionicons name="checkmark-circle" size={18} color={SUCCESS} />
                      <Text style={s.purchaseCheckText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[s.purchaseBtn, purchasing && s.purchaseBtnDisabled]}
                  onPress={handlePurchase}
                  disabled={purchasing || restoring}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Subscribe to MileClear Pro for ${price} per ${selectedPlan === "annual" ? "year" : "month"}`}
                >
                  {purchasing ? (
                    <ActivityIndicator color="#030712" />
                  ) : (
                    <Text style={s.purchaseBtnText}>Subscribe Now</Text>
                  )}
                </TouchableOpacity>

                {isIapAvailable() && (
                  <TouchableOpacity
                    style={s.restoreBtn}
                    onPress={handleRestore}
                    disabled={restoring || purchasing}
                    activeOpacity={0.7}
                  >
                    <Text style={s.restoreBtnText}>
                      {restoring ? "Restoring..." : "Restore Purchases"}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={s.legalLinks}>
                  <TouchableOpacity onPress={() => Linking.openURL("https://mileclear.com/terms")}>
                    <Text style={s.legalLink}>Terms of Service</Text>
                  </TouchableOpacity>
                  <Text style={s.legalDot}>·</Text>
                  <TouchableOpacity onPress={() => Linking.openURL("https://mileclear.com/privacy")}>
                    <Text style={s.legalLink}>Privacy Policy</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.legalSmall}>
                  Payment will be charged to your Apple ID account at confirmation of purchase.
                  Subscription automatically renews unless cancelled at least 24 hours before the
                  end of the current period. You can manage or cancel in your Apple ID settings.
                </Text>
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const FEATURES = [
  { icon: "document-text-outline", label: "HMRC Exports", desc: "PDF & CSV for self-assessment" },
  { icon: "cloud-upload-outline", label: "CSV Import", desc: "Bulk import platform earnings" },
  { icon: "analytics-outline", label: "Analytics", desc: "Efficiency metrics & insights" },
  { icon: "podium-outline", label: "Business Insights", desc: "Platform comparison, shift grades & P&L" },
  { icon: "ribbon-outline", label: "Shift Scorecard", desc: "Performance grade after every shift" },
  { icon: "calendar-outline", label: "Monthly & Yearly Recaps", desc: "Track progress beyond today" },
  { icon: "location-outline", label: "Unlimited Locations", desc: "Save as many depots as you need" },
  { icon: "card-outline", label: "Open Banking", desc: "Auto-import earnings from your bank" },
  { icon: "calendar-outline", label: "Work Schedule", desc: "Plan shifts & get reminders" },
  { icon: "map-outline", label: "Journey Map", desc: "Visualise all your routes on one map" },
];

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    minHeight: "75%",
    overflow: "hidden",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dotActive: {
    width: 20,
    backgroundColor: AMBER,
  },
  scroller: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // ── Value screen ──
  valueIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: AMBER_DIM,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  valueHeading: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 6,
  },
  valueSubheading: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  valueHighlight: {
    color: AMBER,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  valueCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 16,
  },
  valueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  valueLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  valueAmount: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  valueDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  valueFooter: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },

  // ── Trust screen ──
  trustHeading: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 6,
  },
  trustSubheading: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  trustCards: {
    gap: 12,
    marginBottom: 24,
  },
  trustCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  trustCardBody: {
    flex: 1,
  },
  trustCardTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 3,
  },
  trustCardText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 19,
  },

  // ── Features screen ──
  featuresHeading: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 20,
  },
  featureGrid: {
    gap: 14,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: AMBER_DIM,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    justifyContent: "center",
    alignItems: "center",
  },
  featureBody: {
    flex: 1,
    paddingTop: 2,
  },
  featureLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  socialProof: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 10,
  },
  socialProofText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
  },

  // ── Next button ──
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: AMBER_DIM,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
  },
  nextBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
  },

  // ── Purchase screen ──
  purchaseIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: AMBER_DIM,
    borderWidth: 1,
    borderColor: AMBER_BORDER,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  purchaseHeading: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 12,
  },
  purchasePrice: {
    fontSize: 32,
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
    textAlign: "center",
    marginBottom: 20,
  },
  purchasePeriod: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  planToggle: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  planOption: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    padding: 14,
    alignItems: "center",
  },
  planOptionActive: {
    borderColor: AMBER,
    backgroundColor: AMBER_DIM,
  },
  planLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    marginBottom: 4,
  },
  planLabelActive: {
    color: TEXT_1,
  },
  planPrice: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_2,
  },
  planPriceActive: {
    color: AMBER,
  },
  saveBadge: {
    backgroundColor: SUCCESS,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  saveBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  purchaseChecks: {
    gap: 10,
    marginBottom: 24,
  },
  purchaseCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  purchaseCheckText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_1,
  },
  purchaseBtn: {
    backgroundColor: AMBER,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  purchaseBtnDisabled: {
    opacity: 0.6,
  },
  purchaseBtnText: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  restoreBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 16,
  },
  restoreBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_3,
    textDecorationLine: "underline",
  },
  legalLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  legalLink: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textDecorationLine: "underline",
  },
  legalDot: {
    fontSize: 12,
    color: TEXT_3,
  },
  legalSmall: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "rgba(100,116,139,0.6)",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 8,
  },
});
