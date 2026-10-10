import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button } from "../../components/Button";
import { DateTimePickerField } from "../../components/DateTimePickerField";
import { TripRouteCard } from "../../components/map/TripRouteCard";
import { fetchOdometerDays, type OdometerDay } from "../../lib/api/odometer";
import { dayLineA11y, dayLineText, loadedRange, selectDayLines } from "../../lib/odometer/logic";
import { fetchTrips, fetchTripSummary, fetchProjectLabels, fetchUnclassifiedCount, fetchMissedJourneys, fetchClassificationSuggestion, mergeTrips, undoClassification, clearDuplicateFlag, TripWithVehicle, ClassificationSuggestion, type TripSummary } from "../../lib/api/trips";
import { describeError } from "../../lib/api/apiError";
import { syncUpdateTrip, syncDeleteTrip } from "../../lib/sync/actions";
import { processSyncQueue } from "../../lib/sync";
import { isNetworkError } from "../../lib/sync/errors";
import { markLiveActivityClassified } from "../../lib/liveActivity";
import { getLocalTrips, getLocalUnsyncedTrips } from "../../lib/db/queries";
import { groupTripsByDay, type DayRow } from "../../lib/trips/dayOrder";
import { mergeTripPage, uniqueById } from "../../lib/trips/pageMerge";
import { tripEndLabel, type SavedPlace } from "../../lib/trips/placeLabel";
import { getDatabase } from "../../lib/db";
import { learnFromClassification } from "../../lib/classification";
import { maybeRequestReview } from "../../lib/rating/index";
import { GIG_PLATFORMS, getTaxYear, parseTaxYear } from "@mileclear/shared";
import type { TripClassification, PlatformTag } from "@mileclear/shared";
import { Skeleton } from "../../components/Skeleton";
import { colors, fonts, radii, spacing } from "../../lib/theme";
import { TripNoteEditor, displayNote } from "../../components/TripNoteEditor";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { TripsReviewStrip } from "../../components/trips/TripsReviewStrip";
import { MissingTripReporter } from "../../components/MissingTripReporter";
import { MissedJourneys } from "../../components/MissedJourneys";
import { TrackingOffBanner } from "../../components/TrackingOffBanner";
import { haptic } from "../../lib/haptics";
import { AppModal } from "../../components/AppModal";
import { Swipeable, RectButton } from "react-native-gesture-handler";
import AppHeader from "../../components/AppHeader";

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

type DateRange = "all" | "week" | "month" | "lastMonth" | "taxYear" | "lastTaxYear" | "custom";

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "All time", value: "all" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
  { label: "Last month", value: "lastMonth" },
  { label: "This tax year", value: "taxYear" },
  { label: "Last tax year", value: "lastTaxYear" },
  { label: "Custom…", value: "custom" },
];

// Decrement a "YYYY-YY" tax-year string by one year (e.g. "2026-27" -> "2025-26").
function previousTaxYear(taxYear: string): string {
  const [start] = taxYear.split("-").map((s) => parseInt(s, 10));
  const prevStart = start - 1;
  return `${prevStart}-${String(prevStart + 1).slice(2)}`;
}

/**
 * Convert a DateRange + optional custom bounds into the from/to ISO strings
 * the trips API expects. Returns {} for "all time" so the API does not filter.
 */
function rangeBounds(
  r: DateRange,
  customFrom?: Date | null,
  customTo?: Date | null
): { from?: string; to?: string } {
  const now = new Date();
  switch (r) {
    case "all":
      return {};
    case "week": {
      // Monday at 00:00 of the current week
      const d = new Date(now);
      const dow = d.getDay();
      const offset = dow === 0 ? 6 : dow - 1;
      d.setDate(d.getDate() - offset);
      d.setHours(0, 0, 0, 0);
      return { from: d.toISOString(), to: now.toISOString() };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString(), to: now.toISOString() };
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case "taxYear": {
      const { start, end } = parseTaxYear(getTaxYear(now));
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case "lastTaxYear": {
      const { start, end } = parseTaxYear(previousTaxYear(getTaxYear(now)));
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case "custom":
      if (customFrom && customTo) {
        // End of day on the "to" date so trips at 23:59 are included.
        const end = new Date(customTo);
        end.setHours(23, 59, 59, 999);
        const start = new Date(customFrom);
        start.setHours(0, 0, 0, 0);
        return { from: start.toISOString(), to: end.toISOString() };
      }
      return {};
  }
}

function rangeLabel(
  r: DateRange,
  customFrom?: Date | null,
  customTo?: Date | null
): string {
  switch (r) {
    case "all":
      return "All time";
    case "week":
      return "This week";
    case "month":
      return "This month";
    case "lastMonth":
      return "Last month";
    case "taxYear":
      return `Tax year ${getTaxYear(new Date())}`;
    case "lastTaxYear":
      return `Tax year ${previousTaxYear(getTaxYear(new Date()))}`;
    case "custom":
      if (customFrom && customTo) {
        const fmt = (d: Date) =>
          d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        return `${fmt(customFrom)} – ${fmt(customTo)}`;
      }
      return "Custom";
  }
}

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

// A quiet server classification stays undoable in the list for a week;
// after that it reads like any other classified trip.
const AUTO_UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Low or medium confidence gets a pill; high stays visually clean. */
function showConfidenceFor(item: TripItem): boolean {
  const level = item.confidence?.level;
  return level === "low" || level === "medium";
}

function isRecentAutoTrip(item: TripItem): boolean {
  return (
    item.classification !== "unclassified" &&
    !!item.autoClassifiedAt &&
    Date.now() - new Date(item.autoClassifiedAt).getTime() < AUTO_UNDO_WINDOW_MS
  );
}

/** Saved places from the local database, for the route line's names. */
async function loadSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ name: string; latitude: number; longitude: number; radius_meters: number }>(
      "SELECT name, latitude, longitude, radius_meters FROM saved_locations"
    );
    return rows.map((r) => ({ name: r.name, lat: r.latitude, lng: r.longitude, radiusMeters: r.radius_meters }));
  } catch {
    return [];
  }
}

