import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../lib/user/context";
import { usePaywall } from "./paywall";
import { colors, fonts } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

const AMBER = colors.amber;

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string;
  compact?: boolean;
}

/**
 * Wraps content that requires premium.
 * If user is premium, renders children.
 * If free, renders a teaser card with upgrade CTA.
 */
export function PremiumGate({ children, feature, compact }: PremiumGateProps) {
  const { user } = useUser();

  if (user?.isPremium) {
    return <>{children}</>;
  }

  return <PremiumTeaser feature={feature} compact={compact} />;
}

/**
 * Standalone premium teaser card — use directly when you need
 * more control than the wrapper pattern (e.g. replacing specific content).
 */
export function PremiumTeaser({
  feature,
  compact,
}: {
  feature?: string;
  compact?: boolean;
}) {
  const { showPaywall } = usePaywall();

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactCard}
        onPress={() => showPaywall(feature ?? "premium_gate")}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={feature ? `${feature} requires Pro. Upgrade to unlock` : "Upgrade to Pro to unlock this feature"}
      >
        <Ionicons name="diamond-outline" size={16} color={AMBER} />
        <Text style={styles.compactText}>
          {feature ? `${feature} — ` : ""}Upgrade to Pro
        </Text>
        <Ionicons name="chevron-forward" size={14} color={TEXT_3} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => showPaywall(feature ?? "premium_gate")}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={feature ? `${feature} is a Pro feature. Tap to upgrade to MileClear Pro` : "Upgrade to MileClear Pro to unlock this feature"}
    >
      <View style={styles.iconRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="diamond-outline" size={20} color={AMBER} />
        </View>
      </View>
      <Text style={styles.title}>
        {feature || "Pro Feature"}
      </Text>
      <Text style={styles.description}>
        Upgrade to MileClear Pro to unlock this feature.
      </Text>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Upgrade to Pro</Text>
        <Ionicons name="chevron-forward" size={14} color={BG} />
      </View>
    </TouchableOpacity>
  );
}

/**
 * Hook to check premium status — for inline conditional rendering.
 */
export function useIsPremium(): boolean {
  const { user } = useUser();
  return user?.isPremium ?? false;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    alignItems: "center",
    marginBottom: 12,
  },
  iconRow: {
    marginBottom: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 14,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: AMBER,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  ctaText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: BG,
  },
  compactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    marginBottom: 8,
  },
  compactText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: TEXT_2,
    flex: 1,
  },
});
