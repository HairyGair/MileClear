import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import { colors, fonts } from "../../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const GREEN = colors.green;

interface TaxSavingsCardProps {
  deductionPence: number;
  businessMiles: number;
  taxYear: string;
}

export function TaxSavingsCard({
  deductionPence,
  businessMiles,
  taxYear,
}: TaxSavingsCardProps) {
  if (deductionPence <= 0) return null;

  const milesStr =
    businessMiles < 1000
      ? businessMiles.toFixed(1)
      : Math.round(businessMiles).toLocaleString("en-GB");

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="cash-outline" size={16} color={GREEN} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>HMRC Deduction</Text>
          <Text style={styles.taxYear}>{taxYear}</Text>
        </View>
      </View>

      <Text style={styles.amount}>{formatPence(deductionPence)}</Text>

      <View style={styles.detailRow}>
        <Ionicons name="car-outline" size={13} color={TEXT_2} />
        <Text style={styles.detailText}>
          {milesStr} business miles claimed
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.15)",
    ...Platform.select({
      ios: {
        shadowColor: GREEN,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  taxYear: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 1,
  },
  amount: {
    fontSize: 32,
    fontFamily: fonts.light,
    color: GREEN,
    letterSpacing: -1,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
});
