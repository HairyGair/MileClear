// EV running-costs card — the electric analogue of FuelSummaryCard. Shows for
// electric vehicles only: estimated monthly home-charging cost + cost-per-mile
// (from the vehicle's miles/kWh and the effective electricity rate), and a tap
// through to nearby public chargers. Pure estimate today (no per-charge logs
// like fuel has) — clearly labelled.

import { useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { fetchElectricityRate } from "../../lib/api/charging";
import { formatPence, evChargingCostPence, evCostPerMilePence } from "@mileclear/shared";
import { colors, fonts } from "../../lib/theme";

const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_1 = colors.text1;
const TEXT_3 = colors.text3;

const FALLBACK_MILES_PER_KWH = 3.5; // typical UK EV
const FALLBACK_PENCE_PER_KWH = 24.5;

interface ChargingSummaryCardProps {
  monthMiles: number;
  milesPerKwh: number | null;
  fuelType: "petrol" | "diesel" | "electric" | "hybrid" | null;
}

export function ChargingSummaryCard({ monthMiles, milesPerKwh, fuelType }: ChargingSummaryCardProps) {
  const router = useRouter();
  const [pencePerKwh, setPencePerKwh] = useState(FALLBACK_PENCE_PER_KWH);
  const [rateSource, setRateSource] = useState<string>("default");

  useFocusEffect(
    useCallback(() => {
      fetchElectricityRate()
        .then((res) => {
          setPencePerKwh(res.data.pencePerKwh);
          setRateSource(res.data.source);
        })
        .catch(() => {});
    }, [])
  );

  // Electric vehicles only.
  if (fuelType !== "electric") return null;
  if (monthMiles < 1) return null;

  const eff = milesPerKwh && milesPerKwh > 0 ? milesPerKwh : FALLBACK_MILES_PER_KWH;
  const monthCost = evChargingCostPence(monthMiles, eff, pencePerKwh) ?? 0;
  const perMile = evCostPerMilePence(eff, pencePerKwh);
  const costPerMile = perMile != null ? (perMile / 100).toFixed(2) : null;
  const usingDefaultEff = !milesPerKwh || milesPerKwh <= 0;

  const rateLabel =
    rateSource === "user" ? "your rate" : rateSource === "octopus_agile" ? "Agile avg" : "est. rate";

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push("/charging-nearby")}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Charging and running costs. Estimated ${formatPence(monthCost)} this month. Tap to find nearby chargers.`}
    >
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="flash" size={16} color={AMBER} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Charging & Running Costs</Text>
          <Text style={styles.subtitle}>Estimated home charging this month</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={TEXT_3} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>~{formatPence(monthCost)}</Text>
          <Text style={styles.statLabel}>est. cost</Text>
        </View>
        <View style={styles.statDot} />
        {costPerMile && (
          <>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{"£"}{costPerMile}</Text>
              <Text style={styles.statLabel}>per mile</Text>
            </View>
            <View style={styles.statDot} />
          </>
        )}
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{eff.toFixed(1)}</Text>
          <Text style={styles.statLabel}>mi/kWh</Text>
        </View>
        <View style={styles.statDot} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{pencePerKwh.toFixed(1)}p</Text>
          <Text style={styles.statLabel}>{rateLabel}</Text>
        </View>
      </View>

      <View style={styles.hint}>
        <Text style={styles.hintText}>
          {usingDefaultEff ? "Add your car's miles/kWh for an accurate estimate" : "Find nearby chargers"}
        </Text>
        <Ionicons name={usingDefaultEff ? "create-outline" : "navigate-outline"} size={14} color={AMBER} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: CARD_BG, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(245, 166, 35, 0.1)", justifyContent: "center", alignItems: "center" },
  title: { fontSize: 14, fontFamily: fonts.semibold, color: TEXT_1 },
  subtitle: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_3, marginTop: 1 },
  statsRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 10 },
  statItem: { alignItems: "center", paddingHorizontal: 10 },
  statValue: { fontSize: 15, fontFamily: fonts.semibold, color: TEXT_1 },
  statLabel: { fontSize: 10, fontFamily: fonts.regular, color: TEXT_3, marginTop: 2 },
  statDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.1)" },
  hint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" },
  hintText: { fontSize: 12, fontFamily: fonts.medium, color: AMBER },
});
