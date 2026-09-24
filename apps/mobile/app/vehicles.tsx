import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, Stack } from "expo-router";
import { fetchVehicles, type VehicleWithCaz } from "../lib/api/vehicles";
import { useUser } from "../lib/user/context";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { colors, fonts, radii, spacing } from "../lib/theme";

// Local theme aliases — same pattern as the (tabs) screens.
const AMBER = colors.amber;
const CARD_BG = colors.surface;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const BG = colors.bg;

// Free tier is capped at 1 vehicle; Pro is unlimited. There's no shared
// constant for this (unlike MAX_FREE_SAVED_LOCATIONS) so it's mirrored here
// from the paywall docs / profile.tsx behaviour.
const MAX_FREE_VEHICLES = 1;

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

function VehicleCard({
  item,
  onPress,
}: {
  item: VehicleWithCaz;
  onPress: () => void;
}) {
  const typeLabel = VEHICLE_TYPE_LABELS[item.vehicleType] ?? item.vehicleType;
  const fuelLabel = FUEL_TYPE_LABELS[item.fuelType] ?? item.fuelType;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.make} ${item.model}${item.isPrimary ? ", primary vehicle" : ""}, ${typeLabel}, ${fuelLabel}${item.year ? `, ${item.year}` : ""}${item.dvlaPlateProblem ? ", number plate needs checking" : ""}. Tap to edit.`}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons name="car-outline" size={22} color={AMBER} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.make} {item.model}
          </Text>
          {item.isPrimary && (
            <View style={styles.primaryBadge}>
              <Text style={styles.primaryBadgeText}>Primary</Text>
            </View>
          )}
        </View>
        <View style={styles.cardMeta}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
          <Text style={styles.metaText}>{fuelLabel}</Text>
          {item.year && <Text style={styles.metaText}>{item.year}</Text>}
          {item.dvlaPlateProblem && (
            <View style={[styles.cazChip, styles.cazChipWarn]}>
              <Ionicons name="alert-circle" size={10} color="#f59e0b" accessible={false} />
              <Text style={[styles.cazChipText, { color: "#f59e0b" }]}>Check plate</Text>
            </View>
          )}
          {item.cleanAirZones && item.cleanAirZones.verdict !== "unknown" && (
            <View
              style={[
                styles.cazChip,
                item.cleanAirZones.verdict === "compliant"
                  ? styles.cazChipOk
                  : styles.cazChipWarn,
              ]}
            >
              <Ionicons
                name={item.cleanAirZones.verdict === "compliant" ? "leaf" : "alert-circle"}
                size={10}
                color={item.cleanAirZones.verdict === "compliant" ? "#10b981" : "#f59e0b"}
                accessible={false}
              />
              <Text
                style={[
                  styles.cazChipText,
                  { color: item.cleanAirZones.verdict === "compliant" ? "#10b981" : "#f59e0b" },
                ]}
              >
                {item.cleanAirZones.verdict === "compliant" ? "ULEZ ready" : "May be charged"}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={TEXT_3} accessible={false} />
    </TouchableOpacity>
  );
}

export default function VehiclesScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [vehicles, setVehicles] = useState<VehicleWithCaz[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadVehicles = useCallback(async () => {
    try {
      const res = await fetchVehicles();
      setVehicles(res.data);
    } catch {
      // Request failed — keep whatever list we already had rather than
      // clearing it out from under the user.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadVehicles();
  }, [loadVehicles]);

  const handleAdd = useCallback(() => {
    router.push("/vehicle-form");
  }, [router]);

  const isPremium = user?.isPremium ?? false;
  const atFreeLimit = !isPremium && vehicles.length >= MAX_FREE_VEHICLES;

  const renderItem = ({ item }: { item: VehicleWithCaz }) => (
    <VehicleCard item={item} onPress={() => router.push(`/vehicle-form?id=${item.id}`)} />
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Vehicles" }} />
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="car-outline"
              title="Add your first vehicle"
              description="MileClear uses your vehicle's type and fuel to work out running costs, MPG, and Clean Air Zone charges."
              action={<Button title="Add Vehicle" icon="add" onPress={handleAdd} />}
            />
          ) : null
        }
        ListFooterComponent={
          vehicles.length > 0 ? (
            <View style={styles.footer}>
              {atFreeLimit ? (
                <TouchableOpacity
                  style={styles.lockedAddBtn}
                  onPress={handleAdd}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add vehicle — upgrade to Pro for unlimited vehicles"
                >
                  <View style={styles.lockedAddBtnRow}>
                    <Ionicons name="lock-closed" size={18} color={TEXT_2} />
                    <Text style={styles.lockedAddBtnText}>Add Vehicle</Text>
                  </View>
                  <Text style={styles.lockedAddBtnSubtitle}>
                    Free accounts get 1 vehicle. Upgrade to Pro for unlimited vehicles.
                  </Text>
                </TouchableOpacity>
              ) : (
                <Button title="Add Vehicle" icon="add" onPress={handleAdd} />
              )}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  // Card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 12,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  cardName: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: "#fff",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.amberDim,
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  metaText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  cazChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  cazChipOk: { backgroundColor: "rgba(16,185,129,0.12)" },
  cazChipWarn: { backgroundColor: "rgba(245,158,11,0.12)" },
  cazChipText: { fontSize: 11, fontFamily: fonts.semibold },
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
  // Footer
  footer: {
    marginTop: 8,
    paddingBottom: 20,
  },
  // Locked add button
  lockedAddBtn: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 6,
  },
  lockedAddBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lockedAddBtnText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  lockedAddBtnSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textAlign: "center",
  },
});
