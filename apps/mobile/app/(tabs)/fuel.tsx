import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { fetchFuelLogs } from "../../lib/api/fuel";
import { getLocalFuelLogs, getLocalUnsyncedFuelLogs } from "../../lib/db/queries";
import NearbyPrices from "../../components/fuel/NearbyPrices";
import { FUEL_BRANDS, formatPence } from "@mileclear/shared";
import type { FuelLogWithVehicle } from "@mileclear/shared";

type FuelLogItem = FuelLogWithVehicle & { _isLocal?: boolean };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPpl(costPence: number, litres: number): string {
  if (litres <= 0) return "—";
  return (costPence / litres).toFixed(1) + "p/L";
}

export default function FuelScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<FuelLogItem[]>([]);
  const [stationFilter, setStationFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSpendPence, setTotalSpendPence] = useState(0);
  const [totalLitres, setTotalLitres] = useState(0);
  const [totalCostPenceForAvg, setTotalCostPenceForAvg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const loadLogs = useCallback(
    async (pageNum: number, append = false) => {
      try {
        const res = await fetchFuelLogs({ page: pageNum, pageSize: 20 });
        setIsOffline(false);
        let filtered = res.data as FuelLogItem[];
        if (stationFilter) {
          filtered = filtered.filter(
            (l) => l.stationName?.toLowerCase() === stationFilter.toLowerCase()
          );
        }
        if (append) {
          setLogs((prev) => [...prev, ...filtered]);
        } else {
          // Merge unsynced local items on first page
          const unsynced = await getLocalUnsyncedFuelLogs();
          const apiIds = new Set(res.data.map((l) => l.id));
          let uniqueLocal = unsynced.filter((l) => !apiIds.has(l.id)) as FuelLogItem[];
          if (stationFilter) {
            uniqueLocal = uniqueLocal.filter(
              (l) => l.stationName?.toLowerCase() === stationFilter.toLowerCase()
            );
          }
          setLogs([...uniqueLocal, ...filtered]);
        }
        setPage(res.page);
        setTotalPages(res.totalPages);
        // Compute summary from all returned data (not filtered)
        if (!append) {
          const spend = res.data.reduce((acc, l) => acc + l.costPence, 0);
          const litres = res.data.reduce((acc, l) => acc + l.litres, 0);
          setTotalSpendPence(spend);
          setTotalLitres(litres);
          setTotalCostPenceForAvg(spend);
        } else {
          setTotalSpendPence((prev) =>
            prev + res.data.reduce((acc, l) => acc + l.costPence, 0)
          );
          const newLitres = res.data.reduce((acc, l) => acc + l.litres, 0);
          setTotalLitres((prev) => prev + newLitres);
          setTotalCostPenceForAvg((prev) =>
            prev + res.data.reduce((acc, l) => acc + l.costPence, 0)
          );
        }
      } catch {
        // Offline fallback — show all local data
        if (!append) {
          let local = await getLocalFuelLogs() as FuelLogItem[];
          if (stationFilter) {
            local = local.filter(
              (l) => l.stationName?.toLowerCase() === stationFilter.toLowerCase()
            );
          }
          setLogs(local);
          setIsOffline(true);
          setTotalPages(1);
          const spend = local.reduce((acc, l) => acc + l.costPence, 0);
          const litres = local.reduce((acc, l) => acc + l.litres, 0);
          setTotalSpendPence(spend);
          setTotalLitres(litres);
          setTotalCostPenceForAvg(spend);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [stationFilter]
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadLogs(1);
    }, [loadLogs])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLogs(1);
  }, [loadLogs]);

  const onEndReached = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    loadLogs(page + 1, true);
  }, [loadingMore, page, totalPages, loadLogs]);

  const handleFilterChange = useCallback((value: string | undefined) => {
    setStationFilter(value);
    setLoading(true);
  }, []);

  const avgPpl =
    totalLitres > 0 ? (totalCostPenceForAvg / totalLitres).toFixed(1) : "—";

  const onEndReachedSafe = useCallback(() => {
    if (isOffline) return;
    onEndReached();
  }, [isOffline, onEndReached]);

  const renderLog = ({ item }: { item: FuelLogItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/fuel-form?id=${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.stationText}>
          {item.stationName ?? "Unknown Station"}
        </Text>
        {item.vehicle && (
          <Text style={styles.vehicleBadge}>
            {item.vehicle.make} {item.vehicle.model}
          </Text>
        )}
      </View>

      <Text style={styles.costText}>{formatPence(item.costPence)}</Text>

      <View style={styles.cardFooter}>
        <Text style={styles.detailText}>
          {item.litres.toFixed(1)}L · {formatPpl(item.costPence, item.litres)}
        </Text>
        <View style={styles.footerRight}>
          {item._isLocal && (
            <Text style={styles.syncBadge}>Pending sync</Text>
          )}
          <Text style={styles.dateText}>{formatDate(item.loggedAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderLog}
        onEndReached={onEndReachedSafe}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#f59e0b"
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {isOffline && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  Offline — showing local data
                </Text>
              </View>
            )}
            {/* Summary card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Spend</Text>
                  <Text style={styles.summaryAmount}>
                    {formatPence(totalSpendPence)}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Avg Cost</Text>
                  <Text style={styles.summaryAvg}>
                    {avgPpl === "—" ? "—" : `${avgPpl}p/L`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Nearby community fuel prices */}
            <NearbyPrices />

            {/* Station brand filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  !stationFilter && styles.filterChipActive,
                ]}
                onPress={() => handleFilterChange(undefined)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    !stationFilter && styles.filterChipTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {FUEL_BRANDS.map((brand) => (
                <TouchableOpacity
                  key={brand}
                  style={[
                    styles.filterChip,
                    stationFilter === brand && styles.filterChipActive,
                  ]}
                  onPress={() => handleFilterChange(brand)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      stationFilter === brand && styles.filterChipTextActive,
                    ]}
                  >
                    {brand}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No fuel logs yet</Text>
              <Text style={styles.emptyText}>
                Tap the button below to log your first fill-up
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {loadingMore && (
              <ActivityIndicator
                color="#f59e0b"
                style={{ marginBottom: 12 }}
              />
            )}
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push("/fuel-form")}
              activeOpacity={0.7}
            >
              <Text style={styles.addButtonText}>+ Add Fuel Log</Text>
            </TouchableOpacity>
          </View>
        }
      />
      {loading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#f59e0b" />
        </View>
      )}
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
  // Summary card
  summaryCard: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#10b981",
  },
  summaryAvg: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f59e0b",
  },
  // Filter chips
  filterRow: {
    gap: 8,
    marginBottom: 16,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  filterChipActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  filterChipTextActive: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  // Log cards
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stationText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
  },
  vehicleBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#d1d5db",
    backgroundColor: "#1f2937",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  costText: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#10b981",
    marginBottom: 6,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  dateText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
    backgroundColor: "#f59e0b",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  offlineBanner: {
    backgroundColor: "#92400e",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: "center",
  },
  offlineBannerText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fef3c7",
  },
  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
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
    textAlign: "center",
  },
  // Footer
  footer: {
    marginTop: 16,
    paddingBottom: 20,
  },
  addButton: {
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(3, 7, 18, 0.7)",
  },
});
