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
  Platform,
  UIManager,
  Pressable,
  ScrollView,
  Alert,
  AccessibilityInfo,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Button } from "../../components/Button";
import { DateTimePickerField } from "../../components/DateTimePickerField";
import { TripThumb } from "../../components/trips/TripThumb";
import { MissedDrivesStrip } from "../../components/trips/MissedDrivesStrip";
import { PracticeSortLine } from "../../components/practice/PracticeSortLine";
import { ClassifyControl } from "../../components/home/ClassifyControl";
import { fetchOdometerDays, type OdometerDay } from "../../lib/api/odometer";
import { dayLineA11y, dayLineText, loadedRange, selectDayLines } from "../../lib/odometer/logic";
import { joinPreview } from "../../lib/trips/joinTotalRule";
import { fetchTrips, fetchTripSummary, fetchProjectLabels, fetchUnclassifiedCount, fetchMissedJourneys, fetchClassificationSuggestion, mergeTrips, undoClassification, clearDuplicateFlag, TripWithVehicle, ClassificationSuggestion, type TripSummary } from "../../lib/api/trips";
import { describeError } from "../../lib/api/apiError";
import { syncUpdateTrip, syncDeleteTrip } from "../../lib/sync/actions";
import { processSyncQueue } from "../../lib/sync";
import { isNetworkError } from "../../lib/sync/errors";
import { markLiveActivityClassified } from "../../lib/liveActivity";
import { getLocalTrips, getLocalUnsyncedTrips, getQueuedTripProjectLabels } from "../../lib/db/queries";
import {
  ALL_CLIENTS,
  clientFilterChoices,
  clientFilterLabel,
  clientFilterParams,
  filterLocalTripsByClient,
  sameClientFilter,
  type ClientFilter,
} from "../../lib/trips/clientFilter";
import { dayLabel, groupTripsByDay, type DayRow } from "../../lib/trips/dayOrder";
import { useNewestTripFirst } from "../../lib/trips/orderPref";
import { createdInBatchIds, dayMilesText, isRecentAutoSort, suggestionLine, tripTag } from "../../lib/trips/tripLabels";
import { routeText } from "../../lib/home/lastTrip";
import { mergeTripPage, uniqueById } from "../../lib/trips/pageMerge";
import { animateListChange } from "../../lib/ui/listTransition";
import { tripEndLabel, type SavedPlace } from "../../lib/trips/placeLabel";
import { loadSavedPlaces } from "../../lib/trips/savedPlaces";
import { getDatabase } from "../../lib/db";
import { learnFromClassification } from "../../lib/classification";
import { maybeRequestReview } from "../../lib/rating/index";
import { GIG_PLATFORMS, getTaxYear, parseTaxYear } from "@mileclear/shared";
import type { TripClassification, PlatformTag } from "@mileclear/shared";
import { Skeleton } from "../../components/Skeleton";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";
import { TripNoteEditor, displayNote } from "../../components/TripNoteEditor";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
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

/** The "Marked Business · Undo" note after a swipe, and what Undo puts back. */
interface SwipeNotice {
  item: TripItem;
  from: TripClassification;
  to: "business" | "personal";
  /** Where the row sat, so Undo can put a row that left back in place. */
  index: number;
  /** The list it was swiped in. */
  filter: TripClassification | "all";
  /** True when the row no longer belongs in that list. */
  leaves: boolean;
}

/** How long the note stays, and how long a leaving row stays first. */
const SWIPE_NOTICE_MS = 4000;
const SWIPE_LEAVE_MS = 1200;

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
  /** Raw address label for grouping; the card itself shows the short place names. */
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
  { label: "To sort", value: "unclassified" },
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
  { label: "Choose dates", value: "custom" },
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
        return `${fmt(customFrom)} to ${fmt(customTo)}`;
      }
      return "Choose dates";
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

/** Trips on this phone whose upload has failed for good (red "Retry" tag). */
async function loadFailedTripIds(): Promise<Set<string>> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ entity_id: string }>(
      "SELECT DISTINCT entity_id FROM sync_queue WHERE entity_type = 'trip' AND status = 'permanently_failed'"
    );
    return new Set(rows.map((r) => r.entity_id));
  } catch {
    return new Set();
  }
}

/**
 * Trips on this phone that belong under the client filter, judged by the
 * Project / client in their queued upload. All clients: every one. If the
 * queue can't be read, none: better a short list than a wrong one.
 */
async function localTripsForClient<T extends { id: string }>(trips: T[], client: ClientFilter): Promise<T[]> {
  if (client.kind === "all" || trips.length === 0) return trips;
  try {
    return filterLocalTripsByClient(trips, await getQueuedTripProjectLabels(), client);
  } catch {
    return [];
  }
}

