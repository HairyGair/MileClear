import { useCallback, useState, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Button } from "../../components/Button";
import { fetchTrips, fetchUnclassifiedCount, fetchClassificationSuggestion, mergeTrips, TripWithVehicle, ClassificationSuggestion } from "../../lib/api/trips";
import { syncUpdateTrip, syncDeleteTrip } from "../../lib/sync/actions";
import { markLiveActivityClassified } from "../../lib/liveActivity";
import { getLocalTrips, getLocalUnsyncedTrips } from "../../lib/db/queries";
import { learnFromClassification } from "../../lib/classification";
import { maybeRequestReview } from "../../lib/rating/index";
import { GIG_PLATFORMS } from "@mileclear/shared";
import type { TripClassification, PlatformTag, BusinessPurpose } from "@mileclear/shared";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type TripItem = TripWithVehicle & { _isLocal?: boolean };

// ─── Route grouping ──────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ROUTE_GROUP_RADIUS_M = 300;

export interface RouteGroup {
  /** Stable key derived from the representative trip id. */
  key: string;
  trips: TripItem[];
  /** Representative start/end coords (from first trip in group). */
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** Display label: "Start address → End address" using the first trip that has addresses. */
  routeLabel: string;
  totalDistanceMiles: number;
}

/**
 * Groups an array of unclassified trips by route similarity.
 * Two trips share a route when start coords are within 300 m of each other
 * AND end coords are within 300 m of each other.
 * Trips without end coordinates are placed into their own singleton groups.
 */
