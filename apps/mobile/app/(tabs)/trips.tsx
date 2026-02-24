import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Button } from "../../components/Button";
import { fetchTrips, TripWithVehicle } from "../../lib/api/trips";
import { getLocalTrips, getLocalUnsyncedTrips } from "../../lib/db/queries";
import { GIG_PLATFORMS } from "@mileclear/shared";
import type { TripClassification } from "@mileclear/shared";

type TripItem = TripWithVehicle & { _isLocal?: boolean };

const FILTERS: { label: string; value: TripClassification | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Business", value: "business" },
  { label: "Personal", value: "personal" },
];

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function TripsScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [filter, setFilter] = useState<TripClassification | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const loadTrips = useCallback(
    async (pageNum: number, append = false) => {
      try {
        const res = await fetchTrips({
          classification: filter,
          page: pageNum,
          pageSize: 20,
        });
        setIsOffline(false);

        if (append) {
          setTrips((prev) => [...prev, ...res.data]);
        } else {
          // Merge unsynced local items on first page
          const unsynced = await getLocalUnsyncedTrips({ classification: filter });
          const apiIds = new Set(res.data.map((t) => t.id));
          const uniqueLocal = unsynced.filter((t) => !apiIds.has(t.id)) as TripItem[];
          setTrips([...uniqueLocal, ...res.data]);
        }
        setPage(res.page);
        setTotalPages(res.totalPages);
      } catch {
        // Offline fallback — show all local data
        if (!append) {
          const local = await getLocalTrips({ classification: filter });
          setTrips(local as TripItem[]);
          setIsOffline(true);
          setTotalPages(1);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filter]
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTrips(1);
    }, [loadTrips])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTrips(1);
  }, [loadTrips]);

  const onEndReached = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    loadTrips(page + 1, true);
  }, [loadingMore, page, totalPages, loadTrips]);

  const handleFilterChange = useCallback(
    (value: TripClassification | undefined) => {
      setFilter(value);
      setLoading(true);
    },
    []
  );

  const onEndReachedSafe = useCallback(() => {
    if (isOffline) return;
    onEndReached();
  }, [isOffline, onEndReached]);

  const renderTrip = ({ item }: { item: TripItem }) => (
    <TouchableOpacity
      style={styles.tripCard}
      onPress={() => router.push(`/trip-form?id=${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.tripHeader}>
        <Text style={styles.tripDate}>{formatDate(item.startedAt)}</Text>
        <Text
          style={[
            styles.classificationBadge,
            item.classification === "business"
              ? styles.businessBadge
              : styles.personalBadge,
          ]}
        >
          {item.classification === "business" ? "Business" : "Personal"}
        </Text>
      </View>

      <View style={styles.tripDetails}>
        <Text style={styles.distanceText}>
          {item.distanceMiles.toFixed(1)} mi
        </Text>
        <Text style={styles.timeText}>
          {formatTime(item.startedAt)}
          {item.endedAt ? ` — ${formatTime(item.endedAt)}` : ""}
        </Text>
      </View>

      {(item.startAddress || item.endAddress) && (
        <View style={styles.addressRow}>
          {item.startAddress && (
            <Text style={styles.addressText} numberOfLines={1}>
              {item.startAddress}
            </Text>
          )}
          {item.startAddress && item.endAddress && (
            <Text style={styles.arrowText}> → </Text>
          )}
          {item.endAddress && (
            <Text style={styles.addressText} numberOfLines={1}>
              {item.endAddress}
            </Text>
          )}
        </View>
      )}

      <View style={styles.tripMeta}>
        {item._isLocal && (
          <Text style={styles.syncBadge}>Pending sync</Text>
        )}
        {item.platformTag && (
          <Text style={styles.platformBadge}>
            {PLATFORM_LABELS[item.platformTag] ?? item.platformTag}
          </Text>
        )}
        {item.vehicle && (
          <Text style={styles.metaText}>
            {item.vehicle.make} {item.vehicle.model}
          </Text>
        )}
        {item.isManualEntry && (
          <Text style={styles.manualBadge}>Manual</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={renderTrip}
        onEndReached={onEndReachedSafe}
        onEndReachedThreshold={0.3}
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
            {isOffline && (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineBannerText}>
                  Offline — showing local data
                </Text>
              </View>
            )}
            <View style={styles.filterRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.label}
                  style={[
                    styles.filterChip,
                    filter === f.value && styles.filterChipActive,
                  ]}
                  onPress={() => handleFilterChange(f.value)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filter === f.value && styles.filterChipTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="car-outline" size={40} color="#4a5568" />
              </View>
              <Text style={styles.emptyTitle}>No trips recorded yet</Text>
              <Text style={styles.emptyText}>
                Tap the button below to add your first trip
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {loadingMore && (
              <ActivityIndicator
                color="#f5a623"
                style={{ marginBottom: 12 }}
              />
            )}
            <Button
              title="Add Trip"
              icon="add"
              onPress={() => router.push("/trip-form")}
            />
          </View>
        }
      />
      {loading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#f5a623" />
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
  // Filter chips
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
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
    backgroundColor: "#f5a623",
    borderColor: "#f5a623",
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
  // Trip cards
  tripCard: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    padding: 16,
    marginBottom: 10,
  },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  tripDate: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
  },
  classificationBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  businessBadge: {
    color: "#030712",
    backgroundColor: "#f5a623",
  },
  personalBadge: {
    color: "#d1d5db",
    backgroundColor: "#374151",
  },
  tripDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  distanceText: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
  },
  timeText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  addressText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    flexShrink: 1,
  },
  arrowText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  tripMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  platformBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#d1d5db",
    backgroundColor: "#1f2937",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  metaText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#6b7280",
  },
  manualBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#9ca3af",
    backgroundColor: "#1f2937",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  syncBadge: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
    backgroundColor: "#f5a623",
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
    textAlign: "center",
  },
  // Footer
  footer: {
    marginTop: 16,
    paddingBottom: 20,
  },
  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(3, 7, 18, 0.7)",
  },
});
