import { View, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";

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
          <Ionicons name="cash-outline" size={16} color="#10b981" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>HMRC Deduction</Text>
          <Text style={styles.taxYear}>{taxYear}</Text>
        </View>
      </View>

      <Text style={styles.amount}>{formatPence(deductionPence)}</Text>

      <View style={styles.detailRow}>
        <Ionicons name="car-outline" size={13} color="#8494a7" />
        <Text style={styles.detailText}>
          {milesStr} business miles claimed
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0a1120",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.15)",
    ...Platform.select({
      ios: {
        shadowColor: "#10b981",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
  },
  taxYear: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    marginTop: 1,
  },
  amount: {
    fontSize: 32,
    fontFamily: "PlusJakartaSans_300Light",
    color: "#10b981",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#8494a7",
  },
});
