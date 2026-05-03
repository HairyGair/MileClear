import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../../components/Button";
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
import { getLocalEarnings, getLocalUnsyncedEarnings } from "../../lib/db/queries";
import { GIG_PLATFORMS, formatPence } from "@mileclear/shared";
import type { Earning } from "@mileclear/shared";
import { Skeleton } from "../../components/Skeleton";
import { colors, fonts } from "../../lib/theme";

type EarningItem = Earning & { _isLocal?: boolean };

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
  const [earnings, setEarnings] = useState<EarningItem[]>([]);
  const [platformFilter, setPlatformFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPence, setTotalPence] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const loadEarnings = useCallback(
    async (pageNum: number, append = false) => {
      try {
        const res = await fetchEarnings({
          platform: platformFilter,
          page: pageNum,
          pageSize: 20,
        });
        setIsOffline(false);
        if (append) {
          setEarnings((prev) => [...prev, ...res.data]);
        } else {
          // Merge unsynced local items on first page
          const unsynced = await getLocalUnsyncedEarnings({ platform: platformFilter });
          const apiIds = new Set(res.data.map((e) => e.id));
          const uniqueLocal = unsynced.filter((e) => !apiIds.has(e.id)) as EarningItem[];
          setEarnings([...uniqueLocal, ...res.data]);
        }
        setPage(res.page);
        setTotalPages(res.totalPages);
        // Use server-side total across all pages
        const resAny = res as any;
        if (resAny.totalAmountPence != null) {
          setTotalPence(resAny.totalAmountPence);
        }
      } catch {
        // Offline fallback — show all local data
        if (!append) {
          const local = await getLocalEarnings({ platform: platformFilter }) as EarningItem[];
          setEarnings(local);
          setIsOffline(true);
          setTotalPages(1);
          setTotalPence(local.reduce((acc, e) => acc + e.amountPence, 0));
        }
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

  const onEndReachedSafe = useCallback(() => {
    if (isOffline) return;
    onEndReached();
  }, [isOffline, onEndReached]);

  const renderEarning = ({ item }: { item: EarningItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/earning-form?id=${item.id}`)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${PLATFORM_LABELS[item.platform] ?? item.platform} earning, ${formatPence(item.amountPence)}, ${formatDate(item.periodStart)} to ${formatDate(item.periodEnd)}, source: ${SOURCE_LABELS[item.source] ?? item.source}. Tap to edit.`}
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

      <View style={styles.cardFooterRow}>
        <Text style={styles.periodText}>
          {formatDate(item.periodStart)} — {formatDate(item.periodEnd)}
        </Text>
        {item._isLocal && (
          <Text style={styles.syncBadge}>Pending sync</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={earnings}
        keyExtractor={(item) => item.id}
        renderItem={renderEarning}
        onEndReached={onEndReachedSafe}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={AMBER}
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
                accessibilityRole="button"
                accessibilityLabel="All platforms"
                accessibilityState={{ selected: !platformFilter }}
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
                  accessibilityRole="button"
                  accessibilityLabel={p.label}
                  accessibilityState={{ selected: platformFilter === p.value }}
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
            <View
              style={styles.emptyState}
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
            >
              <View style={styles.emptyIcon}>
                <Ionicons name="cash-outline" size={40} color={TEXT_3} accessible={false} />
              </View>
              <Text style={styles.emptyTitle}>No earnings recorded yet</Text>
              <Text style={styles.emptyText}>
                Tap + at the top right to add your first earning.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {loadingMore && (
              <ActivityIndicator
                color={AMBER}
                style={{ marginBottom: 12 }}
              />
            )}
            <Button
              title="Add Earning"
              icon="add"
              onPress={() => router.push("/earning-form")}
            />
            <Button
              variant="secondary"
              title="Import CSV"
              icon="document-text-outline"
              onPress={() => router.push("/csv-import")}
              style={{ marginTop: 10 }}
            />
            <Button
              variant="secondary"
              title="Connect Bank"
              icon="business-outline"
              onPress={() => router.push("/open-banking")}
              style={{ marginTop: 10 }}
            />
          </View>
        }
      />
      {loading && !refreshing && (
        // Skeleton ghost-rows mirroring the earning-card row shape. Same
        // pattern as the trips/fuel screens.
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingSkeletonStack}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonCard}>
                <View style={styles.skeletonHeaderRow}>
                  <Skeleton width={120} height={14} radius={6} />
                  <Skeleton width={50} height={12} radius={6} />
                </View>
                <Skeleton width={140} height={22} radius={6} style={{ marginTop: 8 }} />
                <Skeleton width={180} height={12} radius={6} style={{ marginTop: 10 }} />
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const BG = colors.bg;
const CARD_BG = colors.surface;
const CARD_BORDER = colors.surfaceBorder;
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const GREEN = colors.green;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  listContent: {
    padding: 16,
  },
  // Summary card
  summaryCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: GREEN,
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
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  filterChipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  filterChipTextActive: {
    fontFamily: fonts.semibold,
    color: BG,
  },
  // Earning cards
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  platformText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  sourceBadge: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: TEXT_2,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  amountText: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: GREEN,
    marginBottom: 6,
  },
  periodText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  cardFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  syncBadge: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: BG,
    backgroundColor: AMBER,
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
    fontFamily: fonts.semibold,
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
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_3,
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
    backgroundColor: BG,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingSkeletonStack: {
    gap: 10,
  },
  skeletonCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  skeletonHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
