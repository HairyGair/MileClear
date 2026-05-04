import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, fonts } from "../../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_3 = colors.text3;

interface CostEstimateProps {
  monthMiles: number;
  estimatedMpg: number | null;
  fuelPricePerLitre: number | null;
  fuelType: "petrol" | "diesel" | "electric" | "hybrid" | null;
}

const LITRES_PER_GALLON = 4.54609;

// Average UK fuel prices as fallback (pence per litre)
const FALLBACK_PRICES = {
  petrol: 138,
  diesel: 145,
  electric: 0,
  hybrid: 138,
};

// Average UK MPG by vehicle type
const FALLBACK_MPG = 35;

export function CostEstimate({
  monthMiles,
  estimatedMpg,
  fuelPricePerLitre,
  fuelType,
}: CostEstimateProps) {
  const router = useRouter();

  if (monthMiles < 1) return null;
  if (fuelType === "electric") return null;

  const mpg = estimatedMpg || FALLBACK_MPG;
  const ppl = fuelPricePerLitre || FALLBACK_PRICES[fuelType || "petrol"];
  const isEstimate = !estimatedMpg || !fuelPricePerLitre;

  // Cost calculation: miles / mpg = gallons, gallons * litres_per_gallon = litres, litres * ppl = cost in pence
  const gallons = monthMiles / mpg;
  const litres = gallons * LITRES_PER_GALLON;
  const costPence = litres * ppl;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="speedometer" size={16} color={AMBER} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Estimated Fuel Cost</Text>
          <Text style={styles.subtitle}>
            {isEstimate ? "Based on average UK figures" : `${mpg} MPG at ${ppl}p/L`}
          </Text>
        </View>
        <Text style={styles.cost}>
          ~{"\u00A3"}{(costPence / 100).toFixed(2)}
        </Text>
      </View>

      <View style={styles.breakdownRow}>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownValue}>{litres.toFixed(1)}L</Text>
          <Text style={styles.breakdownLabel}>fuel used</Text>
        </View>
        <View style={styles.breakdownDot} />
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownValue}>
            {(costPence / monthMiles / 100).toFixed(2)}
          </Text>
          <Text style={styles.breakdownLabel}>{"\u00A3"}/mile</Text>
        </View>
        <View style={styles.breakdownDot} />
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownValue}>{mpg}</Text>
          <Text style={styles.breakdownLabel}>MPG</Text>
        </View>
      </View>

      {isEstimate && (
        <TouchableOpacity
          style={styles.hint}
          onPress={() => router.push("/vehicle-form")}
          activeOpacity={0.7}
        >
          <Text style={styles.hintText}>
            Add your vehicle's MPG for accurate costs
          </Text>
          <Ionicons name="chevron-forward" size={14} color={AMBER} />
        </TouchableOpacity>
      )}
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
    borderColor: "rgba(255,255,255,0.05)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 1,
  },
  cost: {
    fontSize: 18,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 10,
  },
  breakdownItem: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  breakdownValue: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  breakdownLabel: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 2,
  },
  breakdownDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  hintText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: AMBER,
  },
});
