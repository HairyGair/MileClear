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
import { fetchEarnings } from "../../lib/api/earnings";
import { GIG_PLATFORMS, formatPence } from "@mileclear/shared";
import type { Earning } from "@mileclear/shared";

const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  csv: "CSV",
  open_banking: "Open Banking",
  ocr: "OCR",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function EarningsScreen() {
  const router = useRouter();
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [platformFilter, setPlatformFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPence, setTotalPence] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadEarnings = useCallback(
    async (pageNum: number, append = false) => {
      try {
        const res = await fetchEarnings({
          platform: platformFilter,
          page: pageNum,
          pageSize: 20,
        });
        if (append) {
          setEarnings((prev) => [...prev, ...res.data]);
        } else {
          setEarnings(res.data);
        }
        setPage(res.page);
        setTotalPages(res.totalPages);
        // Use server-side total across all pages
        const resAny = res as any;
        if (resAny.totalAmountPence != null) {
          setTotalPence(resAny.totalAmountPence);
        }
      } catch {
        // Silently fail — will show empty state
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [platformFilter]
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadEarnings(1);
    }, [loadEarnings])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadEarnings(1);
  }, [loadEarnings]);

  const onEndReached = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    loadEarnings(page + 1, true);
  }, [loadingMore, page, totalPages, loadEarnings]);

  const handleFilterChange = useCallback(
    (value: string | undefined) => {
      setPlatformFilter(value);
      setLoading(true);
    },
    []
  );

  const renderEarning = ({ item }: { item: Earning }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/earning-form?id=${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.platformText}>
          {PLATFORM_LABELS[item.platform] ?? item.platform}
        </Text>
        <Text style={styles.sourceBadge}>
          {SOURCE_LABELS[item.source] ?? item.source}
        </Text>
      </View>

      <Text style={styles.amountText}>{formatPence(item.amountPence)}</Text>

      <Text style={styles.periodText}>
        {formatDate(item.periodStart)} — {formatDate(item.periodEnd)}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={earnings}
        keyExtractor={(item) => item.id}
        renderItem={renderEarning}
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
            {/* Total summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Earnings</Text>
              <Text style={styles.summaryAmount}>{formatPence(totalPence)}</Text>
            </View>

            {/* Platform filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  !platformFilter && styles.filterChipActive,
                ]}
                onPress={() => handleFilterChange(undefined)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    !platformFilter && styles.filterChipTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {GIG_PLATFORMS.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    styles.filterChip,
                    platformFilter === p.value && styles.filterChipActive,
                  ]}
                  onPress={() => handleFilterChange(p.value)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      platformFilter === p.value && styles.filterChipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No earnings recorded yet</Text>
              <Text style={styles.emptyText}>
                Tap the button below to add your first earning
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
              onPress={() => router.push("/earning-form")}
              activeOpacity={0.7}
            >
              <Text style={styles.addButtonText}>+ Add Earning</Text>
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
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: "#10b981",
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
    fontWeight: "600",
    color: "#9ca3af",
  },
  filterChipTextActive: {
    color: "#030712",
  },
  // Earning cards
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
  platformText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  sourceBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#d1d5db",
    backgroundColor: "#1f2937",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  amountText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#10b981",
    marginBottom: 6,
  },
  periodText: {
    fontSize: 13,
    color: "#9ca3af",
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
