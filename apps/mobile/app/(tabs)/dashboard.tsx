import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  RefreshControl,
  Platform,
  Dimensions,
  Linking,
  AppState,
} from "react-native";
import { AppModal } from "../../components/AppModal";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";
import { describeError } from "../../lib/api/apiError";
import { useFocusEffect, useRouter } from "expo-router";
import { fetchVehicles } from "../../lib/api/vehicles";
import {
  fetchActiveShift,
  ShiftWithVehicle,
} from "../../lib/api/shifts";
import { syncStartShift, syncCreateEarning } from "../../lib/sync/actions";
import {
  finishShift,
  checkActiveShiftForAutoEnd,
  wasShiftAutoEnded,
  onShiftAutoEnded,
} from "../../lib/tracking/shiftEnd";
import { getDatabase } from "../../lib/db/index";
import { fetchGamificationStats } from "../../lib/api/gamification";
import {
  requestLocationPermissions,
  startShiftTracking,
  isTrackingActive,
  peekBackgroundCoordinates,
} from "../../lib/tracking/index";
import { watchLowPowerMode } from "../../lib/tracking/batteryAware";
import { fetchDataQualityImprovement } from "../../lib/api/user";
import { apiRequest } from "../../lib/api/index";
import { fetchReferralSummary } from "../../lib/api/referrals";
import type {
  Vehicle,
  GamificationStats,
  ShiftScorecard,
} from "@mileclear/shared";
import { formatPence, filterTraceOutliers, MAX_FREE_SAVED_LOCATIONS } from "@mileclear/shared";
import { maybeRequestReview } from "../../lib/rating/index";
import { maybeSuggestSavedPlaces } from "../../lib/savedPlacesPrompt/index";
import { requestPromptSlot } from "../../lib/promptGate/index";
import { useMode } from "../../lib/mode/context";
import { LiveMapTracker } from "../../components/map/LiveMapTracker";
import { useUser } from "../../lib/user/context";
import { Ionicons } from "@expo/vector-icons";
import { startLiveActivity, updateLiveActivity, recoverLiveActivity } from "../../lib/liveActivity";
import { getLiveActivityContext } from "../../lib/liveActivity/context";
import {
  previousTaxYear,
  wantsPreviousYear,
  type HeroYearFigure,
} from "../../lib/heroFigure";
import { fetchSelfAssessmentSummary } from "../../lib/api/selfAssessment";
import { selectDashboardMessages, batteryChecklistCopy } from "../../lib/dashboardMessages";
import { askAboutPauseBeforeStart } from "../../lib/tracking/pausePrompt";
import { type PauseChoice } from "../../lib/tracking/pauseRule";
import { type SetupChecklistRow } from "../../components/SetupChecklistCard";
import { useIsPremium } from "../../components/PremiumGate";
import { usePrompt } from "../../components/prompt";
import { requestOrFixBackgroundLocation, getLocationPermissionStatus, type LocationPermissionTier } from "../../lib/permissions/location";
import type { MotionPermission } from "../../lib/tracking/motionPermission";
import {
  getNotificationPermissionStatus,
  registerForPushNotifications,
  type NotificationPermissionState,
} from "../../lib/notifications/index";
import { registerPushToken } from "../../lib/api/notifications";
import {
  getBatteryOptimisationState,
  openBatteryOptimisationSettings,
} from "../../lib/tracking/batteryOptimisation";
import {
  batteryNudgeDecision,
  type BatteryOptimisationState,
} from "../../lib/tracking/batteryOptimisationRule";
import { haptic } from "../../lib/haptics";
import AppHeader from "../../components/AppHeader";
import { Medal } from "../../components/insights/BadgesRow";
import { HomeIdle } from "../../components/home/HomeIdle";
import { useHomeStatus } from "../../components/home/useHomeStatus";

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
  const { isWork } = useMode();
  const { user: currentUser } = useUser();
  const [activeShift, setActiveShift] = useState<ShiftWithVehicle | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  // False until the vehicle list has loaded once, so a failed or slow request
  // never asks a driver who has a vehicle to "Add your vehicle" (QA 10 Oct).
  const [vehiclesKnown, setVehiclesKnown] = useState(false);
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

  // Last tax year's deduction, for the hero (lib/heroFigure). Fetched only
  // while this year's figure is weak (early in the year, or under £50), and
  // once per tax year per visit: last year's total barely moves. From the
  // Self Assessment summary, so it is the same number, worked out at that
  // year's HMRC rates, that the wizard shows (free since 8 May 2026).
  const [previousYear, setPreviousYear] = useState<HeroYearFigure | null>(null);
  const previousYearFetchedFor = useRef<string | null>(null);
  const heroWantsPreviousYear =
    stats != null &&
    wantsPreviousYear(new Date(), {
      taxYear: stats.taxYear,
      deductionPence: stats.deductionPence,
      businessMiles: stats.businessMiles,
    });
  useEffect(() => {
    if (!stats || !heroWantsPreviousYear) return;
    const prev = previousTaxYear(stats.taxYear);
    if (!prev || previousYearFetchedFor.current === prev) return;
    previousYearFetchedFor.current = prev;
    fetchSelfAssessmentSummary(prev)
      .then((res) =>
        setPreviousYear({
          taxYear: prev,
          deductionPence: res.data.mileageDeductionPence,
          businessMiles: res.data.businessMiles,
        })
      )
      .catch(() => {
        // No figure is fine: the hero falls back to this year's. Let the
        // next visit try again.
        previousYearFetchedFor.current = null;
      });
  }, [stats, heroWantsPreviousYear]);

  const isPremium = useIsPremium();

  // Work mode explainer — shown once on first Work mode visit
  const [showWorkExplainer, setShowWorkExplainer] = useState(false);
  const [workExplainerSeen, setWorkExplainerSeen] = useState(true); // default true until loaded
  // Location primer - the one-time blocking explainer shown to users who
  // currently have NO location access at all, so the app is recording
  // nothing. Onboarding has auto-marked itself complete since 21 May, which
  // means its permission step never runs and new users land straight on a
  // dashboard that silently cannot work. This is that step, moved to the
  // first place the user actually arrives. It fires the OS prompt on a tap
  // rather than cold, because a prompt with no explanation in front of it is
  // the thing that produced 121 undetermined permissions.
  const [showLocPrimer, setShowLocPrimer] = useState(false);
  const [locPrimerSeen, setLocPrimerSeen] = useState(true); // default true until loaded
  // Its own flag for the While Using version (1 Oct 2026). Drivers who saw the
  // first-install version had loc_primer_seen set, so the "switch back to
  // Always" version never reached the 77 active drivers whose iPhone had
  // dropped them to While Using. Cleared whenever the phone has Always, so a
  // later loss shows it once more.
  const [locPrimerForegroundSeen, setLocPrimerForegroundSeen] = useState(true); // default true until loaded
  // The primer has a second card on Android: Physical activity, asked once,
  // straight after location and never before it. Until 21 Sep 2026 the only
  // ask in the whole app sat behind starting a shift, so 14 of 41 Android
  // phones had never been asked at all and 474 of 626 drivers never start a
  // shift to be asked by.
  const [primerStep, setPrimerStep] = useState<"location" | "motion">("location");
  // Timestamp the explainer was shown, to measure dwell time on dismiss.
  const explainerShownAtRef = useRef<number | null>(null);

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
  // Motion & Fitness (Physical activity on Android) → degraded short-trip
  // detection. Soft, dismissable nudge (engine still works via the speed
  // backstop), 7-day cooldown. Holds the phone's real answer rather than a
  // denied flag: 21 Sep 2026, 41 Android dumps had it undetermined on 14
  // phones, and "never asked" was counting as done. Starts at "granted" so a
  // cold start cannot flash the row before the real read lands.
  const [motionStatus, setMotionStatus] = useState<MotionPermission>("granted");
  const [motionNudgeDismissedAt, setMotionNudgeDismissedAt] = useState<number | null>(null);
  // Pause with an end (16 Sep 2026): epoch ms while paused, else null. And
  // when the permanent Settings switch went off, for the "off since" card.
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
  const [detectionOffSince, setDetectionOffSince] = useState<number | null>(null);
  // Low Power Mode (iPhone) / Battery Saver (Android), live. iOS cuts
  // background location in it, so drives go unrecorded without a word.
  const [lowPowerMode, setLowPowerMode] = useState(false);
  useEffect(() => watchLowPowerMode(setLowPowerMode), []);
  const refreshPauseState = useCallback(() => {
    import("../../lib/tracking/detection")
      .then(async (m) => {
        setPausedUntil(await m.getDrivePauseUntil());
        const enabled = await m.isDriveDetectionEnabled();
        const offAt = await m.getDriveDetectionOffAt();
        setDetectionOffSince(!enabled && (await m.getDrivePauseUntil()) === null ? (offAt ?? Date.now()) : null);
      })
      .catch(() => {});
  }, []);
  const pauseRecording = useCallback((choice: PauseChoice) => {
    import("../../lib/tracking/detection")
      .then((m) => m.pauseDriveDetection(choice.until, choice.id))
      .catch(() => {})
      .finally(refreshPauseState);
  }, [refreshPauseState]);
  const resumeRecording = useCallback(() => {
    import("../../lib/tracking/detection")
      .then((m) => m.resumeDriveDetection("manual"))
      .catch(() => {})
      .finally(refreshPauseState);
  }, [refreshPauseState]);

  // Notification permission. On Android a denial doesn't just stop pushes -
  // it also blocks the LOCAL "Looks like you're driving?" prompt and the
  // missed-journey offers, so it degrades capture quality. "undetermined"
  // shows the primer card (startup no longer fires the bare system prompt);
  // "denied" shows the amber settings nudge. Both dismissible, 7-day snooze.
  // Default "granted" until checked to avoid a flash on load.
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>("granted");
  const [notifPrimerDismissedAt, setNotifPrimerDismissedAt] = useState<number | null>(null);
  const [notifDeniedDismissedAt, setNotifDeniedDismissedAt] = useState<number | null>(null);
  const [notifRequesting, setNotifRequesting] = useState(false);

  // Android battery optimisation. Stock "Optimised" and the vendor power
  // managers (Honor/Huawei App launch, Xiaomi Autostart...) end the recorder
  // between drives, and the stationary geofence then has nothing to wake: the
  // drive is never recorded. SteveG's Honor X5C lost a 10 mi afternoon drive
  // to it on 1 Sep 2026 with every permission granted. null = not Android or
  // not knowable, and the nudge stays hidden. Rule + copy live in
  // batteryOptimisationRule.ts; 7-day snooze like the other nudges.
  const [batteryOptState, setBatteryOptState] = useState<BatteryOptimisationState | null>(null);
  const [batteryNudgeDismissedAt, setBatteryNudgeDismissedAt] = useState<number | null>(null);
  const batteryNudgeShownLogged = useRef(false);

  // Referral promo card dismissal. Promotional (not urgent), so it sleeps
  // longer than the other nudges (30 days) before resurfacing.
  const [referralCardDismissedAt, setReferralCardDismissedAt] = useState<number | null>(null);

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
  const { prompt } = usePrompt();
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
  // "Below their limit", not "zero saved": a free user with one pinned
  // place and seven suggestions still has a slot to fill, and gating on
  // zero hid the card from exactly the people it was built for (same bug
  // f8007ad fixed on the list screen). Pro has no limit.
  const showSavedLocationsNudge =
    !loading &&
    savedLocationsCount !== null &&
    (isPremium || savedLocationsCount < MAX_FREE_SAVED_LOCATIONS) &&
    savedLocationsSuggestionCount > 0 &&
    Date.now() >= savedLocsNudgeDismissedUntil;
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
  const AMAP_ANNOUNCEMENT_ID = "android_beta_2026_09";
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
        "SELECT key, value FROM tracking_state WHERE key IN ('work_explainer_seen', 'bg_loc_nudge_dismissed_at', 'referral_card_dismissed_at', 'motion_nudge_dismissed_at', 'notif_primer_dismissed_at', 'notif_denied_nudge_dismissed_at', 'battery_opt_nudge_dismissed_at', 'loc_primer_seen', 'loc_primer_foreground_seen')"
      );
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      setWorkExplainerSeen(map["work_explainer_seen"] === "1");
      setLocPrimerSeen(map["loc_primer_seen"] === "1");
      setLocPrimerForegroundSeen(map["loc_primer_foreground_seen"] === "1");
      const dismissedAt = map["bg_loc_nudge_dismissed_at"]
        ? parseInt(map["bg_loc_nudge_dismissed_at"], 10)
        : null;
      setBgLocNudgeDismissedAt(Number.isFinite(dismissedAt as number) ? dismissedAt : null);
      const motionDismissedAt = map["motion_nudge_dismissed_at"]
        ? parseInt(map["motion_nudge_dismissed_at"], 10)
        : null;
      setMotionNudgeDismissedAt(Number.isFinite(motionDismissedAt as number) ? motionDismissedAt : null);
      const refDismissedAt = map["referral_card_dismissed_at"]
        ? parseInt(map["referral_card_dismissed_at"], 10)
        : null;
      setReferralCardDismissedAt(Number.isFinite(refDismissedAt as number) ? refDismissedAt : null);
      const npDismissedAt = map["notif_primer_dismissed_at"]
        ? parseInt(map["notif_primer_dismissed_at"], 10)
        : null;
      setNotifPrimerDismissedAt(Number.isFinite(npDismissedAt as number) ? npDismissedAt : null);
      const ndDismissedAt = map["notif_denied_nudge_dismissed_at"]
        ? parseInt(map["notif_denied_nudge_dismissed_at"], 10)
        : null;
      setNotifDeniedDismissedAt(Number.isFinite(ndDismissedAt as number) ? ndDismissedAt : null);
      const boDismissedAt = map["battery_opt_nudge_dismissed_at"]
        ? parseInt(map["battery_opt_nudge_dismissed_at"], 10)
        : null;
      setBatteryNudgeDismissedAt(Number.isFinite(boDismissedAt as number) ? boDismissedAt : null);
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

  // Notification primer + denied nudge dismissals. Same 7-day snooze the
  // other permission nudges use, persisted in tracking_state.
  const dismissNotifPrimer = useCallback(async () => {
    const now = Date.now();
    setNotifPrimerDismissedAt(now);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('notif_primer_dismissed_at', ?)",
      [String(now)]
    );
  }, []);
  const notifPrimerSilenced =
    notifPrimerDismissedAt !== null &&
    Date.now() - notifPrimerDismissedAt < SEVEN_DAYS_MS;

  const dismissNotifDeniedNudge = useCallback(async () => {
    const now = Date.now();
    setNotifDeniedDismissedAt(now);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('notif_denied_nudge_dismissed_at', ?)",
      [String(now)]
    );
  }, []);
  const notifDeniedNudgeSilenced =
    notifDeniedDismissedAt !== null &&
    Date.now() - notifDeniedDismissedAt < SEVEN_DAYS_MS;

  // Battery-optimisation nudge: decision + copy from the pure rule, so the
  // screen it opens and the words on the card can never disagree.
  const batteryNudge = batteryNudgeDecision({
    platform: Platform.OS,
    state: batteryOptState,
    dismissedAt: batteryNudgeDismissedAt,
    now: Date.now(),
  });
  // The checklist row itself is owned by lib/dashboardMessages: shown until
  // the phone reads ignoring:true, snoozed 7 days per dismissal, never gone
  // for good. This effect only logs the first time it is visible.
  useEffect(() => {
    if (batteryOptState?.ignoring !== false || !batteryNudge.show || batteryNudgeShownLogged.current) return;
    batteryNudgeShownLogged.current = true;
    trackEvent("battery_opt_nudge.shown", {
      screen: batteryNudge.screen,
      reason: batteryNudge.reason,
      manufacturer: (batteryOptState?.vendor?.manufacturer ?? batteryOptState?.manufacturer) ?? null,
      ignoring: batteryOptState?.ignoring ?? null,
    });
  }, [batteryNudge.show, batteryNudge.screen, batteryNudge.reason, batteryOptState]);
  const dismissBatteryNudge = useCallback(async () => {
    const now = Date.now();
    setBatteryNudgeDismissedAt(now);
    trackEvent("battery_opt_nudge.snoozed", {
      screen: batteryNudge.screen,
      until: now + SEVEN_DAYS_MS,
      manufacturer: (batteryOptState?.vendor?.manufacturer ?? batteryOptState?.manufacturer) ?? null,
    });
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('battery_opt_nudge_dismissed_at', ?)",
      [String(now)]
    );
  }, [batteryNudge.screen, batteryOptState, SEVEN_DAYS_MS]);
  const openBatteryNudgeSettings = useCallback(async () => {
    const screen = batteryNudge.screen ?? "stock";
    trackEvent("battery_opt_nudge.tapped", {
      screen,
      manufacturer: (batteryOptState?.vendor?.manufacturer ?? batteryOptState?.manufacturer) ?? null,
    });
    // Vendor screen first; if the device turns out not to have one after
    // all, the stock allow-list; failing that, the app's own settings page.
    if (await openBatteryOptimisationSettings(screen)) return;
    if (screen === "vendor" && (await openBatteryOptimisationSettings("stock"))) return;
    Linking.openSettings().catch(() => {});
  }, [batteryNudge.screen, batteryOptState]);

  // "Enable notifications" on the primer card: fires the system prompt, then
  // registers the push token exactly the way startup does for already-granted
  // users. If the user denies, the state flips to "denied" and the amber
  // settings nudge takes over on its own 7-day cadence.
  const enableNotifications = useCallback(async () => {
    if (notifRequesting) return;
    setNotifRequesting(true);
    try {
      const token = await registerForPushNotifications();
      if (token) await registerPushToken(token).catch(() => {});
    } catch {
      // non-fatal - the status refresh below reflects whatever happened
    } finally {
      const status = await getNotificationPermissionStatus();
      setNotifPermission(status);
      setNotifRequesting(false);
    }
  }, [notifRequesting]);

  // A driver with zero trips and some location permission has one job, so the
  // referral ask stands aside for them. (Their "Your first trip" card is on
  // Home itself; the no-location blocker owns the "none" case.)
  const showFirstTripNudge =
    !loading &&
    stats !== null &&
    (stats.totalTrips ?? 0) === 0 &&
    locationTier !== "none" &&
    !activeShift;

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

  // ── What the dashboard is allowed to say ────────────────────────
  //
  // Sixteen hardcoded cards used to live below, each hand-wired to dodge the
  // others, and nothing capped the total across families: five asks could
  // stack above the driver's own mileage (14 Sep 2026). Ordering and capping
  // now live in lib/dashboardMessages, which is pure and unit-tested.
  const fixLocationFromBlocker = useCallback(async () => {
    const final = await requestOrFixBackgroundLocation();
    setLocationTier(final.tier);
  }, []);

  // Undetermined still has a system prompt behind it, so ask for it here and
  // save the driver a trip into Settings. Once it is denied the OS never
  // prompts again, so Settings is the only route left (21 Sep 2026).
  const fixMotionFromChecklist = useCallback(async () => {
    if (motionStatus === "denied") {
      Linking.openSettings().catch(() => {});
      return;
    }
    const { requestMotionPermission } = await import("../../lib/tracking/motionPermission");
    const result = await requestMotionPermission();
    setMotionStatus(result);
    trackEvent("motion_permission.result", { source: "checklist", status: result });
  }, [motionStatus]);

  const lowPowerLogged = useRef(false);
  const dashboardMessages = useMemo(
    () =>
      selectDashboardMessages({
        activeShift: !!activeShift,
        loading,
        locationTier,
        bgRefreshOff,
        bgPermissionLost,
        motionStatus,
        chaseUndeterminedMotion: Platform.OS === "android",
        notifPermission,
        batteryApplicable: Platform.OS === "android",
        batteryIgnoring: batteryOptState?.ignoring ?? null,
        batteryDismissedAt: batteryNudgeDismissedAt,
        now: Date.now(),
        bgLocNudgeSilenced,
        motionNudgeSilenced,
        notifDeniedNudgeSilenced,
        notifPrimerSilenced,
        detectionOffSince,
        lowPowerMode,
      }),
    [
      activeShift, loading, locationTier, bgRefreshOff, bgPermissionLost,
      motionStatus, notifPermission, batteryOptState, batteryNudgeDismissedAt,
      bgLocNudgeSilenced, motionNudgeSilenced, notifDeniedNudgeSilenced,
      notifPrimerSilenced, detectionOffSince, lowPowerMode,
    ]
  );
  // How often Low Power Mode is on when a driver looks: once per dashboard
  // mount, so it can be set against missed drives.
  useEffect(() => {
    if (dashboardMessages.notice === "low_power_mode" && !lowPowerLogged.current) {
      lowPowerLogged.current = true;
      trackEvent("low_power_mode.shown", { platform: Platform.OS });
    }
  }, [dashboardMessages]);

  const snoozeSetupChecklist = useCallback(async () => {
    // Snoozes every outstanding row for 7 days using the flags that already
    // existed, so nothing is orphaned and the card can come back later.
    trackEvent("setup_checklist.snoozed", {
      done: dashboardMessages.setup?.done ?? 0,
      total: dashboardMessages.setup?.total ?? 0,
    });
    await Promise.all([
      dismissBgLocNudge(),
      dismissMotionNudge(),
      notifPermission === "undetermined" ? dismissNotifPrimer() : dismissNotifDeniedNudge(),
      dismissBatteryNudge(),
    ]);
  }, [
    dashboardMessages.setup, notifPermission, dismissBgLocNudge, dismissMotionNudge,
    dismissNotifPrimer, dismissNotifDeniedNudge, dismissBatteryNudge,
  ]);

  const setupRows: SetupChecklistRow[] = useMemo(() => {
    const items = dashboardMessages.setup?.items ?? [];
    const out: SetupChecklistRow[] = [];
    for (const it of items) {
      if (!it.applicable) continue;
      if (it.id === "always_location") {
        out.push({
          key: it.id, icon: "location-outline", label: "Allow location Always",
          hint: "So drives record with the app closed",
          done: it.done, actionable: it.actionable, onPress: fixLocationFromBlocker,
        });
      } else if (it.id === "motion") {
        out.push({
          key: it.id, icon: "walk-outline", label: Platform.OS === "android" ? "Allow Physical activity" : "Turn on Motion & Fitness",
          hint: "It is how we catch the moment a drive starts",
          done: it.done, actionable: it.actionable, onPress: fixMotionFromChecklist,
        });
      } else if (it.id === "notifications") {
        out.push({
          key: it.id, icon: "notifications-outline", label: "Turn on notifications",
          hint: "Drive prompts, missed journeys and tax reminders",
          done: it.done, actionable: it.actionable,
          onPress:
            notifPermission === "undetermined"
              ? enableNotifications
              : () => { Linking.openSettings().catch(() => {}); },
        });
      } else if (it.id === "battery") {
        const copy = batteryChecklistCopy(
          batteryOptState?.vendor?.manufacturer ?? batteryOptState?.manufacturer
        );
        out.push({
          key: it.id, icon: "battery-half-outline",
          label: copy.label, hint: copy.hint,
          done: it.done, actionable: it.actionable, onPress: openBatteryNudgeSettings,
        });
      }
    }
    return out;
  }, [
    dashboardMessages.setup, notifPermission, batteryOptState,
    fixLocationFromBlocker, fixMotionFromChecklist, enableNotifications,
    openBatteryNudgeSettings,
  ]);


  // ── Home's status line ──────────────────────────────────────────
  // One row (and the sheets it opens) for everything that used to be a
  // separate banner: recording, can't record, failed uploads, pause, Automatic
  // trips off, Low Power, setup, the one-time "we recovered" note. It is built
  // here, above the early returns, so the idle Home and the shift screen share
  // it. The rules are in lib/home/statusLine.ts.
  const home = useHomeStatus({
    mode: isWork ? "work" : "personal",
    blocker: dashboardMessages.blocker,
    setup: dashboardMessages.setup
      ? { done: dashboardMessages.setup.done, total: dashboardMessages.setup.total, rows: setupRows }
      : null,
    lowPowerMode: dashboardMessages.notice === "low_power_mode",
    pausedUntil,
    automaticOff: detectionOffSince !== null,
    recovered:
      !dqBannerSeen && dqImprovement
        ? { trips: dqImprovement.improvedTripCount, miles: dqImprovement.milesGained }
        : null,
    onFixLocation: fixLocationFromBlocker,
    onPause: pauseRecording,
    onResume: resumeRecording,
    onAutomaticChange: refreshPauseState,
    onShowExplainer: () => {
      explainerShownAtRef.current = Date.now();
      trackEvent("work_explainer.shown", { source: "manual" });
      setShowWorkExplainer(true);
    },
    onSnoozeSetup: snoozeSetupChecklist,
    onRecoveredTap: dismissDqBanner,
  });
  // "We recovered..." shows for one visit: leaving Home counts as seeing it.
  const recoveredShown = useRef(false);
  recoveredShown.current = home.status.kind === "recovered";
  useFocusEffect(
    useCallback(
      () => () => {
        if (recoveredShown.current) dismissDqBanner();
      },
      [dismissDqBanner]
    )
  );

  // Auto-show work explainer on first Work mode visit.
  //
  // Yields to the location primer. Both are Modals rendered by this screen,
  // and a Modal floats above the whole navigation stack, so two of them firing
  // on the same render stack on top of each other (and on top of whatever
  // screen the user has since pushed). A driver who is recording nothing has a
  // more urgent problem than which mode to pick, so the primer goes first.
  // locPrimerSeen is true for everyone who never sees the primer, and flips
  // true the moment it is dismissed either way, so this cannot strand the
  // explainer.
  //
  // That check alone did not stop the stack (3 Oct 2026): the While Using
  // primer decides after an async read, so it was not showing yet when this
  // ran. The prompt gate holds this back for a few seconds so the primer can
  // win, and if it does the explainer waits for a later app open, unseen.
  useEffect(() => {
    if (!isWork || workExplainerSeen || loading || showLocPrimer || !locPrimerSeen) return;
    let cancelled = false;
    requestPromptSlot("work_explainer").then((granted) => {
      if (!granted || cancelled) return;
      explainerShownAtRef.current = Date.now();
      trackEvent("work_explainer.shown", { source: "auto" });
      setShowWorkExplainer(true);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isWork, workExplainerSeen, loading, showLocPrimer, locPrimerSeen]);

  // locationTier starts optimistically at "always" and only drops after a
  // real permission read, so this cannot flash on a cold start.
  //
  // Shown to anyone without Always, not only to "none". Until 1 Oct 2026 a
  // driver who tapped "Allow While Using" in setup counted as covered and never
  // saw it: 34 of the 49 new users (in 14 days) whose background permission was
  // never asked were in exactly that state, and only 29% of the never-asked
  // group ever got an automatic trip against 81% of those with Always.
  //
  // A driver who switched Automatic trips off has chosen shifts and Start Trip
  // only, which work with While Using, so "foreground" is not asked to go
  // Always. "none" still is: nothing records at all without location.
  useEffect(() => {
    if (locationTier === "always" || loading) return;
    // "none" goes by the first-install flag, "foreground" by its own.
    if (locationTier === "none" ? locPrimerSeen : locPrimerForegroundSeen) return;
    let cancelled = false;
    (async () => {
      if (locationTier === "foreground") {
        const { isDriveDetectionSwitchOn } = await import("../../lib/tracking/detection");
        if (!(await isDriveDetectionSwitchOn())) return;
      }
      if (cancelled) return;
      // Top of the prompt gate's order, so this only loses when another ask
      // already showed this app open. Then it comes back on the next one.
      if (!(await requestPromptSlot("location_primer")) || cancelled) return;
      trackEvent("loc_primer.shown", { source: "auto", tier: locationTier });
      setShowLocPrimer(true);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [locationTier, locPrimerSeen, locPrimerForegroundSeen, loading]);

  // Recording the primer as seen and closing it are two things now: the motion
  // card keeps the modal open after the location card is finished with.
  const persistLocPrimerSeen = useCallback(async () => {
    // Both flags: someone who answers the first-install version with While
    // Using must not be asked again straight away by the While Using version.
    setLocPrimerSeen(true);
    setLocPrimerForegroundSeen(true);
    const db = await getDatabase();
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('loc_primer_seen', '1')"
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('loc_primer_foreground_seen', '1')"
    );
  }, []);

  const markLocPrimerSeen = useCallback(async () => {
    setShowLocPrimer(false);
    setPrimerStep("location");
    await persistLocPrimerSeen();
  }, [persistLocPrimerSeen]);

  const enableLocationFromPrimer = useCallback(async () => {
    trackEvent("loc_primer.accepted", {});
    const final = await requestOrFixBackgroundLocation();
    setLocationTier(final.tier);
    trackEvent("loc_primer.result", { tier: final.tier });
    // Motion second, and only when location got somewhere: piling a second
    // prompt on top of a refusal asks for a second refusal. Only where the
    // phone has never been asked, so nobody sees this twice.
    if (Platform.OS === "android" && final.tier !== "none") {
      const { getMotionPermission } = await import("../../lib/tracking/motionPermission");
      const motion = await getMotionPermission();
      setMotionStatus(motion);
      if (motion === "undetermined") {
        trackEvent("motion_primer.shown", { source: "loc_primer" });
        await persistLocPrimerSeen();
        setPrimerStep("motion");
        return;
      }
    }
    await markLocPrimerSeen();
  }, [markLocPrimerSeen, persistLocPrimerSeen]);

  const enableMotionFromPrimer = useCallback(async () => {
    trackEvent("motion_primer.accepted", {});
    const { requestMotionPermission } = await import("../../lib/tracking/motionPermission");
    const result = await requestMotionPermission();
    setMotionStatus(result);
    trackEvent("motion_permission.result", { source: "primer", status: result });
    setShowLocPrimer(false);
    setPrimerStep("location");
  }, []);

  const dismissLocPrimer = useCallback(async (method: string = "not_now") => {
    if (primerStep === "motion") {
      trackEvent("motion_primer.dismissed", { method });
      setShowLocPrimer(false);
      setPrimerStep("location");
      // Snooze the checklist row too, or the same ask reappears seconds after
      // they said not now. Seven days, the same cooldown as every other nudge.
      await dismissMotionNudge();
      return;
    }
    trackEvent("loc_primer.dismissed", { method });
    await markLocPrimerSeen();
  }, [markLocPrimerSeen, primerStep, dismissMotionNudge]);

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

  const loadData = useCallback(async () => {
    try {
      // A shift left running with no driving ends itself (see
      // lib/tracking/shiftEnd.ts). The engine usually does this in the
      // background; checking here too covers a phone whose engine hasn't
      // woken since, so the dashboard never shows a shift that should be over.
      await checkActiveShiftForAutoEnd("dashboard").catch(() => "kept");
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
        fetchVehicles().catch(() => null),
        fetchGamificationStats().catch(() => null),
      ]);

      let active = shiftRes.data.length > 0 ? shiftRes.data[0] : null;
      // Ended on its own here, but the server hasn't heard yet (sync still
      // running or queued offline). Don't re-attach GPS to it below, which
      // would switch automatic tracking off again.
      if (active && (await wasShiftAutoEnded(active.id))) active = null;
      setActiveShift(active);
      if (vehicleRes) {
        setVehicles(vehicleRes.data);
        setVehiclesKnown(true);
      }
      const vehicleList = vehicleRes?.data ?? [];
      if (statsRes) setStats(statsRes.data);

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
          const v = vehicleList.find((veh) => veh.id === active.vehicleId);
          const vehicleName = v ? `${v.make} ${v.model}` : "";
          startLiveActivity({ activityType: "shift", vehicleName, isBusinessMode: isWork });
        }
      } else if (vehicleRes) {
        const primary = vehicleList.find((v) => v.isPrimary);
        setSelectedVehicleId(primary?.id);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isWork]);

  // A shift that ends on its own while the dashboard is open: drop the timer
  // straight away and reload once the trips and server end have gone through.
  useEffect(() => {
    return onShiftAutoEnded((shiftId) => {
      setActiveShift((cur) => (cur?.id === shiftId ? null : cur));
      loadData();
    });
  }, [loadData]);

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

  // Location tier check, shared by the focus effect below and the AppState
  // listener. The AppState path matters on Android: the "Your trips aren't
  // being recorded" blocker sends the user to system Settings, and coming back
  // via the Back button does NOT re-focus the route, so without this the
  // banner stayed red after the permission had been granted (seen on the
  // emulator, 26 Aug 2026).
  const refreshLocationTier = useCallback(() => {
    getLocationPermissionStatus().then(({ tier }) => {
      setLocationTier(tier);
    }).catch(() => {});
    // Same round trip for notifications: the denied nudge sends the user to
    // system Settings, and on Android the Back button doesn't re-focus the
    // route, so the AppState path is what clears the nudge after a fix.
    getNotificationPermissionStatus().then(setNotifPermission).catch(() => {});
    // And for battery optimisation: the nudge sends the user to a settings
    // screen; this is what clears it when they come back having fixed it.
    getBatteryOptimisationState().then(setBatteryOptState).catch(() => {});
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshLocationTier();
    });
    return () => sub.remove();
  }, [refreshLocationTier]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      // Saved-location count was read once on mount, so saving a place on
      // the suggest screen and coming back left the nudge showing a stale
      // "below the limit" state until the next cold start.
      getDatabase()
        .then((db) =>
          db.getFirstAsync<{ count: number }>(
            "SELECT COUNT(*) as count FROM saved_locations"
          )
        )
        .then((row) => setSavedLocationsCount(row?.count ?? 0))
        .catch(() => {});
      // Notification permission drives the primer card (undetermined) and
      // the denied nudge - re-check on each focus.
      getNotificationPermissionStatus().then(setNotifPermission).catch(() => {});
      getBatteryOptimisationState().then(setBatteryOptState).catch(() => {});
      // Check the full location permission tier on each focus.
      getLocationPermissionStatus().then(({ tier }) => {
        setLocationTier(tier);
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
            // Always is on, so a future drop to While Using (iOS's periodic
            // background-location reminder, Gail Chapman 29 Sep 2026) gets
            // the "switch back" explainer once more.
            await db.runAsync(
              "DELETE FROM tracking_state WHERE key = 'loc_primer_foreground_seen'"
            ).catch(() => {});
            setLocPrimerForegroundSeen(false);
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
      // Motion & Fitness: without it, ClearTrack can't detect a drive STARTING
      // via the motion chip and leans on the slower GPS speed backstop, which
      // misses short cold-start legs (balkistomi, recurring). Softer than the
      // location blocker — the engine still works — so it's a dismissable nudge.
      // The full status, not just "denied": on Android a phone that was never
      // asked is in exactly the same hole as one that refused (21 Sep 2026).
      import("../../lib/tracking/motionPermission")
        .then(({ getMotionPermission }) => getMotionPermission().then(setMotionStatus))
        .catch(() => {});
      refreshPauseState();
      // dashboard_focus rating trigger removed 4 May 2026 — was the
      // dominant source of "Not now" dismissals. Rating prompts now
      // only fire after positive moments (achievement, streak, trip
      // saved/classified, scorecard). Manual fallback lives at
      // Profile → Rate MileClear for users who want to volunteer one.
      //
      // The one-time "save Home and Work?" ask lives here instead. It goes
      // through the prompt gate (lib/promptGate), so it stands down if the
      // location primer, the Work explainer or the rating alert has this
      // app open, and asks again on a later one.
      const suggestTimer = setTimeout(() => maybeSuggestSavedPlaces("dashboard_focus", isPremium), 4000);
      return () => clearTimeout(suggestTimer);
    }, [loadData, isPremium, refreshPauseState])
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
        // Filter before summing, with the SAME filter the save path uses
        // (processShiftTrips -> filterTraceOutliers). Without this the live
        // figure was a raw haversine sum over every stored fix while the saved
        // figure dropped >50m-accuracy points and >120mph teleports, so the two
        // were guaranteed to disagree whenever a bad fix arrived - the number
        // appeared to drop when the shift ended. Same reason the Live Activity
        // end-card was inflated: it reads liveDistRef.
        const filtered = filterTraceOutliers(coords);
        const dist = filtered.length >= 2 ? calcDistance(filtered) : 0;
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

  // Persist a new hourly rate. Shared by the iOS Alert.prompt path and the
  // Android modal below so both write the rate identically.
  const saveHourlyRate = useCallback(async (raw: string | undefined) => {
    const pounds = parseFloat((raw ?? "").replace(/[^0-9.]/g, ""));
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
  }, []);

  // Set / change the hourly rate for live shift earnings. Persisted so the next
  // shift remembers it. usePrompt keeps Alert.prompt on iOS and gives Android a
  // real input modal - Alert.prompt is a silent no-op there.
  const promptHourlyRate = useCallback(async () => {
    const res = await prompt({
      title: "Hourly rate",
      message: "What are you paid per hour? Your earnings will tick up live as you work.",
      defaultValue: hourlyRatePence != null ? (hourlyRatePence / 100).toFixed(2) : "",
      keyboardType: "decimal-pad",
    });
    if (res.action !== "submit") return;
    await saveHourlyRate(res.value);
  }, [hourlyRatePence, saveHourlyRate, prompt]);

  const handleStartShift = useCallback(async () => {
    setStarting(true);
    try {
      // A running pause is offered back once; the shift starts either way.
      const pause = await askAboutPauseBeforeStart("shift");
      if (pause === "resumed") refreshPauseState();
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
  }, [selectedVehicleId, isWork, selectedVehicle, refreshPauseState]);

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
            // Stop GPS + Live Activity, turn breadcrumbs into trips, end the
            // shift offline-aware. Shared with the automatic end so both
            // behave the same (lib/tracking/shiftEnd.ts).
            const res = await finishShift({
              shiftId: activeShift.id,
              vehicleId: activeShift.vehicleId,
              liveDistanceMiles: liveDistRef.current,
            });
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
                  `You worked ${formatElapsed(elapsedSecs)} at £${(hourlyRatePence / 100).toFixed(2)}/hr, that's ${formatPence(earnedPence)}. Add it to your earnings?`,
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // A trip sorted from Home's Last trip card changes the claim the hero shows.
  // Only the stats: the rest of loadData (shift, vehicles) has not changed.
  const refreshStats = useCallback(() => {
    fetchGamificationStats()
      .then((res) => setStats(res.data))
      .catch(() => {});
  }, []);

  if (loading) {
    // Skeleton-first: the shape of the new Home (status line, hero, buttons,
    // last trip, doors) while we fetch user / vehicle / shift state.
    return (
      <View style={s.container}>
        <AppHeader />
        <ScrollView contentContainerStyle={s.homeContent}>
          <Skeleton.Group gap={spacing.md}>
            <Skeleton height={48} radius={radii.md} />
            <Skeleton height={132} radius={20} style={{ marginTop: spacing.md }} />
            <Skeleton height={56} radius={radii.md} style={{ marginTop: spacing.lg }} />
            <Skeleton height={112} radius={radii.lg} style={{ marginTop: spacing.xl }} />
            <Skeleton height={156} radius={radii.lg} style={{ marginTop: spacing.xl }} />
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
                  <Text style={s.scorecardUnit}>claim</Text>
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
                      <Medal type={a.type} state="earned" size={32} />
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

          {/* Gig drivers are paid per job, not by the hour, so the hourly
              "Log shift earnings?" offer never reaches them. Start shift,
              end shift, add earnings in one go (Krzysztof, 3 Oct 2026). */}
          {scorecard && (
            <Button
              title="Add earnings for this shift"
              icon="cash-outline"
              variant="secondary"
              onPress={() => {
                setShowScorecard(false);
                router.push({ pathname: "/earning-form", params: { prefillDate: scorecard.startedAt } });
              }}
              style={{ marginBottom: 10 }}
            />
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
          <ScrollView
            // Without this the ScrollView sizes itself to its content,
            // overflows the card's maxHeight and is clipped instead of
            // scrolling (same fix as the menu sheet).
            style={{ flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.explainerIconWrap}>
              <Ionicons name="briefcase" size={28} color="#f5a623" />
            </View>
            <Text style={s.explainerTitle}>Who is Work mode for?</Text>
            <Text style={s.explainerBody}>
              Work mode is for <Text style={s.explainerBold}>driving you do for work</Text>. That includes:
            </Text>

            <View style={s.explainerList}>
              <ExplainerItem icon="bicycle-outline" text="Gig and delivery drivers (Uber, Deliveroo, Just Eat, Amazon Flex)" />
              <ExplainerItem icon="construct-outline" text="Self-employed drivers, couriers and tradespeople" />
              <ExplainerItem icon="briefcase-outline" text="Employees who use their own vehicle for work" />
              <ExplainerItem icon="business-outline" text="Drivers whose company uses Milesheet" />
            </View>

            <View style={s.explainerDivider} />

            <Text style={s.explainerSubhead}>How it works</Text>
            <Text style={s.explainerBody}>
              Business trips are kept apart from personal ones. If you are self-employed, they build your <Text style={s.explainerBold}>mileage claim</Text>: 55p a mile for the first 10,000, then 25p. If your employer pays you for mileage, MileClear works out what you may be owed back. Company drivers send their miles to their company.
            </Text>

            <View style={s.explainerDivider} />

            <Text style={s.explainerSubhead}>Not sure?</Text>
            <Text style={s.explainerBody}>
              Regular commuting to a fixed workplace is <Text style={s.explainerBold}>not</Text> a business trip. If you only want to track personal driving, switch to <Text style={s.explainerBold}>Personal</Text> mode. You can switch back any time.
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

  // Second card of the primer, Android only: Physical activity. Explained
  // first, prompt on the tap, same as location - a cold prompt is what left 14
  // of 41 Android phones undetermined (21 Sep 2026).
  const motionPrimerCard = (
    <View style={s.explainerOverlay}>
      <View style={s.explainerCard}>
        <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.explainerIconWrap}>
            <Ionicons name="walk" size={28} color="#f5a623" />
          </View>
          <Text style={s.explainerTitle}>One more, and you are set</Text>
          <Text style={s.explainerBody}>
            Your phone can tell MileClear the moment you start moving. That is how a drive gets recorded from the start, instead of a mile in.
          </Text>

          <View style={s.explainerList}>
            <ExplainerItem
              icon="car-outline"
              text="Short drives get picked up, not missed."
            />
            <ExplainerItem
              icon="flash-outline"
              text="It reads a sensor your phone already runs, so it is not extra GPS."
            />
          </View>

          <View style={s.explainerDivider} />

          <Text style={s.explainerSubhead}>What happens next</Text>
          <Text style={s.explainerBody}>
            Your phone will ask to allow <Text style={s.explainerBold}>Physical activity</Text>. You can change it any time in Settings.
          </Text>
        </ScrollView>

        <TouchableOpacity
          onPress={enableMotionFromPrimer}
          activeOpacity={0.85}
          style={s.explainerCta}
          accessibilityRole="button"
          accessibilityLabel="Allow physical activity"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="walk" size={20} color="#030712" />
          <Text style={s.explainerCtaText}>Allow Physical activity</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => dismissLocPrimer("not_now")}
          activeOpacity={0.7}
          style={{ marginTop: 12, paddingVertical: 10, alignItems: "center" }}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: TEXT_3, fontSize: 14, fontFamily: fonts.regular }}>
            Not now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const locPrimerModal = (
    <AppModal
      visible={showLocPrimer}
      animationType="fade"
      onRequestClose={() => dismissLocPrimer("system")}
    >
      {primerStep === "motion" ? motionPrimerCard : (
      <View style={s.explainerOverlay}>
        <View style={s.explainerCard}>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            <View style={s.explainerIconWrap}>
              <Ionicons name="location" size={28} color="#f5a623" />
            </View>
            {locationTier === "foreground" ? (
              <>
                <Text style={s.explainerTitle}>Record drives automatically</Text>
                <Text style={s.explainerBody}>
                  Right now MileClear can only record while it is open on screen. Switch location to <Text style={s.explainerBold}>{Platform.OS === "android" ? "Allow all the time" : "Always"}</Text> and every drive records itself, with the phone in your pocket. A forgotten 20-mile trip is about <Text style={s.explainerBold}>£11</Text> you cannot claim back.
                </Text>
              </>
            ) : (
              <>
                <Text style={s.explainerTitle}>Never miss a mile</Text>
                <Text style={s.explainerBody}>
                  MileClear is not recording your trips yet. It needs location access to log your miles, even with your screen off. A forgotten 20-mile trip is about <Text style={s.explainerBold}>£11</Text> you cannot claim back.
                </Text>
              </>
            )}

            <View style={s.explainerList}>
              <ExplainerItem
                icon="navigate-outline"
                text="While using the app: tracks your route with MileClear open on screen."
              />
              <ExplainerItem
                icon="radio-button-on-outline"
                text="Always (recommended): records trips with the app closed, so every claimable mile is captured."
              />
            </View>

            <View style={s.explainerDivider} />

            <Text style={s.explainerSubhead}>What happens next</Text>
            <Text style={s.explainerBody}>
              {locationTier === "foreground" ? (
                Platform.OS === "android" ? (
                  <>Tap below and choose <Text style={s.explainerBold}>Allow all the time</Text>. If your phone opens Settings instead, pick it there. You can change it any time.</>
                ) : (
                  <>Tap below and choose <Text style={s.explainerBold}>Change to Always Allow</Text>. If your phone opens Settings instead, pick Always there. You can change it any time.</>
                )
              ) : (
                <>Tap below and your phone will ask for location access. Choose <Text style={s.explainerBold}>{Platform.OS === "android" ? "Allow all the time" : "Always"}</Text> for automatic tracking. You can change it any time in Settings.</>
              )}
            </Text>
          </ScrollView>

          <TouchableOpacity
            onPress={enableLocationFromPrimer}
            activeOpacity={0.85}
            style={s.explainerCta}
            accessibilityRole="button"
            accessibilityLabel={locationTier === "foreground" ? "Record drives automatically" : "Turn on location access"}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="location" size={20} color="#030712" />
            <Text style={s.explainerCtaText}>{locationTier === "foreground" ? "Record automatically" : "Turn on location"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => dismissLocPrimer("not_now")}
            activeOpacity={0.7}
            style={{ marginTop: 12, paddingVertical: 10, alignItems: "center" }}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: TEXT_3, fontSize: 14, fontFamily: fonts.regular }}>
              Not now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      )}
    </AppModal>
  );

  // ── Active Shift ──────────────────────────────────────────────
  if (activeShift) {
    return (
      <>
        {scorecardModal}
        {/* The status line's Recording sheet links to this explainer on the
            shift screen too, so it has to be mounted here as well. */}
        {workExplainerModal}
        <AppHeader />
        <ScrollView
          style={s.container}
          contentContainerStyle={[s.content, { paddingTop: 16 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f5a623" />
          }
        >
        <View style={s.shiftStatus}>{home.element}</View>
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

  // ── Idle Home ─────────────────────────────────────────────────
  // The new Home (components/home). Modals stay here as siblings so they sit
  // at the component root, away from the ScrollView's portal layer on iPad.
  return (
    <>
      {scorecardModal}
      {workExplainerModal}
      {locPrimerModal}
      <HomeIdle
        stats={stats}
        previousYear={previousYear}
        status={home.status}
        statusElement={home.element}
        hasVehicle={!vehiclesKnown || vehicles.length > 0}
        starting={starting}
        onStartShift={handleStartShift}
        onShiftGraded={(sc) => {
          if (sc) {
            setScorecard(sc);
            setShowScorecard(true);
          } else {
            router.push("/shifts");
          }
        }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onTripClassified={refreshStats}
        savedPlaces={{
          eligible: showSavedLocationsNudge,
          count: savedLocationsSuggestionCount,
          dismiss: dismissSavedLocationsNudge,
        }}
        pro={{ eligible: showProNudge, dismiss: dismissProNudge }}
        referral={{ eligible: showReferralCard, dismiss: dismissReferralCard }}
        androidBeta={{ eligible: !amapBannerSeen, dismiss: dismissAmapBanner }}
      />
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
  shiftStatus: { marginBottom: 16 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  homeContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 },
  greeting: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
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
  unlockLabel: { fontSize: 14, fontFamily: fonts.semibold, color: TEXT_1 },
  unlockDesc: { fontSize: 12, fontFamily: fonts.regular, color: TEXT_2 },

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
    // Was maxHeight: "85%". Same Android trap the menu sheet hit (0f04895):
    // a percentage maxHeight needs a definite parent height, and without one
    // the card grows past the screen and pushes the "Got it" button off it.
    // Steven, 31 Aug 2026, Android 15 with large font scale: two
    // work_explainer.shown, zero dismissed - the exact frozen-modal
    // signature the dwell-time comment above describes.
    maxHeight: Math.round(Dimensions.get("window").height * 0.85),
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
});