export default function TripsScreen() {
  const router = useRouter();
  // "?filter=unclassified" is how the classify reminders (evening digest,
  // weekly nudge, the app's own reminder) open To sort. Until 28 Sep 2026
  // nothing read it, so every one of those taps landed on All instead.
  // "&range=lastTaxYear" narrows it to the tax year the 31 January Self
  // Assessment deadline is for (the "Ready for 31 January?" checklist).
  // "?client=NHS%20Trust" is how a row on Miles by project opens its trips.
  const params = useLocalSearchParams<{ filter?: string; range?: string; day?: string; client?: string }>();
  const [trips, setTrips] = useState<TripItem[]>([]);
  // Bumped to refetch the odometer day lines (focus, pull to refresh).
  const [odoTick, setOdoTick] = useState(0);
  const [filter, setFilter] = useState<TripClassification | "all">(() =>
    params.filter === "unclassified" ? "unclassified" : "all"
  );
  // Platform filter is orthogonal to classification — both can be active at
  // once. Stored as PlatformTag value or "all" sentinel.
  const [platformFilter, setPlatformFilter] = useState<PlatformTag | "all">("all");
  // Project / client filter (23 Oct 2026), alongside the app and dates ones.
  const [clientFilter, setClientFilter] = useState<ClientFilter>(() =>
    typeof params.client === "string" && params.client.trim()
      ? { kind: "label", label: params.client.trim() }
      : ALL_CLIENTS
  );
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
  // Drives to check (missed-journey proposals). null = not known yet, or the
  // fetch failed; the strip then shows nothing.
  const [missedCount, setMissedCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Whether the driver has tagged any trip with a Project / client. Only
  // then is the "Miles by project" link worth its row. One grouped query.
  const [hasProjectLabels, setHasProjectLabels] = useState(false);
  // The labels themselves, most recent first: the Client chips in Filters.
  const [projectLabels, setProjectLabels] = useState<string[]>([]);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);
  // Trips whose upload failed for good, and the "+" sheet.
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [showAddSheet, setShowAddSheet] = useState(false);
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

  // Route grouping state (To sort view)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [batchClassifyingKey, setBatchClassifyingKey] = useState<string | null>(null);

  const loadUnclassifiedCount = useCallback(async () => {
    try {
      const res = await fetchUnclassifiedCount();
      setUnclassifiedCount(res.count);
    } catch {
      // Ignore: the To sort count just keeps the last value
    }
  }, []);

  // Drives to check feed the strip at the top. A failure leaves the last known
  // count (or none) rather than claiming there is nothing to check. Not run
  // for To sort or on filter taps: there MissedJourneys loads its own.
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
  const clientFilterRef = useRef(clientFilter);
  clientFilterRef.current = clientFilter;
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
        const client = clientFilterRef.current;
        const res = await fetchTrips({
          classification,
          platformTag,
          ...clientFilterParams(client),
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
          // Merge unsynced local items on first page. With a client filter,
          // each one's client comes from its queued upload (lib/trips/clientFilter).
          const unsynced = await localTripsForClient(
            await getLocalUnsyncedTrips({ classification, platformTag }),
            client
          );
          const apiIds = new Set(res.data.map((t) => t.id));
          const uniqueLocal = unsynced.filter((t) => !apiIds.has(t.id)) as TripItem[];
          loadFailedTripIds().then(setFailedIds).catch(() => {});
          const allTrips = uniqueById([...uniqueLocal, ...res.data]);
          // Animate the data swap-in. Pairs with the configureNext call in
          // handleFilterChange / handlePlatformChange so the chip → list
          // transition flows as one motion instead of two snaps.
          animateListChange();
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
          // The phone only knows the client of trips not uploaded yet, so a
          // client filter offline shows just those (the offline line says so).
          const client = clientFilterRef.current;
          const all = await getLocalTrips({ classification, platformTag });
          const local =
            client.kind === "all"
              ? all
              : await localTripsForClient(all.filter((t) => t._isLocal), client);
          setTrips(local as TripItem[]);
          loadFailedTripIds().then(setFailedIds).catch(() => {});
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
        ...clientFilterParams(clientFilterRef.current),
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
        .then((labels) => {
          setHasProjectLabels(labels.length > 0);
          setProjectLabels(labels);
        })
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
      animateListChange();
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

  // A reminder tapped while Trips is already mounted: switch to To sort,
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
      animateListChange();
      setPlatformFilter(value);
      platformFilterRef.current = value;
      setTrips([]);
      setLoading(true);
      loadTrips(1);
      loadSummary();
    },
    [loadTrips, loadSummary]
  );

  const handleClientChange = useCallback(
    (value: ClientFilter) => {
      if (sameClientFilter(value, clientFilterRef.current)) return;
      animateListChange();
      setClientFilter(value);
      clientFilterRef.current = value;
      setTrips([]);
      setLoading(true);
      loadTrips(1);
      loadSummary();
    },
    [loadTrips, loadSummary]
  );

  // Miles by project opens Trips for one client. Cleared afterwards so the
  // same row tapped again later (after the driver changed the filter) is a change.
  useEffect(() => {
    if (typeof params.client !== "string") return;
    const label = params.client.trim();
    if (label) handleClientChange({ kind: "label", label });
    router.setParams({ client: undefined });
  }, [params.client, handleClientChange, router]);

  // Clears platform, client and date range in one reload - the "back to
  // unfiltered" tap from the Filters sheet. Kept separate from
  // handlePlatformChange so clearing doesn't fire two overlapping fetches.
  const clearFilters = useCallback(() => {
    animateListChange();
    setPlatformFilter("all");
    platformFilterRef.current = "all";
    setClientFilter(ALL_CLIENTS);
    clientFilterRef.current = ALL_CLIENTS;
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
  // Reverse a quiet server classification. The trip returns to To sort
  // and the server counts the undo against that route from now on.
  const handleUndoClassification = useCallback(async (tripId: string) => {
    setClassifyingId(tripId);
    try {
      await undoClassification(tripId);
      haptic("selection");
      animateListChange();
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
        animateListChange();
        setTrips((prev) => prev.map((t) =>
          t.id === tripId ? { ...t, classification } : t
        ));
        setUnclassifiedCount((prev) => Math.max(0, prev - 1));

        // In To sort, a trip that now has an answer leaves the view
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

  // Swipe to sort. Until 11 Oct 2026 the row stayed slid open after the tap
  // and nothing said it had worked. Now the row closes, the chip changes at
  // once, a short "Marked Business · Undo" shows at the bottom, and a row
  // that no longer belongs in this list leaves after that, not before.
  const swipeRefs = useRef(new Map<string, Swipeable>());
  const [swipeNotice, setSwipeNotice] = useState<SwipeNotice | null>(null);
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = leaveTimers.current;
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const dropLeaving = useCallback((tripId: string) => {
    const t = leaveTimers.current.get(tripId);
    if (t) clearTimeout(t);
    leaveTimers.current.delete(tripId);
    setLeavingIds((prev) => {
      if (!prev.has(tripId)) return prev;
      const next = new Set(prev);
      next.delete(tripId);
      return next;
    });
  }, []);

  // Puts the row back as it was: back in place if it is still on screen,
  // or back where it was if it already left.
  const restoreRow = useCallback(
    (n: SwipeNotice) => {
      dropLeaving(n.item.id);
      animateListChange();
      setTrips((prev) => {
        if (prev.some((t) => t.id === n.item.id)) {
          return prev.map((t) => (t.id === n.item.id ? { ...t, classification: n.from } : t));
        }
        if (filterRef.current !== n.filter) return prev;
        const next = [...prev];
        next.splice(Math.min(n.index, next.length), 0, { ...n.item, classification: n.from });
        return next;
      });
      if (n.from === "unclassified") setUnclassifiedCount((prev) => prev + 1);
    },
    [dropLeaving]
  );

  const handleSwipeClassify = useCallback(
    async (item: TripItem, to: "business" | "personal") => {
      swipeRefs.current.get(item.id)?.close();
      const from = item.classification;
      if (from === to) return;
      const label = to === "business" ? "Business" : "Personal";
      const leaves =
        filter === "unclassified" || ((filter === "business" || filter === "personal") && filter !== to);
      const notice: SwipeNotice = {
        item,
        from,
        to,
        index: Math.max(0, trips.findIndex((t) => t.id === item.id)),
        filter,
        leaves,
      };

      haptic("light");
      animateListChange();
      setTrips((prev) => prev.map((t) => (t.id === item.id ? { ...t, classification: to } : t)));
      if (from === "unclassified") setUnclassifiedCount((prev) => Math.max(0, prev - 1));

      if (leaves) {
        // Keep it on screen with its new chip for a moment, then let it go.
        setLeavingIds((prev) => new Set(prev).add(item.id));
        const old = leaveTimers.current.get(item.id);
        if (old) clearTimeout(old);
        leaveTimers.current.set(
          item.id,
          setTimeout(() => {
            leaveTimers.current.delete(item.id);
            setLeavingIds((prev) => {
              const next = new Set(prev);
              next.delete(item.id);
              return next;
            });
            // The driver may have changed list since; then the reload owns it.
            if (filterRef.current !== notice.filter) return;
            animateListChange();
            setTrips((prev) => prev.filter((t) => t.id !== item.id));
          }, SWIPE_LEAVE_MS)
        );
      }

      setSwipeNotice(notice);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setSwipeNotice(null), SWIPE_NOTICE_MS);
      AccessibilityInfo.announceForAccessibility(`Marked ${label}. Undo is at the bottom of the screen.`);

      try {
        await syncUpdateTrip(item.id, { classification: to });
        markLiveActivityClassified().catch(() => {});
        setTimeout(() => maybeRequestReview("trip_classified"), 2000);
      } catch {
        restoreRow(notice);
        setSwipeNotice((cur) => (cur?.item.id === item.id ? null : cur));
        Alert.alert("Couldn't save that", "Try again in a moment.");
      }
    },
    [filter, trips, restoreRow]
  );

  const handleSwipeUndo = useCallback(async () => {
    const n = swipeNotice;
    if (!n) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setSwipeNotice(null);
    haptic("selection");
    restoreRow(n);
    const back = n.from === "unclassified" ? "To sort" : n.from === "business" ? "Business" : "Personal";
    AccessibilityInfo.announceForAccessibility(`Undone. Back to ${back}.`);
    try {
      await syncUpdateTrip(n.item.id, { classification: n.from });
    } catch {
      Alert.alert("Couldn't undo", "Check your connection and try again.");
    }
  }, [swipeNotice, restoreRow]);

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
              animateListChange();
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
      ...(isRecentAutoSort(item)
        ? [{ label: "Put back in To sort", onPress: () => handleUndoClassification(item.id) }]
        : []),
      note,
      {
        label: "Join trips",
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

      // Joining into a past shift's typed total keeps the total as it is
      // (Business, its own app), so nothing chosen here would apply.
      const preview = joinPreview(selectedTrips);
      if (preview.kind === "refused") {
        Alert.alert("Can't join these trips", preview.problem);
        return;
      }
      await mergeTrips(
        preview.kind === "into_total"
          ? { tripIds: selectedTrips.map((t) => t.id), classification: "business", platformTag: null }
          : {
              tripIds: selectedTrips.map((t) => t.id),
              classification: mergeClassification,
              platformTag: (mergePlatform as PlatformTag) || null,
            }
      );

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
      const { title, message } = describeError(err, "Couldn't join the trips", { savedLocally: false });
      Alert.alert(title, message);
    } finally {
      setMergeLoading(false);
    }
  }, [selectedIds, trips, mergeClassification, mergePlatform, exitMergeMode, loadTrips, loadSummary, loadUnclassifiedCount]);

  // Possible double-count. The server marks the newer of two trips that
  // overlap in time and share both ends (a drive added by hand whose
  // recording landed later, or a missed-journey gap the app then filled).
  // Nothing is removed until the driver chooses: Join folds the pair into
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
        const { title, message } = describeError(err, "Couldn't join the trips", { savedLocally: false });
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
      animateListChange();
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

        animateListChange();
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
        const { title, message } = describeError(err, "Couldn't sort the trips");
        Alert.alert(title, message);
      } finally {
        setBatchClassifyingKey(null);
      }
    },
    []
  );

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

  // Trips the server saved together (a split's legs), so their late save
  // time isn't read as a late drive.
  const batchIds = useMemo(() => createdInBatchIds(trips), [trips]);

  // showDate: the day list already heads each day, so its rows leave the
  // date out; To sort's route groups mix days, so theirs keep it.
  const renderTrip = ({ item, showDate = false }: { item: TripItem; showDate?: boolean }) => {
    const isUnclassified = item.classification === "unclassified";
    const isBusiness = item.classification === "business";
    const isClassifying = classifyingId === item.id;
    const tripSuggestion = isUnclassified ? suggestions[item.id] : null;
    const suggestionText = suggestionLine(tripSuggestion);
    const isRecentAuto = isRecentAutoSort(item);
    const fromLabel = tripEndLabel(item.startAddress, item.startLat, item.startLng, savedPlaces);
    const toLabel = tripEndLabel(item.endAddress, item.endLat, item.endLng, savedPlaces);
    const route = routeText(fromLabel, toLabel);
    const isSelected = mergeMode && selectedIds.has(item.id);
    const note = displayNote(item.notes);
    const isEditingNote = editingNoteId === item.id;
    const tag = tripTag(item, {
      local: !!item._isLocal,
      uploadFailed: failedIds.has(item.id),
      createdInBatch: batchIds.has(item.id),
    });
    // The trip this one may be a double of, if it is loaded on this screen.
    const duplicateOther = item.possibleDuplicateOfId
      ? trips.find((t) => t.id === item.possibleDuplicateOfId) ?? null
      : null;
    const duplicateOtherIsBelow =
      duplicateOther != null &&
      trips.findIndex((t) => t.id === duplicateOther.id) > trips.findIndex((t) => t.id === item.id);
    const isDuplicateBusy = duplicateBusyId === item.id;

    // Line 2: "08:05 · 12.4 mi · Uber Eats". Personal trips leave the app out.
    const platformLabel =
      item.platformTag && item.classification !== "personal"
        ? (PLATFORM_LABELS[item.platformTag] ?? item.platformTag)
        : null;
    const when = showDate ? `${dayLabel(new Date(item.startedAt))} ${formatTime(item.startedAt)}` : formatTime(item.startedAt);
    const line2 = [when, `${item.distanceMiles.toFixed(1)}\u00a0mi`, platformLabel].filter(Boolean).join(" · ");

    // Swipe actions (Anthony 16 May audit). Right swipe = quick classify to
    // the OTHER state, left swipe = delete. Disabled in join mode, where taps
    // mean multi-select.
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

    // Right-swipe (drag left-to-right) classifies. For unsorted trips it
    // suggests Business; for sorted trips it flips to the other one.
    const targetClass: TripClassification = isBusiness ? "personal" : "business";
    const targetLabel = targetClass === "business" ? "Business" : "Personal";
    const targetColor = targetClass === "business" ? AMBER : colors.personal;
    const renderLeftActions = () =>
      mergeMode ? null : (
        <RectButton
          style={[styles.swipeClassifyAction, { backgroundColor: targetColor }]}
          onPress={() => {
            handleSwipeClassify(item, targetClass);
          }}
          accessibilityLabel={`Mark as ${targetLabel}`}
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

    const sortedWord = isUnclassified ? "not sorted yet" : isBusiness ? "Business" : "Personal";
    const tagWords = tag ? `. ${tag.text}${tag.kind === "auto_sorted" ? ", you can undo it" : ""}` : "";

    const cardInner = (
      <TouchableOpacity
        style={[styles.tripCard, isSelected && styles.tripCardSelected]}
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
            ? `${isSelected ? "Deselect" : "Select"} ${route}, ${formatDate(item.startedAt)}, ${item.distanceMiles.toFixed(1)} miles`
            : `${route}. ${formatDate(item.startedAt)} at ${formatTime(item.startedAt)}, ${item.distanceMiles.toFixed(1)} miles${platformLabel ? `, ${platformLabel}` : ""}, ${sortedWord}${tagWords}. Tap to open. Swipe right to mark ${targetLabel}. Swipe left to delete.`
        }
        accessibilityState={mergeMode ? { selected: isSelected } : undefined}
        accessibilityHint={mergeMode ? undefined : "Long press for more options"}
        accessibilityActions={
          !mergeMode && isRecentAuto ? [{ name: "undo", label: "Put back in To sort" }] : undefined
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "undo") handleUndoClassification(item.id);
        }}
      >
        <View style={styles.tripMainRow}>
          {mergeMode && (
            <View
              style={[styles.selectCircle, isSelected && styles.selectCircleActive]}
              accessible={false}
            >
              {isSelected && <Ionicons name="checkmark" size={14} color={BG} accessible={false} />}
            </View>
          )}

          {/* Home's small route drawing, from the same route the trip screen
              draws. Taps and swipes pass straight through. */}
          <TripThumb
            tripId={item.id}
            routePolyline={item.routePolyline}
            isManualEntry={!!item.isManualEntry}
            startLat={item.startLat}
            startLng={item.startLng}
            endLat={item.endLat}
            endLng={item.endLng}
            size={THUMB_SIZE}
          />

          <View style={styles.tripText}>
            {/* Line 1: the route. Both ends are already short; if it still
                won't fit, the first place gives way so the destination reads. */}
            {fromLabel && toLabel ? (
              <View style={styles.routeRow} accessible={false}>
                <Text style={[styles.routeTitle, styles.routeFrom]} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                  {fromLabel}
                </Text>
                <Text style={[styles.routeTitle, styles.routeTo]} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                  {` to ${toLabel}`}
                </Text>
              </View>
            ) : (
              <Text style={styles.routeTitle} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                {route}
              </Text>
            )}

            {/* Line 2: time, miles, app; the Business or Personal chip on the right */}
            <View style={styles.line2Row}>
              <Text style={styles.line2} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                {line2}
              </Text>
              {!isUnclassified && (
                <View style={[styles.chip, isBusiness ? styles.chipBusiness : styles.chipPersonal]} accessible={false}>
                  <Ionicons
                    name={isBusiness ? "briefcase" : "person"}
                    size={12}
                    color={isBusiness ? AMBER : TEXT_1}
                    accessible={false}
                  />
                  <Text
                    style={[styles.chipText, { color: isBusiness ? AMBER : TEXT_1 }]}
                    maxFontSizeMultiplier={fontScaleCap.body}
                  >
                    {isBusiness ? "Business" : "Personal"}
                  </Text>
                </View>
              )}
            </View>

            {/* Line 3, only when it helps: one tag. */}
            {tag && (
              <View style={styles.tagRow}>
                <Ionicons
                  name={tag.icon as keyof typeof Ionicons.glyphMap}
                  size={12}
                  color={tag.kind === "upload_failed" ? RED : TEXT_2}
                  accessible={false}
                />
                <Text
                  style={[styles.tagText, tag.kind === "upload_failed" && { color: RED }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={fontScaleCap.body}
                >
                  {tag.text}
                </Text>
                {tag.kind === "auto_sorted" && !mergeMode && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleUndoClassification(item.id);
                    }}
                    disabled={isClassifying}
                    hitSlop={{ top: 14, bottom: 14, left: 8, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Undo. Puts this trip back in To sort"
                  >
                    <Text style={styles.tagAction} maxFontSizeMultiplier={fontScaleCap.body}>· Undo</Text>
                  </Pressable>
                )}
                {tag.kind === "upload_failed" && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      router.push("/sync-status" as never);
                    }}
                    hitSlop={{ top: 14, bottom: 14, left: 8, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry. Opens uploads"
                  >
                    <Text style={[styles.tagAction, { color: RED }]} maxFontSizeMultiplier={fontScaleCap.body}>· Retry</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>

        {/* A note is edited here from the long-press menu; it shows on the trip screen. */}
        {isEditingNote && (
          <View style={styles.noteEditWrap}>
            <TripNoteEditor initial={note} onSave={(text) => saveNote(item.id, item.notes, text)} />
          </View>
        )}

        {/* Unsorted: Home's Business / Personal control under the text. The
            suggestion is words above it, never an amber half. */}
        {isUnclassified && !mergeMode && (
          <View style={styles.classifyWrap}>
            {suggestionText && (
              <Text style={styles.suggestionText} maxFontSizeMultiplier={fontScaleCap.body}>
                {suggestionText}
              </Text>
            )}
            <ClassifyControl
              choice="unclassified"
              onChoose={(c) => handleQuickClassify(item.id, c)}
              busy={isClassifying}
              label={`Business or personal? ${route}`}
            />
          </View>
        )}

        {/* Possible double-count: only shown while the other trip is on
            screen too, so the driver can see both before choosing. */}
        {duplicateOther && !mergeMode && (
          <View style={styles.duplicateWrap}>
            <View style={styles.duplicateNoteRow}>
              <Ionicons name="copy-outline" size={14} color={AMBER} accessible={false} />
              <Text style={styles.duplicateNoteText} maxFontSizeMultiplier={fontScaleCap.body}>
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
                accessibilityLabel="Join the two trips into one"
              >
                <Text style={styles.duplicateBtnPrimaryText}>{isDuplicateBusy ? "Working" : "Join"}</Text>
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
      </TouchableOpacity>
    );

    // Don't wrap in Swipeable while joining: taps should toggle selection,
    // not be eaten by gesture handlers. Also skip for local (unsynced) trips
    // since the delete action requires a server round-trip.
    if (mergeMode || item._isLocal) {
      return cardInner;
    }

    return (
      <Swipeable
        ref={(r) => {
          if (r) swipeRefs.current.set(item.id, r);
          else swipeRefs.current.delete(item.id);
        }}
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

  // A row swiped out of To sort stays in its group until it leaves.
  const routeGroups: RouteGroup[] = filter === "unclassified"
    ? groupUnclassifiedTrips(trips.filter((t) => t.classification === "unclassified" || leavingIds.has(t.id)))
    : [];

  // The flat list reads day by day: newest day at the top, and inside a day
  // the first trip first, so checking a day for missed journeys runs
  // forwards rather than backwards. Regrouped over the whole loaded array
  // every time a page arrives, so the oldest day on screen fills in as the
  // next page loads.
  const newestFirst = useNewestTripFirst();
  const dayRows = useMemo<DayRow<TripItem>[]>(() => groupTripsByDay(trips, new Date(), { newestFirstWithinDay: newestFirst }), [trips, newestFirst]);

  // The day's miles beside each day header, from the trips loaded for it.
  const dayMiles = useMemo(() => {
    const out = new Map<string, string>();
    let key: string | null = null;
    let list: TripItem[] = [];
    const flush = () => {
      if (key) out.set(key, dayMilesText(list));
    };
    for (const row of dayRows) {
      if (row.kind === "header") {
        flush();
        key = row.dayKey;
        list = [];
      } else {
        list.push(row.trip);
      }
    }
    flush();
    return out;
  }, [dayRows]);

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
      const miles = dayMiles.get(item.dayKey);
      return (
        <View style={styles.dayHeaderWrap}>
          <View
            style={styles.dayHeaderRow}
            accessible
            accessibilityRole="header"
            accessibilityLabel={miles ? `${item.label}, ${miles.replace("\u00a0mi", " miles")}` : item.label}
          >
            <Text style={styles.dayHeader} maxFontSizeMultiplier={fontScaleCap.heading}>{item.label}</Text>
            {miles ? (
              <Text style={styles.dayMiles} maxFontSizeMultiplier={fontScaleCap.heading}>{miles}</Text>
            ) : null}
          </View>
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
  const activeClientLabel = clientFilterLabel(clientFilter);
  const activeFilterLabels = [activeClientLabel, activePlatformLabel, activeDateLabel].filter(
    (l): l is string => !!l
  );
  const activeFilterCount = activeFilterLabels.length;
  const clientChoices = useMemo(() => clientFilterChoices(projectLabels, clientFilter), [projectLabels, clientFilter]);

  // A brand-new driver with no trips and nothing to sort: just the empty state.
  const noTripsAtAll =
    !loading && filter === "all" && trips.length === 0 && unclassifiedCount === 0 &&
    (missedCount ?? 0) === 0 &&
    dateRange === "all" && platformFilter === "all" && clientFilter.kind === "all";

  // To sort: a trip on its own is an ordinary row; several on the same route
  // share one card and one Business / Personal choice for them all.
  const renderRouteGroup = ({ item: group }: { item: RouteGroup }) => {
    if (group.trips.length === 1) {
      return renderTrip({ item: group.trips[0], showDate: true });
    }
    const isExpanded = expandedGroups.has(group.key);
    const isBatchClassifying = batchClassifyingKey === group.key;
    const n = group.trips.length;
    const sortedTrips = [...group.trips].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const latestTrip = sortedTrips[0];
    const fromLabel = tripEndLabel(latestTrip.startAddress, latestTrip.startLat, latestTrip.startLng, savedPlaces);
    const toLabel = tripEndLabel(latestTrip.endAddress, latestTrip.endLat, latestTrip.endLng, savedPlaces);
    const route = routeText(fromLabel, toLabel);
    const summaryLine = `${n} trips · ${group.totalDistanceMiles.toFixed(1)}\u00a0mi · latest ${dayLabel(new Date(latestTrip.startedAt))} ${formatTime(latestTrip.startedAt)}`;

    return (
      <View style={styles.routeGroup}>
        <View style={styles.tripCard}>
          <TouchableOpacity
            style={styles.tripMainRow}
            onPress={() => toggleGroupExpanded(group.key)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${route}, ${n} trips, ${group.totalDistanceMiles.toFixed(1)} miles in all. Tap to ${isExpanded ? "hide" : "show"} them.`}
            accessibilityState={{ expanded: isExpanded }}
          >
            <TripThumb
              tripId={latestTrip.id}
              routePolyline={latestTrip.routePolyline}
              isManualEntry={!!latestTrip.isManualEntry}
              startLat={latestTrip.startLat}
              startLng={latestTrip.startLng}
              endLat={latestTrip.endLat}
              endLng={latestTrip.endLng}
              size={THUMB_SIZE}
            />
            <View style={styles.tripText}>
              <Text style={styles.routeTitle} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
                {route}
              </Text>
              <Text style={styles.line2} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.body}>
                {summaryLine}
              </Text>
            </View>
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={TEXT_3}
              accessible={false}
            />
          </TouchableOpacity>
          <View style={styles.classifyWrap}>
            <ClassifyControl
              choice="unclassified"
              onChoose={(c) => handleBatchClassify(group, c)}
              busy={isBatchClassifying}
              businessText={`Business (${n})`}
              personalText={`Personal (${n})`}
              label={`Mark all ${n} trips, ${route}`}
            />
          </View>
        </View>

        {isExpanded && (
          <View style={styles.routeGroupTrips}>
            {sortedTrips.map((trip) => (
              <View key={trip.id}>{renderTrip({ item: trip, showDate: true })}</View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const inToSort = filter === "unclassified";

  return (
    <View style={styles.container}>
      <AppHeader
        title="Trips"
        right={
          <>
            {/* The Recent Journeys map left Home (Oct 2026); this is its entry point. */}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push("/journey-map" as never)}
              accessibilityRole="button"
              accessibilityLabel="Journey map. Opens a map of your recent routes."
            >
              <Ionicons name="map-outline" size={20} color={TEXT_2} accessible={false} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerButton, activeFilterCount > 0 && styles.headerButtonActive]}
              onPress={() => setShowFiltersSheet(true)}
              accessibilityRole="button"
              accessibilityLabel={
                activeFilterCount > 0
                  ? `Filters, ${activeFilterLabels.join(", ")} on. Opens filter options.`
                  : hasProjectLabels
                    ? "Filters. Opens client, app and date options."
                    : "Filters. Opens app and date options."
              }
            >
              <Ionicons
                name={activeFilterCount > 0 ? "funnel" : "funnel-outline"}
                size={19}
                color={activeFilterCount > 0 ? AMBER : TEXT_2}
                accessible={false}
              />
              {activeFilterCount > 0 && (
                <View style={styles.filtersCountBadge} accessible={false}>
                  <Text style={styles.filtersCountText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            {/* "+" asks which: a trip now, or one already driven (T-B1). */}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowAddSheet(true)}
              accessibilityRole="button"
              accessibilityLabel="Add trip"
              accessibilityHint="Choose Start a trip now or Add a past trip"
            >
              <Ionicons name="add" size={24} color={TEXT_1} accessible={false} />
            </TouchableOpacity>
          </>
        }
      />
      <FlatList
        key={inToSort ? "grouped" : "flat"}
        data={inToSort ? (routeGroups as any[]) : dayRows}
        keyExtractor={(item) => {
          if (inToSort) return (item as RouteGroup).key;
          const row = item as DayRow<TripItem>;
          return row.kind === "header" ? row.key : row.trip.id;
        }}
        renderItem={inToSort ? (renderRouteGroup as any) : (renderDayRow as any)}
        onEndReached={onEndReachedSafe}
        onEndReachedThreshold={0.3}
        // Day headers are items too, hence 10 for about six trips on the
        // first screen.
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

            {/* Only when there's something to check (T-B5). */}
            {!inToSort && (
              <MissedDrivesStrip count={missedCount} onPress={() => handleFilterChange("unclassified")} />
            )}

            {isOffline && (
              <Text style={styles.offlineLine} maxFontSizeMultiplier={fontScaleCap.body}>
                {clientFilter.kind === "all"
                  ? "Offline. Showing trips saved on this phone."
                  : "Offline. The client filter can only show trips not uploaded yet."}
              </Text>
            )}

            {/* One slate track, four segments (Home's mode pill). To sort
                carries the same count as the tab badge. */}
            <View style={styles.segmented} accessibilityRole="tablist">
              {FILTERS.map((f) => {
                const selected = filter === f.value;
                const count = f.value === "unclassified" ? unclassifiedCount : 0;
                return (
                  <TouchableOpacity
                    key={f.label}
                    style={[styles.segment, selected && styles.segmentActive]}
                    onPress={() => handleFilterChange(f.value)}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      count > 0 ? `${f.label}, ${count} trip${count !== 1 ? "s" : ""} to sort` : f.label
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
                    {count > 0 && (
                      <View style={styles.segmentCount} accessible={false}>
                        <Text style={styles.segmentCountText} maxFontSizeMultiplier={1.3}>
                          {count > 99 ? "99+" : count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* To sort: drives we may have missed first, then the trips to sort. */}
            {inToSort && <PracticeSortLine />}
            {inToSort && <MissedJourneys startExpanded onCountChange={setMissedCount} />}
            {inToSort && routeGroups.length > 0 && (
              <Text style={styles.sectionTitle} accessibilityRole="header">Business or personal?</Text>
            )}

            {/* Stats summary - shown when any filter (date range OR platform)
                is active. Sourced from /trips/summary so totals are accurate
                no matter how far the user has scrolled. Falls back to a
                client-side computation if the aggregate request failed. */}
            {activeFilterCount > 0 && (summary || trips.length > 0) && (() => {
              const stats = summary ?? {
                totalMiles: trips.reduce((s, t) => s + t.distanceMiles, 0),
                totalTrips: trips.length,
                businessMiles: trips.filter((t) => t.classification === "business").reduce((s, t) => s + t.distanceMiles, 0),
                businessTrips: trips.filter((t) => t.classification === "business").length,
                personalMiles: trips.filter((t) => t.classification === "personal").reduce((s, t) => s + t.distanceMiles, 0),
                personalTrips: trips.filter((t) => t.classification === "personal").length,
              };
              const headerLabel = [activeClientLabel, activeDateLabel, activePlatformLabel].filter(Boolean).join(" · ");
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
                          <Text style={styles.rangeStatValue}>
                            {stats.businessMiles.toFixed(1)}
                          </Text>
                          <Text style={styles.rangeStatUnit}>Business mi</Text>
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
                          <Text style={styles.rangeStatUnit}>Personal mi</Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* Join mode banner */}
            {mergeMode && (
              <View style={styles.mergeBanner}>
                <View style={styles.mergeBannerLeft}>
                  <Ionicons name="git-merge-outline" size={18} color={TEXT_2} accessible={false} />
                  <Text style={styles.mergeBannerText}>
                    {selectedIds.size < 2
                      ? "Tap the trips to join"
                      : `${selectedIds.size} trips chosen`}
                  </Text>
                </View>
                <View style={styles.mergeBannerActions}>
                  <TouchableOpacity
                    style={styles.mergeBannerCancel}
                    onPress={exitMergeMode}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel joining trips"
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
                    accessibilityLabel={`Join ${selectedIds.size} trip${selectedIds.size !== 1 ? "s" : ""}`}
                    accessibilityState={{ disabled: selectedIds.size < 2 }}
                    accessibilityHint={selectedIds.size < 2 ? "Choose at least 2 trips to join" : undefined}
                  >
                    <Text style={[
                      styles.mergeBannerBtnText,
                      selectedIds.size < 2 && styles.mergeBannerBtnTextDisabled,
                    ]}>
                      Join
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
            ) : inToSort ? (
              (missedCount ?? 0) > 0 ? null : (
                <EmptyState
                  icon="checkmark-circle-outline"
                  title="All sorted"
                  description="Every trip has Business or Personal and there's nothing to check."
                  iconColor={colors.green}
                />
              )
            ) : clientFilter.kind !== "all" ? (
              <EmptyState
                icon="briefcase-outline"
                title={clientFilter.kind === "none" ? "No trips without a client" : `No trips for ${clientFilter.label}`}
                description={
                  activeFilterCount > 1 || filter !== "all"
                    ? "Nothing matches all your filters. Try Clear filters in Filters."
                    : clientFilter.kind === "none"
                      ? "Every trip here has a Project / client."
                      : "Trips you give this Project / client show here. Open a trip and tap Details to add one."
                }
              />
            ) : filter === "business" || filter === "personal" ? (
              <EmptyState
                icon="filter-outline"
                title={`No ${filter === "business" ? "Business" : "Personal"} trips yet`}
                description={`Trips you mark ${filter === "business" ? "Business" : "Personal"} show here.`}
              />
            ) : (
              <EmptyState
                icon="car-outline"
                title="No trips yet"
                description="Drives record by themselves once you set off. You can also add one yourself."
                action={
                  <Button
                    title="Add a past trip"
                    variant="secondary"
                    onPress={() => router.push({ pathname: "/trip-form", params: { mode: "manual", source: "trips_empty" } } as never)}
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
            {!noTripsAtAll && !inToSort && (
              <TouchableOpacity
                style={styles.footerLink}
                onPress={() => router.push({ pathname: "/trip-form", params: { mode: "manual", source: "trips_footer" } } as never)}
                accessibilityRole="button"
                accessibilityLabel="Add a past trip"
              >
                <Ionicons name="add" size={16} color={TEXT_2} accessible={false} />
                <Text style={styles.footerLinkText} maxFontSizeMultiplier={fontScaleCap.body}>Add a past trip</Text>
              </TouchableOpacity>
            )}
            {/* Brand-new drivers are the ones who most need "Missing a trip?". */}
            <MissingTripReporter variant="link" onTripAdded={onRefresh} />
          </View>
        }
      />
      {swipeNotice && (
        // Floats over the bottom of the list, like Road alerts' Undo.
        <View style={styles.swipeNotice} accessibilityLiveRegion="polite">
          <Ionicons
            name={swipeNotice.to === "business" ? "briefcase" : "person"}
            size={16}
            color={swipeNotice.to === "business" ? AMBER : TEXT_1}
            accessible={false}
          />
          <Text style={styles.swipeNoticeText} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.body}>
            Marked {swipeNotice.to === "business" ? "Business" : "Personal"}
          </Text>
          <TouchableOpacity
            onPress={handleSwipeUndo}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`Undo. Puts this trip back to ${
              swipeNotice.from === "unclassified" ? "To sort" : swipeNotice.from === "business" ? "Business" : "Personal"
            }`}
          >
            <Text style={styles.swipeNoticeUndo} maxFontSizeMultiplier={fontScaleCap.body}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing && (
        // Skeleton-first loading overlay: ghost trip rows that mimic the
        // list's shape, so the wait reads as the list arriving.
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingSkeletonStack}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={84} radius={radii.lg} />
            ))}
          </View>
        </View>
      )}

      {/* "+": a trip now, or one already driven */}
      <AppModal visible={showAddSheet} animationType="fade" onRequestClose={() => setShowAddSheet(false)}>
        <Pressable style={styles.mergeBackdrop} onPress={() => setShowAddSheet(false)} accessible={false}>
          <Pressable style={styles.mergeSheet} onPress={(e) => e.stopPropagation()} accessible={false} accessibilityViewIsModal>
            <View style={styles.mergeHandle} />
            <Text style={styles.mergeTitle}>Add a trip</Text>
            <View style={styles.sheetCard}>
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setShowAddSheet(false);
                  router.push("/trip-form" as never);
                }}
                accessibilityRole="button"
                accessibilityLabel="Start a trip now. Records this drive until you arrive."
              >
                <Ionicons name="navigate-outline" size={20} color={TEXT_2} accessible={false} />
                <View style={styles.sheetRowText}>
                  <Text style={styles.sheetRowTitle}>Start a trip now</Text>
                  <Text style={styles.sheetRowSub}>Records this drive until you arrive</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={TEXT_3} accessible={false} />
              </TouchableOpacity>
              <View style={styles.sheetDivider} />
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setShowAddSheet(false);
                  router.push({ pathname: "/trip-form", params: { mode: "manual", source: "trips_plus" } } as never);
                }}
                accessibilityRole="button"
                accessibilityLabel="Add a past trip. A drive you've already made."
              >
                <Ionicons name="create-outline" size={20} color={TEXT_2} accessible={false} />
                <View style={styles.sheetRowText}>
                  <Text style={styles.sheetRowTitle}>Add a past trip</Text>
                  <Text style={styles.sheetRowSub}>A drive you've already made</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={TEXT_3} accessible={false} />
              </TouchableOpacity>
            </View>
            <Button title="Cancel" variant="ghost" onPress={() => setShowAddSheet(false)} />
          </Pressable>
        </Pressable>
      </AppModal>

      {/* Long-press menu */}
      <AppModal visible={menuTrip != null} animationType="fade" onRequestClose={() => setMenuTrip(null)}>
        <Pressable style={styles.mergeBackdrop} onPress={() => setMenuTrip(null)} accessible={false}>
          <Pressable style={styles.mergeSheet} onPress={(e) => e.stopPropagation()} accessible={false} accessibilityViewIsModal>
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

      {/* Join sheet */}
      {mergeModalVisible && (
        <AppModal visible={true} animationType="slide" onRequestClose={() => setMergeModalVisible(false)}>
          <Pressable
            style={styles.mergeBackdrop}
            onPress={() => setMergeModalVisible(false)}
            accessible={false}
          >
            <View style={styles.mergeSheet} onStartShouldSetResponder={() => true} accessibilityViewIsModal={true}>
              <View style={styles.mergeHandle} />

              <Text style={styles.mergeTitle}>Join {selectedIds.size} trips</Text>

              {/* Preview: first trip's start to last trip's end */}
              {(() => {
                const selected = trips
                  .filter((t) => selectedIds.has(t.id))
                  .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
                const first = selected[0];
                const last = selected[selected.length - 1];
                const preview = joinPreview(selected);
                const totalMiles = preview.kind === "refused" ? null : preview.miles;
                if (!first || !last) return null;
                const fromName =
                  tripEndLabel(first.startAddress, first.startLat, first.startLng, savedPlaces) ||
                  `${first.startLat.toFixed(4)}, ${first.startLng.toFixed(4)}`;
                const toName =
                  tripEndLabel(last.endAddress, last.endLat, last.endLng, savedPlaces) || "End not recorded";
                return (
                  <View style={styles.mergePreview}>
                    <View style={styles.mergePreviewRow}>
                      <View style={styles.previewRing} />
                      <Text style={styles.mergePreviewText} numberOfLines={1}>{fromName}</Text>
                    </View>
                    <View style={styles.previewLine} />
                    <View style={styles.mergePreviewRow}>
                      <View style={styles.previewDot} />
                      <Text style={styles.mergePreviewText} numberOfLines={1}>{toName}</Text>
                    </View>
                    <View style={styles.mergePreviewStats}>
                      <Text style={styles.mergePreviewStat}>
                        {preview.kind === "into_total"
                          ? `${(totalMiles ?? 0).toFixed(1)} mi, the shift's total`
                          : totalMiles != null
                            ? `${totalMiles.toFixed(1)} mi in all`
                            : ""}
                      </Text>
                      <Text style={styles.mergePreviewStat}>
                        {formatTime(first.startedAt)} to {last.endedAt ? formatTime(last.endedAt) : "still going"}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {(() => {
                const preview = joinPreview(trips.filter((t) => selectedIds.has(t.id)));
                if (preview.kind === "into_total") {
                  return (
                    <Text style={styles.mergeLabel}>
                      Joined into the shift's total. It keeps the miles you typed and stays Business, and the other
                      trips are removed.
                    </Text>
                  );
                }
                if (preview.kind === "refused") {
                  return <Text style={styles.mergeLabel}>{preview.problem}</Text>;
                }
                return null;
              })()}

              {joinPreview(trips.filter((t) => selectedIds.has(t.id))).kind === "plain" && (
                <>
                <Text style={styles.mergeLabel} accessibilityRole="header">Business or personal?</Text>
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
                        name={cls === "business" ? "briefcase" : "person"}
                        size={16}
                        color={mergeClassification === cls ? (cls === "business" ? BG : TEXT_1) : TEXT_2}
                      />
                      <Text style={[
                        styles.mergeClassBtnText,
                        mergeClassification === cls && (cls === "business" ? styles.mergeClassBtnTextActive : styles.mergeClassBtnTextPersonal),
                      ]}>
                        {cls === "business" ? "Business" : "Personal"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {mergeClassification === "business" && (
                  <>
                    <Text style={styles.mergeLabel}>Which app (optional)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mergePlatformScroll}>
                      <TouchableOpacity
                        style={[styles.mergePlatformChip, !mergePlatform && styles.mergePlatformChipActive]}
                        onPress={() => setMergePlatform(null)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="No app"
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
                </>
              )}

              <TouchableOpacity
                style={[styles.mergeConfirmBtn, mergeLoading && { opacity: 0.6 }]}
                onPress={handleMerge}
                disabled={mergeLoading}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Join ${selectedIds.size} trips into one`}
                accessibilityState={{ disabled: mergeLoading, busy: mergeLoading }}
              >
                {mergeLoading ? (
                  <ActivityIndicator size="small" color={BG} accessibilityLabel="Joining trips" />
                ) : (
                  <Text style={styles.mergeConfirmText}>Join into one trip</Text>
                )}
              </TouchableOpacity>
              {/* The backdrop isn't a VoiceOver button (it would hide the sheet), so Cancel closes it. */}
              <Button title="Cancel" variant="ghost" onPress={() => setMergeModalVisible(false)} />
            </View>
          </Pressable>
        </AppModal>
      )}

      {/* Filters sheet - app + date range, folded behind the single Filters
          control in the header. */}
      <AppModal
        visible={showFiltersSheet}
        animationType="slide"
        onRequestClose={() => setShowFiltersSheet(false)}
      >
        <Pressable
          style={styles.mergeBackdrop}
          onPress={() => setShowFiltersSheet(false)}
          accessible={false}
        >
          <Pressable
            style={styles.mergeSheet}
            onPress={(e) => e.stopPropagation()}
            accessible={false}
            accessibilityViewIsModal
          >
            <View style={styles.mergeHandle} />
            <Text style={styles.mergeTitle}>Filters</Text>

            <View style={styles.filtersSection}>
              <Text style={styles.filtersSectionLabel}>Which app</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dateRangeRow}
                accessibilityLabel="App filter"
              >
                {([{ value: "all" as const, label: "Any app" }, ...GIG_PLATFORMS]).map((p) => {
                  const active = platformFilter === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      style={[styles.dateRangeChip, active && styles.dateRangeChipActive]}
                      onPress={() => handlePlatformChange(p.value as PlatformTag | "all")}
                      accessibilityRole="button"
                      accessibilityLabel={`App: ${p.label}`}
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
              <Text style={styles.filtersSectionLabel}>Dates</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dateRangeRow}
                accessibilityLabel="Date filter"
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
                      accessibilityLabel={`Dates: ${label}`}
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

            {/* Client: only once the driver has tagged a trip (23 Oct 2026). */}
            {(hasProjectLabels || clientFilter.kind !== "all") && (
              <View style={styles.filtersSection}>
                <Text style={styles.filtersSectionLabel}>Which client</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dateRangeRow}
                  accessibilityLabel="Client filter"
                >
                  {clientChoices.map((c) => {
                    const active = sameClientFilter(clientFilter, c.value);
                    return (
                      <TouchableOpacity
                        key={c.key}
                        style={[styles.dateRangeChip, active && styles.dateRangeChipActive]}
                        onPress={() => handleClientChange(c.value)}
                        accessibilityRole="button"
                        accessibilityLabel={`Client: ${c.label}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[
                            styles.dateRangeChipText,
                            active && styles.dateRangeChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

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
          accessible={false}
        >
          <Pressable
            style={styles.mergeSheet}
            onPress={(e) => e.stopPropagation()}
            accessible={false}
            accessibilityViewIsModal
          >
            <View style={styles.mergeHandle} />
            <Text style={styles.mergeTitle}>Choose dates</Text>
            <Text style={styles.customRangeHint}>
              Pick a start and end date. The trip list and totals change to match.
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
// Local aliases for theme tokens.

const BG = colors.bg;
const CARD_BG = colors.surface;
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const RED = colors.red;
// Home's mini route on each row (PROPOSALS 6.3).
const THUMB_SIZE = 56;
const THUMB_GAP = 12;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  listContent: {
    padding: 16,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  headerButtonActive: {
    backgroundColor: colors.amberDim,
    borderColor: colors.amberGlow,
  },
  filtersCountBadge: {
    position: "absolute",
    top: -2,
    right: -2,
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
  offlineLine: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 12,
  },
  // One slate track with four segments: Home's mode pill.
  segmented: {
    flexDirection: "row",
    padding: 3,
    gap: 2,
    borderRadius: radii.pill + 4,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 12,
  },
  // Each segment sizes to its words, then the spare width is shared, so
  // "To sort" and its count fit on a small phone.
  segment: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentActive: {
    backgroundColor: colors.personal,
    borderColor: colors.personalEdge,
  },
  segmentText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  segmentTextActive: {
    color: TEXT_1,
  },
  segmentCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: AMBER,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentCountText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: BG,
    fontVariant: ["tabular-nums"],
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 8,
  },
  // Day header: "Today" on the left, the day's miles on the right.
  dayHeaderWrap: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  dayHeader: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  dayMiles: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    fontVariant: ["tabular-nums"],
  },
  odoLine: {
    minHeight: 44,
    justifyContent: "center",
    marginTop: -10,
    marginBottom: -10,
  },
  odoLineText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
    fontVariant: ["tabular-nums"],
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    marginBottom: 8,
  },
  projectRowText: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text1,
  },
  // Filters sheet body
  filtersSectionLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 10,
  },
  filtersSection: {
    marginBottom: 12,
  },
  filtersSheetFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  dateRangeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  dateRangeChip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radii.pill + 2,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  dateRangeChipActive: {
    backgroundColor: colors.personal,
    borderColor: colors.personalEdge,
  },
  dateRangeChipText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  dateRangeChipTextActive: {
    color: TEXT_1,
    fontFamily: fonts.semibold,
  },
  // Totals card shown above the list when a date range or app is chosen
  rangeStatsCard: {
    backgroundColor: CARD_BG,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  rangeStatsLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
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
  rangeStatUnit: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_3,
  },
  rangeStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.hairline,
  },
  customRangeHint: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 20,
    marginBottom: 16,
  },
  // Trip row (PROPOSALS 6.3): standard card, radius 16, 10 apart.
  tripCard: {
    backgroundColor: CARD_BG,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  tripMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: THUMB_GAP,
  },
  tripText: {
    flex: 1,
    minWidth: 0,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  routeTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  // The first place gives way before the destination does.
  routeFrom: {
    flexShrink: 3,
  },
  routeTo: {
    flexShrink: 1,
  },
  line2Row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },
  line2: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    fontVariant: ["tabular-nums"],
  },
  // Home's chips: soft amber with a briefcase, slate with a person.
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  chipBusiness: {
    backgroundColor: colors.amberDim,
  },
  chipPersonal: {
    backgroundColor: colors.personal,
  },
  chipText: {
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  tagText: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  tagAction: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: TEXT_1,
  },
  // Under the text, lined up with it rather than the thumbnail.
  classifyWrap: {
    marginTop: 12,
    marginLeft: THUMB_SIZE + THUMB_GAP,
  },
  suggestionText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: TEXT_2,
    marginBottom: 6,
  },
  noteEditWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  // Swipe action buttons (Anthony 16 May audit — native iOS feel)
  swipeClassifyAction: {
    width: 110,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    borderTopLeftRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
    gap: 4,
  },
  swipeDeleteAction: {
    width: 90,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    borderTopRightRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    gap: 4,
  },
  swipeNotice: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  swipeNoticeText: { flex: 1, color: TEXT_1, fontFamily: fonts.semibold, fontSize: 14 },
  swipeNoticeUndo: { color: AMBER, fontFamily: fonts.semibold, fontSize: 14 },
  swipeActionText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  duplicateWrap: {
    marginTop: 12,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.amberDim,
  },
  duplicateNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  duplicateNoteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: TEXT_1,
  },
  duplicateActions: {
    flexDirection: "row",
    gap: 8,
  },
  duplicateBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  duplicateBtnPrimary: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  duplicateBtnPrimaryText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: BG,
  },
  duplicateBtnText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  // Footer
  footer: {
    marginTop: 8,
    paddingBottom: 20,
    alignItems: "center",
  },
  footerLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  footerLinkText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
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
  // Join mode
  tripCardSelected: {
    borderColor: colors.amberGlow,
    backgroundColor: "#11161f",
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.personalEdge,
    justifyContent: "center",
    alignItems: "center",
  },
  selectCircleActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  mergeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.lg,
    paddingVertical: 6,
    paddingLeft: 14,
    paddingRight: 6,
    marginBottom: 12,
  },
  mergeBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  mergeBannerText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    flexShrink: 1,
  },
  mergeBannerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mergeBannerCancel: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  mergeBannerCancelText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  mergeBannerBtn: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: AMBER,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  mergeBannerBtnDisabled: {
    backgroundColor: colors.hairline,
  },
  mergeBannerBtnText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: BG,
  },
  mergeBannerBtnTextDisabled: {
    color: TEXT_3,
  },
  // Sheets
  mergeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  mergeSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.surfaceBorder,
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
    fontSize: 18,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 16,
  },
  sheetCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: BG,
    marginBottom: 12,
    overflow: "hidden",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetRowText: {
    flex: 1,
  },
  sheetRowTitle: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: TEXT_1,
  },
  sheetRowSub: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 2,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginLeft: 48,
  },
  mergePreview: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 20,
  },
  mergePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mergePreviewText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    flex: 1,
  },
  previewRing: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: TEXT_1,
  },
  previewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AMBER,
  },
  previewLine: {
    width: 2,
    height: 14,
    marginLeft: 4,
    marginVertical: 3,
    backgroundColor: colors.hairline,
  },
  mergePreviewStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
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
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  mergeClassBtnBusiness: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  mergeClassBtnPersonal: {
    backgroundColor: colors.personal,
    borderColor: colors.personalEdge,
  },
  mergeClassBtnText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  mergeClassBtnTextActive: {
    color: BG,
    fontFamily: fonts.bold,
  },
  mergeClassBtnTextPersonal: {
    color: TEXT_1,
    fontFamily: fonts.bold,
  },
  mergePlatformScroll: {
    marginBottom: 20,
  },
  mergePlatformChip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radii.pill + 2,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginRight: 8,
  },
  mergePlatformChipActive: {
    backgroundColor: colors.personal,
    borderColor: colors.personalEdge,
  },
  mergePlatformText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  mergePlatformTextActive: {
    color: TEXT_1,
    fontFamily: fonts.semibold,
  },
  mergeConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AMBER,
    minHeight: 52,
    borderRadius: radii.md,
  },
  mergeConfirmText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: BG,
  },
  // To sort: several trips on one route
  routeGroup: {
    marginBottom: 0,
  },
  routeGroupTrips: {
    marginBottom: 6,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.hairline,
  },
});
