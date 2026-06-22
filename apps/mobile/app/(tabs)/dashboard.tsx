import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Share,
  Platform,
  Animated,
  Linking,
} from "react-native";
import { AppModal } from "../../components/AppModal";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { FadeInStagger } from "../../components/FadeInStagger";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";
import { ActiveRecordingBanner } from "../../components/ActiveRecordingBanner";
import { SyncStatusBanner } from "../../components/SyncStatusBanner";
import { TrackingOffBanner } from "../../components/TrackingOffBanner";
import { TripStatusStrip } from "../../components/TripStatusStrip";
import { describeError } from "../../lib/api/apiError";
import { useFocusEffect, useRouter } from "expo-router";
import { fetchVehicles } from "../../lib/api/vehicles";
import {
  fetchActiveShift,
  ShiftWithVehicle,
} from "../../lib/api/shifts";
import { syncStartShift, syncEndShift, syncCreateEarning } from "../../lib/sync/actions";
import { getDatabase } from "../../lib/db/index";
import {
  fetchGamificationStats,
  fetchRecap,
} from "../../lib/api/gamification";
import {
  requestLocationPermissions,
  startShiftTracking,
  stopShiftTracking,
  processShiftTrips,
  isTrackingActive,
  peekBackgroundCoordinates,
} from "../../lib/tracking/index";
import { fetchUnclassifiedCount } from "../../lib/api/trips";
import { fetchDataQualityImprovement } from "../../lib/api/user";
import { apiRequest } from "../../lib/api/index";
import { fetchReferralSummary } from "../../lib/api/referrals";
import type {
  Vehicle,
  GamificationStats,
  ShiftScorecard,
  PeriodRecap,
} from "@mileclear/shared";
import { formatPence } from "@mileclear/shared";
import { maybeRequestReview } from "../../lib/rating/index";
import { useMode } from "../../lib/mode/context";
import { ModeToggle } from "../../components/ModeToggle";
import { PersonalDashboard } from "../../components/personal/PersonalDashboard";
import { CommunityInsightsCard } from "../../components/community/CommunityInsightsCard";
import { WeeklyGoalCard } from "../../components/work/WeeklyGoalCard";
import { TaxReadinessCard } from "../../components/business/TaxReadinessCard";
import { MileageMonthCard } from "../../components/business/MileageMonthCard";
import { ActivityHeatmapCard } from "../../components/business/ActivityHeatmapCard";
import { BenchmarkCard } from "../../components/business/BenchmarkCard";
import { WorkCalendarCard } from "../../components/work/WorkCalendarCard";
import { MapOverview } from "../../components/personal/MapOverview";
import { LiveMapTracker, type TripTapInfo } from "../../components/map/LiveMapTracker";
import { useUser } from "../../lib/user/context";
import { useRecentTripsWithCoords } from "../../hooks/useRecentTripsWithCoords";
import { Ionicons } from "@expo/vector-icons";
import { startLiveActivity, updateLiveActivity, endLiveActivityWithSummary, recoverLiveActivity } from "../../lib/liveActivity";
import { getLiveActivityContext } from "../../lib/liveActivity/context";
import { useLayoutPrefs } from "../../lib/layout/index";
import { PremiumGate, useIsPremium } from "../../components/PremiumGate";
import { SmartInsightCard } from "../../components/SmartInsightCard";
import { usePaywall } from "../../components/paywall";
import { requestOrFixBackgroundLocation, getLocationPermissionStatus, type LocationPermissionTier } from "../../lib/permissions/location";
import { haptic } from "../../lib/haptics";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatMilesShort(miles: number): string {
  return miles < 1000
    ? `${miles.toFixed(1)}`
    : `${(miles / 1000).toFixed(1)}k`;
}