export default function TripsScreen() {
  const router = useRouter();
  // "?filter=unclassified" is how the classify reminders (evening digest,
  // weekly nudge, the app's own reminder) open the Inbox. Until 28 Sep 2026
  // nothing read it, so every one of those taps landed on All instead.
  // "&range=lastTaxYear" narrows it to the tax year the 31 January Self
  // Assessment deadline is for (the "Ready for 31 January?" checklist).
  const params = useLocalSearchParams<{ filter?: string; range?: string; day?: string }>();
  const [trips, setTrips] = useState<TripItem[]>([]);
  // Bumped to refetch the odometer day lines (focus, pull to refresh).
  const [odoTick, setOdoTick] = useState(0);
  const [filter, setFilter] = useState<TripClassification | "all">(() =>
    params.filter === "unclassified" ? "unclassified" : "all"
  );
  // Platform filter is orthogonal to classification — both can be active at
  // once. Stored as PlatformTag value or "all" sentinel.
  const [platformFilter, setPlatformFilter] = useState<PlatformTag | "all">("all");
  const [page, setPage] = useState(1);
  // Saved places ("Home", "Depot") name the ends of the route line first.
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  // Date range state. When dateRange !== "all" (or any other filter is active)
  // a stats summary card appears at the top of the list.
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    params.range === "lastTaxYear" ? "lastTaxYear" : "all"
  );
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  // Platform + date range now live behind a single "Filters" control (was
  // two permanently-visible chip rows pushing the first trip a third of
  // the way down the screen). Sheet visibility only - the underlying
  // platformFilter/dateRange state and its query logic are untouched.
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  // Journeys to check (missed-journey proposals). null = not known yet, or the
  // fetch failed; the review card then treats it as none.
  const [missedCount, setMissedCount] = useState<number | null>(null);
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Whether the driver has tagged any trip with a Project / client. Only
  // then is the "Miles by project" link worth its row. One grouped query.
  const [hasProjectLabels, setHasProjectLabels] = useState(false);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, ClassificationSuggestion>>({});
  // Summary stats backed by /trips/summary (server-side aggregate). Lets the
  // stats card show accurate totals regardless of which page the list is on,
  // and means we can paginate the list at a sensible 20-per-page even when
  // filtered. Replaces the old "fetch 500 at once when filtered" pattern.
  const [summary, setSummary] = useState<TripSummary | null>(null);

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
      // Ignore: the review card just keeps the last count
    } finally {
      setCountsLoaded(true);
    }
  }, []);

  // Journeys to check feed the review card. A failure leaves the last known
  // count (or none) rather than claiming there is nothing to check. Not run
  // for the Inbox view or on filter taps: there MissedJourneys loads its own.
  const loadMissedCount = useCallback(() => {
    fetchMissedJourneys()
      .then((r) => setMissedCount((r.proposals ?? []).length))
      .catch(() => {});
  }, []);

  // Fetch classification suggestions for unclassified trips
  const loadSuggestions = useCallback(async (tripList: TripItem[]) => {
    const unclassified = tripList.filter(
      (t) => t.classification === "unclassified" && t.endLat && t.endLng
    );
    if (unclassified.length === 0) return;

    // The list response carries the suggestion inline since 8 Sep 2026.
    // Rows that have the field (even as null) need no fetch; only rows
    // from an older server shape fall back to the per-row call.
    const inline: Record<string, ClassificationSuggestion> = {};
    for (const t of unclassified) {
      if (t.suggestion) inline[t.id] = t.suggestion as ClassificationSuggestion;
    }
    if (Object.keys(inline).length > 0) {
      setSuggestions((prev) => ({ ...prev, ...inline }));
    }
    const needsFetch = unclassified.filter((t) => t.suggestion === undefined);
    if (needsFetch.length === 0) return;

    // Fetch suggestions in parallel (max 10 to avoid flooding)
    const toFetch = needsFetch.slice(0, 10);
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
  const platformFilterRef = useRef(platformFilter);
  platformFilterRef.current = platformFilter;
  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;
  const customFromRef = useRef(customFrom);
  customFromRef.current = customFrom;
  const customToRef = useRef(customTo);
  customToRef.current = customTo;

  // Paginate at a consistent 20-per-page across every filter combo. The
  // stats card sources from /trips/summary so accuracy isn't tied to how
  // far the user has scrolled.
  const PAGE_SIZE = 20;

  // One next-page load at a time. `loadingMore` state is read from the last
  // render, so two scroll events before a re-render could each start a load
  // of the same page. A fresh page-1 load bumps the generation, so a
  // next-page load that was already in flight for the old list is dropped
  // instead of being appended to the new one.
  const loadingMoreRef = useRef(false);
  const listGenerationRef = useRef(0);

  const loadTrips = useCallback(
    async (pageNum: number, append = false) => {
      const generation = append ? listGenerationRef.current : ++listGenerationRef.current;
      try {
        const classification = filterRef.current === "all" ? undefined : filterRef.current;
        const platformTag =
          platformFilterRef.current === "all" ? undefined : platformFilterRef.current;
        const bounds = rangeBounds(
          dateRangeRef.current,
          customFromRef.current,
          customToRef.current
        );
        const res = await fetchTrips({
          classification,
          platformTag,
          ...bounds,
          page: pageNum,
          pageSize: PAGE_SIZE,
        });
        if (generation !== listGenerationRef.current) return;
        setIsOffline(false);
        setLoadError(false);

        if (append) {
          // Never append a trip that is already on screen: a trip that synced
          // since page 1 loaded slides the last trip of page 1 onto page 2.
          setTrips((prev) => mergeTripPage(prev, res.data));
        } else {
          // Merge unsynced local items on first page
          const unsynced = await getLocalUnsyncedTrips({ classification, platformTag });
          const apiIds = new Set(res.data.map((t) => t.id));
          const uniqueLocal = unsynced.filter((t) => !apiIds.has(t.id)) as TripItem[];
          const allTrips = uniqueById([...uniqueLocal, ...res.data]);
          // Animate the data swap-in. Pairs with the configureNext call in
          // handleFilterChange / handlePlatformChange so the chip → list
          // transition flows as one motion instead of two snaps.
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setTrips(allTrips);

          // Fetch smart suggestions for unclassified trips (non-blocking)
          loadSuggestions(allTrips).catch(() => {});
        }
        setPage(res.page);
        setTotalPages(res.totalPages);
      } catch (err) {
        // Fall back to local data on any fetch failure, but only flag "offline"
        // for a genuine network error - a token hiccup or a one-off 500 must not
        // claim you're offline (Anthony, 4 Jun: a transient blip latched the
        // banner until a manual refresh).
        if (!append && generation === listGenerationRef.current) {
          const classification = filterRef.current === "all" ? undefined : filterRef.current;
          const platformTag =
            platformFilterRef.current === "all" ? undefined : platformFilterRef.current;
          const local = await getLocalTrips({ classification, platformTag });
          setTrips(local as TripItem[]);
          setLoadError(local.length === 0);
          setIsOffline(isNetworkError(err));
          setTotalPages(1);
        }
      } finally {
        if (append) loadingMoreRef.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [loadSuggestions]
  );

  // Server-side aggregate for the stats card. Single round-trip, returns
  // {totalTrips, totalMiles, businessTrips, businessMiles, personalTrips,
  // personalMiles}. Re-fetched alongside loadTrips on every filter change.
  const loadSummary = useCallback(async () => {
    try {
      const classification = filterRef.current === "all" ? undefined : filterRef.current;
      const platformTag =
        platformFilterRef.current === "all" ? undefined : platformFilterRef.current;
      const bounds = rangeBounds(
        dateRangeRef.current,
        customFromRef.current,
        customToRef.current
      );
      const res = await fetchTripSummary({
        classification,
        platformTag,
        ...bounds,
      });
      setSummary(res.data);
    } catch {
      // If the aggregate fails we fall back to client-side stats from the
      // currently-loaded trips. Not ideal but better than a blank card.
      setSummary(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTrips(1);
      loadSummary();
      loadUnclassifiedCount();
      setOdoTick((n) => n + 1);
      if (filterRef.current !== "unclassified") loadMissedCount();
      loadSavedPlaces().then(setSavedPlaces);
      fetchProjectLabels()
        .then((labels) => setHasProjectLabels(labels.length > 0))
        .catch(() => {});
    }, [loadTrips, loadSummary, loadUnclassifiedCount, loadMissedCount])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Pull-to-refresh is the discoverable "fix it" gesture - flush any
    // stuck items in the sync queue first, then reload from the API. If a
    // user's trips look wrong / stuck-pending, this single gesture
    // recovers them without needing a force-quit.
    processSyncQueue().catch(() => {});
    loadTrips(1);
    loadSummary();
    loadUnclassifiedCount();
    setOdoTick((n) => n + 1);
    if (filterRef.current !== "unclassified") loadMissedCount();
  }, [loadTrips, loadSummary, loadUnclassifiedCount, loadMissedCount]);

  const onEndReached = useCallback(() => {
    if (loadingMoreRef.current || loadingMore || page >= totalPages) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    loadTrips(page + 1, true);
  }, [loadingMore, page, totalPages, loadTrips]);

  const handleFilterChange = useCallback(
    (value: TripClassification | "all") => {
      // Animate the chip-row + list transition. easeInEaseOut over the
      // default 200ms feels like a real filter, not a snap-cut.
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFilter(value);
      filterRef.current = value; // Sync ref immediately so loadTrips reads the new value
      setTrips([]); // Clear stale data immediately
      setLoading(true);
      // Directly reload - don't wait for useFocusEffect dependency chain
      // which causes a render gap where stale data can flash.
      loadTrips(1);
      loadSummary();
      loadUnclassifiedCount();
    },
    [loadTrips, loadSummary, loadUnclassifiedCount]
  );

  // A reminder tapped while Trips is already mounted: switch to the Inbox,
  // then clear the param so the next tap (after the driver has moved back
  // to All) is seen as a change too.
  useEffect(() => {
    const wantsRange = params.range === "lastTaxYear";
    // "?day=2026-10-09" is how the Odometer log opens one day of trips.
    const dayMatch = typeof params.day === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.day) : null;
    const wantsDay = !!dayMatch;
    if (params.filter !== "unclassified" && !wantsRange && !wantsDay) return;
    let reload = false;
    if (wantsDay && dayMatch) {
      const day = new Date(Number(dayMatch[1]), Number(dayMatch[2]) - 1, Number(dayMatch[3]));
      setDateRange("custom");
      dateRangeRef.current = "custom";
      setCustomFrom(day);
      setCustomTo(day);
      customFromRef.current = day;
      customToRef.current = day;
      reload = true;
    } else if (wantsRange && dateRangeRef.current !== "lastTaxYear") {
      setDateRange("lastTaxYear");
      dateRangeRef.current = "lastTaxYear";
      setCustomFrom(null);
      setCustomTo(null);
      customFromRef.current = null;
      customToRef.current = null;
      reload = true;
    }
    if (params.filter === "unclassified" && filterRef.current !== "unclassified") {
      handleFilterChange("unclassified"); // reloads with the range set above
      reload = false;
    }
    if (reload) {
      setTrips([]);
      setLoading(true);
      loadTrips(1);
      loadSummary();
    }
    router.setParams({ filter: undefined, range: undefined, day: undefined });
  }, [params.filter, params.range, params.day, handleFilterChange, loadTrips, loadSummary, router]);

  const handlePlatformChange = useCallback(
    (value: PlatformTag | "all") => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPlatformFilter(value);
      platformFilterRef.current = value;
      setTrips([]);
      setLoading(true);
      loadTrips(1);
      loadSummary();
    },
    [loadTrips, loadSummary]
  );

  // Clears both platform and date range in one reload - the "back to
  // unfiltered" tap from the Filters sheet. Kept separate from
  // handlePlatformChange so clearing doesn't fire two overlapping fetches.
  const clearFilters = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlatformFilter("all");
    platformFilterRef.current = "all";
    setDateRange("all");
    dateRangeRef.current = "all";
    setCustomFrom(null);
    setCustomTo(null);
    customFromRef.current = null;
    customToRef.current = null;
    setTrips([]);
    setLoading(true);
    loadTrips(1);
    loadSummary();
  }, [loadTrips, loadSummary]);

  const onEndReachedSafe = useCallback(() => {
    if (isOffline) return;
    onEndReached();
  }, [isOffline, onEndReached]);

  // Quick classify a trip directly from the list
  // Reverse a quiet server classification. The trip returns to the inbox
  // and the server counts the undo against that route from now on.
  const handleUndoClassification = useCallback(async (tripId: string) => {
    setClassifyingId(tripId);
    try {
      await undoClassification(tripId);
      haptic("selection");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTrips((prev) =>
        prev.map((t) =>
          t.id === tripId
            ? { ...t, classification: "unclassified", autoClassifiedAt: null, classificationSource: "user_undo" }
            : t
        )
      );
      setUnclassifiedCount((prev) => prev + 1);
    } catch {
      Alert.alert("Couldn't undo", "Check your connection and try again.");
    } finally {
      setClassifyingId(null);
    }
  }, []);

  const handleQuickClassify = useCallback(
    async (tripId: string, classification: "business" | "personal") => {
      setClassifyingId(tripId);
      try {
        await syncUpdateTrip(tripId, { classification });
        haptic("selection");
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
            } catch (err) {
              const { title, message } = describeError(err, "Couldn't delete the trip");
              Alert.alert(title, message);
            }
          },
        },
      ]);
    },
    [filter]
  );

  // A small list sheet rather than Alert.alert: Android keeps only three
  // Alert buttons, which dropped Cancel and Merge.
  const [menuTrip, setMenuTrip] = useState<TripItem | null>(null);
  const handleLongPress = useCallback(
    (item: TripItem) => {
      if (mergeMode) return;
      setMenuTrip(item);
    },
    [mergeMode]
  );
  const menuActions = useMemo(() => {
    const item = menuTrip;
    if (!item) return [];
    const note = { label: "Add or edit note", onPress: () => setEditingNoteId(item.id) };
    // Unsynced trips can only take a note from here; the rest needs the server copy.
    if (item._isLocal) return [note];
    return [
      ...(isRecentAutoTrip(item)
        ? [{ label: "Undo automatic sort", onPress: () => handleUndoClassification(item.id) }]
        : []),
      note,
      {
        label: "Merge trips",
        onPress: () => {
          setMergeMode(true);
          setSelectedIds(new Set([item.id]));
        },
      },
      { label: "Delete trip", destructive: true, onPress: () => handleDeleteTrip(item.id) },
    ];
  }, [menuTrip, handleDeleteTrip, handleUndoClassification]);

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
      loadSummary();
      loadUnclassifiedCount();
    } catch (err: unknown) {
      // Merge is a direct API call, not an offline-first queued write.
      const { title, message } = describeError(err, "Couldn't merge the trips", { savedLocally: false });
      Alert.alert(title, message);
    } finally {
      setMergeLoading(false);
    }
  }, [selectedIds, trips, mergeClassification, mergePlatform, exitMergeMode, loadTrips, loadSummary, loadUnclassifiedCount]);

  // Possible double-count. The server marks the newer of two trips that
  // overlap in time and share both ends (a drive added by hand whose
  // recording landed later, or a missed-journey gap the app then filled).
  // Nothing is removed until the driver chooses: Merge folds the pair into
  // one trip through the ordinary merge endpoint, Keep both clears the mark.
  const [duplicateBusyId, setDuplicateBusyId] = useState<string | null>(null);

  const handleMergeDuplicate = useCallback(
    async (item: TripItem, other: TripItem) => {
      setDuplicateBusyId(item.id);
      try {
        // The newer trip's own classification and platform carry over. If it
        // has not been sorted yet, the merged trip is not either.
        await mergeTrips({
          tripIds: [item.id, other.id],
          classification: item.classification,
          platformTag: item.platformTag ?? null,
        });
        haptic("success");
        setLoading(true);
        loadTrips(1);
        loadSummary();
        loadUnclassifiedCount();
      } catch (err: unknown) {
        const { title, message } = describeError(err, "Couldn't merge the trips", { savedLocally: false });
        Alert.alert(title, message);
      } finally {
        setDuplicateBusyId(null);
      }
    },
    [loadTrips, loadSummary, loadUnclassifiedCount]
  );

  const handleKeepBoth = useCallback(async (tripId: string) => {
    setDuplicateBusyId(tripId);
    try {
      await clearDuplicateFlag(tripId);
      haptic("selection");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, possibleDuplicateOfId: null } : t)));
    } catch (err: unknown) {
      const { title, message } = describeError(err, "Couldn't save that", { savedLocally: false });
      Alert.alert(title, message);
    } finally {
      setDuplicateBusyId(null);
    }
  }, []);

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
      } catch (err) {
        const { title, message } = describeError(err, "Couldn't classify the trips");
        Alert.alert(title, message);
      } finally {
        setBatchClassifyingKey(null);
      }
    },
    []
  );

  const openNoteEditor = useCallback((tripId: string) => setEditingNoteId(tripId), []);

  // Save a trip note. Only writes when the text actually changed, so tapping
  // a note and away without editing never clobbers an internal marker.
  const saveNote = useCallback(
    async (tripId: string, currentNotes: string | null | undefined, text: string) => {
      setEditingNoteId(null);
      const draft = text.trim();
      if (draft === displayNote(currentNotes)) return;
      const newVal = draft.length ? draft : null;
      setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, notes: newVal } : t)));
      try {
        await syncUpdateTrip(tripId, { notes: newVal });
      } catch {
        // Kept in local state; the sync queue will retry.
      }
    },
    []
  );

  // showDate: the day list already heads each day, so its rows leave the
  // date out; the Inbox's route groups mix days, so theirs keep it.
  const renderTrip = ({ item, showDate = false }: { item: TripItem; showDate?: boolean }) => {
    const isUnclassified = item.classification === "unclassified";
    const isBusiness = item.classification === "business";
    const isClassifying = classifyingId === item.id;
    const tripSuggestion = isUnclassified ? suggestions[item.id] : null;
    const isRecentAuto = isRecentAutoTrip(item);
    const fromLabel = tripEndLabel(item.startAddress, item.startLat, item.startLng, savedPlaces);
    const toLabel = tripEndLabel(item.endAddress, item.endLat, item.endLng, savedPlaces);
    const hasMeta =
      showDate || !!item.platformTag || !!item._isLocal || !!item.isManualEntry || showConfidenceFor(item);
    const isSelected = mergeMode && selectedIds.has(item.id);
    const note = displayNote(item.notes);
    const isEditingNote = editingNoteId === item.id;
    const inInbox = filter === "unclassified";
    // The trip this one may be a double of, if it is loaded on this screen.
    const duplicateOther = item.possibleDuplicateOfId
      ? trips.find((t) => t.id === item.possibleDuplicateOfId) ?? null
      : null;
    const duplicateOtherIsBelow =
      duplicateOther != null &&
      trips.findIndex((t) => t.id === duplicateOther.id) > trips.findIndex((t) => t.id === item.id);
    const isDuplicateBusy = duplicateBusyId === item.id;

    // iOS Mail-style left bar — single coloured stripe telling the
    // classification at a glance. Replaces the heavier right-aligned
    // Business/Personal pill which forced a multi-row header layout.
    const classificationBarColour = isBusiness
      ? AMBER
      : isUnclassified
        ? "#f5a623" // gold for needs-action
        : "#475569"; // dim slate for personal — present but quiet

    // Confidence pill (replaces the unexplained amber dot). Shows only
    // when confidence is low or medium so high-confidence trips stay
    // visually clean. Includes accessibilityLabel that explains the
    // signal rather than just "dot".
    const confidence = item.confidence?.level;
    const showConfidence = showConfidenceFor(item);

    // Swipe actions — Anthony 16 May audit. Right swipe = quick classify
    // (cycles Business / Personal / unclassified to the OTHER state),
    // left swipe = delete. Disabled in merge-mode where taps mean
    // multi-select.
    const renderRightActions = () => (
      <RectButton
        style={styles.swipeDeleteAction}
        onPress={() => {
          handleDeleteTrip(item.id);
        }}
        accessibilityLabel="Delete trip"
      >
        <Ionicons name="trash-outline" size={22} color="#fff" />
        <Text style={styles.swipeActionText}>Delete</Text>
      </RectButton>
    );

    // Right-swipe (drag left-to-right) classifies. For unclassified
    // trips it suggests Business; for already-classified trips it
    // flips to the opposite class — matching the "primary positive
    // action" iOS gesture pattern.
    const targetClass: TripClassification = isBusiness ? "personal" : "business";
    const targetLabel = targetClass === "business" ? "Business" : "Personal";
    const targetColor = targetClass === "business" ? AMBER : "#374151";
    const renderLeftActions = () =>
      mergeMode ? null : (
        <RectButton
          style={[styles.swipeClassifyAction, { backgroundColor: targetColor }]}
          onPress={() => {
            handleQuickClassify(item.id, targetClass);
          }}
          accessibilityLabel={`Classify as ${targetLabel}`}
        >
          <Ionicons
            name={targetClass === "business" ? "briefcase" : "person"}
            size={22}
            color={targetClass === "business" ? BG : "#fff"}
          />
          <Text
            style={[
              styles.swipeActionText,
              { color: targetClass === "business" ? BG : "#fff" },
            ]}
          >
            {targetLabel}
          </Text>
        </RectButton>
      );

    const cardInner = (
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
            : `Trip on ${formatDate(item.startedAt)}, ${item.distanceMiles.toFixed(1)} miles${item.classification !== "unclassified" ? `, ${item.classification}` : ", needs classifying"}${confidence && confidence !== "high" ? `, ${confidence} confidence` : ""}${isRecentAuto ? ", sorted automatically" : ""}. Tap to open. Swipe right to classify as ${targetLabel}. Swipe left to delete.`
        }
        accessibilityState={mergeMode ? { selected: isSelected } : undefined}
        accessibilityHint={mergeMode ? undefined : "Long press for more options"}
        accessibilityActions={
          !mergeMode && isRecentAuto ? [{ name: "undo", label: "Undo automatic sort" }] : undefined
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "undo") handleUndoClassification(item.id);
        }}
      >
        {/* Left classification bar */}
        <View style={[styles.classificationBar, { backgroundColor: classificationBarColour }]} />

        <View style={styles.tripCardBody}>
          {/* Compact row (4 Oct 2026): a small route thumbnail and three
              short lines, so five or six trips fit on a screen. The
              full-width map it replaced is on the trip screen. */}
          <View style={styles.tripMainRow}>
            {mergeMode && (
              <View
                style={[styles.selectCircle, isSelected && styles.selectCircleActive]}
                accessible={false}
              >
                {isSelected && <Ionicons name="checkmark" size={14} color={BG} accessible={false} />}
              </View>
            )}

            {/* Where it went. Shown for every trip, classified or not: the
                route is what the Business / Personal choice is about
                (Anthony, 2 Sep 2026). Taps and swipes pass straight
                through. The icon shows when there is no map to draw. */}
            <View style={styles.tripThumb} accessible={false}>
              <Ionicons
                name={item.isManualEntry ? "create-outline" : "map-outline"}
                size={20}
                color={TEXT_3}
                accessible={false}
              />
              <TripRouteCard
                tripId={item.id}
                routePolyline={item.routePolyline}
                isManualEntry={item.isManualEntry}
                startLat={item.startLat}
                startLng={item.startLng}
                endLat={item.endLat}
                endLng={item.endLng}
                height={THUMB_SIZE}
                compact
                style={styles.tripThumbMap}
              />
            </View>

            <View style={styles.tripText}>
              {/* Line 1: distance · time, classification on the right */}
              <View style={styles.tripPrimaryRow}>
                <Text style={styles.distanceCompact}>
                  {item.distanceMiles.toFixed(1)} mi
                </Text>
                <Text style={styles.dotSep}>·</Text>
                <Text style={styles.timeCompact}>{formatTime(item.startedAt)}</Text>
                <View style={{ flex: 1 }} />
                {isUnclassified ? (
                  <View style={styles.unclassifiedBadge}>
                    <Ionicons name="help-circle" size={11} color={AMBER} accessible={false} />
                    <Text style={styles.unclassifiedBadgeText}>Classify</Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.classificationBadge,
                      isBusiness ? styles.businessBadge : styles.personalBadge,
                    ]}
                  >
                    {isBusiness ? "Business" : "Personal"}
                  </Text>
                )}
                {isRecentAuto && (
                  <Ionicons
                    name="sparkles-outline"
                    size={12}
                    color={TEXT_3}
                    style={styles.autoSortedIcon}
                    accessible={false}
                  />
                )}
                {!inInbox && !!note && (
                  <TouchableOpacity
                    onPress={() => openNoteEditor(item.id)}
                    hitSlop={8}
                    style={styles.noteGlyphBtn}
                    accessibilityRole="button"
                    accessibilityLabel={note ? "Edit note" : "Add note"}
                  >
                    <Ionicons
                      name={note ? "chatbox-ellipses" : "chatbox-outline"}
                      size={14}
                      color={note ? AMBER : TEXT_3}
                      accessible={false}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Line 2: from → to, on a line of its own so both ends read */}
              {(fromLabel || toLabel) && (
                <Text style={styles.routeCompact} numberOfLines={1} ellipsizeMode="tail">
                  {fromLabel}
                  {fromLabel && toLabel ? <Text style={styles.arrowSubtle}> → </Text> : null}
                  {toLabel}
                </Text>
              )}

              {/* Line 3, only when there is something to say. The vehicle
                  is on the trip screen; truncated here it read as
                  "Vauxhall A...". */}
              {hasMeta && (
                <View style={styles.tripSecondaryRow}>
                  {showDate && <Text style={styles.dateCompact}>{formatDate(item.startedAt)}</Text>}
                  {item.platformTag && (
                    <Text style={styles.platformBadge}>
                      {PLATFORM_LABELS[item.platformTag] ?? item.platformTag}
                    </Text>
                  )}
                  {item._isLocal && <Text style={styles.syncBadge}>Pending</Text>}
                  {item.isManualEntry && <Text style={styles.manualBadge}>Manual</Text>}
                  {showConfidence && (
                    <View
                      style={[
                        styles.confidencePill,
                        confidence === "low" && styles.confidencePillLow,
                      ]}
                      accessible={true}
                      accessibilityLabel={`${confidence} confidence: MileClear is less sure about this classification`}
                    >
                      <Text style={styles.confidencePillText}>
                        {confidence === "low" ? "Review" : "?"}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Free-text note — prominent in Inbox, subtle elsewhere */}
          {isEditingNote ? (
            <View style={styles.noteEditWrap}>
              <TripNoteEditor initial={note} onSave={(text) => saveNote(item.id, item.notes, text)} />
            </View>
          ) : inInbox ? (
            <TouchableOpacity
              style={styles.noteRowInbox}
              onPress={() => openNoteEditor(item.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={note ? `Note: ${note}. Tap to edit.` : "Add a note"}
            >
              <Ionicons
                name={note ? "create" : "add-circle-outline"}
                size={15}
                color={note ? AMBER : TEXT_3}
                accessible={false}
              />
              <Text style={[styles.noteTextInbox, !note && styles.notePlaceholder]} numberOfLines={3}>
                {note || "Add a note"}
              </Text>
            </TouchableOpacity>
          ) : note ? (
            <TouchableOpacity
              style={styles.noteRowSubtle}
              onPress={() => openNoteEditor(item.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Note: ${note}. Tap to edit.`}
            >
              <Ionicons name="chatbox-ellipses-outline" size={12} color={TEXT_3} accessible={false} />
              <Text style={styles.noteTextSubtle} numberOfLines={1}>{note}</Text>
            </TouchableOpacity>
          ) : null}

        {/* Quick classify buttons for unclassified trips */}
        {isUnclassified && (
          <View style={styles.quickClassifyWrap}>
            {tripSuggestion && (
              <View style={styles.inlineSuggestion}>
                <Ionicons name="sparkles" size={12} color={AMBER} />
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
                  <ActivityIndicator size="small" color={BG} accessibilityLabel="Classifying" />
                ) : (
                  <>
                    {tripSuggestion?.classification === "business" && (
                      <Ionicons name="sparkles" size={12} color={BG} accessible={false} />
                    )}
                    <Ionicons name="briefcase" size={14} color={BG} accessible={false} />
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
                  <ActivityIndicator size="small" color={TEXT_2} accessibilityLabel="Classifying" />
                ) : (
                  <>
                    {tripSuggestion?.classification === "personal" && (
                      <Ionicons name="sparkles" size={12} color={BG} accessible={false} />
                    )}
                    <Ionicons name="car" size={14} color={tripSuggestion?.classification === "personal" ? BG : TEXT_2} accessible={false} />
                    <Text style={tripSuggestion?.classification === "personal" ? styles.quickClassifyBtnTextDark : styles.quickClassifyBtnTextLight}>Personal</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        {/* Possible double-count: only shown while the other trip is on
            screen too, so the driver can see both before choosing. */}
        {duplicateOther && !mergeMode && (
          <View style={styles.duplicateWrap}>
            <View style={styles.duplicateNoteRow}>
              <Ionicons name="copy-outline" size={12} color={AMBER} accessible={false} />
              <Text style={styles.duplicateNoteText}>
                Looks like the same journey as the one {duplicateOtherIsBelow ? "below" : "above"}
              </Text>
            </View>
            <View style={styles.duplicateActions}>
              <TouchableOpacity
                style={[styles.duplicateBtn, styles.duplicateBtnPrimary]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleMergeDuplicate(item, duplicateOther);
                }}
                disabled={isDuplicateBusy}
                accessibilityRole="button"
                accessibilityLabel="Merge the two trips into one"
              >
                <Text style={styles.duplicateBtnPrimaryText}>{isDuplicateBusy ? "Working" : "Merge"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.duplicateBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleKeepBoth(item.id);
                }}
                disabled={isDuplicateBusy}
                accessibilityRole="button"
                accessibilityLabel="Keep both trips"
              >
                <Text style={styles.duplicateBtnText}>Keep both</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        </View>{/* /tripCardBody */}
      </TouchableOpacity>
    );

    // Don't wrap in Swipeable while in merge-mode — taps should toggle
    // selection, not be eaten by gesture handlers. Also skip for local
    // (unsynced) trips since the delete action requires a server round-trip.
    if (mergeMode || item._isLocal) {
      return cardInner;
    }

    return (
      <Swipeable
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
      >
        {cardInner}
      </Swipeable>
    );
  };

  const routeGroups: RouteGroup[] = filter === "unclassified"
    ? groupUnclassifiedTrips(trips.filter((t) => t.classification === "unclassified"))
    : [];

  // The flat list reads day by day: newest day at the top, and inside a day
  // the first trip first, so checking a day for missed journeys runs
  // forwards rather than backwards. Regrouped over the whole loaded array
  // every time a page arrives, so the oldest day on screen fills in as the
  // next page loads.
  const dayRows = useMemo<DayRow<TripItem>[]>(() => groupTripsByDay(trips), [trips]);

  // Odometer line under each day header (SPEC-UX 2.3). One request covers the
  // days on screen; a failure just means no lines, never an error.
  const [odoDays, setOdoDays] = useState<OdometerDay[]>([]);
  const dayKeys = useMemo(
    () => dayRows.filter((r): r is Extract<DayRow<TripItem>, { kind: "header" }> => r.kind === "header").map((r) => r.dayKey),
    [dayRows]
  );
  const odoRange = useMemo(() => loadedRange(dayKeys), [dayKeys]);
  const odoRangeKey = odoRange ? `${odoRange.from}|${odoRange.to}` : "";
  useEffect(() => {
    if (!odoRange) return;
    let cancelled = false;
    fetchOdometerDays(odoRange)
      .then((res) => {
        if (!cancelled) setOdoDays(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // odoRange is derived from odoRangeKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odoRangeKey, odoTick]);
  const odoLines = useMemo(() => selectDayLines(odoDays, dayKeys), [odoDays, dayKeys]);

  const renderDayRow = ({ item }: { item: DayRow<TripItem> }) => {
    if (item.kind === "header") {
      const odo = odoLines.get(item.dayKey);
      return (
        <View>
          <Text style={[styles.dayHeader, odo ? { marginBottom: 0 } : null]} accessibilityRole="header">
            {item.label}
          </Text>
          {odo ? (
            <TouchableOpacity
              style={styles.odoLine}
              onPress={() =>
                router.push(`/odometer-log?date=${item.dayKey}&vehicleId=${odo.vehicleId}` as never)
              }
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={dayLineA11y(odo)}
            >
              <Text style={styles.odoLineText} maxFontSizeMultiplier={1.4}>{dayLineText(odo)}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    return renderTrip({ item: item.trip });
  };

  // Drives the collapsed Filters control. A narrowed list never reads as
  // trips having gone missing: the button turns amber with a count, and the
  // summary card under the row names each active filter.
  const activePlatformLabel =
    platformFilter === "all" ? null : (PLATFORM_LABELS[platformFilter] ?? platformFilter);
  const activeDateLabel = dateRange === "all" ? null : rangeLabel(dateRange, customFrom, customTo);
  const activeFilterCount = (activePlatformLabel ? 1 : 0) + (activeDateLabel ? 1 : 0);

  // A brand-new driver with no trips and nothing to sort: no review card, just
  // the empty state.
  const noTripsAtAll =
    !loading && filter === "all" && trips.length === 0 && unclassifiedCount === 0 &&
    (missedCount ?? 0) === 0 &&
    dateRange === "all" && platformFilter === "all";

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
              <Ionicons name="git-branch-outline" size={14} color={AMBER} accessible={false} />
              <Text style={styles.routeGroupLabel} numberOfLines={1}>
                {group.routeLabel}
              </Text>
            </View>
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={TEXT_3}
              accessible={false}
            />
          </View>

          {/* Date and time */}
          <Text style={styles.routeGroupDate}>
            {isSingleton
              ? `${latestDate} at ${latestTime}`
              : `Latest: ${latestDate} at ${latestTime}`}
          </Text>

          {/* The route, before the Business / Personal buttons that ask
              about it. The group's latest trip stands for the group. */}
          <TripRouteCard
            tripId={latestTrip.id}
            routePolyline={latestTrip.routePolyline}
            isManualEntry={latestTrip.isManualEntry}
            startLat={latestTrip.startLat}
            startLng={latestTrip.startLng}
            endLat={latestTrip.endLat}
            endLng={latestTrip.endLng}
            height={140}
            style={styles.routeGroupMap}
          />

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
                <ActivityIndicator size="small" color={BG} accessibilityLabel="Classifying" />
              ) : (
                <>
                  <Ionicons name="briefcase" size={14} color={BG} accessible={false} />
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
                <ActivityIndicator size="small" color={TEXT_2} accessibilityLabel="Classifying" />
              ) : (
                <>
                  <Ionicons name="car" size={14} color={TEXT_2} accessible={false} />
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
                {renderTrip({ item: trip, showDate: true })}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Trips"
        addRoute="/trip-form"
        right={
          <>
          {/* The Recent Journeys map left Home (Oct 2026); this is its entry point. */}
          <TouchableOpacity
            style={styles.filtersButton}
            onPress={() => router.push("/journey-map" as never)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Journey map. Opens a map of your recent routes."
          >
            <Ionicons name="map-outline" size={16} color={TEXT_2} accessible={false} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filtersButton, activeFilterCount > 0 && styles.filtersButtonActive]}
            onPress={() => setShowFiltersSheet(true)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={
              activeFilterCount > 0
                ? `Filters, ${[activePlatformLabel, activeDateLabel].filter(Boolean).join(", ")} active. Opens filter options.`
                : "Filters. Opens platform and date range options."
            }
          >
            <Ionicons
              name={activeFilterCount > 0 ? "funnel" : "funnel-outline"}
              size={16}
              color={activeFilterCount > 0 ? AMBER : TEXT_2}
              accessible={false}
            />
            {activeFilterCount > 0 && (
              <View style={styles.filtersCountBadge} accessible={false}>
                <Text style={styles.filtersCountText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          </>
        }
      />
      <FlatList
        key={filter === "unclassified" ? "grouped" : "flat"}
        data={filter === "unclassified" ? (routeGroups as any[]) : dayRows}
        keyExtractor={(item) => {
          if (filter === "unclassified") return (item as RouteGroup).key;
          const row = item as DayRow<TripItem>;
          return row.kind === "header" ? row.key : row.trip.id;
        }}
        renderItem={filter === "unclassified" ? (renderRouteGroup as any) : (renderDayRow as any)}
        onEndReached={onEndReachedSafe}
        onEndReachedThreshold={0.3}
        // Each row carries a small map thumbnail (a lite / cached snapshot,
        // not a live map). Keep the render window tight so the list mounts
        // a screen or two of them, not the whole page. Day headers are
        // items too, hence 10 for about six trips on the first screen.
        windowSize={7}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        removeClippedSubviews={Platform.OS === "android"}
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
            {/* Safety: warn (any filter) if auto-detection is off, so missing
                trips don't go unexplained. One tap re-enables. */}
            <TrackingOffBanner />
            {noTripsAtAll ? (
              // Brand-new drivers are the ones who most need "Missing a trip?".
              <View style={styles.soloReporter}>
                <MissingTripReporter variant="row" onTripAdded={onRefresh} />
              </View>
            ) : (
              <TripsReviewStrip
                unclassifiedCount={unclassifiedCount}
                missedCount={missedCount}
                loading={!countsLoaded}
                offline={isOffline}
                inInbox={filter === "unclassified"}
                onOpenInbox={() => handleFilterChange("unclassified")}
                reporter={<MissingTripReporter variant="row" onTripAdded={onRefresh} />}
              />
            )}

            {/* Four equal segments, no sideways scroll: with the Filters
                button up in the header the row has the full width, so
                "Personal" fits whole even at large text. The Inbox shows a
                dot, not a number; the count lives in the review card. */}
            <View style={styles.segmented} accessibilityRole="tablist">
              {FILTERS.map((f) => {
                const selected = filter === f.value;
                return (
                  <TouchableOpacity
                    key={f.label}
                    style={[styles.segment, selected && styles.segmentActive]}
                    onPress={() => handleFilterChange(f.value)}
                    hitSlop={{ top: 4, bottom: 4 }}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      f.value === "unclassified" && unclassifiedCount > 0
                        ? `${f.label}, ${unclassifiedCount} trip${unclassifiedCount !== 1 ? "s" : ""} to classify`
                        : f.label
                    }
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[styles.segmentText, selected && styles.segmentTextActive]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.3}
                    >
                      {f.label}
                    </Text>
                    {f.value === "unclassified" && unclassifiedCount > 0 && (
                      <View
                        style={[styles.segmentDot, selected && styles.segmentDotActive]}
                        accessible={false}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Inbox: journeys to check come first, then the trips to classify. */}
            {filter === "unclassified" && (
              <View style={{ display: (missedCount ?? 0) > 0 ? "flex" : "none" }}>
                <Text style={styles.inboxSectionLabel}>JOURNEYS TO CHECK</Text>
                <MissedJourneys startExpanded onCountChange={setMissedCount} />
              </View>
            )}
            {filter === "unclassified" && routeGroups.length > 0 && (
              <Text style={styles.inboxSectionLabel}>TO CLASSIFY</Text>
            )}

            {/* Stats summary - shown when any filter (date range OR platform)
                is active. Sourced from /trips/summary so totals are accurate
                no matter how far the user has scrolled. Falls back to a
                client-side computation if the aggregate request failed. */}
            {(dateRange !== "all" || platformFilter !== "all") && (summary || trips.length > 0) && (() => {
              const stats = summary ?? {
                totalMiles: trips.reduce((s, t) => s + t.distanceMiles, 0),
                totalTrips: trips.length,
                businessMiles: trips.filter((t) => t.classification === "business").reduce((s, t) => s + t.distanceMiles, 0),
                businessTrips: trips.filter((t) => t.classification === "business").length,
                personalMiles: trips.filter((t) => t.classification === "personal").reduce((s, t) => s + t.distanceMiles, 0),
                personalTrips: trips.filter((t) => t.classification === "personal").length,
              };
              const platformLabel =
                platformFilter === "all"
                  ? null
                  : (PLATFORM_LABELS[platformFilter] ?? platformFilter);
              const headerLabel = [
                dateRange !== "all" ? rangeLabel(dateRange, customFrom, customTo) : null,
                platformLabel,
              ]
                .filter(Boolean)
                .join(" · ")
                .toUpperCase();
              return (
                <View style={styles.rangeStatsCard}>
                  <Text style={styles.rangeStatsLabel}>{headerLabel}</Text>
                  <View style={styles.rangeStatsRow}>
                    <View style={styles.rangeStatItem}>
                      <Text style={styles.rangeStatValue}>
                        {stats.totalMiles.toFixed(1)}
                      </Text>
                      <Text style={styles.rangeStatUnit}>miles</Text>
                    </View>
                    <View style={styles.rangeStatDivider} />
                    <View style={styles.rangeStatItem}>
                      <Text style={styles.rangeStatValue}>{stats.totalTrips}</Text>
                      <Text style={styles.rangeStatUnit}>
                        {stats.totalTrips === 1 ? "trip" : "trips"}
                      </Text>
                    </View>
                    {stats.businessMiles > 0 && (
                      <>
                        <View style={styles.rangeStatDivider} />
                        <View style={styles.rangeStatItem}>
                          <Text style={[styles.rangeStatValue, styles.rangeStatBusiness]}>
                            {stats.businessMiles.toFixed(1)}
                          </Text>
                          <Text style={styles.rangeStatUnit}>business mi</Text>
                        </View>
                      </>
                    )}
                    {stats.personalMiles > 0 && (
                      <>
                        <View style={styles.rangeStatDivider} />
                        <View style={styles.rangeStatItem}>
                          <Text style={styles.rangeStatValue}>
                            {stats.personalMiles.toFixed(1)}
                          </Text>
                          <Text style={styles.rangeStatUnit}>personal mi</Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              );
            })()}

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
                    <Ionicons name="git-merge-outline" size={14} color={selectedIds.size >= 2 ? BG : TEXT_3} />
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
            loadError ? (
              <ErrorState
                title="Couldn't load your trips"
                description="Check your connection and pull down to try again."
                onRetry={() => {
                  setLoading(true);
                  loadTrips(1);
                }}
              />
            ) : filter === "unclassified" ? (
              (missedCount ?? 0) > 0 ? null : (
                <EmptyState
                  icon="checkmark-circle-outline"
                  title="All caught up"
                  description="Every trip is sorted and there's nothing to check."
                  iconColor={colors.amber}
                />
              )
            ) : filter === "business" || filter === "personal" ? (
              <EmptyState
                icon="filter-outline"
                title={`No ${filter} trips`}
                description={`Trips you mark ${filter === "business" ? "Business" : "Personal"} show here.`}
              />
            ) : (
              <EmptyState
                icon="car-outline"
                title="No trips yet"
                description="Drives record by themselves once you set off. You can also add one by hand."
                action={
                  <Button
                    title="Add a past trip"
                    variant="secondary"
                    onPress={() => router.push({ pathname: "/trip-form", params: { mode: "manual" } } as never)}
                  />
                }
              />
            )
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
            {/* Page progress: visible whenever the list has scrolled or
                paginated. Tells the user where they are in the dataset
                without requiring a "Load more" button. */}
            {!loading && trips.length > 0 && filter !== "unclassified" && (
              <Text style={styles.pageProgress}>
                {page >= totalPages
                  ? `Showing all ${trips.length} trip${trips.length === 1 ? "" : "s"}`
                  : `Showing ${trips.length} of ${summary?.totalTrips ?? "..."} trips · page ${page} of ${totalPages}`}
              </Text>
            )}
            {!noTripsAtAll && (
              <Button
                title="Add a past trip"
                variant="secondary"
                icon="add"
                onPress={() => router.push({ pathname: "/trip-form", params: { mode: "manual" } } as never)}
              />
            )}
          </View>
        }
      />
      {loading && !refreshing && (
        // Skeleton-first loading overlay: instead of a centred amber spinner,
        // show ghost trip rows that mimic the actual list shape. Reduces the
        // perceived wait on cold opens — the user sees layout immediately
        // and waits less time staring at a blank screen.
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingSkeletonStack}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={84} radius={radii.md} />
            ))}
          </View>
        </View>
      )}

      {/* Long-press menu */}
      <AppModal visible={menuTrip != null} animationType="fade" onRequestClose={() => setMenuTrip(null)}>
        <Pressable style={styles.mergeBackdrop} onPress={() => setMenuTrip(null)}>
          <Pressable style={styles.mergeSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.mergeHandle} />
            {menuActions.map((a) => (
              <TouchableOpacity
                key={a.label}
                style={styles.projectRow}
                onPress={() => {
                  setMenuTrip(null);
                  a.onPress();
                }}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.projectRowText,
                    "destructive" in a && a.destructive && { color: "#f87171" },
                  ]}
                >
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
            <Button title="Cancel" variant="ghost" onPress={() => setMenuTrip(null)} />
          </Pressable>
        </Pressable>
      </AppModal>

      {/* Merge classification modal */}
      {mergeModalVisible && (
        <AppModal visible={true} animationType="slide" onRequestClose={() => setMergeModalVisible(false)}>
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
                      <Ionicons name="location" size={14} color={GREEN} />
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
                      <Ionicons name="flag" size={14} color={RED} />
                      <Text style={styles.mergePreviewText} numberOfLines={1}>
                        {last.endAddress || last.startAddress || "End point"}
                      </Text>
                    </View>
                    <View style={styles.mergePreviewStats}>
                      <Text style={styles.mergePreviewStat}>{totalMiles.toFixed(1)} mi total</Text>
                      <Text style={styles.mergePreviewStat}>
                        {formatTime(first.startedAt)} to {last.endedAt ? formatTime(last.endedAt) : "ongoing"}
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
                      color={mergeClassification === cls ? BG : TEXT_2}
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
                  <ActivityIndicator size="small" color={BG} accessibilityLabel="Merging trips" />
                ) : (
                  <>
                    <Ionicons name="git-merge-outline" size={18} color={BG} />
                    <Text style={styles.mergeConfirmText}>
                      Merge into 1 Trip
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </AppModal>
      )}

      {/* Filters sheet - platform + date range, folded behind the single
          "Filters" control in row 1. Same chips, same handlers as before;
          only the location moved. */}
      <AppModal
        visible={showFiltersSheet}
        animationType="slide"
        onRequestClose={() => setShowFiltersSheet(false)}
      >
        <Pressable
          style={styles.mergeBackdrop}
          onPress={() => setShowFiltersSheet(false)}
        >
          <Pressable
            style={styles.mergeSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.mergeHandle} />
            <Text style={styles.mergeTitle}>Filters</Text>

            <View style={styles.filtersSection}>
              <Text style={styles.filtersSectionLabel}>Platform</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dateRangeRow}
                accessibilityLabel="Platform filter"
              >
                {([{ value: "all" as const, label: "Any platform" }, ...GIG_PLATFORMS]).map((p) => {
                  const active = platformFilter === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      style={[styles.dateRangeChip, active && styles.dateRangeChipActive]}
                      onPress={() => handlePlatformChange(p.value as PlatformTag | "all")}
                      accessibilityRole="button"
                      accessibilityLabel={`Platform: ${p.label}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.dateRangeChipText,
                          active && styles.dateRangeChipTextActive,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.filtersSection}>
              <Text style={styles.filtersSectionLabel}>Date range</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dateRangeRow}
                accessibilityLabel="Date range filter"
              >
                {DATE_RANGES.map((r) => {
                  const active = dateRange === r.value;
                  const label =
                    r.value === "custom"
                      ? rangeLabel(r.value, customFrom, customTo)
                      : r.label;
                  return (
                    <TouchableOpacity
                      key={r.value}
                      style={[styles.dateRangeChip, active && styles.dateRangeChipActive]}
                      onPress={() => {
                        if (r.value === "custom") {
                          // Hand off to the dedicated custom-range modal -
                          // avoids stacking two sheets at once.
                          setShowFiltersSheet(false);
                          setShowCustomPicker(true);
                          return;
                        }
                        setDateRange(r.value);
                        setCustomFrom(null);
                        setCustomTo(null);
                        // Schedule reload after state has actually flushed.
                        dateRangeRef.current = r.value;
                        customFromRef.current = null;
                        customToRef.current = null;
                        loadTrips(1);
                        loadSummary();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Date range: ${label}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.dateRangeChipText,
                          active && styles.dateRangeChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {hasProjectLabels && (
              <TouchableOpacity
                style={styles.projectRow}
                onPress={() => {
                  setShowFiltersSheet(false);
                  router.push("/project-totals");
                }}
                accessibilityRole="button"
                accessibilityLabel="Miles by project. Opens your business miles totalled by project or client."
              >
                <Ionicons name="briefcase-outline" size={18} color={TEXT_2} accessible={false} />
                <Text style={styles.projectRowText}>Miles by project</Text>
                <Ionicons name="chevron-forward" size={16} color={TEXT_3} accessible={false} />
              </TouchableOpacity>
            )}

            <View style={styles.filtersSheetFooter}>
              <Button
                title="Clear filters"
                variant="ghost"
                onPress={clearFilters}
                disabled={activeFilterCount === 0}
                style={{ flex: 1 }}
              />
              <Button
                title="Done"
                variant="primary"
                onPress={() => setShowFiltersSheet(false)}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* Custom date-range picker modal */}
      <AppModal
        visible={showCustomPicker}
        animationType="slide"
        onRequestClose={() => setShowCustomPicker(false)}
      >
        <Pressable
          style={styles.mergeBackdrop}
          onPress={() => setShowCustomPicker(false)}
        >
          <Pressable
            style={styles.mergeSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.mergeHandle} />
            <Text style={styles.mergeTitle}>Custom date range</Text>
            <Text style={styles.customRangeHint}>
              Pick a start and end date. The trip list and stats update to that range.
            </Text>
            <DateTimePickerField
              label="From"
              value={customFrom}
              onChange={setCustomFrom}
              maximumDate={customTo ?? new Date()}
            />
            <DateTimePickerField
              label="To"
              value={customTo}
              onChange={setCustomTo}
              maximumDate={new Date()}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setShowCustomPicker(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Apply"
                variant="primary"
                onPress={() => {
                  if (!customFrom || !customTo) {
                    setShowCustomPicker(false);
                    return;
                  }
                  setDateRange("custom");
                  dateRangeRef.current = "custom";
                  customFromRef.current = customFrom;
                  customToRef.current = customTo;
                  setShowCustomPicker(false);
                  loadTrips(1);
                  loadSummary();
                }}
                disabled={!customFrom || !customTo}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    </View>
  );
}

// ── Style constants ────────────────────────────────────────────────
//
// Local aliases for theme tokens. Defined here so the find/replace pass
// across the styles block is one-line per replacement instead of touching
// hundreds of style declarations. Same naming pattern dashboard.tsx uses.

const BG = colors.bg;
const CARD_BG = colors.surface;
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const GREEN = colors.green;
const RED = colors.red;
// Route thumbnail on each trip row: small enough for five or six rows per
// screen, big enough to tell a known route at a glance.
const THUMB_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  listContent: {
    padding: 16,
  },
  // Day header in the flat list. Matches the month header on the shifts
  // screen: small, muted, tracked, sitting just above its first card.
  odoLine: {
    minHeight: 44,
    justifyContent: "center",
  },
  odoLineText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_3,
    fontVariant: ["tabular-nums"],
  },
  dayHeader: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_3,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  // Collapsed control for platform + date range - opens the Filters sheet.
  // Icon only, so it can never crowd the classification chips off screen.
  // Four equal segments under the review card.
  soloReporter: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.md,
    marginBottom: 16,
    overflow: "hidden",
  },
  segmented: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  segmentActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  segmentText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  segmentTextActive: {
    color: BG,
  },
  segmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AMBER,
  },
  segmentDotActive: {
    backgroundColor: BG,
  },
  inboxSectionLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_3,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    marginBottom: 16,
  },
  projectRowText: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text1,
  },
  filtersButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  filtersButtonActive: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  filtersCountBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: AMBER,
    justifyContent: "center",
    alignItems: "center",
  },
  filtersCountText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: BG,
  },
  // Filters sheet body
  filtersSectionLabel: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: TEXT_3,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  filtersSection: {
    marginBottom: 20,
  },
  filtersSheetFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  // Date-range chip row (smaller / more secondary than classification pills)
  dateRangeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 0,
    marginBottom: 16,
  },
  dateRangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  dateRangeChipActive: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  dateRangeChipText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  dateRangeChipTextActive: {
    color: AMBER,
    fontFamily: fonts.semibold,
  },
  // Stats summary card shown above the trip list when a date range is active
  rangeStatsCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.12)",
  },
  rangeStatsLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: AMBER,
    letterSpacing: 1,
    marginBottom: 10,
  },
  rangeStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rangeStatItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  rangeStatValue: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: TEXT_1,
    letterSpacing: -0.4,
  },
  rangeStatBusiness: {
    color: GREEN,
  },
  rangeStatUnit: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: TEXT_3,
    letterSpacing: 0.2,
  },
  rangeStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  customRangeHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
    marginBottom: 16,
  },
  // Trip cards — compact layout (Anthony 16 May audit)
  tripCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 10,
    flexDirection: "row",
    overflow: "hidden",
  },
  tripCardUnclassified: {
    borderColor: "rgba(245, 166, 35, 0.25)",
  },
  // Left coloured bar — classification at a glance (iOS Mail style)
  classificationBar: {
    width: 5,
    alignSelf: "stretch",
  },
  tripCardBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tripMainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Placeholder look (and icon) sits underneath; the map covers it.
  tripThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  tripThumbMap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
  },
  tripText: {
    flex: 1,
    minWidth: 0,
  },
  routeGroupMap: {
    marginTop: 10,
    marginBottom: 10,
  },
  noteGlyphBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  noteEditWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  noteRowInbox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  noteTextInbox: {
    flex: 1,
    color: TEXT_1,
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  notePlaceholder: {
    color: TEXT_3,
    fontStyle: "italic",
  },
  noteRowSubtle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  noteTextSubtle: {
    flex: 1,
    color: TEXT_2,
    fontSize: 11.5,
    fontFamily: fonts.regular,
  },
  tripPrimaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // Wraps rather than clips when a trip has several badges at once.
  tripSecondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 8,
    rowGap: 4,
    marginTop: 5,
  },
  distanceCompact: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: "#fff",
  },
  timeCompact: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  routeCompact: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: TEXT_1,
    marginTop: 3,
  },
  arrowSubtle: {
    color: TEXT_3,
  },
  dotSep: {
    fontSize: 13,
    color: TEXT_3,
    marginHorizontal: 2,
  },
  dateCompact: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  // Confidence pill — replaces unexplained amber dot
  confidencePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.35)",
  },
  confidencePillLow: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  confidencePillText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: AMBER,
    letterSpacing: 0.3,
  },
  // Swipe action buttons (Anthony 16 May audit — native iOS feel)
  swipeClassifyAction: {
    width: 110,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    gap: 4,
  },
  swipeDeleteAction: {
    width: 90,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    gap: 4,
  },
  swipeActionText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.semibold,
    color: "#fff",
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
  classificationBadge: {
    fontSize: 11,
    fontFamily: fonts.bold,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  businessBadge: {
    color: BG,
    backgroundColor: AMBER,
  },
  personalBadge: {
    color: TEXT_2,
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
  autoSortedIcon: {
    marginLeft: 6,
  },
  duplicateWrap: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.25)",
  },
  duplicateNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  duplicateNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.medium,
    color: "#d4a053",
  },
  duplicateActions: {
    flexDirection: "row",
    gap: 8,
  },
  duplicateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  duplicateBtnPrimary: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  duplicateBtnPrimaryText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: BG,
  },
  duplicateBtnText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  unclassifiedBadgeText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  tripDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  distanceText: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: "#fff",
  },
  timeText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  addressText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    flexShrink: 1,
  },
  arrowText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  tripMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  platformBadge: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_2,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  metaText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  manualBadge: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_2,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
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
    backgroundColor: AMBER,
  },
  quickClassifyPersonal: {
    backgroundColor: "#374151",
  },
  quickClassifySuggested: {
    borderWidth: 2,
    borderColor: "#ca8a04",
  },
  quickClassifyPersonalSuggested: {
    backgroundColor: AMBER,
  },
  inlineSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  inlineSuggestionText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: "#d4a053",
  },
  quickClassifyBtnTextDark: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: BG,
  },
  quickClassifyBtnTextLight: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  // Footer
  footer: {
    marginTop: 16,
    paddingBottom: 20,
  },
  pageProgress: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textAlign: "center",
    marginBottom: 12,
  },
  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    paddingTop: 200,
    paddingHorizontal: spacing.lg,
  },
  loadingSkeletonStack: {
    gap: spacing.md,
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
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.medium,
    color: TEXT_2,
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
    fontFamily: fonts.bold,
    color: BG,
  },
  mergeBannerBtnTextDisabled: {
    color: TEXT_3,
  },
  // Merge modal
  mergeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  mergeSheet: {
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.bold,
    color: TEXT_1,
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
    fontFamily: fonts.medium,
    color: TEXT_2,
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
    backgroundColor: TEXT_3,
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
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  mergeLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
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
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  mergeClassBtnBusiness: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  mergeClassBtnPersonal: {
    backgroundColor: "#60a5fa",
    borderColor: "#60a5fa",
  },
  mergeClassBtnText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  mergeClassBtnTextActive: {
    color: BG,
  },
  mergePlatformScroll: {
    marginBottom: 20,
  },
  mergePlatformChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: CARD_BG,
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
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  mergePlatformTextActive: {
    color: AMBER,
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.bold,
    color: BG,
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
    fontFamily: fonts.semibold,
    color: TEXT_1,
    flex: 1,
  },
  routeGroupDate: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
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
    fontFamily: fonts.medium,
    color: TEXT_2,
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
    backgroundColor: AMBER,
  },
  routeGroupBtnPersonal: {
    backgroundColor: "#374151",
  },
  routeGroupBtnTextDark: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: BG,
  },
  routeGroupBtnTextLight: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
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