function groupUnclassifiedTrips(trips: TripItem[]): RouteGroup[] {
  const groups: RouteGroup[] = [];

  for (const trip of trips) {
    const { startLat, startLng, endLat, endLng } = trip;

    // Trips with no end coordinates cannot be grouped — they get their own group.
    if (endLat == null || endLng == null) {
      groups.push({
        key: trip.id,
        trips: [trip],
        startLat,
        startLng,
        endLat: startLat,
        endLng: startLng,
        routeLabel: trip.startAddress ?? "Unknown start",
        totalDistanceMiles: trip.distanceMiles,
      });
      continue;
    }

    // Try to find an existing group whose representative coords match.
    let matched = false;
    for (const group of groups) {
      // Skip singleton groups created for trips without end coordinates —
      // these can only match themselves.
      if (group.trips.length === 1 && group.trips[0].endLat == null) {
        continue;
      }
      const startDist = haversineMeters(startLat, startLng, group.startLat, group.startLng);
      const endDist = haversineMeters(endLat, endLng, group.endLat, group.endLng);
      if (startDist <= ROUTE_GROUP_RADIUS_M && endDist <= ROUTE_GROUP_RADIUS_M) {
        group.trips.push(trip);
        group.totalDistanceMiles += trip.distanceMiles;
        // If this trip has better address info, upgrade the label.
        if (!group.routeLabel.includes("→") && trip.startAddress && trip.endAddress) {
          group.routeLabel = `${trip.startAddress} → ${trip.endAddress}`;
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      const startLabel = trip.startAddress ?? `${startLat.toFixed(3)}, ${startLng.toFixed(3)}`;
      const endLabel = trip.endAddress ?? `${endLat.toFixed(3)}, ${endLng.toFixed(3)}`;
      groups.push({
        key: trip.id,
        trips: [trip],
        startLat,
        startLng,
        endLat,
        endLng,
        routeLabel: `${startLabel} → ${endLabel}`,
        totalDistanceMiles: trip.distanceMiles,
      });
    }
  }

  // Sort groups: largest trip count first, then most recent trip first.
  groups.sort((a, b) => {
    if (b.trips.length !== a.trips.length) return b.trips.length - a.trips.length;
    const aLatest = Math.max(...a.trips.map((t) => new Date(t.startedAt).getTime()));
    const bLatest = Math.max(...b.trips.map((t) => new Date(t.startedAt).getTime()));
    return bLatest - aLatest;
  });

  return groups;
}

const FILTERS: { label: string; value: TripClassification | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Inbox", value: "unclassified" },
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
  const [filter, setFilter] = useState<TripClassification | "all">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, ClassificationSuggestion>>({});

  // Merge mode state
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeModalVisible, setMergeModalVisible] = useState(false);
  const [mergeClassification, setMergeClassification] = useState<TripClassification>("business");
  const [mergePlatform, setMergePlatform] = useState<string | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);

  // Route grouping state (inbox view)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [batchClassifyingKey, setBatchClassifyingKey] = useState<string | null>(null);

  const loadUnclassifiedCount = useCallback(async () => {
    try {
      const res = await fetchUnclassifiedCount();
      setUnclassifiedCount(res.count);
    } catch {
      // Ignore — badge just won't show
    }
  }, []);

  // Fetch classification suggestions for unclassified trips
  const loadSuggestions = useCallback(async (tripList: TripItem[]) => {
    const unclassified = tripList.filter(
      (t) => t.classification === "unclassified" && t.endLat && t.endLng
    );
    if (unclassified.length === 0) return;

    // Fetch suggestions in parallel (max 10 to avoid flooding)
    const toFetch = unclassified.slice(0, 10);
    const results = await Promise.allSettled(
      toFetch.map((t) =>
        fetchClassificationSuggestion(t.endLat!, t.endLng!, "end").then((res) => ({
          tripId: t.id,
          suggestion: res.suggestion,
        }))
      )
    );

    const newSuggestions: Record<string, ClassificationSuggestion> = {};
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.suggestion) {
        newSuggestions[result.value.tripId] = result.value.suggestion;
      }
    }
    if (Object.keys(newSuggestions).length > 0) {
      setSuggestions((prev) => ({ ...prev, ...newSuggestions }));
    }
  }, []);

  // Use a ref to track current filter so loadTrips always reads the latest
  // value without needing filter as a dependency (which causes effect churn).
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const loadTrips = useCallback(
    async (pageNum: number, append = false) => {
      try {
        const classification = filterRef.current === "all" ? undefined : filterRef.current;
        const res = await fetchTrips({
          classification,
          page: pageNum,
          pageSize: 20,
        });
        setIsOffline(false);

        if (append) {
          setTrips((prev) => [...prev, ...res.data]);
        } else {
          // Merge unsynced local items on first page
          const unsynced = await getLocalUnsyncedTrips({ classification });
          const apiIds = new Set(res.data.map((t) => t.id));
          const uniqueLocal = unsynced.filter((t) => !apiIds.has(t.id)) as TripItem[];
          const allTrips = [...uniqueLocal, ...res.data];
          setTrips(allTrips);

          // Fetch smart suggestions for unclassified trips (non-blocking)
          loadSuggestions(allTrips).catch(() => {});
        }
        setPage(res.page);
        setTotalPages(res.totalPages);
      } catch {
        // Offline fallback — show all local data
        if (!append) {
          const classification = filterRef.current === "all" ? undefined : filterRef.current;
          const local = await getLocalTrips({ classification });
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
    [loadSuggestions]
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTrips(1);
      loadUnclassifiedCount();
    }, [loadTrips, loadUnclassifiedCount])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTrips(1);
    loadUnclassifiedCount();
  }, [loadTrips, loadUnclassifiedCount]);

  const onEndReached = useCallback(() => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    loadTrips(page + 1, true);
  }, [loadingMore, page, totalPages, loadTrips]);

  const handleFilterChange = useCallback(
    (value: TripClassification | "all") => {
      setFilter(value);
      filterRef.current = value; // Sync ref immediately so loadTrips reads the new value
      setTrips([]); // Clear stale data immediately
      setLoading(true);
      // Directly reload - don't wait for useFocusEffect dependency chain
      // which causes a render gap where stale data can flash.
      loadTrips(1);
      loadUnclassifiedCount();
    },
    [loadTrips, loadUnclassifiedCount]
  );

  const onEndReachedSafe = useCallback(() => {
    if (isOffline) return;
    onEndReached();
  }, [isOffline, onEndReached]);

  // Quick classify a trip directly from the list
  const handleQuickClassify = useCallback(
    async (tripId: string, classification: "business" | "personal") => {
      setClassifyingId(tripId);
      try {
        await syncUpdateTrip(tripId, { classification });
        // Clear "Classify Trip" CTA from any running Live Activity
        markLiveActivityClassified().catch(() => {});
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setTrips((prev) => prev.map((t) =>
          t.id === tripId ? { ...t, classification } : t
        ));
        setUnclassifiedCount((prev) => Math.max(0, prev - 1));

        // If viewing inbox and trip is now classified, remove it from view
        if (filter === "unclassified") {
          setTrips((prev) => prev.filter((t) => t.id !== tripId));
        }

        // Classifying a trip is peak "this app works" moment
        setTimeout(() => maybeRequestReview("trip_classified"), 2000);
      } catch {
        // Failed — trip stays, user can retry
      } finally {
        setClassifyingId(null);
      }
    },
    [filter]
  );

  const handleDeleteTrip = useCallback(
    (tripId: string) => {
      Alert.alert("Delete trip?", "This will permanently remove this trip.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await syncDeleteTrip(tripId);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setTrips((prev) => prev.filter((t) => t.id !== tripId));
              if (filter === "unclassified") {
                setUnclassifiedCount((prev) => Math.max(0, prev - 1));
              }
            } catch {
              Alert.alert("Error", "Failed to delete trip. Please try again.");
            }
          },
        },
      ]);
    },
    [filter]
  );

  const handleLongPress = useCallback(
    (item: TripItem) => {
      if (mergeMode || item._isLocal) return;
      Alert.alert(
        "",
        "",
        [
          {
            text: "Delete Trip",
            style: "destructive",
            onPress: () => handleDeleteTrip(item.id),
          },
          {
            text: "Merge Trips",
            onPress: () => {
              setMergeMode(true);
              setSelectedIds(new Set([item.id]));
            },
          },
          { text: "Cancel", style: "cancel" },
        ]
      );
    },
    [mergeMode, handleDeleteTrip]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitMergeMode = useCallback(() => {
    setMergeMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleMerge = useCallback(async () => {
    if (selectedIds.size < 2) return;
    setMergeLoading(true);
    try {
      // Sort selected trips by startedAt to ensure correct order
      const selectedTrips = trips
        .filter((t) => selectedIds.has(t.id))
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

      await mergeTrips({
        tripIds: selectedTrips.map((t) => t.id),
        classification: mergeClassification,
        platformTag: (mergePlatform as PlatformTag) || null,
      });

      setMergeModalVisible(false);
      exitMergeMode();
      setMergeClassification("business");
      setMergePlatform(null);

      // Refresh
      setLoading(true);
      loadTrips(1);
      loadUnclassifiedCount();
    } catch (err: any) {
      Alert.alert("Merge Failed", err.message || "Something went wrong merging your trips.");
    } finally {
      setMergeLoading(false);
    }
  }, [selectedIds, trips, mergeClassification, mergePlatform, exitMergeMode, loadTrips, loadUnclassifiedCount]);

  const toggleGroupExpanded = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleBatchClassify = useCallback(
    async (group: RouteGroup, classification: "business" | "personal") => {
      setBatchClassifyingKey(group.key);
      try {
        // Classify all trips in the group.
        await Promise.all(
          group.trips.map((t) => syncUpdateTrip(t.id, { classification }))
        );
        // Clear "Classify Trip" CTA from any running Live Activity
        markLiveActivityClassified().catch(() => {});

        // Learn from the representative trip (first in group that has end coords).
        const representative = group.trips.find((t) => t.endLat != null && t.endLng != null);
        if (representative && representative.endLat != null && representative.endLng != null) {
          await learnFromClassification({
            startLat: representative.startLat,
            startLng: representative.startLng,
            endLat: representative.endLat,
            endLng: representative.endLng,
            classification,
            platformTag: representative.platformTag ?? null,
          }).catch(() => {
            // Non-fatal: learning failure doesn't block classification.
          });
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const classifiedIds = new Set(group.trips.map((t) => t.id));
        setTrips((prev) => prev.filter((t) => !classifiedIds.has(t.id)));
        setUnclassifiedCount((prev) => Math.max(0, prev - group.trips.length));
        setExpandedGroups((prev) => {
          const next = new Set(prev);
          next.delete(group.key);
          return next;
        });

        // Batch classifying a whole route group is a power-user moment
        setTimeout(() => maybeRequestReview("batch_classified"), 2000);
      } catch {
        Alert.alert("Error", "Failed to classify trips. Please try again.");
      } finally {
        setBatchClassifyingKey(null);
      }
    },
    []
  );

  const renderTrip = ({ item }: { item: TripItem }) => {
    const isUnclassified = item.classification === "unclassified";
    const isClassifying = classifyingId === item.id;
    const tripSuggestion = isUnclassified ? suggestions[item.id] : null;
    const isSelected = mergeMode && selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.tripCard,
          isUnclassified && styles.tripCardUnclassified,
          isSelected && styles.tripCardSelected,
        ]}
        onPress={() => {
          if (mergeMode) {
            toggleSelect(item.id);
          } else {
            router.push(`/trip-form?id=${item.id}`);
          }
        }}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          mergeMode
            ? `${isSelected ? "Deselect" : "Select"} trip on ${formatDate(item.startedAt)}, ${item.distanceMiles.toFixed(1)} miles`
            : `Trip on ${formatDate(item.startedAt)}, ${item.distanceMiles.toFixed(1)} miles${item.classification !== "unclassified" ? `, ${item.classification}` : ", needs classifying"}. Tap to edit.`
        }
        accessibilityState={mergeMode ? { selected: isSelected } : undefined}
        accessibilityHint={mergeMode ? undefined : "Long press to enter merge mode"}
      >
        <View style={styles.tripHeader}>
          {mergeMode && (
            <View
              style={[styles.selectCircle, isSelected && styles.selectCircleActive]}
              accessible={false}
            >
              {isSelected && <Ionicons name="checkmark" size={14} color="#030712" accessible={false} />}
            </View>
          )}
          <Text style={[styles.tripDate, mergeMode && { flex: 1 }]}>{formatDate(item.startedAt)}</Text>
          <View style={styles.tripHeaderRight}>
            {isUnclassified ? (
              <View style={styles.unclassifiedBadge}>
                <Ionicons name="help-circle" size={12} color="#f5a623" accessible={false} />
                <Text style={styles.unclassifiedBadgeText}>Needs classifying</Text>
              </View>
            ) : (
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
            )}
            {!mergeMode && !item._isLocal && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleDeleteTrip(item.id);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Delete trip"
              >
                <Ionicons name="trash-outline" size={16} color="#64748b" accessible={false} />
              </TouchableOpacity>
            )}
          </View>
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

        {/* Quick classify buttons for unclassified trips */}
        {isUnclassified && (
          <View style={styles.quickClassifyWrap}>
            {tripSuggestion && (
              <View style={styles.inlineSuggestion}>
                <Ionicons name="sparkles" size={12} color="#f5a623" />
                <Text style={styles.inlineSuggestionText}>
                  Looks like {tripSuggestion.classification} ({tripSuggestion.matchCount} previous trip{tripSuggestion.matchCount !== 1 ? "s" : ""} here)
                </Text>
              </View>
            )}
            <View style={styles.quickClassifyRow}>
              <TouchableOpacity
                style={[
                  styles.quickClassifyBtn,
                  styles.quickClassifyBusiness,
                  tripSuggestion?.classification === "business" && styles.quickClassifySuggested,
                ]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleQuickClassify(item.id, "business");
                }}
                disabled={isClassifying}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Classify as Business${tripSuggestion?.classification === "business" ? " (suggested)" : ""}`}
                accessibilityState={{ disabled: isClassifying }}
              >
                {isClassifying ? (
                  <ActivityIndicator size="small" color="#030712" accessibilityLabel="Classifying" />
                ) : (
                  <>
                    {tripSuggestion?.classification === "business" && (
                      <Ionicons name="sparkles" size={12} color="#030712" accessible={false} />
                    )}
                    <Ionicons name="briefcase" size={14} color="#030712" accessible={false} />
                    <Text style={styles.quickClassifyBtnTextDark}>Business</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.quickClassifyBtn,
                  tripSuggestion?.classification === "personal"
                    ? styles.quickClassifyPersonalSuggested
                    : styles.quickClassifyPersonal,
                ]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleQuickClassify(item.id, "personal");
                }}
                disabled={isClassifying}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Classify as Personal${tripSuggestion?.classification === "personal" ? " (suggested)" : ""}`}
                accessibilityState={{ disabled: isClassifying }}
              >
                {isClassifying ? (
                  <ActivityIndicator size="small" color="#d1d5db" accessibilityLabel="Classifying" />
                ) : (
                  <>
                    {tripSuggestion?.classification === "personal" && (
                      <Ionicons name="sparkles" size={12} color="#030712" accessible={false} />
                    )}
                    <Ionicons name="car" size={14} color={tripSuggestion?.classification === "personal" ? "#030712" : "#d1d5db"} accessible={false} />
                    <Text style={tripSuggestion?.classification === "personal" ? styles.quickClassifyBtnTextDark : styles.quickClassifyBtnTextLight}>Personal</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const routeGroups: RouteGroup[] = filter === "unclassified"
    ? groupUnclassifiedTrips(trips.filter((t) => t.classification === "unclassified"))
    : [];

  const renderRouteGroup = ({ item: group }: { item: RouteGroup }) => {
    const isExpanded = expandedGroups.has(group.key);
    const isBatchClassifying = batchClassifyingKey === group.key;
    const isSingleton = group.trips.length === 1;

    // Date info from trips
    const sortedTrips = [...group.trips].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const latestTrip = sortedTrips[0];
    const latestDate = formatDate(latestTrip.startedAt);
    const latestTime = formatTime(latestTrip.startedAt);

    return (
      <View style={styles.routeGroup}>
        {/* Group header */}
        <TouchableOpacity
          style={styles.routeGroupHeader}
          onPress={() => toggleGroupExpanded(group.key)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Route group: ${group.routeLabel}, ${group.trips.length} trip${group.trips.length !== 1 ? "s" : ""}, ${group.totalDistanceMiles.toFixed(1)} miles total. Tap to ${isExpanded ? "collapse" : "expand"}.`}
          accessibilityState={{ expanded: isExpanded }}
        >
          <View style={styles.routeGroupHeaderTop}>
            <View style={styles.routeGroupInfo}>
              <Ionicons name="git-branch-outline" size={14} color="#f5a623" accessible={false} />
              <Text style={styles.routeGroupLabel} numberOfLines={1}>
                {group.routeLabel}
              </Text>
            </View>
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color="#6b7280"
              accessible={false}
            />
          </View>

          {/* Date and time */}
          <Text style={styles.routeGroupDate}>
            {isSingleton
              ? `${latestDate} at ${latestTime}`
              : `Latest: ${latestDate} at ${latestTime}`}
          </Text>

          <View style={styles.routeGroupMeta}>
            <View style={styles.routeGroupMetaPill}>
              <Text style={styles.routeGroupMetaText}>
                {group.trips.length} trip{group.trips.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <View style={styles.routeGroupMetaPill}>
              <Text style={styles.routeGroupMetaText}>
                {group.totalDistanceMiles.toFixed(1)} mi total
              </Text>
            </View>
          </View>

          {/* Batch action buttons */}
          <View style={styles.routeGroupActions}>
            <TouchableOpacity
              style={[styles.routeGroupBtn, styles.routeGroupBtnBusiness]}
              onPress={(e) => {
                e.stopPropagation?.();
                handleBatchClassify(group, "business");
              }}
              disabled={isBatchClassifying}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Classify all ${group.trips.length} trip${group.trips.length !== 1 ? "s" : ""} as Business`}
              accessibilityState={{ disabled: isBatchClassifying, busy: isBatchClassifying }}
            >
              {isBatchClassifying ? (
                <ActivityIndicator size="small" color="#030712" accessibilityLabel="Classifying" />
              ) : (
                <>
                  <Ionicons name="briefcase" size={14} color="#030712" accessible={false} />
                  <Text style={styles.routeGroupBtnTextDark}>
                    {isSingleton ? "Business" : `Business (${group.trips.length})`}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.routeGroupBtn, styles.routeGroupBtnPersonal]}
              onPress={(e) => {
                e.stopPropagation?.();
                handleBatchClassify(group, "personal");
              }}
              disabled={isBatchClassifying}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Classify all ${group.trips.length} trip${group.trips.length !== 1 ? "s" : ""} as Personal`}
              accessibilityState={{ disabled: isBatchClassifying, busy: isBatchClassifying }}
            >
              {isBatchClassifying ? (
                <ActivityIndicator size="small" color="#d1d5db" accessibilityLabel="Classifying" />
              ) : (
                <>
                  <Ionicons name="car" size={14} color="#d1d5db" accessible={false} />
                  <Text style={styles.routeGroupBtnTextLight}>
                    {isSingleton ? "Personal" : `Personal (${group.trips.length})`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Expanded individual trips */}
        {isExpanded && (
          <View style={styles.routeGroupTrips}>
            {group.trips.map((trip) => (
              <View key={trip.id} style={styles.routeGroupTripItem}>
                {renderTrip({ item: trip })}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        key={filter === "unclassified" ? "grouped" : "flat"}
        data={filter === "unclassified" ? (routeGroups as any[]) : trips}
        keyExtractor={(item) => (filter === "unclassified" ? (item as RouteGroup).key : (item as TripItem).id)}
        renderItem={filter === "unclassified" ? (renderRouteGroup as any) : renderTrip}
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

            {/* Inbox banner — shows when there are unclassified trips and not already viewing inbox */}
            {unclassifiedCount > 0 && filter !== "unclassified" && (
              <TouchableOpacity
                style={styles.inboxBanner}
                onPress={() => handleFilterChange("unclassified")}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${unclassifiedCount} trip${unclassifiedCount !== 1 ? "s" : ""} need classifying. Tap to review.`}
              >
                <View style={styles.inboxBannerLeft}>
                  <View style={styles.inboxBannerIcon}>
                    <Ionicons name="file-tray" size={18} color="#f5a623" accessible={false} />
                  </View>
                  <View>
                    <Text style={styles.inboxBannerTitle}>
                      {unclassifiedCount} trip{unclassifiedCount !== 1 ? "s" : ""} to classify
                    </Text>
                    <Text style={styles.inboxBannerSubtitle}>
                      Tap to review and classify
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#6b7280" accessible={false} />
              </TouchableOpacity>
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
                  accessibilityRole="button"
                  accessibilityLabel={f.value === "unclassified" && unclassifiedCount > 0 ? `${f.label}, ${unclassifiedCount} trip${unclassifiedCount !== 1 ? "s" : ""}` : f.label}
                  accessibilityState={{ selected: filter === f.value }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filter === f.value && styles.filterChipTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                  {f.value === "unclassified" && unclassifiedCount > 0 && (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterBadgeText}>
                        {unclassifiedCount > 99 ? "99+" : unclassifiedCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Merge mode banner */}
            {mergeMode && (
              <View style={styles.mergeBanner}>
                <View style={styles.mergeBannerLeft}>
                  <Ionicons name="git-merge-outline" size={18} color="#60a5fa" />
                  <Text style={styles.mergeBannerText}>
                    {selectedIds.size} trip{selectedIds.size !== 1 ? "s" : ""} selected
                  </Text>
                </View>
                <View style={styles.mergeBannerActions}>
                  <TouchableOpacity
                    style={styles.mergeBannerCancel}
                    onPress={exitMergeMode}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel merge mode"
                  >
                    <Text style={styles.mergeBannerCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.mergeBannerBtn,
                      selectedIds.size < 2 && styles.mergeBannerBtnDisabled,
                    ]}
                    onPress={() => selectedIds.size >= 2 && setMergeModalVisible(true)}
                    disabled={selectedIds.size < 2}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Merge ${selectedIds.size} selected trip${selectedIds.size !== 1 ? "s" : ""}`}
                    accessibilityState={{ disabled: selectedIds.size < 2 }}
                    accessibilityHint={selectedIds.size < 2 ? "Select at least 2 trips to merge" : undefined}
                  >
                    <Ionicons name="git-merge-outline" size={14} color={selectedIds.size >= 2 ? "#030712" : "#6b7280"} />
                    <Text style={[
                      styles.mergeBannerBtnText,
                      selectedIds.size < 2 && styles.mergeBannerBtnTextDisabled,
                    ]}>
                      Merge
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
                <Ionicons
                  name={filter === "unclassified" ? "checkmark-circle-outline" : "car-outline"}
                  size={40}
                  color="#64748b"
                  accessible={false}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {filter === "unclassified"
                  ? "All caught up!"
                  : "No trips recorded yet"}
              </Text>
              <Text style={styles.emptyText}>
                {filter === "unclassified"
                  ? "All your trips have been classified"
                  : "Tap the button below to add your first trip"}
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
          <ActivityIndicator size="large" color="#f5a623" accessibilityLabel="Loading trips" />
        </View>
      )}

      {/* Merge classification modal */}
      {mergeModalVisible && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setMergeModalVisible(false)}>
          <Pressable
            style={styles.mergeBackdrop}
            onPress={() => setMergeModalVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close merge dialog"
          >
            <View style={styles.mergeSheet} onStartShouldSetResponder={() => true} accessibilityViewIsModal={true}>
              <View style={styles.mergeHandle} />

              <Text style={styles.mergeTitle}>Merge {selectedIds.size} Trips</Text>

              {/* Preview: first → last trip summary */}
              {(() => {
                const selected = trips
                  .filter((t) => selectedIds.has(t.id))
                  .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
                const first = selected[0];
                const last = selected[selected.length - 1];
                const totalMiles = selected.reduce((sum, t) => sum + t.distanceMiles, 0);
                if (!first || !last) return null;
                return (
                  <View style={styles.mergePreview}>
                    <View style={styles.mergePreviewRow}>
                      <Ionicons name="location" size={14} color="#10b981" />
                      <Text style={styles.mergePreviewText} numberOfLines={1}>
                        {first.startAddress || `${first.startLat.toFixed(4)}, ${first.startLng.toFixed(4)}`}
                      </Text>
                    </View>
                    <View style={styles.mergePreviewDots}>
                      <View style={styles.mergePreviewDot} />
                      <View style={styles.mergePreviewDot} />
                      <View style={styles.mergePreviewDot} />
                    </View>
                    <View style={styles.mergePreviewRow}>
                      <Ionicons name="flag" size={14} color="#ef4444" />
                      <Text style={styles.mergePreviewText} numberOfLines={1}>
                        {last.endAddress || last.startAddress || "End point"}
                      </Text>
                    </View>
                    <View style={styles.mergePreviewStats}>
                      <Text style={styles.mergePreviewStat}>{totalMiles.toFixed(1)} mi total</Text>
                      <Text style={styles.mergePreviewStat}>
                        {formatTime(first.startedAt)} — {last.endedAt ? formatTime(last.endedAt) : "ongoing"}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={styles.mergeLabel} accessibilityRole="header">Classification</Text>
              <View style={styles.mergeClassRow}>
                {(["business", "personal"] as const).map((cls) => (
                  <TouchableOpacity
                    key={cls}
                    style={[
                      styles.mergeClassBtn,
                      mergeClassification === cls && (cls === "business" ? styles.mergeClassBtnBusiness : styles.mergeClassBtnPersonal),
                    ]}
                    onPress={() => setMergeClassification(cls)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={cls === "business" ? "Business" : "Personal"}
                    accessibilityState={{ selected: mergeClassification === cls }}
                  >
                    <Ionicons
                      name={cls === "business" ? "briefcase" : "car"}
                      size={16}
                      color={mergeClassification === cls ? "#030712" : "#9ca3af"}
                    />
                    <Text style={[
                      styles.mergeClassBtnText,
                      mergeClassification === cls && styles.mergeClassBtnTextActive,
                    ]}>
                      {cls === "business" ? "Business" : "Personal"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {mergeClassification === "business" && (
                <>
                  <Text style={styles.mergeLabel}>Platform (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mergePlatformScroll}>
                    <TouchableOpacity
                      style={[styles.mergePlatformChip, !mergePlatform && styles.mergePlatformChipActive]}
                      onPress={() => setMergePlatform(null)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="No platform"
                      accessibilityState={{ selected: !mergePlatform }}
                    >
                      <Text style={[styles.mergePlatformText, !mergePlatform && styles.mergePlatformTextActive]}>None</Text>
                    </TouchableOpacity>
                    {GIG_PLATFORMS.map((p) => (
                      <TouchableOpacity
                        key={p.value}
                        style={[styles.mergePlatformChip, mergePlatform === p.value && styles.mergePlatformChipActive]}
                        onPress={() => setMergePlatform(p.value)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={p.label}
                        accessibilityState={{ selected: mergePlatform === p.value }}
                      >
                        <Text style={[styles.mergePlatformText, mergePlatform === p.value && styles.mergePlatformTextActive]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <TouchableOpacity
                style={[styles.mergeConfirmBtn, mergeLoading && { opacity: 0.6 }]}
                onPress={handleMerge}
                disabled={mergeLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Merge ${selectedIds.size} trips into one`}
                accessibilityState={{ disabled: mergeLoading, busy: mergeLoading }}
              >
                {mergeLoading ? (
                  <ActivityIndicator size="small" color="#030712" accessibilityLabel="Merging trips" />
                ) : (
                  <>
                    <Ionicons name="git-merge-outline" size={18} color="#030712" />
                    <Text style={styles.mergeConfirmText}>
                      Merge into 1 Trip
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
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
  // Inbox banner
  inboxBanner: {
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inboxBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  inboxBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  inboxBannerTitle: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
  inboxBannerSubtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#8494a7",
    marginTop: 1,
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
    backgroundColor: "#0a1120",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  filterBadge: {
    backgroundColor: "#f5a623",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  filterBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  // Trip cards
  tripCard: {
    backgroundColor: "#0a1120",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
    marginBottom: 10,
  },
  tripCardUnclassified: {
    borderColor: "rgba(245, 166, 35, 0.25)",
  },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  tripHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  unclassifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  unclassifiedBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
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
    backgroundColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "rgba(255,255,255,0.08)",
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
  // Quick classify buttons
  quickClassifyWrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  quickClassifyRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickClassifyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  quickClassifyBusiness: {
    backgroundColor: "#f5a623",
  },
  quickClassifyPersonal: {
    backgroundColor: "#374151",
  },
  quickClassifySuggested: {
    borderWidth: 2,
    borderColor: "#ca8a04",
  },
  quickClassifyPersonalSuggested: {
    backgroundColor: "#f5a623",
  },
  inlineSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  inlineSuggestionText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#d4a053",
  },
  quickClassifyBtnTextDark: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  quickClassifyBtnTextLight: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
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
    backgroundColor: "#0a1120",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
  // Select mode
  tripCardSelected: {
    borderColor: "#60a5fa",
    backgroundColor: "rgba(96, 165, 250, 0.06)",
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  selectCircleActive: {
    backgroundColor: "#60a5fa",
    borderColor: "#60a5fa",
  },
  // Merge banner
  mergeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(96, 165, 250, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.25)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  mergeBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mergeBannerText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#93c5fd",
  },
  mergeBannerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mergeBannerCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mergeBannerCancelText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#9ca3af",
  },
  mergeBannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#60a5fa",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  mergeBannerBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  mergeBannerBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  mergeBannerBtnTextDisabled: {
    color: "#6b7280",
  },
  // Merge modal
  mergeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  mergeSheet: {
    backgroundColor: "#0a1120",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.06)",
  },
  mergeHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 16,
  },
  mergeTitle: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
    marginBottom: 16,
  },
  mergePreview: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  mergePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mergePreviewText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#d1d5db",
    flex: 1,
  },
  mergePreviewDots: {
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    paddingLeft: 6,
    paddingVertical: 4,
  },
  mergePreviewDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#4b5563",
  },
  mergePreviewStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  mergePreviewStat: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
  },
  mergeLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mergeClassRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  mergeClassBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#0a1120",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  mergeClassBtnBusiness: {
    backgroundColor: "#f5a623",
    borderColor: "#f5a623",
  },
  mergeClassBtnPersonal: {
    backgroundColor: "#60a5fa",
    borderColor: "#60a5fa",
  },
  mergeClassBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  mergeClassBtnTextActive: {
    color: "#030712",
  },
  mergePlatformScroll: {
    marginBottom: 20,
  },
  mergePlatformChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#0a1120",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginRight: 8,
  },
  mergePlatformChipActive: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  mergePlatformText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#9ca3af",
  },
  mergePlatformTextActive: {
    color: "#f5a623",
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  mergeConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#60a5fa",
    paddingVertical: 14,
    borderRadius: 12,
  },
  mergeConfirmText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#030712",
  },
  // Route group (inbox grouped view)
  routeGroup: {
    marginBottom: 14,
  },
  routeGroupHeader: {
    backgroundColor: "#0d1726",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    padding: 14,
  },
  routeGroupHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  routeGroupInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  routeGroupLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f0f2f5",
    flex: 1,
  },
  routeGroupDate: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#8494a7",
    marginTop: 4,
    marginLeft: 22,
  },
  routeGroupMeta: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  routeGroupMetaPill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  routeGroupMetaText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
  },
  routeGroupActions: {
    flexDirection: "row",
    gap: 10,
  },
  routeGroupBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  routeGroupBtnBusiness: {
    backgroundColor: "#f5a623",
  },
  routeGroupBtnPersonal: {
    backgroundColor: "#374151",
  },
  routeGroupBtnTextDark: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
  routeGroupBtnTextLight: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
  },
  routeGroupTrips: {
    marginTop: 4,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(245, 166, 35, 0.15)",
  },
  routeGroupTripItem: {
    marginTop: 4,
  },
});