function calcDistance(coords: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const R = 3958.8;
    const dLat = ((coords[i].lat - coords[i - 1].lat) * Math.PI) / 180;
    const dLng = ((coords[i].lng - coords[i - 1].lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((coords[i - 1].lat * Math.PI) / 180) *
        Math.cos((coords[i].lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

/**
 * Fire-and-forget client event log (lands in app_events, admin-visible).
 * Same channel the rating funnel uses. Used here to measure the Work Mode
 * Explainer: shown vs dismissed-via-button + dwell time. A "shown" with no
 * following "dismissed" is the signature of the modal freezing / the user
 * force-quitting on it (Anthony's "not working" hunch); a tiny dwellMs is
 * the "putting people off" signature (instant bounce without reading).
 */
function trackEvent(type: string, metadata?: Record<string, unknown>): void {
  apiRequest("/user/event", {
    method: "POST",
    body: JSON.stringify({ type, metadata }),
  }).catch(() => {});
}

function ExplainerItem({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <Ionicons name={icon} size={18} color="#f5a623" style={{ marginTop: 1 }} />
      <Text style={{ color: colors.text2, fontSize: 14, fontFamily: fonts.regular, flex: 1, lineHeight: 20 }}>
        {text}
      </Text>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { isPersonal, isWork } = useMode();
  const { user: currentUser } = useUser();
  const [activeShift, setActiveShift] = useState<ShiftWithVehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  // Live shift earnings (Laura's idea): an optional hourly rate, remembered in
  // tracking_state, drives a live "£ earned" ticker on the active-shift card and
  // an offer to log it as earnings (-> invoice tracker) when the shift ends.
  const [hourlyRatePence, setHourlyRatePence] = useState<number | null>(null);
  const [liveDistance, setLiveDistance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [scorecard, setScorecard] = useState<ShiftScorecard | null>(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [recapData, setRecapData] = useState<PeriodRecap | null>(null);
  const [showRecap, setShowRecap] = useState(false);
  const [dailyRecap, setDailyRecap] = useState<PeriodRecap | null>(null);

  // Recent trips with coordinates for MapOverview
  const { trips: recentTrips } = useRecentTripsWithCoords(10);

  // Layout customization
  const workLayout = useLayoutPrefs("dashboard_work");
  const personalLayout = useLayoutPrefs("dashboard_personal");
  const isPremium = useIsPremium();

  // Unclassified trip count for smart insights
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);

  // Work mode explainer — shown once on first Work mode visit
  const [showWorkExplainer, setShowWorkExplainer] = useState(false);
  const [workExplainerSeen, setWorkExplainerSeen] = useState(true); // default true until loaded
  // Timestamp the explainer was shown, to measure dwell time on dismiss.
  const explainerShownAtRef = useRef<number | null>(null);

  // Background location permission — needed for auto trip detection
  const [bgLocationGranted, setBgLocationGranted] = useState(true); // default true until checked
  // Full permission tier so the dashboard can tell "records when open"
  // (foreground) apart from "can't record at all" (none = undetermined/denied).
  // The latter is an activation blocker — the app is non-functional — so it
  // gets a PERSISTENT, non-dismissible banner, not the soft 7-day nudge.
  // Default "always" until checked to avoid a flash on load.
  const [locationTier, setLocationTier] = useState<LocationPermissionTier>("always");
  // iOS Background App Refresh off => the app can't run in the background, so
  // recording fails regardless of location/engine. Surfaced as a blocker banner.
  const [bgRefreshOff, setBgRefreshOff] = useState(false);
  // Background location was granted before and has since been lost (iOS
  // downgrade / OS update / user change). Firm recovery banner, distinct from
  // the soft "upgrade to Always" nudge for users who never granted it.
  const [bgPermissionLost, setBgPermissionLost] = useState(false);
  // Dismissal cooldown: hides the "Auto-detection is off" nudge for 7
  // days after a tap on the X. Avoids the every-load nag (Anthony 16
  // May audit) while still resurfacing the prompt periodically so a
  // user who genuinely benefits from auto-detection finds it again.
  const [bgLocNudgeDismissedAt, setBgLocNudgeDismissedAt] = useState<number | null>(null);
  // Motion & Fitness denied → degraded short-trip detection. Soft, dismissable
  // nudge (engine still works via the speed backstop), 7-day cooldown.
  const [motionDenied, setMotionDenied] = useState(false);
  const [motionNudgeDismissedAt, setMotionNudgeDismissedAt] = useState<number | null>(null);

  // First-trip nudge dismissal. Mirrors the bg-loc nudge cooldown. The
  // in-app safety net for the activation funnel: a user who has Always
  // location on but still has zero trips needs an explicit "record your
  // first trip" prompt (with a manual-add path), since the passive Day-1
  // hero alone leaves ~27% of vehicle-setup users never recording anything.
  const [firstTripNudgeDismissedAt, setFirstTripNudgeDismissedAt] = useState<number | null>(null);

  // Referral promo card dismissal. Promotional (not urgent), so it sleeps
  // longer than the other nudges (30 days) before resurfacing.
  const [referralCardDismissedAt, setReferralCardDismissedAt] = useState<number | null>(null);

  // Vehicle nudge — show when user has no vehicles at all
  const showVehicleNudge = !loading && vehicles.length === 0;

  // Data-quality improvement banner — fires once per user when they
  // open the app after a server-side backfill corrected some of their
  // trips. Turns invisible "we fixed your data" work into a visible
  // trust moment. Dismissed via SQLite flag so it only shows once.
  const [dqImprovement, setDqImprovement] = useState<{
    improvedTripCount: number;
    milesGained: number;
  } | null>(null);
  const [dqBannerSeen, setDqBannerSeen] = useState(true); // default seen until loaded

  // Pro nudge card — dismissible, for free users with 5+ trips
  const { showPaywall } = usePaywall();
  const [proNudgeDismissedUntil, setProNudgeDismissedUntil] = useState<number>(Date.now() + 999999999);
  const showProNudge = !isPremium && !loading && (stats?.totalTrips ?? 0) >= 5 && Date.now() >= proNudgeDismissedUntil;

  // Saved-locations nudge — surfaces when a user has trip history but
  // hasn't pinned anywhere yet. Server has clustering ready to suggest
  // up to 8 places. Hidden once the user has any saved location, after
  // dismissal (snoozed 7 days), or while the server hasn't found
  // enough clusters worth surfacing.
  // 7-day snooze is intentional: people who say "not yet" usually mean
  // "remind me later", not "never". A week feels like a fair next nudge.
  const [savedLocationsSuggestionCount, setSavedLocationsSuggestionCount] =
    useState<number>(0);
  const [savedLocationsCount, setSavedLocationsCount] = useState<number | null>(null);
  const [savedLocsNudgeDismissedUntil, setSavedLocsNudgeDismissedUntil] =
    useState<number>(Date.now() + 999999999);
  const showSavedLocationsNudge =
    !loading &&
    savedLocationsCount === 0 &&
    savedLocationsSuggestionCount > 0 &&
    Date.now() >= savedLocsNudgeDismissedUntil;
  const proNudgeMessages = [
    stats ? `You've saved ${formatPence(stats.deductionPence)} in deductions — export them with Pro` : "Export your HMRC deductions with Pro",
    "See which platform pays best with business insights",
    "Save unlimited work locations with Pro",
    "Get monthly and yearly recap reports",
  ];
  const proNudgeIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % proNudgeMessages.length;

  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const nudgeRow = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'pro_nudge_dismissed_at'"
      );
      if (nudgeRow) {
        const dismissedAt = parseInt(nudgeRow.value, 10);
        setProNudgeDismissedUntil(dismissedAt + 3 * 24 * 60 * 60 * 1000);
      } else {
        setProNudgeDismissedUntil(0);
      }
    })();
  }, []);

  const dismissProNudge = useCallback(async () => {
    const now = Date.now();
    setProNudgeDismissedUntil(now + 3 * 24 * 60 * 60 * 1000);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('pro_nudge_dismissed_at', ?)",
      [String(now)]
    );
  }, []);

  // Load saved-locations nudge state on mount. Dismissal stored in
  // tracking_state as ms epoch; nudge re-appears 7 days later.
  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'saved_locs_nudge_dismissed_at'"
      );
      if (row) {
        const dismissedAt = parseInt(row.value, 10);
        setSavedLocsNudgeDismissedUntil(dismissedAt + 7 * 24 * 60 * 60 * 1000);
      } else {
        setSavedLocsNudgeDismissedUntil(0);
      }
      // Local SQLite count is faster than waiting for the API
      const countRow = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM saved_locations"
      );
      setSavedLocationsCount(countRow?.count ?? 0);
    })();
  }, []);

  // Fetch suggestion count once per mount. Cheap (single query on
  // recent trips) and only matters when the user has 0 saved
  // locations — but we keep the call unconditional so the dashboard
  // is responsive the moment a user deletes their last location.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchSavedLocationSuggestions } = await import(
          "../../lib/api/savedLocations"
        );
        const res = await fetchSavedLocationSuggestions();
        if (!cancelled) {
          setSavedLocationsSuggestionCount(res.data?.length ?? 0);
        }
      } catch {
        // Silent — no nudge appears, which is the right fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissSavedLocationsNudge = useCallback(async () => {
    const now = Date.now();
    setSavedLocsNudgeDismissedUntil(now + 7 * 24 * 60 * 60 * 1000);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('saved_locs_nudge_dismissed_at', ?)",
      [String(now)]
    );
  }, []);

  // Load data-quality improvement banner state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'dq_banner_seen'"
      );
      const seen = row?.value === "1";
      if (cancelled) return;
      setDqBannerSeen(seen);
      if (!seen) {
        try {
          const res = await fetchDataQualityImprovement();
          if (cancelled) return;
          if (res.data.improvedTripCount > 0 && res.data.milesGained > 0.5) {
            setDqImprovement({
              improvedTripCount: res.data.improvedTripCount,
              milesGained: res.data.milesGained,
            });
          } else {
            // Nothing to celebrate — silently mark seen so we never query again.
            await db.runAsync(
              "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('dq_banner_seen', '1')"
            );
            if (!cancelled) setDqBannerSeen(true);
          }
        } catch {
          // Best-effort. If the endpoint fails, leave it for next launch.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // AMAP rate change announcement banner (45p → 55p, effective 6 April
  // 2026). Shows on every dashboard visit until dismissed; one-time
  // SQLite flag keyed on the announcement id so a future announcement
  // re-shows even to people who dismissed this one.
  const AMAP_ANNOUNCEMENT_ID = "amap_rate_2026_27";
  const [amapBannerSeen, setAmapBannerSeen] = useState(true); // default seen until loaded
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = ?",
        [`announcement_dismissed_${AMAP_ANNOUNCEMENT_ID}`]
      );
      if (cancelled) return;
      setAmapBannerSeen(row?.value === "1");
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const dismissAmapBanner = useCallback(async () => {
    setAmapBannerSeen(true);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, '1')",
      [`announcement_dismissed_${AMAP_ANNOUNCEMENT_ID}`]
    );
  }, []);

  const dismissDqBanner = useCallback(async () => {
    setDqBannerSeen(true);
    setDqImprovement(null);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('dq_banner_seen', '1')"
    );
  }, []);

  // Load work explainer flag + bg-location nudge dismissal cooldown
  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ key: string; value: string }>(
        "SELECT key, value FROM tracking_state WHERE key IN ('work_explainer_seen', 'bg_loc_nudge_dismissed_at', 'first_trip_nudge_dismissed_at', 'referral_card_dismissed_at', 'motion_nudge_dismissed_at')"
      );
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      setWorkExplainerSeen(map["work_explainer_seen"] === "1");
      const dismissedAt = map["bg_loc_nudge_dismissed_at"]
        ? parseInt(map["bg_loc_nudge_dismissed_at"], 10)
        : null;
      setBgLocNudgeDismissedAt(Number.isFinite(dismissedAt as number) ? dismissedAt : null);
      const motionDismissedAt = map["motion_nudge_dismissed_at"]
        ? parseInt(map["motion_nudge_dismissed_at"], 10)
        : null;
      setMotionNudgeDismissedAt(Number.isFinite(motionDismissedAt as number) ? motionDismissedAt : null);
      const ftDismissedAt = map["first_trip_nudge_dismissed_at"]
        ? parseInt(map["first_trip_nudge_dismissed_at"], 10)
        : null;
      setFirstTripNudgeDismissedAt(Number.isFinite(ftDismissedAt as number) ? ftDismissedAt : null);
      const refDismissedAt = map["referral_card_dismissed_at"]
        ? parseInt(map["referral_card_dismissed_at"], 10)
        : null;
      setReferralCardDismissedAt(Number.isFinite(refDismissedAt as number) ? refDismissedAt : null);
    })();
  }, []);

  const dismissBgLocNudge = useCallback(async () => {
    const now = Date.now();
    setBgLocNudgeDismissedAt(now);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('bg_loc_nudge_dismissed_at', ?)",
      [String(now)]
    );
  }, []);

  // The nudge sleeps for 7 days after dismissal, then resurfaces.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const bgLocNudgeSilenced =
    bgLocNudgeDismissedAt !== null &&
    Date.now() - bgLocNudgeDismissedAt < SEVEN_DAYS_MS;

  const dismissMotionNudge = useCallback(async () => {
    const now = Date.now();
    setMotionNudgeDismissedAt(now);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('motion_nudge_dismissed_at', ?)",
      [String(now)]
    );
  }, []);
  const motionNudgeSilenced =
    motionNudgeDismissedAt !== null &&
    Date.now() - motionNudgeDismissedAt < SEVEN_DAYS_MS;

  const dismissFirstTripNudge = useCallback(async () => {
    const now = Date.now();
    setFirstTripNudgeDismissedAt(now);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('first_trip_nudge_dismissed_at', ?)",
      [String(now)]
    );
  }, []);

  // First-trip nudge: zero trips, Always location already on (so we don't
  // collide with the "Auto-detection is off" nudge above — that one owns the
  // permission case), not in an active shift, and not snoozed. Reaches both
  // Work and Personal mode, unlike the work-only Day-1 hero.
  const firstTripNudgeSilenced =
    firstTripNudgeDismissedAt !== null &&
    Date.now() - firstTripNudgeDismissedAt < SEVEN_DAYS_MS;
  const showFirstTripNudge =
    !loading &&
    stats !== null &&
    (stats.totalTrips ?? 0) === 0 &&
    bgLocationGranted &&
    !activeShift &&
    !firstTripNudgeSilenced;

  // Referral promo card — shown near the top of both dashboards. Resurfaces
  // every 7 days after a dismissal (and on a fresh login, since the device has
  // no dismissal flag then). Suppressed during the first-trip nudge so we
  // don't stack two promos on a brand-new user, during an active shift, and
  // once the user has earned all 3 free months (cap reached -> nothing left to
  // promote).
  const referralCardSilenced =
    referralCardDismissedAt !== null &&
    Date.now() - referralCardDismissedAt < SEVEN_DAYS_MS;
  const dismissReferralCard = useCallback(async () => {
    const now = Date.now();
    setReferralCardDismissedAt(now);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('referral_card_dismissed_at', ?)",
      [String(now)]
    );
  }, []);
  // Earned referral months (qualified referrals). null until fetched. Used to
  // hide the card once the user has maxed out at 3. Fetched only when the card
  // could otherwise show, to avoid an extra call on every dashboard load.
  const [referralEarnedMonths, setReferralEarnedMonths] = useState<number | null>(null);
  useEffect(() => {
    if (referralCardSilenced) return;
    let cancelled = false;
    fetchReferralSummary()
      .then((sum) => {
        if (!cancelled) setReferralEarnedMonths(sum.earnedMonths);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [referralCardSilenced]);
  const showReferralCard =
    !loading &&
    !activeShift &&
    !referralCardSilenced &&
    !showFirstTripNudge &&
    (referralEarnedMonths === null || referralEarnedMonths < 3);

  // Auto-show work explainer on first Work mode visit
  useEffect(() => {
    if (isWork && !workExplainerSeen && !loading) {
      explainerShownAtRef.current = Date.now();
      trackEvent("work_explainer.shown", { source: "auto" });
      setShowWorkExplainer(true);
    }
  }, [isWork, workExplainerSeen, loading]);

  const dismissWorkExplainer = useCallback(async (method: string = "got_it") => {
    const shownAt = explainerShownAtRef.current;
    explainerShownAtRef.current = null;
    trackEvent("work_explainer.dismissed", {
      method,
      dwellMs: shownAt ? Date.now() - shownAt : null,
    });
    setShowWorkExplainer(false);
    setWorkExplainerSeen(true);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('work_explainer_seen', '1')"
    );
  }, []);

  // Streak milestone rating trigger
  const streakMilestoneRef = useRef<number>(0);
  useEffect(() => {
    const streak = stats?.currentStreakDays ?? 0;
    const prev = streakMilestoneRef.current;
    streakMilestoneRef.current = streak;
    if (prev === streak || streak === 0) return;
    const milestones = [7, 14, 30, 60, 100];
    if (milestones.includes(streak) && !milestones.includes(prev)) {
      setTimeout(() => maybeRequestReview("streak_milestone"), 3000);
    }
  }, [stats?.currentStreakDays]);

  // Fire achievement-unlock haptic when the scorecard becomes visible with new achievements
  useEffect(() => {
    if (showScorecard && scorecard && scorecard.newAchievements.length > 0) {
      haptic("success");
    }
  }, [showScorecard]);

  // Trip segment bottom sheet
  const [tripTapInfo, setTripTapInfo] = useState<TripTapInfo | null>(null);
  const tripSheetAnim = useRef(new Animated.Value(200)).current;

  const handleTripTap = useCallback((info: TripTapInfo) => {
    setTripTapInfo(info);
    tripSheetAnim.setValue(200);
    Animated.spring(tripSheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [tripSheetAnim]);

  const dismissTripSheet = useCallback(() => {
    Animated.timing(tripSheetAnim, {
      toValue: 200,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setTripTapInfo(null));
  }, [tripSheetAnim]);

  const loadData = useCallback(async () => {
    try {
      const [shiftRes, vehicleRes, statsRes] = await Promise.all([
        fetchActiveShift().catch(async () => {
          // Offline fallback: check local SQLite for active shift
          const db = await getDatabase();
          const row = await db.getFirstAsync<{
            id: string;
            vehicle_id: string | null;
            started_at: string;
            ended_at: string | null;
            status: string;
          }>("SELECT * FROM shifts WHERE status = 'active' LIMIT 1");
          if (row) {
            return {
              data: [{
                id: row.id,
                userId: "",
                vehicleId: row.vehicle_id,
                startedAt: row.started_at,
                endedAt: row.ended_at,
                status: row.status as "active",
                vehicle: null,
              }] as ShiftWithVehicle[],
            };
          }
          return { data: [] as ShiftWithVehicle[] };
        }),
        fetchVehicles().catch(() => ({ data: [] as Vehicle[] })),
        fetchGamificationStats().catch(() => null),
      ]);

      const active = shiftRes.data.length > 0 ? shiftRes.data[0] : null;
      setActiveShift(active);
      setVehicles(vehicleRes.data);
      if (statsRes) setStats(statsRes.data);

      // Fetch daily recap (free for all users) + unclassified count for insights
      fetchRecap("daily").then((res) => setDailyRecap(res.data)).catch(() => {});
      fetchUnclassifiedCount()
        .then((res) => setUnclassifiedCount(res.count ?? 0))
        .catch(() => {});

      if (active) {
        // Resume GPS tracking if app was killed/backgrounded during a shift
        const tracking = await isTrackingActive();
        if (!tracking) {
          const hasPermission = await requestLocationPermissions();
          if (hasPermission) {
            await startShiftTracking(active.id);
          }
        }
        // Recover Live Activity if it's still running after app restart
        const startMs = new Date(active.startedAt).getTime();
        const recovered = await recoverLiveActivity(startMs);
        if (!recovered) {
          // Live Activity expired or was dismissed - start a fresh one
          const v = vehicleRes.data.find((veh) => veh.id === active.vehicleId);
          const vehicleName = v ? `${v.make} ${v.model}` : "";
          startLiveActivity({ activityType: "shift", vehicleName, isBusinessMode: isWork });
        }
      } else {
        const primary = vehicleRes.data.find((v) => v.isPrimary);
        setSelectedVehicleId(primary?.id);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isWork]);

  // Auto-trip Live Activity catch-up. iOS blocks STARTING a Live Activity while
  // the app is backgrounded, so the native engine's start is rejected when a
  // drive begins with MileClear not in front (Anthony's car-mount drive, 4 Jun:
  // the trip recorded fine but the Dynamic Island stayed dark). When the app
  // next comes to the foreground during an active auto-recording, start it here
  // - foreground starts ARE allowed - and it then persists on the Dynamic Island
  // for the rest of the drive even after the app is backgrounded again.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const db = await getDatabase();
          const rec = await db.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = 'auto_recording_active'"
          );
          if (cancelled || rec?.value !== "1") return;
          // Re-bind if one's already live; only start a fresh one if none is.
          const showing = await recoverLiveActivity();
          if (cancelled || showing) return;
          const { startNativeAutoTripLiveActivity } = await import(
            "../../lib/tracking/detection"
          );
          await startNativeAutoTripLiveActivity();
        } catch {
          // best-effort - never block focus on this
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
      // Check the full location permission tier on each focus.
      getLocationPermissionStatus().then(({ tier }) => {
        setLocationTier(tier);
        setBgLocationGranted(tier === "always");
        // Track whether background was ever granted, and detect a regression.
        getDatabase().then(async (db) => {
          if (tier === "always") {
            // Healthy now — remember it was granted, clear any lost flag.
            await db.runAsync(
              "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('bg_was_granted', '1')"
            ).catch(() => {});
            await db.runAsync(
              "DELETE FROM tracking_state WHERE key = 'bg_permission_lost'"
            ).catch(() => {});
            setBgPermissionLost(false);
          } else {
            const lost = await db.getFirstAsync<{ value: string }>(
              "SELECT value FROM tracking_state WHERE key = 'bg_permission_lost'"
            ).catch(() => null);
            setBgPermissionLost(lost?.value === "1");
          }
        }).catch(() => {});
      }).catch(() => {});
      // Background App Refresh: if iOS won't run us in the background, recording
      // fails no matter what — surface it so the user can re-enable the setting.
      import("../../lib/permissions/backgroundRefresh")
        .then(({ getBackgroundRefreshStatus, isBackgroundRefreshBlocked }) =>
          getBackgroundRefreshStatus().then((s) => setBgRefreshOff(isBackgroundRefreshBlocked(s)))
        )
        .catch(() => {});
      // Motion & Fitness: when denied, ClearTrack can't detect a drive STARTING
      // via the motion chip and leans on the slower GPS speed backstop, which
      // misses short cold-start legs (balkistomi, recurring). Softer than the
      // location blocker — the engine still works — so it's a dismissable nudge.
      import("../../lib/tracking/motionPermission")
        .then(({ getMotionPermission }) =>
          getMotionPermission().then((m) => setMotionDenied(m === "denied"))
        )
        .catch(() => {});
      // dashboard_focus rating trigger removed 4 May 2026 — was the
      // dominant source of "Not now" dismissals. Rating prompts now
      // only fire after positive moments (achievement, streak, trip
      // saved/classified, scorecard). Manual fallback lives at
      // Profile → Rate MileClear for users who want to volunteer one.
    }, [loadData])
  );

  useEffect(() => {
    if (activeShift) {
      let tick = 0;
      const updateElapsed = () => {
        const start = new Date(activeShift.startedAt).getTime();
        const secs = Math.floor((Date.now() - start) / 1000);
        setElapsed(secs);
        // Update Dynamic Island every 5 seconds
        tick++;
        if (tick % 5 === 0) {
          const dist = liveDistRef.current;
          getLiveActivityContext({ currentTripMiles: dist, includeEarnings: true })
            .then((ctx) => {
              updateLiveActivity({
                distanceMiles: dist,
                speedMph: 0,
                tripCount: 0,
                dailyTotalMiles: ctx.dailyTotalMiles,
                milestoneText: ctx.milestoneText,
                earningsTodayPence: ctx.earningsTodayPence,
              });
            })
            .catch(() => {
              updateLiveActivity({ distanceMiles: dist, speedMph: 0, tripCount: 0 });
            });
        }
      };
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [activeShift, stats]);

  // ── Live distance polling — reads shift_coordinates from SQLite ────────
  const liveDistRef = useRef(0);
  const activeShiftId = activeShift?.id;
  useEffect(() => {
    if (!activeShiftId) {
      setLiveDistance(0);
      liveDistRef.current = 0;
      return;
    }

    let mounted = true;
    const poll = async () => {
      try {
        const coords = await peekBackgroundCoordinates(activeShiftId);
        if (!mounted) return;
        const dist = coords.length >= 2 ? calcDistance(coords) : 0;
        setLiveDistance(dist);
        liveDistRef.current = dist;
      } catch {
        // DB not ready
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [activeShiftId]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  // Load the remembered hourly rate once on mount.
  useEffect(() => {
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'shift_hourly_rate_pence'"
        );
        if (row?.value) setHourlyRatePence(Number(row.value) || null);
      } catch {
        // tracking_state not ready — rate just stays unset
      }
    })();
  }, []);

  // Set / change the hourly rate for live shift earnings. Persisted so the next
  // shift remembers it. Alert.prompt is iOS-only; the feature is iOS-first.
  const promptHourlyRate = useCallback(() => {
    Alert.prompt(
      "Hourly rate",
      "What are you paid per hour? Your earnings will tick up live as you work.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: async (val?: string) => {
            const pounds = parseFloat((val ?? "").replace(/[^0-9.]/g, ""));
            if (!isFinite(pounds) || pounds <= 0) return;
            const pence = Math.round(pounds * 100);
            setHourlyRatePence(pence);
            try {
              const db = await getDatabase();
              await db.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('shift_hourly_rate_pence', ?)",
                [String(pence)]
              );
            } catch {
              // best-effort persistence; the in-memory rate still drives the ticker
            }
          },
        },
      ],
      "plain-text",
      hourlyRatePence != null ? (hourlyRatePence / 100).toFixed(2) : "",
      "decimal-pad"
    );
  }, [hourlyRatePence]);

  const handleStartShift = useCallback(async () => {
    setStarting(true);
    try {
      const res = await syncStartShift(
        selectedVehicleId ? { vehicleId: selectedVehicleId } : undefined
      );
      setActiveShift(res.data);
      haptic("success");

      // Start Live Activity (Dynamic Island)
      const vehicleName = selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : "";
      startLiveActivity({ activityType: "shift", vehicleName, isBusinessMode: isWork });

      // Start GPS tracking
      const hasPermission = await requestLocationPermissions();
      if (hasPermission) {
        await startShiftTracking(res.data.id);
      } else {
        Alert.alert(
          "Location Access",
          "GPS tracking is disabled. Trips won't be recorded automatically, but you can still add them manually.",
          [
            { text: "Open Settings", onPress: () => Linking.openSettings() },
            { text: "OK", style: "cancel" },
          ]
        );
      }
    } catch (err: unknown) {
      const { title, message } = describeError(err, "Couldn't start the shift");
      Alert.alert(title, message);
    } finally {
      setStarting(false);
    }
  }, [selectedVehicleId, isWork, selectedVehicle]);

  const handleEndShift = useCallback(() => {
    if (!activeShift) return;
    Alert.alert("End Shift", "Are you sure you want to end this shift?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Shift",
        style: "destructive",
        onPress: async () => {
          setEnding(true);
          try {
            // 1. Stop GPS tracking + Live Activity
            await stopShiftTracking();
            endLiveActivityWithSummary({ distanceMiles: liveDistRef.current, tripCount: 0 });

            // 2. Process GPS coordinates into trips (before ending shift so scorecard counts them)
            await processShiftTrips(
              activeShift.id,
              activeShift.vehicleId ?? undefined
            );

            // 3. End shift (offline-aware — syncs when online)
            const res = await syncEndShift(activeShift.id);
            setActiveShift(null);
            haptic("success");
            if (res) {
              const resAny = res as any;
              if (resAny.scorecard) {
                setScorecard(resAny.scorecard);
                setShowScorecard(true);
                setTimeout(() => maybeRequestReview("scorecard_shown"), 3000);
              }
            }

            // Live earnings: offer to log what this shift earned at the set rate,
            // feeding earnings totals + the invoice tracker (Laura's ask). Uses
            // true accrual (rate x time worked); she can round/edit when invoicing.
            if (hourlyRatePence != null) {
              const elapsedSecs = Math.max(
                0,
                Math.floor((Date.now() - new Date(activeShift.startedAt).getTime()) / 1000)
              );
              const earnedPence = Math.round((hourlyRatePence * elapsedSecs) / 3600);
              if (earnedPence > 0) {
                Alert.alert(
                  "Log shift earnings?",
                  `You worked ${formatElapsed(elapsedSecs)} at £${(hourlyRatePence / 100).toFixed(2)}/hr — that's ${formatPence(earnedPence)}. Add it to your earnings?`,
                  [
                    { text: "Not now", style: "cancel" },
                    {
                      text: "Add earning",
                      onPress: () => {
                        syncCreateEarning({
                          platform: "freelance",
                          amountPence: earnedPence,
                          periodStart: new Date(activeShift.startedAt).toISOString(),
                          periodEnd: new Date().toISOString(),
                        })
                          .then(() => haptic("success"))
                          .catch(() => {});
                      },
                    },
                  ]
                );
              }
            }
            loadData();
          } catch (err: any) {
            Alert.alert("Couldn't end the shift", err.message || "Try again in a moment.");
          } finally {
            setEnding(false);
          }
        },
      },
    ]);
  }, [activeShift, loadData, hourlyRatePence]);

  const handleShareRecap = useCallback(async () => {
    if (!recapData) return;
    try {
      await Share.share({ message: recapData.shareText });
    } catch {}
  }, [recapData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading) {
    // Skeleton-first: show approximate shape of hero, mode toggle, and the
    // CTA buttons while we fetch user / vehicle / shift state. Replaces the
    // centred amber spinner that used to make load feel longer than it is.
    return (
      <View style={s.container}>
        <ScrollView contentContainerStyle={s.content}>
          <Skeleton.Group gap={spacing.md}>
            <Skeleton height={32} width={180} radius={radii.pill} />
            <Skeleton height={140} radius={radii.lg} style={{ marginTop: spacing.md }} />
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
              <Skeleton height={56} width="48%" radius={radii.md} />
              <Skeleton height={56} width="48%" radius={radii.md} />
            </View>
            <Skeleton height={120} radius={radii.lg} style={{ marginTop: spacing.lg }} />
            <Skeleton height={120} radius={radii.lg} style={{ marginTop: spacing.md }} />
          </Skeleton.Group>
        </ScrollView>
      </View>
    );
  }

  // ── Scorecard Modal ───────────────────────────────────────────
  const scorecardModal = (
    <AppModal
      visible={showScorecard}
      animationType="slide"
      onRequestClose={() => setShowScorecard(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalSheet} accessibilityViewIsModal={true}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Shift Complete</Text>

          {scorecard && (
            <>
              <View style={s.scorecardGrid}>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>
                    {scorecard.tripsCompleted}
                  </Text>
                  <Text style={s.scorecardUnit}>trips</Text>
                </View>
                <View style={[s.scorecardCell, s.scorecardCellCenter]}>
                  <Text style={s.scorecardNumLarge}>
                    {scorecard.totalMiles.toFixed(1)}
                  </Text>
                  <Text style={s.scorecardUnit}>miles</Text>
                </View>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>
                    {formatPence(scorecard.deductionPence)}
                  </Text>
                  <Text style={s.scorecardUnit}>deduction</Text>
                </View>
              </View>

              <Text style={s.scorecardDuration}>
                {formatElapsed(scorecard.durationSeconds)}
              </Text>

              {(scorecard.isPersonalBestMiles || scorecard.isPersonalBestTrips) && (
                <View style={s.pbBadge}>
                  <Text style={s.pbText}>
                    {scorecard.isPersonalBestMiles && scorecard.isPersonalBestTrips
                      ? "New record - Miles & Trips"
                      : scorecard.isPersonalBestMiles
                        ? "New record - Most Miles"
                        : "New record - Most Trips"}
                  </Text>
                </View>
              )}

              {scorecard.newAchievements.length > 0 && (
                <View style={s.unlockSection}>
                  <Text style={s.unlockTitle}>Unlocked</Text>
                  {scorecard.newAchievements.map((a) => (
                    <View key={a.id} style={s.unlockRow}>
                      <Text style={s.unlockEmoji}>{a.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.unlockLabel}>{a.label}</Text>
                        <Text style={s.unlockDesc}>{a.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <Button
            title="Done"
            icon="checkmark"
            onPress={() => setShowScorecard(false)}
          />
        </View>
      </View>
    </AppModal>
  );

  // ── Recap Modal ───────────────────────────────────────────────
  const recapModal = (
    <AppModal
      visible={showRecap}
      animationType="slide"
      onRequestClose={() => setShowRecap(false)}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalSheet} accessibilityViewIsModal={true}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>
            {recapData?.period === "daily" ? "Daily" : recapData?.period === "weekly" ? "Weekly" : "Monthly"} Recap
          </Text>
          {recapData && (
            <>
              <Text style={s.recapSubtitle}>{recapData.label}</Text>

              <View style={s.scorecardGrid}>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>
                    {recapData.totalMiles.toFixed(1)}
                  </Text>
                  <Text style={s.scorecardUnit}>miles</Text>
                </View>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>{recapData.totalTrips}</Text>
                  <Text style={s.scorecardUnit}>trips</Text>
                </View>
                <View style={s.scorecardCell}>
                  <Text style={s.scorecardNum}>
                    {formatPence(recapData.deductionPence)}
                  </Text>
                  <Text style={s.scorecardUnit}>deduction</Text>
                </View>
              </View>

              {recapData.busiestDayLabel && (
                <Text style={s.recapDetail}>
                  Busiest day: {recapData.busiestDayLabel} ({recapData.busiestDayMiles.toFixed(1)} mi)
                </Text>
              )}

              <View style={s.recapBtnRow}>
                <Button
                  variant="secondary"
                  title="Share"
                  icon="share-outline"
                  onPress={handleShareRecap}
                />
                <Button
                  title="Close"
                  icon="checkmark"
                  onPress={() => setShowRecap(false)}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </AppModal>
  );

  // ── Work Mode Explainer Modal ─────────────────────────────────
  // Plain TouchableOpacity instead of <Button>: the Button variant wraps its
  // Pressable in two animated Views (glow + scale) which on iPad iPadOS 26
  // can break hit-testing inside a Modal. Apple App Review hit this on
  // iPad Air M3 / iPadOS 26.4.2 (build 60 rejection, guideline 2.1(a)).
  const workExplainerModal = (
    <AppModal
      visible={showWorkExplainer}
      animationType="fade"
      onRequestClose={() => dismissWorkExplainer("system")}
    >
      <View style={s.explainerOverlay}>
        <View style={s.explainerCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.explainerIconWrap}>
              <Ionicons name="briefcase" size={28} color="#f5a623" />
            </View>
            <Text style={s.explainerTitle}>Who is Work mode for?</Text>
            <Text style={s.explainerBody}>
              Work mode is for <Text style={s.explainerBold}>self-employed drivers</Text> who use their own vehicle for business. This includes:
            </Text>

            <View style={s.explainerList}>
              <ExplainerItem icon="bicycle-outline" text="Gig & delivery drivers (Uber, Deliveroo, Just Eat, Amazon Flex)" />
              <ExplainerItem icon="cube-outline" text="Couriers & freelance drivers (Stuart, Gophr, DPD, Yodel, Evri)" />
              <ExplainerItem icon="construct-outline" text="Self-employed tradespeople, estate agents, carers" />
              <ExplainerItem icon="business-outline" text="Anyone who drives for their own business" />
            </View>

            <View style={s.explainerDivider} />

            <Text style={s.explainerSubhead}>How it works</Text>
            <Text style={s.explainerBody}>
              Business trips are tracked separately and used to calculate your <Text style={s.explainerBold}>HMRC mileage deduction</Text> - 55p per mile for the first 10,000, then 25p after that. This reduces your tax bill at the end of the year.
            </Text>

            <View style={s.explainerDivider} />

            <Text style={s.explainerSubhead}>Not sure if you qualify?</Text>
            <Text style={s.explainerBody}>
              If you're employed and your employer reimburses mileage, you may still be able to claim the difference from HMRC. However, regular commuting to a fixed office is <Text style={s.explainerBold}>not</Text> claimable.
            </Text>
            <Text style={[s.explainerBody, { marginTop: 8 }]}>
              If you just want to track personal driving, switch to <Text style={s.explainerBold}>Personal</Text> mode - you can always switch back later.
            </Text>
          </ScrollView>

          <TouchableOpacity
            onPress={() => dismissWorkExplainer("got_it")}
            activeOpacity={0.85}
            style={s.explainerCta}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="checkmark" size={20} color="#030712" />
            <Text style={s.explainerCtaText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AppModal>
  );

  // ── Active Shift ──────────────────────────────────────────────
  if (activeShift) {
    return (
      <>
        {scorecardModal}
        <ScrollView
          style={s.container}
          contentContainerStyle={[s.content, { paddingTop: 16 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f5a623" />
          }
        >
        <Text style={s.greeting}>Shift Active</Text>

        <View style={s.timerWrap}>
          <View
            style={s.liveIndicator}
            accessible={true}
            accessibilityLabel="Tracking shift, live"
            accessibilityRole="text"
          >
            <View style={s.liveDot} accessible={false} />
            <Text style={s.liveText} accessible={false}>TRACKING</Text>
          </View>
          <Text style={s.timer}>{formatElapsed(elapsed)}</Text>
          {activeShift.vehicle && (
            <Text style={s.timerSub}>
              {activeShift.vehicle.make} {activeShift.vehicle.model}
            </Text>
          )}
          <TouchableOpacity
            onPress={promptHourlyRate}
            activeOpacity={0.7}
            style={s.shiftEarnRow}
            accessibilityRole="button"
            accessibilityLabel={
              hourlyRatePence != null ? "Change hourly rate" : "Set hourly rate"
            }
          >
            {hourlyRatePence != null ? (
              <>
                <Text style={s.shiftEarnAmount}>
                  {formatPence(Math.round((hourlyRatePence * elapsed) / 3600))}
                </Text>
                <Text style={s.shiftEarnRate}>
                  earned &middot; £{(hourlyRatePence / 100).toFixed(2)}/hr &middot; tap to change
                </Text>
              </>
            ) : (
              <Text style={s.shiftEarnSet}>+ Set your hourly rate to track earnings live</Text>
            )}
          </TouchableOpacity>
        </View>

        <LiveMapTracker
          shiftId={activeShift.id}
          height={280}
          trailDefault
          avatarId={currentUser?.avatarId}
          showTripSegments
          onTripTap={handleTripTap}
        />

        <View style={s.statsRow}>
          <View style={[s.statCard, s.statCardLive]}>
            <Text style={s.statNumLive} maxFontSizeMultiplier={fontScaleCap.display}>
              {liveDistance.toFixed(1)}
            </Text>
            <Text style={s.statUnit}>mi this shift</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum} maxFontSizeMultiplier={fontScaleCap.display}>
              {stats ? formatMilesShort(stats.todayMiles) : "0"}
            </Text>
            <Text style={s.statUnit}>mi today</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum} maxFontSizeMultiplier={fontScaleCap.display}>
              {stats ? formatMilesShort(stats.weekMiles) : "0"}
            </Text>
            <Text style={s.statUnit}>mi this week</Text>
          </View>
        </View>

        <Button
          variant="destructive"
          title="End Shift"
          icon="stop-circle"
          onPress={handleEndShift}
          loading={ending}
          size="lg"
        />
        </ScrollView>
      </>
    );
  }

  // ── Idle Dashboard ────────────────────────────────────────────
  // Modals rendered as siblings of the ScrollView (not children) so they
  // sit at the component root. Avoids any odd interaction between the
  // outer ScrollView and the Modal's portal layer on iPad.
  return (
    <>
      {scorecardModal}
      {recapModal}
      {workExplainerModal}
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingTop: 16 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f5a623" />
        }
      >
      {/* Mode Toggle */}
      <ModeToggle
        onInfoPress={() => {
          explainerShownAtRef.current = Date.now();
          trackEvent("work_explainer.shown", { source: "manual" });
          setShowWorkExplainer(true);
        }}
      />

      {/* Active recording banner — appears whenever auto-detection has a
          trip in progress, so the user always knows we're tracking even if
          the Live Activity silently failed to present. */}
      <ActiveRecordingBanner />
      {/* Safety: warn if auto-detection is switched off, with one-tap re-enable. */}
      <TrackingOffBanner />
      <SyncStatusBanner />
      {/* Persistent trip-status surface — Saving / Saved+sync-state / Ready.
          Hides itself while recording (banner above owns that state) and when
          permissions are broken (the red blockers below own those). */}
      <TripStatusStrip />

      {/* Data-quality improvement celebration banner — fires once per user
          when they open the app after a server-side backfill corrected
          some of their trips. Turns invisible "we fixed your data" work
          into a visible trust moment. SQLite-flagged so it only shows
          once per device install. */}
      {!dqBannerSeen && dqImprovement && (
        <View style={s.dqBanner}>
          <View style={s.dqBannerIconWrap}>
            <Ionicons name="sparkles" size={20} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.dqBannerTitle}>We improved your trip data</Text>
            <Text style={s.dqBannerBody}>
              We re-routed {dqImprovement.improvedTripCount} of your recent {dqImprovement.improvedTripCount === 1 ? "trip" : "trips"} and recovered{" "}
              {dqImprovement.milesGained.toFixed(1)} miles for you. Tax Readiness is up to date.
            </Text>
          </View>
          <TouchableOpacity
            onPress={dismissDqBanner}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Ionicons name="close" size={20} color={colors.text3} />
          </TouchableOpacity>
        </View>
      )}

      {/* Background location nudge - auto trip detection requires "Always".
          Uses the smart escalation helper so the right thing happens whether
          the user has never granted, granted only foreground, or denied
          outright. Linking.openSettings() alone is wrong for fresh installs:
          iOS doesn't show a Location row in Settings until the app has
          actually asked for permission once. */}
      {/* ACTIVATION BLOCKER — no location access at all (undetermined/denied):
          the app literally cannot record a single trip. Persistent and
          NON-dismissible until fixed. This is the dead state a new user lands
          in after skipping the onboarding permission prompt (Adnan K, 1 June:
          onboarding_complete with permission 'undetermined', zero trips, gone
          in 90s). An app that silently can't work is worse than an honest one
          that says so. */}
      {locationTier === "none" && !activeShift && (
        <TouchableOpacity
          style={[s.bgLocNudge, s.bgLocBlocker]}
          onPress={async () => {
            const final = await requestOrFixBackgroundLocation();
            setLocationTier(final.tier);
            setBgLocationGranted(final.tier === "always");
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Your trips are not being recorded. Tap to turn on location access so MileClear can log your miles."
        >
          <View style={s.bgLocNudgeRow}>
            <View style={s.bgLocNudgeIcon}>
              <Ionicons name="warning" size={20} color="#ef4444" accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bgLocBlockerTitle}>Your trips aren&apos;t being recorded</Text>
              <Text style={s.bgLocNudgeBody}>
                MileClear needs location access to log your miles. Until it&apos;s on, every drive — and every £ of tax deduction — is lost. Tap to turn it on.
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* BACKGROUND APP REFRESH OFF — iOS won't run the app in the background,
          so recording fails no matter how good detection is (fleet diagnostics
          found 11 active users in this state, 3 Jun 2026). Only shown once
          location itself is sorted (locationTier !== "none"), so we never stack
          two red blockers. Opens Settings directly — there's no in-app fix. */}
      {bgRefreshOff && locationTier !== "none" && !activeShift && (
        <TouchableOpacity
          style={[s.bgLocNudge, s.bgLocBlocker]}
          onPress={() => Linking.openSettings().catch(() => {})}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Background App Refresh is off. Tap to open Settings and turn it on so MileClear can record your trips in the background."
        >
          <View style={s.bgLocNudgeRow}>
            <View style={s.bgLocNudgeIcon}>
              <Ionicons name="warning" size={20} color="#ef4444" accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bgLocBlockerTitle}>Background App Refresh is off</Text>
              <Text style={s.bgLocNudgeBody}>
                iOS won&apos;t let MileClear run in the background, so your trips can&apos;t record automatically. Turn it on in Settings → MileClear → Background App Refresh. Tap to open Settings.
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* REGRESSION — background location was granted before and has been lost
          (iOS downgrade, OS update, user change). 40% of the fleet has a
          permission_lost event. Firm, non-dismissible recovery banner, distinct
          from the soft "upgrade to Always" nudge below (which is for users who
          never granted it). Takes precedence over that nudge. */}
      {bgPermissionLost && locationTier !== "always" && !activeShift && (
        <TouchableOpacity
          style={[s.bgLocNudge, s.bgLocBlocker]}
          onPress={async () => {
            const final = await requestOrFixBackgroundLocation();
            setLocationTier(final.tier);
            setBgLocationGranted(final.tier === "always");
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="You've lost background location access. Tap to restore it so MileClear can record your trips again."
        >
          <View style={s.bgLocNudgeRow}>
            <View style={s.bgLocNudgeIcon}>
              <Ionicons name="warning" size={20} color="#ef4444" accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bgLocBlockerTitle}>Your trips stopped recording</Text>
              <Text style={s.bgLocNudgeBody}>
                MileClear had background location access, but it&apos;s been turned off — so your drives aren&apos;t being recorded anymore. Tap to switch it back to &ldquo;Always&rdquo;.
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Foreground-only ("While Using"): records while the app is open but
          misses backgrounded drives. The app still works, so this stays a soft,
          dismissible nudge to upgrade to Always. Suppressed when the firm
          regression banner above is showing. */}
      {locationTier === "foreground" && !activeShift && !bgLocNudgeSilenced && !bgPermissionLost && (
        <TouchableOpacity
          style={s.bgLocNudge}
          onPress={async () => {
            const final = await requestOrFixBackgroundLocation();
            setLocationTier(final.tier);
            setBgLocationGranted(final.tier === "always");
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Auto-detection is limited. Tap to allow Always location so trips record in the background too."
        >
          <View style={s.bgLocNudgeRow}>
            <View style={s.bgLocNudgeIcon}>
              <Ionicons name="location-outline" size={20} color="#f59e0b" accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bgLocNudgeTitle}>Auto-detection is limited</Text>
              <Text style={s.bgLocNudgeBody}>
                Trips only record while MileClear is open. Switch to &ldquo;Always&rdquo; so backgrounded drives are captured too - tap to fix.
              </Text>
            </View>
            <TouchableOpacity
              onPress={dismissBgLocNudge}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss for 7 days"
            >
              <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Motion & Fitness denied — ClearTrack can't catch the START of short
          trips via the motion chip and leans on the slower GPS speed backstop,
          missing cold-start morning legs (balkistomi, recurring 14 Jun 2026).
          Soft + dismissable: the engine still works, this just makes it
          reliable. Only when location is otherwise fine, so we don't stack it
          under the firmer location prompts. */}
      {motionDenied && locationTier === "always" && !bgRefreshOff && !activeShift && !motionNudgeSilenced && (
        <TouchableOpacity
          style={s.bgLocNudge}
          onPress={async () => {
            const { requestMotionPermission } = await import("../../lib/tracking/motionPermission");
            const result = await requestMotionPermission();
            if (result === "granted") setMotionDenied(false);
            else Linking.openSettings().catch(() => {});
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Turn on Motion and Fitness so MileClear catches the start of short trips. Tap to fix."
        >
          <View style={s.bgLocNudgeRow}>
            <View style={s.bgLocNudgeIcon}>
              <Ionicons name="walk-outline" size={20} color="#f59e0b" accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bgLocNudgeTitle}>Turn on Motion &amp; Fitness</Text>
              <Text style={s.bgLocNudgeBody}>
                It&apos;s how we catch the moment a drive starts. Without it, short trips can be missed. Tap to switch it on in Settings.
              </Text>
            </View>
            <TouchableOpacity
              onPress={dismissMotionNudge}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss for 7 days"
            >
              <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* First-trip nudge — in-app activation safety net. Shows when the user
          has Always location on but still zero trips. Two paths: take a live
          trip now, or backfill one they already drove. */}
      {showFirstTripNudge && (
        <View style={s.ftNudge}>
          <View style={s.bgLocNudgeRow}>
            <View style={s.ftNudgeIcon}>
              <Ionicons name="navigate-outline" size={20} color={AMBER} accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bgLocNudgeTitle}>Record your first trip</Text>
              <Text style={s.bgLocNudgeBody}>
                Auto-detection is on - just drive and it records itself. Already made a journey? Add it now so your deduction starts.
              </Text>
            </View>
            <TouchableOpacity
              onPress={dismissFirstTripNudge}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss for 7 days"
            >
              <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
            </TouchableOpacity>
          </View>
          <View style={s.ftNudgeActions}>
            <TouchableOpacity
              style={[s.ftNudgeBtn, s.ftNudgeBtnPrimary]}
              onPress={() => router.push("/trip-form")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Start a trip now"
            >
              <Ionicons name="play" size={14} color="#0b0e14" accessible={false} />
              <Text style={s.ftNudgeBtnTextPrimary}>Start a trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.ftNudgeBtn}
              onPress={() => router.push({ pathname: "/trip-form", params: { mode: "manual" } } as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add a past trip manually"
            >
              <Ionicons name="create-outline" size={14} color={AMBER} accessible={false} />
              <Text style={s.ftNudgeBtnText}>Add a past trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Referral promo — dismissible (30 days), both modes. Links to the
          Invite Friends screen. Suppressed while the first-trip nudge shows. */}
      {showReferralCard && (
        <TouchableOpacity
          style={s.referralCard}
          onPress={() => router.push("/refer" as never)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Invite friends and get a free month of Pro for each. Opens the invite screen."
        >
          <View style={s.referralCardIcon}>
            <Ionicons name="gift" size={20} color={AMBER} accessible={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.referralCardTitle}>Get Pro free - invite friends</Text>
            <Text style={s.referralCardBody}>
              A free month of Pro for every friend who joins and takes a trip (up to 3).
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={TEXT_3} accessible={false} />
          <TouchableOpacity
            onPress={dismissReferralCard}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            style={s.referralCardDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Ionicons name="close" size={15} color="#6b7280" accessible={false} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Smart Insights */}
      <SmartInsightCard
        stats={stats}
        vehicles={vehicles}
        isPremium={isPremium}
        isWork={isWork}
        unclassifiedCount={unclassifiedCount}
      />

      {/* HMRC AMAP rate change announcement (45p -> 55p, effective
          6 April 2026). Same visual treatment as the suggestion cards
          below. Dismissible per device; one-time SQLite flag keyed on
          the announcement id so a future announcement re-shows even
          to people who dismissed this one. */}
      {!amapBannerSeen && (
        <TouchableOpacity
          style={s.savedLocsNudge}
          onPress={() => {
            Linking.openURL("https://mileclear.com/hmrc-mileage-rates").catch(() => {});
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="HMRC mileage rate raised to 55p from 6 April 2026"
        >
          <TouchableOpacity
            style={s.savedLocsNudgeDismiss}
            onPress={dismissAmapBanner}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
          </TouchableOpacity>
          <View style={s.savedLocsNudgeIconWrap}>
            <Ionicons name="megaphone" size={20} color={AMBER} accessible={false} />
          </View>
          <Text style={s.savedLocsNudgeTitle}>
            HMRC mileage rate raised to 55p
          </Text>
          <Text style={s.savedLocsNudgeBody}>
            From 6 April 2026, cars and vans claim 55p per mile for the first
            10,000 business miles (up from 45p). MileClear picks the right
            rate per trip date - older trips stay at 45p.
          </Text>
          <View style={s.savedLocsNudgeCta}>
            <Text style={s.savedLocsNudgeCtaText}>Learn more</Text>
            <Ionicons name="chevron-forward" size={14} color={AMBER} accessible={false} />
          </View>
        </TouchableOpacity>
      )}

      {/* Saved-locations nudge — users with 0 pinned places + clusters available */}
      {showSavedLocationsNudge && (
        <TouchableOpacity
          style={s.savedLocsNudge}
          onPress={() => router.push("/saved-locations-suggest" as never)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Review ${savedLocationsSuggestionCount} suggested ${
            savedLocationsSuggestionCount === 1 ? "place" : "places"
          }`}
        >
          <TouchableOpacity
            style={s.savedLocsNudgeDismiss}
            onPress={dismissSavedLocationsNudge}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
          </TouchableOpacity>
          <View style={s.savedLocsNudgeIconWrap}>
            <Ionicons name="sparkles" size={20} color={AMBER} accessible={false} />
          </View>
          <Text style={s.savedLocsNudgeTitle}>
            Save the places you visit often
          </Text>
          <Text style={s.savedLocsNudgeBody}>
            MileClear spotted{" "}
            {savedLocationsSuggestionCount === 1
              ? "1 place"
              : `${savedLocationsSuggestionCount} places`}{" "}
            in your recent trips. Save them so journeys are labelled with names
            you recognise.
          </Text>
          <View style={s.savedLocsNudgeCta}>
            <Text style={s.savedLocsNudgeCtaText}>Review suggestions</Text>
            <Ionicons name="chevron-forward" size={14} color={AMBER} accessible={false} />
          </View>
        </TouchableOpacity>
      )}

      {/* Pro Nudge Card — free users with 5+ trips */}
      {showProNudge && (
        <TouchableOpacity
          style={s.proNudgeCard}
          onPress={() => showPaywall("dashboard_nudge")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Pro"
        >
          <TouchableOpacity
            style={s.btPromoDismiss}
            onPress={dismissProNudge}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss Pro nudge"
          >
            <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
          </TouchableOpacity>
          <View style={s.proNudgeIcon}>
            <Ionicons name="star" size={24} color={AMBER} accessible={false} />
          </View>
          <Text style={s.btPromoTitle}>Upgrade to Pro</Text>
          <Text style={s.btPromoBody}>{proNudgeMessages[proNudgeIndex]}</Text>
          <View style={s.btPromoCta}>
            <Text style={s.vehicleNudgeCtaText}>See plans</Text>
            <Ionicons name="chevron-forward" size={14} color={AMBER} accessible={false} />
          </View>
        </TouchableOpacity>
      )}

      {/* ── Work Mode (layout-aware) ── */}
      {/* Each card fades-in-from-below with a small stagger via
          FadeInStagger. The IIFE around the switch captures the rendered
          card so we can wrap it in the animation; the original returns
          are preserved verbatim, only the outer wrapper changed. */}
      {isWork && workLayout.visibleKeys.map((key, index) => {
        // Trip-count gates: cards that only make sense once a few trips are
        // logged are hidden in the empty / early state.
        //
        // We use TWO signals because they catch different empty cases:
        //   - totalTrips: have they driven anything at all? (Day 1 user)
        //   - hasBusinessDeduction: do any of their trips count as business?
        //     (a user with 100 trips all marked Personal still has £0
        //     business deduction and would get empty heatmap / benchmark
        //     / calendar cards if we only gated on totalTrips)
        const totalTrips = stats?.totalTrips ?? 0;
        const hasBusinessDeduction = (stats?.deductionPence ?? 0) > 0;

        const card = (() => {
        switch (key) {
          case "work_hero":
            if (!stats) return null;
            // Empty-state hero: replaces "£0.00 saved" with a Day 1 welcome
            // when the user has never logged a trip. The Start Trip CTA card
            // immediately below the hero is the next-action prompt.
            if (totalTrips === 0) {
              return (
                <View key={key} style={s.heroCard}>
                  <View style={s.heroTopRow}>
                    <Text style={s.heroLabel}>Welcome {"·"} Day 1</Text>
                  </View>
                  <Text style={s.heroValue} maxFontSizeMultiplier={fontScaleCap.display}>{"£"}0.00</Text>
                  <Text style={s.heroSavedLabel}>tax saved so far</Text>
                  <Text style={s.heroEmptyBody}>
                    Tap Start Trip the next time you drive. Your HMRC deduction starts adding up from your first business mile.
                  </Text>
                </View>
              );
            }
            // Trips exist but none are business-classified - the user is
            // tracking but not yet claiming. Replace the confusing "£0 next
            // to 123 trips" display with an actionable nudge.
            if (!hasBusinessDeduction) {
              return (
                <TouchableOpacity
                  key={key}
                  style={s.heroCard}
                  onPress={() => router.push("/(tabs)/trips" as any)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="No business miles tracked yet. Tap to open the Trips tab and reclassify any work-related trips as Business."
                >
                  <View style={s.heroTopRow}>
                    <Text style={s.heroLabel}>Tax Deduction {"·"} {stats.taxYear}</Text>
                  </View>
                  <Text style={s.heroValue} maxFontSizeMultiplier={fontScaleCap.display}>{"£"}0.00</Text>
                  <Text style={s.heroSavedLabel}>no business trips yet</Text>
                  <Text style={s.heroEmptyBody}>
                    You have {stats.totalTrips} trip{stats.totalTrips === 1 ? "" : "s"} tracked but none are marked Business. Tap any work-related trip in the Trips tab and switch its classification to start your HMRC deduction.
                  </Text>
                </TouchableOpacity>
              );
            }
            return stats ? (
              <View key={key} style={s.heroCard}>
                <View style={s.heroTopRow}>
                  <Text style={s.heroLabel}>Tax Deduction {"\u00B7"} {stats.taxYear}</Text>
                  {stats.currentStreakDays > 0 && (
                    <View style={s.streakBadgeInline}>
                      <Text style={s.streakNumInline}>{stats.currentStreakDays}d</Text>
                    </View>
                  )}
                </View>
                {/* Adaptive typography: deductions under \u00A310 use a smaller
                    type ramp so a "\u00A31.67" headline doesn't dominate a card
                    that's meant to celebrate a building total. Once the
                    number is meaningful (\u00A310+) it returns to the full
                    heroValue size. */}
                <Text
                  style={[
                    s.heroValue,
                    stats.deductionPence < 1000 && s.heroValueGettingStarted,
                  ]}
                  maxFontSizeMultiplier={fontScaleCap.display}
                >
                  {formatPence(stats.deductionPence)}
                </Text>
                {stats.deductionPence >= 1000 && (
                  <Text style={s.heroSavedLabel}>saved in tax this year</Text>
                )}
                {stats.deductionPence > 0 && stats.deductionPence < 1000 && (
                  <Text style={s.heroSavedLabel}>building up - keep classifying business trips</Text>
                )}
                {!isPremium && stats.deductionPence >= 1000 && (
                  <Text style={s.heroLockedHint}>Upgrade to export for your tax return</Text>
                )}
                <View style={s.heroMeta}>
                  <Text style={s.heroMetaText}>
                    {formatMilesShort(stats.todayMiles)} mi today
                  </Text>
                  <View style={s.heroDivider} />
                  <Text style={s.heroMetaText}>
                    {formatMilesShort(stats.weekMiles)} mi this week
                  </Text>
                  <View style={s.heroDivider} />
                  <Text style={s.heroMetaText}>
                    {stats.totalTrips} trips
                  </Text>
                </View>
                {(stats.unclassifiedTrips ?? 0) >= 5 && (
                  <TouchableOpacity
                    style={s.heroNudge}
                    onPress={() => router.push("/(tabs)/trips" as any)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${stats.unclassifiedTrips} unclassified trips this tax year. Tap to review.`}
                  >
                    <Ionicons name="alert-circle-outline" size={16} color="#fbbf24" />
                    <Text style={s.heroNudgeText}>
                      {stats.unclassifiedTrips} unclassified {stats.unclassifiedTrips === 1 ? "trip" : "trips"} this tax year — review to boost your deduction
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color="#fbbf24" />
                  </TouchableOpacity>
                )}
              </View>
            ) : null;
          case "tax_readiness":
            // Hide until there's at least one trip - "£0 estimated tax"
            // adds nothing for a brand-new user.
            if (totalTrips === 0) return null;
            return <TaxReadinessCard key={key} />;
          case "business_mileage":
            // Always render - drivers explicitly asked for business mileage
            // visibility, and "0 miles this month" is intuitive (it just
            // means they haven't driven yet).
            return <MileageMonthCard key={key} classification="business" />;
          case "activity_heatmap":
            // 7x24 grid filters for business trips. Hide until the user
            // actually has business activity so we don't show an empty
            // grid to someone with 100 personal trips.
            if (!hasBusinessDeduction) return null;
            return <ActivityHeatmapCard key={key} />;
          case "benchmark":
            // Filters for business activity; otherwise just shows
            // "Need more data" which is noise for a personal-only user.
            if (!hasBusinessDeduction) return null;
            return <BenchmarkCard key={key} />;
          case "daily_recap":
            return dailyRecap && dailyRecap.totalTrips > 0 ? (
              <TouchableOpacity
                key={key}
                style={s.dailyRecapCard}
                onPress={() => { setRecapData(dailyRecap); setShowRecap(true); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Today's recap: ${dailyRecap.totalMiles.toFixed(1)} miles, ${dailyRecap.totalTrips} trip${dailyRecap.totalTrips !== 1 ? "s" : ""}${dailyRecap.deductionPence > 0 ? `, ${formatPence(dailyRecap.deductionPence)} deduction` : ""}. Tap to share.`}
              >
                <View style={s.dailyRecapHeader}>
                  <Ionicons name="today-outline" size={16} color="#f5a623" accessible={false} />
                  <Text style={s.dailyRecapTitle}>Today</Text>
                  <Ionicons name="share-outline" size={14} color="#64748b" style={{ marginLeft: "auto" }} accessible={false} />
                </View>
                <View style={s.dailyRecapStats}>
                  <View style={s.dailyRecapStat}>
                    <Text style={s.dailyRecapValue}>{dailyRecap.totalMiles.toFixed(1)}</Text>
                    <Text style={s.dailyRecapUnit}>miles</Text>
                  </View>
                  <View style={s.dailyRecapDivider} />
                  <View style={s.dailyRecapStat}>
                    <Text style={s.dailyRecapValue}>{dailyRecap.totalTrips}</Text>
                    <Text style={s.dailyRecapUnit}>{dailyRecap.totalTrips === 1 ? "trip" : "trips"}</Text>
                  </View>
                  {dailyRecap.deductionPence > 0 && (
                    <>
                      <View style={s.dailyRecapDivider} />
                      <View style={s.dailyRecapStat}>
                        <Text style={s.dailyRecapValue}>{formatPence(dailyRecap.deductionPence)}</Text>
                        <Text style={s.dailyRecapUnit}>deduction</Text>
                      </View>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            ) : null;
          case "work_cta":
            return (
              <View key={key} style={s.ctaRow}>
                <TouchableOpacity
                  style={s.ctaPrimary}
                  onPress={() => router.push("/trip-form")}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Start Trip"
                >
                  <Ionicons name="navigate" size={18} color="#030712" accessible={false} />
                  <Text style={s.ctaPrimaryText}>Start Trip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.ctaShift}
                  onPress={handleStartShift}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Start Shift"
                  disabled={starting}
                >
                  {starting ? (
                    <ActivityIndicator size="small" color={AMBER} />
                  ) : (
                    <Ionicons name="play" size={18} color={AMBER} accessible={false} />
                  )}
                  <Text style={s.ctaShiftText}>Start Shift</Text>
                </TouchableOpacity>
              </View>
            );
          case "work_shift":
            return null;
          case "work_quicknav":
            return (
              <View key={key} style={s.quickActions}>
                <TouchableOpacity
                  style={s.quickAction}
                  onPress={() => router.push("/insights")}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Business Insights"
                >
                  <Ionicons name="analytics-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} accessible={false} />
                  <Text style={s.quickActionLabel}>Insights</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.quickAction}
                  onPress={() => router.replace("/(tabs)/trips" as any)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View Trips"
                >
                  <Ionicons name="list-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} accessible={false} />
                  <Text style={s.quickActionLabel}>Trips</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.quickAction}
                  onPress={() => router.push("/exports")}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Tax Exports"
                >
                  <Ionicons name="download-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} accessible={false} />
                  <Text style={s.quickActionLabel}>Exports</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.quickAction}
                  onPress={() => router.push("/achievements")}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View Badges and Achievements"
                >
                  <Ionicons name="trophy-outline" size={22} color="#f5a623" style={{ marginBottom: 4 }} accessible={false} />
                  <Text style={s.quickActionLabel}>Badges</Text>
                </TouchableOpacity>
              </View>
            );
          case "journey_map":
            return recentTrips.length > 0 ? (
              <View key={key}>
                <PremiumGate feature="Journey Map">
                  <MapOverview trips={recentTrips} title="Recent Journeys" />
                </PremiumGate>
              </View>
            ) : null;
          case "weekly_goal":
            // Hide until at least one trip - "0 / X miles" with an empty
            // bar tells a brand-new user nothing useful.
            if (totalTrips === 0) return null;
            return <WeeklyGoalCard key={key} />;
          case "work_calendar":
            // Filters for business trips; empty calendar without them.
            if (!hasBusinessDeduction) return null;
            return <WorkCalendarCard key={key} />;
          case "community":
            return (
              <View key={key}>
                <PremiumGate feature="Community Insights">
                  <CommunityInsightsCard isWork={isWork} />
                </PremiumGate>
              </View>
            );
          default:
            return null;
        }
        })();
        return card ? (
          <FadeInStagger key={key} index={index}>
            {card}
          </FadeInStagger>
        ) : null;
      })}

      {/* Vehicle Nudge — no vehicles yet */}
      {isWork && showVehicleNudge && (
        <TouchableOpacity
          style={s.vehicleNudgeCard}
          onPress={() => router.push("/vehicle-form" as any)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add your vehicle. Tap to set up your vehicle for accurate HMRC mileage rates."
        >
          <View style={s.vehicleNudgeIcon}>
            <Ionicons name="car-outline" size={24} color={AMBER} accessible={false} />
          </View>
          <Text style={s.btPromoTitle}>Add your vehicle</Text>
          <Text style={s.btPromoBody}>
            For accurate HMRC mileage rates, add your vehicle. Cars, vans, and motorbikes each have different rates.
          </Text>
          <View style={s.btPromoCta}>
            <Text style={s.vehicleNudgeCtaText}>Add vehicle</Text>
            <Ionicons name="chevron-forward" size={14} color={AMBER} accessible={false} />
          </View>
        </TouchableOpacity>
      )}

      {/* ── Personal Dashboard (layout-aware) ── */}
      {isPersonal && (
        <PersonalDashboard
          avatarId={currentUser?.avatarId}
          stats={stats}
          visibleKeys={personalLayout.visibleKeys}
          recentTrips={recentTrips}
          dailyRecap={dailyRecap}
          onShowRecap={(recap) => { setRecapData(recap); setShowRecap(true); }}
        />
      )}

      {/* Vehicle Nudge — personal mode */}
      {isPersonal && showVehicleNudge && (
        <TouchableOpacity
          style={s.vehicleNudgeCard}
          onPress={() => router.push("/vehicle-form" as any)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add your vehicle. Tap to get personalised fuel economy stats."
        >
          <View style={s.vehicleNudgeIcon}>
            <Ionicons name="car-outline" size={24} color={AMBER} accessible={false} />
          </View>
          <Text style={s.btPromoTitle}>Add your vehicle</Text>
          <Text style={s.btPromoBody}>
            Track which car you're driving and get personalised fuel economy stats.
          </Text>
          <View style={s.btPromoCta}>
            <Text style={s.vehicleNudgeCtaText}>Add vehicle</Text>
            <Ionicons name="chevron-forward" size={14} color={AMBER} accessible={false} />
          </View>
        </TouchableOpacity>
      )}

      {/* Customize layout — discoverable footer link, low visual weight */}
      <TouchableOpacity
        style={s.customizeFooter}
        onPress={() => router.push("/customize-layout" as any)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Customize this dashboard. Reorder cards, hide ones you don't want."
      >
        <Ionicons name="options-outline" size={14} color="#64748b" accessible={false} />
        <Text style={s.customizeFooterText}>Customize this dashboard</Text>
      </TouchableOpacity>

      <View style={{ height: 24 }} />

      {/* Trip segment bottom sheet */}
      {tripTapInfo && (
        <Animated.View
          style={[
            s.tripSheet,
            { transform: [{ translateY: tripSheetAnim }] },
          ]}
        >
          <TouchableOpacity
            style={s.tripSheetDismiss}
            onPress={dismissTripSheet}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Dismiss trip details"
          >
            <View style={s.tripSheetHandle} />
          </TouchableOpacity>
          <View style={s.tripSheetHeader}>
            <View style={[s.tripSheetDot, { backgroundColor: ["#f5a623", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"][tripTapInfo.index % 6] }]} />
            <Text style={s.tripSheetTitle}>Trip {tripTapInfo.index + 1}</Text>
          </View>
          <View style={s.tripSheetStats}>
            <View style={s.tripSheetStat}>
              <Text style={s.tripSheetStatValue}>{tripTapInfo.distance}</Text>
              <Text style={s.tripSheetStatLabel}>miles</Text>
            </View>
            <View style={s.tripSheetStat}>
              <Text style={s.tripSheetStatValue}>
                {Math.floor(tripTapInfo.duration / 60)}m {tripTapInfo.duration % 60}s
              </Text>
              <Text style={s.tripSheetStatLabel}>duration</Text>
            </View>
            <View style={s.tripSheetStat}>
              <Text style={s.tripSheetStatValue}>{tripTapInfo.avgSpeed}</Text>
              <Text style={s.tripSheetStatLabel}>avg mph</Text>
            </View>
          </View>
          {(tripTapInfo.startAddress || tripTapInfo.endAddress) && (
            <View style={s.tripSheetAddresses}>
              {tripTapInfo.startAddress && (
                <Text style={s.tripSheetAddress} numberOfLines={1}>
                  From: {tripTapInfo.startAddress}
                </Text>
              )}
              {tripTapInfo.endAddress && (
                <Text style={s.tripSheetAddress} numberOfLines={1}>
                  To: {tripTapInfo.endAddress}
                </Text>
              )}
            </View>
          )}
        </Animated.View>
      )}
      </ScrollView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────
//
// Local aliases pointing at the design tokens in lib/theme.ts. Until 2 May
// 2026 these were standalone hex values defined inline; pointing them at
// the theme means any palette adjustment cascades through the entire
// 800-line styles block without touching every callsite. Same names are
// kept for diff-friendliness.

const CARD_BG = colors.surface;
const CARD_BORDER = colors.surfaceBorder;
const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  centered: { justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingBottom: 20 },

  // Streak
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  greeting: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  streakBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(245, 166, 35, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  streakNum: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: AMBER,
  },

  // Hero card
  heroCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.12)",
    ...Platform.select({
      ios: {
        shadowColor: AMBER,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
    }),
  },
  heroLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 38,
    fontFamily: fonts.light,
    color: AMBER,
    letterSpacing: -1,
    marginBottom: 10,
  },
  heroValueGettingStarted: {
    fontSize: 28,
    color: TEXT_1, // dim white instead of bright amber when the number is small
    fontFamily: fonts.regular,
  },
  heroSavedLabel: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.green,
    marginBottom: 6,
    marginTop: -6,
  },
  heroEmptyBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: "#94a3b8",
    lineHeight: 19,
    marginTop: 10,
  },
  heroLockedHint: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: "rgba(245, 166, 35, 0.5)",
    marginBottom: 6,
    marginTop: -4,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroMetaText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },
  heroDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TEXT_3,
    marginHorizontal: 10,
  },
  heroNudge: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(251,191,36,0.08)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.18)",
  },
  heroNudgeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.medium,
    color: "#fcd34d",
    lineHeight: 16,
  },

  // Hero top row with inline streak
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  streakBadgeInline: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  streakNumInline: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: AMBER,
  },

  // CTA row — Start Trip + Vehicle picker side by side
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  ctaPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: AMBER,
    borderRadius: 14,
    paddingVertical: 14,
  },
  ctaPrimaryText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: "#030712",
  },
  ctaShift: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: AMBER,
  },
  ctaShiftText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: AMBER,
  },

  // Quick actions
  quickActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  quickAction: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  quickActionLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    letterSpacing: 0.2,
  },

  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  statCardLive: {
    borderColor: "rgba(245,166,35,0.3)",
  },
  statNum: {
    fontSize: 22,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    letterSpacing: -0.5,
  },
  statNumLive: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: "#f5a623",
    letterSpacing: -0.5,
  },
  statUnit: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 2,
    letterSpacing: 0.2,
  },

  // Sections
  section: { marginBottom: 20 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    letterSpacing: -0.2,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: AMBER,
  },

  // Badges
  badgeScroll: { gap: 8 },
  badge: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    width: 74,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  badgeEmoji: { fontSize: 26, marginBottom: 4 },
  badgeLabel: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: TEXT_2,
    textAlign: "center",
  },

  // Recap buttons
  recapRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  recapBtn: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  recapBtnLabel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: AMBER,
    letterSpacing: -0.2,
  },

  // Records
  recordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recordCell: {
    width: "47%" as any,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  recordValue: {
    fontSize: 18,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 2,
  },
  recordLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    letterSpacing: 0.2,
  },

  // Vehicle picker
  vehiclePicker: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  vehiclePickerLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  vehiclePickerVal: {
    fontSize: 16,
    fontFamily: fonts.medium,
    color: TEXT_1,
  },

  // Active shift
  timerWrap: {
    alignItems: "center",
    marginBottom: 28,
    paddingVertical: 24,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#34c759",
  },
  liveText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: "#34c759",
    letterSpacing: 1.5,
  },
  timer: {
    fontSize: 60,
    fontFamily: fonts.light,
    color: TEXT_1,
    fontVariant: ["tabular-nums"],
    letterSpacing: 4,
  },
  timerSub: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 8,
  },
  shiftEarnRow: {
    marginTop: 16,
    alignItems: "center",
  },
  shiftEarnAmount: {
    fontSize: 30,
    fontFamily: fonts.semibold,
    color: "#34d399",
    fontVariant: ["tabular-nums"],
  },
  shiftEarnRate: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 3,
  },
  shiftEarnSet: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: "#f5a623",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0a1120",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderBottomWidth: 0,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: fonts.light,
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: -0.3,
  },

  // Scorecard
  scorecardGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  scorecardCell: { alignItems: "center" },
  scorecardCellCenter: {},
  scorecardNum: {
    fontSize: 20,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  scorecardNumLarge: {
    fontSize: 28,
    fontFamily: fonts.light,
    color: AMBER,
  },
  scorecardUnit: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  scorecardDuration: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_3,
    textAlign: "center",
    marginBottom: 14,
  },
  pbBadge: {
    backgroundColor: "rgba(245, 166, 35, 0.1)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
  },
  pbText: { fontSize: 13, fontFamily: fonts.semibold, color: AMBER },
  unlockSection: { marginTop: 8, marginBottom: 16 },
  unlockTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  unlockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  unlockEmoji: { fontSize: 24 },
  unlockLabel: { fontSize: 14, fontFamily: fonts.semibold, color: TEXT_1 },
  unlockDesc: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_2 },

  // Daily recap card (work mode)
  dailyRecapCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.12)",
  },
  dailyRecapHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  dailyRecapTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  dailyRecapStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  dailyRecapStat: {
    alignItems: "center",
  },
  dailyRecapValue: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  dailyRecapUnit: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  dailyRecapDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  // Recap modal
  recapSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 20,
  },
  recapDetail: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 6,
  },
  recapBtnRow: { gap: 10, marginTop: 8 },
  // Trip segment bottom sheet
  tripSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0a1120",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  tripSheetDismiss: {
    alignItems: "center",
    paddingVertical: 10,
  },
  tripSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tripSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  tripSheetDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  tripSheetTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: TEXT_1,
  },
  tripSheetStats: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  tripSheetStat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  tripSheetStatValue: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: TEXT_1,
  },
  tripSheetStatLabel: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 2,
    textTransform: "uppercase",
  },
  tripSheetAddresses: {
    gap: 4,
  },
  tripSheetAddress: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
  },

  // Bluetooth promo
  btPromoCard: {
    backgroundColor: "rgba(59, 130, 246, 0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.15)",
    padding: 20,
    marginTop: 16,
    position: "relative" as const,
  },
  btPromoDismiss: {
    position: "absolute" as const,
    top: 12,
    right: 12,
    zIndex: 1,
  },
  btPromoIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  },
  btPromoTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 6,
  },
  btPromoBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 19,
    marginBottom: 14,
  },
  btPromoCta: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  btPromoCtaText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: "#3b82f6",
  },

  // Vehicle nudge card
  vehicleNudgeCard: {
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    padding: 20,
    marginTop: 16,
  },
  vehicleNudgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  },
  vehicleNudgeCtaText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: AMBER,
  },

  // Pro nudge card
  proNudgeCard: {
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    padding: 20,
    marginTop: 16,
    position: "relative" as const,
  },
  proNudgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  },

  // Saved-locations nudge (mirrors proNudgeCard styling so it sits well
  // adjacent in the dashboard hierarchy).
  savedLocsNudge: {
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    padding: 20,
    marginTop: 16,
    position: "relative" as const,
  },
  savedLocsNudgeDismiss: {
    position: "absolute" as const,
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  savedLocsNudgeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(245, 166, 35, 0.12)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  },
  savedLocsNudgeTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: AMBER,
    marginBottom: 6,
  },
  savedLocsNudgeBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 18,
    marginBottom: 12,
  },
  savedLocsNudgeCta: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  savedLocsNudgeCtaText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: AMBER,
  },

  // Data-quality improvement celebration banner
  dqBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
    padding: 14,
    marginBottom: 12,
  },
  dqBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  dqBannerTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.text1,
  },
  dqBannerBody: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text2,
    lineHeight: 17,
    marginTop: 2,
  },

  // Background location nudge
  bgLocNudge: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    padding: 14,
    marginBottom: 12,
  },
  // Danger variant for the "can't record at all" activation blocker.
  bgLocBlocker: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  bgLocBlockerTitle: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: "#ef4444",
    marginBottom: 2,
  },
  bgLocNudgeRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  bgLocNudgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  bgLocNudgeTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: "#f59e0b",
    marginBottom: 2,
  },
  bgLocNudgeBody: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
  },

  // First-trip nudge (activation safety net)
  ftNudge: {
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.18)",
    padding: 14,
    marginBottom: 12,
  },
  ftNudgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 166, 35, 0.14)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  ftNudgeActions: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 12,
  },
  ftNudgeBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.35)",
    backgroundColor: "rgba(245, 166, 35, 0.06)",
  },
  ftNudgeBtnPrimary: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  ftNudgeBtnText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  ftNudgeBtnTextPrimary: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: "#0b0e14",
  },

  // Referral promo card
  referralCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.18)",
    padding: 14,
    paddingRight: 34,
    marginBottom: 12,
  },
  referralCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(245, 166, 35, 0.14)",
    justifyContent: "center",
    alignItems: "center",
  },
  referralCardTitle: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: "#f0f2f5",
    marginBottom: 2,
  },
  referralCardBody: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: "#8494a7",
    lineHeight: 17,
  },
  referralCardDismiss: {
    position: "absolute",
    top: 8,
    right: 8,
    padding: 2,
  },

  // Work mode explainer
  explainerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  explainerCard: {
    backgroundColor: "#0a1120",
    borderRadius: 20,
    padding: 24,
    maxHeight: "85%",
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  explainerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(245,166,35,0.12)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  explainerTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 16,
  },
  explainerBody: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 21,
    marginBottom: 12,
  },
  explainerBold: {
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  explainerList: {
    marginTop: 4,
    marginBottom: 4,
  },
  explainerDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 16,
  },
  explainerSubhead: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 8,
  },
  // Standalone "Got it" CTA: plain TouchableOpacity (not the Button variant)
  // because the Button variant wraps its Pressable in two animated Views
  // which break hit-testing inside an iPad Modal on iPadOS 26.
  explainerCta: {
    backgroundColor: AMBER,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 9,
    marginTop: 16,
  },
  explainerCtaText: {
    color: "#030712",
    fontSize: 17,
    fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  customizeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  customizeFooterText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: "#64748b",
  },
});
