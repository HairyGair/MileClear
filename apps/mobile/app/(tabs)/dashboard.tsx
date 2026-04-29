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
  Modal,
  Share,
  Platform,
  Animated,
  Dimensions,
  Linking,
} from "react-native";
import { Button } from "../../components/Button";
import { ActiveRecordingBanner } from "../../components/ActiveRecordingBanner";
import { useFocusEffect, useRouter } from "expo-router";
import { fetchVehicles } from "../../lib/api/vehicles";
import {
  fetchActiveShift,
  ShiftWithVehicle,
} from "../../lib/api/shifts";
import { syncStartShift, syncEndShift } from "../../lib/sync/actions";
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
import { startLiveActivity, updateLiveActivity, endLiveActivity, endLiveActivityWithSummary, recoverLiveActivity } from "../../lib/liveActivity";
import { useLayoutPrefs } from "../../lib/layout/index";
import { PremiumGate, PremiumTeaser, useIsPremium } from "../../components/PremiumGate";
import { SmartInsightCard } from "../../components/SmartInsightCard";
import { usePaywall } from "../../components/paywall";
import * as Location from "expo-location";
import { requestOrFixBackgroundLocation } from "../../lib/permissions/location";

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

function ExplainerItem({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <Ionicons name={icon} size={18} color="#f5a623" style={{ marginTop: 1 }} />
      <Text style={{ color: "#c9d1db", fontSize: 14, fontFamily: "PlusJakartaSans_400Regular", flex: 1, lineHeight: 20 }}>
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

  // Background location permission — needed for auto trip detection
  const [bgLocationGranted, setBgLocationGranted] = useState(true); // default true until checked

  // Vehicle nudge — show when user has no vehicles at all
  const showVehicleNudge = !loading && vehicles.length === 0;

  // Pro nudge card — dismissible, for free users with 5+ trips
  const { showPaywall } = usePaywall();
  const [proNudgeDismissedUntil, setProNudgeDismissedUntil] = useState<number>(Date.now() + 999999999);
  const showProNudge = !isPremium && !loading && (stats?.totalTrips ?? 0) >= 5 && Date.now() >= proNudgeDismissedUntil;
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

  // Load work explainer flag
  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = 'work_explainer_seen'"
      );
      setWorkExplainerSeen(row?.value === "1");
    })();
  }, []);

  // Auto-show work explainer on first Work mode visit
  useEffect(() => {
    if (isWork && !workExplainerSeen && !loading) {
      setShowWorkExplainer(true);
    }
  }, [isWork, workExplainerSeen, loading]);

  const dismissWorkExplainer = useCallback(async () => {
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
      // Check background location permission on each focus
      Location.getBackgroundPermissionsAsync().then((res) => {
        setBgLocationGranted(res.status === Location.PermissionStatus.GRANTED);
      }).catch(() => {});
      // Passive trigger for users who never hit the classify / achievement /
      // scorecard paths - gated by all the standard rating guards (3+ trips,
      // 3-day cooldown, once-per-session). Delayed so it doesn't jump the
      // moment the dashboard renders.
      setTimeout(() => maybeRequestReview("dashboard_focus"), 4000);
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
          updateLiveActivity({ distanceMiles: liveDistRef.current, speedMph: 0, tripCount: 0 });
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
  useEffect(() => {
    if (!activeShift) {
      setLiveDistance(0);
      liveDistRef.current = 0;
      return;
    }

    let mounted = true;
    const poll = async () => {
      try {
        const coords = await peekBackgroundCoordinates(activeShift.id);
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
  }, [activeShift?.id]);

  const handleStartShift = useCallback(async () => {
    setStarting(true);
    try {
      const res = await syncStartShift(
        selectedVehicleId ? { vehicleId: selectedVehicleId } : undefined
      );
      setActiveShift(res.data);

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
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to start shift");
    } finally {
      setStarting(false);
    }
  }, [selectedVehicleId]);

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
            if (res) {
              const resAny = res as any;
              if (resAny.scorecard) {
                setScorecard(resAny.scorecard);
                setShowScorecard(true);
                setTimeout(() => maybeRequestReview("scorecard_shown"), 3000);
              }
            }
            loadData();
          } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to end shift");
          } finally {
            setEnding(false);
          }
        },
      },
    ]);
  }, [activeShift, loadData]);

  const handleSelectVehicle = useCallback(() => {
    if (vehicles.length === 0) {
      Alert.alert("No Vehicles", "Add a vehicle in your profile first.");
      return;
    }
    const options = vehicles.map((v) => ({
      text: `${v.make} ${v.model}${v.isPrimary ? " (Primary)" : ""}`,
      onPress: () => setSelectedVehicleId(v.id),
    }));
    options.push({ text: "No Vehicle", onPress: () => setSelectedVehicleId(undefined) });
    Alert.alert("Select Vehicle", "Choose a vehicle for this shift", [
      ...options,
      { text: "Cancel", onPress: () => {} },
    ]);
  }, [vehicles]);

  const handleRecap = useCallback(async (period: "daily" | "weekly" | "monthly") => {
    try {
      const res = await fetchRecap(period);
      setRecapData(res.data);
      setShowRecap(true);
      if (period === "weekly" || period === "monthly") {
        setTimeout(() => maybeRequestReview("recap_shown"), 3000);
      }
    } catch {
      Alert.alert("Error", "Failed to load recap");
    }
  }, []);

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
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color="#f5a623" accessibilityLabel="Loading dashboard" />
      </View>
    );
  }

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  // ── Scorecard Modal ───────────────────────────────────────────
  const scorecardModal = (
    <Modal
      visible={showScorecard}
      animationType="slide"
      transparent
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
                      ? "New record \u2014 Miles & Trips"
                      : scorecard.isPersonalBestMiles
                        ? "New record \u2014 Most Miles"
                        : "New record \u2014 Most Trips"}
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
    </Modal>
  );

  // ── Recap Modal ───────────────────────────────────────────────
  const recapModal = (
    <Modal
      visible={showRecap}
      animationType="slide"
      transparent
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
    </Modal>
  );

  // ── Work Mode Explainer Modal ─────────────────────────────────
  const workExplainerModal = (
    <Modal
      visible={showWorkExplainer}
      transparent
      animationType="fade"
      onRequestClose={dismissWorkExplainer}
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
              Business trips are tracked separately and used to calculate your <Text style={s.explainerBold}>HMRC mileage deduction</Text> — 45p per mile for the first 10,000, then 25p after that. This reduces your tax bill at the end of the year.
            </Text>

            <View style={s.explainerDivider} />

            <Text style={s.explainerSubhead}>Not sure if you qualify?</Text>
            <Text style={s.explainerBody}>
              If you're employed and your employer reimburses mileage, you may still be able to claim the difference from HMRC. However, regular commuting to a fixed office is <Text style={s.explainerBold}>not</Text> claimable.
            </Text>
            <Text style={[s.explainerBody, { marginTop: 8 }]}>
              If you just want to track personal driving, switch to <Text style={s.explainerBold}>Personal</Text> mode — you can always switch back later.
            </Text>
          </ScrollView>

          <Button
            title="Got it"
            icon="checkmark"
            size="lg"
            onPress={dismissWorkExplainer}
            style={{ marginTop: 16 }}
          />
        </View>
      </View>
    </Modal>
  );

  // ── Active Shift ──────────────────────────────────────────────
  if (activeShift) {
    return (
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingTop: 16 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f5a623" />
        }
      >
        {scorecardModal}
        <Text style={s.greeting}>Shift Active</Text>

        <View style={s.timerWrap}>
          <View style={s.liveIndicator}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>TRACKING</Text>
          </View>
          <Text style={s.timer}>{formatElapsed(elapsed)}</Text>
          {activeShift.vehicle && (
            <Text style={s.timerSub}>
              {activeShift.vehicle.make} {activeShift.vehicle.model}
            </Text>
          )}
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
            <Text style={s.statNumLive}>
              {liveDistance.toFixed(1)}
            </Text>
            <Text style={s.statUnit}>mi this shift</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>
              {stats ? formatMilesShort(stats.todayMiles) : "0"}
            </Text>
            <Text style={s.statUnit}>mi today</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>
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
    );
  }

  // ── Idle Dashboard ────────────────────────────────────────────
  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={[s.content, { paddingTop: 16 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f5a623" />
      }
    >
      {scorecardModal}
      {recapModal}
      {workExplainerModal}

      {/* Mode Toggle */}
      <ModeToggle onInfoPress={() => setShowWorkExplainer(true)} />

      {/* Active recording banner — appears whenever auto-detection has a
          trip in progress, so the user always knows we're tracking even if
          the Live Activity silently failed to present. */}
      <ActiveRecordingBanner />

      {/* Background location nudge - auto trip detection requires "Always".
          Uses the smart escalation helper so the right thing happens whether
          the user has never granted, granted only foreground, or denied
          outright. Linking.openSettings() alone is wrong for fresh installs:
          iOS doesn't show a Location row in Settings until the app has
          actually asked for permission once. */}
      {!bgLocationGranted && !activeShift && (
        <TouchableOpacity
          style={s.bgLocNudge}
          onPress={async () => {
            const final = await requestOrFixBackgroundLocation();
            setBgLocationGranted(final.tier === "always");
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Auto-detection is off. Tap to enable location access. iOS asks in two steps; we'll guide you through both."
        >
          <View style={s.bgLocNudgeRow}>
            <View style={s.bgLocNudgeIcon}>
              <Ionicons name="location-outline" size={20} color="#f59e0b" accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bgLocNudgeTitle}>Auto-detection is off</Text>
              <Text style={s.bgLocNudgeBody}>
                Tap to turn it on. iOS asks for location access in two steps - we'll guide you through both.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#64748b" accessible={false} />
          </View>
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
      {isWork && workLayout.visibleKeys.map((key) => {
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
                  <Text style={s.heroValue}>{"£"}0.00</Text>
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
                  <Text style={s.heroValue}>{"£"}0.00</Text>
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
                <Text style={s.heroValue}>
                  {formatPence(stats.deductionPence)}
                </Text>
                {stats.deductionPence > 0 && (
                  <Text style={s.heroSavedLabel}>saved in tax this year</Text>
                )}
                {!isPremium && stats.deductionPence > 0 && (
                  <Text style={s.heroLockedHint}>Upgrade to export for your tax return</Text>
                )}
                <View style={s.heroMeta}>
                  <Text style={s.heroMetaText}>
                    {formatMilesShort(stats.todayMiles)} today
                  </Text>
                  <View style={s.heroDivider} />
                  <Text style={s.heroMetaText}>
                    {formatMilesShort(stats.weekMiles)} this week
                  </Text>
                  <View style={s.heroDivider} />
                  <Text style={s.heroMetaText}>
                    {stats.totalTrips} trips
                  </Text>
                </View>
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
  );
}

// ── Styles ────────────────────────────────────────────────────────

const CARD_BG = "#0a1120";
const CARD_BORDER = "rgba(255,255,255,0.05)";
const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const TEXT_3 = "#64748b";

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
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_700Bold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 38,
    fontFamily: "PlusJakartaSans_300Light",
    color: AMBER,
    letterSpacing: -1,
    marginBottom: 10,
  },
  heroSavedLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#10b981",
    marginBottom: 6,
    marginTop: -6,
  },
  heroEmptyBody: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#94a3b8",
    lineHeight: 19,
    marginTop: 10,
  },
  heroLockedHint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
  },
  heroDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TEXT_3,
    marginHorizontal: 10,
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
    fontFamily: "PlusJakartaSans_700Bold",
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
    fontFamily: "PlusJakartaSans_700Bold",
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
    fontFamily: "PlusJakartaSans_700Bold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    letterSpacing: -0.5,
  },
  statNumLive: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f5a623",
    letterSpacing: -0.5,
  },
  statUnit: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    letterSpacing: -0.2,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 2,
  },
  recordLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  vehiclePickerVal: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#34c759",
    letterSpacing: 1.5,
  },
  timer: {
    fontSize: 60,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    fontVariant: ["tabular-nums"],
    letterSpacing: 4,
  },
  timerSub: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 8,
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
    fontFamily: "PlusJakartaSans_300Light",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  scorecardNumLarge: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_300Light",
    color: AMBER,
  },
  scorecardUnit: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  scorecardDuration: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
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
  pbText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: AMBER },
  unlockSection: { marginTop: 8, marginBottom: 16 },
  unlockTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
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
  unlockLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: TEXT_1 },
  unlockDesc: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: TEXT_2 },

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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: AMBER,
  },
  dailyRecapUnit: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    textAlign: "center",
    marginBottom: 20,
  },
  recapDetail: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_700Bold",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  tripSheetStatLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
    textTransform: "uppercase",
  },
  tripSheetAddresses: {
    gap: 4,
  },
  tripSheetAddress: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    marginBottom: 6,
  },
  btPromoBody: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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

  // Background location nudge
  bgLocNudge: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    padding: 14,
    marginBottom: 12,
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f59e0b",
    marginBottom: 2,
  },
  bgLocNudgeBody: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 17,
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
    textAlign: "center",
    marginBottom: 16,
  },
  explainerBody: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    lineHeight: 21,
    marginBottom: 12,
  },
  explainerBold: {
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
    marginBottom: 8,
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
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#64748b",
  },
});
