import { useCallback, useState } from "react";
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
import { fetchTrips, TripWithVehicle } from "../../lib/api/trips";
import { GIG_PLATFORMS } from "@mileclear/shared";
import type { TripClassification } from "@mileclear/shared";

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
  const [trips, setTrips] = useState<TripWithVehicle[]>([]);
  const [filter, setFilter] = useState<TripClassification | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadTrips = useCallback(
    async (pageNum: number, append = false) => {
      try {
        const res = await fetchTrips({
          classification: filter,
          page: pageNum,
          pageSize: 20,
        });
        if (append) {
          setTrips((prev) => [...prev, ...res.data]);
        } else {
          setTrips(res.data);
        }
        setPage(res.page);
        setTotalPages(res.totalPages);
      } catch {
        // Silently fail — will show empty state
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

  const renderTrip = ({ item }: { item: TripWithVehicle }) => (
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
        onEndReached={onEndReached}
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
              <Text style={styles.emptyTitle}>No trips yet</Text>
              <Text style={styles.emptyText}>
                Add a trip manually or start a shift to track automatically
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
              onPress={() => router.push("/trip-form")}
              activeOpacity={0.7}
            >
              <Text style={styles.addButtonText}>+ Add Trip</Text>
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
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9ca3af",
  },
  filterChipTextActive: {
    color: "#030712",
  },
  // Trip cards
  tripCard: {
    backgroundColor: "#111827",
    borderRadius: 12,
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
    fontWeight: "600",
    color: "#fff",
  },
  classificationBadge: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  businessBadge: {
    color: "#030712",
    backgroundColor: "#f59e0b",
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
    fontWeight: "700",
    color: "#fff",
  },
  timeText: {
    fontSize: 13,
    color: "#9ca3af",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  addressText: {
    fontSize: 13,
    color: "#9ca3af",
    flexShrink: 1,
  },
  arrowText: {
    fontSize: 13,
    color: "#6b7280",
  },
  tripMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  platformBadge: {
    fontSize: 11,
    color: "#d1d5db",
    backgroundColor: "#1f2937",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  metaText: {
    fontSize: 12,
    color: "#6b7280",
  },
  manualBadge: {
    fontSize: 11,
    color: "#9ca3af",
    backgroundColor: "#1f2937",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
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
    fontWeight: "700",
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
