import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import * as Location from "expo-location";
import { getCurrentLocation, reverseGeocode } from "../lib/location/geocoding";
import {
  fetchTrip,
  CreateTripData,
  submitTripAnomaly,
  fetchClassificationSuggestion,
  fetchClassificationSuggestionForPair,
  recalculateTrip,
  mergeTrips,
  resolveMissedJourney,
  ClassificationSuggestion,
} from "../lib/api/trips";
import { getLocalTrip } from "../lib/db/queries";
import {
  syncCreateTrip,
  syncUpdateTrip,
  syncDeleteTrip,
} from "../lib/sync/actions";
import { fetchVehicles } from "../lib/api/vehicles";
import { GIG_PLATFORMS, BUSINESS_PURPOSES, TRIP_CATEGORY_META, haversineDistance, calculateHmrcDeduction } from "@mileclear/shared";
import { fetchServerRouteDistance, type RouteDistanceResult } from "../lib/api/trips";
import { describeError } from "../lib/api/apiError";
import type { TripClassification, TripCategory, PlatformTag, BusinessPurpose, Vehicle, CazTripAssessment } from "@mileclear/shared";
import { formatPence } from "@mileclear/shared";
import { createExpense } from "../lib/api/expenses";
import { getDatabase } from "../lib/db/index";
import { startQuickTripTracking, stopQuickTripTracking, clearDetectionCooldown, peekBackgroundCoordinates } from "../lib/tracking";
import { recordLastSavedTrip } from "../lib/events/lastTrip";
import { maybeOfferAlwaysAfterCapture } from "../lib/permissions/location";
import { maybeRequestReview } from "../lib/rating/index";
import { LocationPickerField } from "../components/LocationPickerField";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { Button } from "../components/Button";
import { usePaywall } from "../components/paywall";
import { useMode } from "../lib/mode/context";
import { useUser } from "../lib/user/context";
import { fetchBusinessInsights } from "../lib/api/businessInsights";
import {
  detectAnomalies,
  detectSlowZones,
  buildLocationQuestions,
  setLocationQuestionPlace,
  type TripAnomalyDef,
  type LocationQuestion,
} from "@mileclear/shared";
import { startLiveActivity, updateLiveActivity, endLiveActivityWithSummary, markLiveActivityClassified } from "../lib/liveActivity";
import { getLiveActivityContext } from "../lib/liveActivity/context";
import { fetchCommunityInsights } from "../lib/api/communityInsights";
import * as Notifications from "expo-notifications";
import { colors, fonts } from "../lib/theme";
import { haptic } from "../lib/haptics";

/**
 * One-time contextual notification permission ask for users who skipped onboarding.
 * Only fires once - after first trip save, if notifications aren't granted yet.
 */
async function askNotificationPermissionOnce(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return;
    const db = await getDatabase();
    const asked = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'notification_contextual_asked'"
    );
    if (asked) return;
    await db.runAsync(
      "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('notification_contextual_asked', 'true')"
    );
    Alert.alert(
      "Stay on track",
      "Get streak reminders, weekly summaries, and trip detection alerts?",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Enable",
          onPress: () => Notifications.requestPermissionsAsync().catch(() => {}),
        },
      ]
    );
  } catch {}
}

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Lazy import MapView for Expo Go compatibility (UIManager guard)
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
const hasNativeMap =
  Platform.OS !== "web" &&
  UIManager.getViewManagerConfig?.("AIRMap") != null;
if (hasNativeMap) {
  try {
    const Maps = require("react-native-maps");
    MapView = Maps.default;
    Marker = Maps.Marker;
    Polyline = Maps.Polyline;
  } catch {
    // Not available
  }
}

// Lazy import expo-haptics (available in Expo Go runtime)
let Haptics: typeof import("expo-haptics") | null = null;
try {
  Haptics = require("expo-haptics");
} catch {
  // Not available
}

/** Check if dateB is exactly one day after dateA (YYYY-MM-DD strings) */
function isConsecutiveDay(dateA: string, dateB: string): boolean {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  return b.getTime() - a.getTime() === 24 * 60 * 60 * 1000;
}

type TripMode = "ready" | "driving" | "arrived" | "saving" | "manual" | "editing";

const QUICK_TRIP_KEY = "quick_trip_start";

// A straight chord longer than this between consecutive breadcrumbs is a GPS
// gap (app was backgrounded/suspended and the subscription stopped delivering).
// At 50m background sampling, normal points are <=50m apart, so >=0.2mi (~320m)
// is a real dropout worth routing through roads instead of measuring as a chord.
const GAP_FILL_THRESHOLD_MILES = 0.2;
const MAX_GAP_FILLS = 8; // cap server route lookups per save

interface QuickTripStart {
  lat: number;
  lng: number;
  address: string | null;
  startedAt: string;
}

interface Breadcrumb {
  lat: number;
  lng: number;
  speed: number | null; // m/s from expo-location
  accuracy: number | null;
  recordedAt: string;
}

interface TripInsights {
  topSpeedMph: number;
  avgSpeedMph: number;
  avgMovingSpeedMph: number;
  timeMovingSecs: number;
  timeStoppedSecs: number;
  routeEfficiency: number; // 1.0 = straight line, higher = more winding
  longestNonStopMiles: number;
  numberOfStops: number;
  coordCount: number;
  speedFunFact?: string | null;
  distanceFunFact?: string | null;
}

function getSpeedFunFact(topMph: number): string | null {
  if (topMph >= 70) return "Motorway speed reached - 70 mph zone";
  if (topMph >= 60) return "Dual carriageway pace - 60 mph zone";
  if (topMph >= 40) return "Faster than Usain Bolt's 27 mph world record";
  if (topMph >= 30) return "Town driving - nice and steady";
  if (topMph >= 15) return "Quicker than a London cyclist";
  return null;
}

function getDistanceFunFact(miles: number): string | null {
  if (miles >= 100) return "That's like London to Birmingham";
  if (miles >= 60) return "That's London to Brighton and back";
  if (miles >= 30) return "About the same as London to Brighton";
  if (miles >= 15) return `That's about ${Math.round(miles * 100)} football pitches end-to-end`;
  if (miles >= 7) return `About ${Math.round(miles / 3.1)} parkruns back-to-back`;
  if (miles >= 4) return "A bit more than a parkrun by road";
  if (miles >= 2.5) return "About a parkrun distance by road";
  if (miles >= 1) return `About ${Math.round(miles * 20)} laps of a running track`;
  return null;
}

function getRouteDirectnessNote(efficiency: number): string | null {
  if (efficiency <= 1.3) return "Nearly a straight line - very direct route";
  if (efficiency <= 2.0) return "Pretty direct - minimal detours";
  if (efficiency <= 3.5) return "A few twists and turns along the way";
  if (efficiency <= 6.0) return "Winding route - lots of turns";
  return "Very indirect - you really explored the area";
}

function getTimeOfDayNote(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const hour = new Date(startedAt).getHours();
  if (hour >= 5 && hour < 7) return "Early bird - on the road before most";
  if (hour >= 7 && hour < 9) return "Morning rush hour drive";
  if (hour >= 9 && hour < 12) return "Mid-morning drive";
  if (hour >= 12 && hour < 14) return "Lunchtime drive";
  if (hour >= 14 && hour < 16) return "Afternoon drive";
  if (hour >= 16 && hour < 19) return "Evening rush hour drive";
  if (hour >= 19 && hour < 22) return "Evening drive";
  return "Night owl - driving after hours";
}

function computeInsights(crumbs: Breadcrumb[], distMiles: number, durationSecs: number): TripInsights | null {
  if (crumbs.length < 2) return null;

  const MS_TO_MPH = 2.23694;
  const STOP_SPEED_MS = 1.5; // <3.4 mph = stopped

  let topSpeedMph = 0;
  let movingSpeedSum = 0;
  let movingCount = 0;
  let timeMovingSecs = 0;
  let timeStoppedSecs = 0;
  let numberOfStops = 0;
  let wasMoving = false;

  // Longest non-stop stretch
  let currentStretchMiles = 0;
  let longestNonStopMiles = 0;

  for (let i = 1; i < crumbs.length; i++) {
    const prev = crumbs[i - 1];
    const curr = crumbs[i];
    const dt = (new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000;
    if (dt <= 0) continue;

    const speed = curr.speed;
    const isStopped = speed != null ? speed < STOP_SPEED_MS : false;

    if (speed != null && speed >= 0) {
      const mph = speed * MS_TO_MPH;
      if (mph > topSpeedMph) topSpeedMph = mph;
      if (!isStopped) {
        movingSpeedSum += mph;
        movingCount++;
      }
    }

    if (isStopped) {
      timeStoppedSecs += dt;
      if (wasMoving) numberOfStops++;
      wasMoving = false;
      // End of non-stop stretch
      if (currentStretchMiles > longestNonStopMiles) {
        longestNonStopMiles = currentStretchMiles;
      }
      currentStretchMiles = 0;
    } else {
      timeMovingSecs += dt;
      wasMoving = true;
      // Calculate segment distance
      const segDist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      currentStretchMiles += segDist;
    }
  }
  // Check final stretch
  if (currentStretchMiles > longestNonStopMiles) {
    longestNonStopMiles = currentStretchMiles;
  }

  // Route efficiency: actual distance vs straight-line
  const straightLine = haversineDistance(
    crumbs[0].lat, crumbs[0].lng,
    crumbs[crumbs.length - 1].lat, crumbs[crumbs.length - 1].lng
  );
  const routeEfficiency = straightLine > 0.01 ? distMiles / straightLine : 1;

  const avgSpeedMph = durationSecs > 0 ? (distMiles / durationSecs) * 3600 : 0;
  const avgMovingSpeedMph = movingCount > 0 ? movingSpeedSum / movingCount : avgSpeedMph;

  return {
    topSpeedMph: Math.round(topSpeedMph),
    avgSpeedMph: Math.round(avgSpeedMph),
    avgMovingSpeedMph: Math.round(avgMovingSpeedMph),
    timeMovingSecs: Math.round(timeMovingSecs),
    timeStoppedSecs: Math.round(timeStoppedSecs),
    routeEfficiency: Math.round(routeEfficiency * 10) / 10,
    longestNonStopMiles: Math.round(longestNonStopMiles * 10) / 10,
    numberOfStops,
    coordCount: crumbs.length,
  };
}

// Speed colour thresholds for trail segments
function getSpeedColor(mph: number): string {
  if (mph < 3) return RED;      // stopped - red
  if (mph < 15) return "#f59e0b";     // slow - amber
  if (mph < 50) return AMBER;     // cruising - brand amber
  return GREEN;                    // fast - green
}

// Build speed-coloured polyline segments from trail points
function buildSpeedSegments(
  trail: { latitude: number; longitude: number; speed: number }[],
  accentColor?: string
): { coords: { latitude: number; longitude: number }[]; color: string }[] {
  if (trail.length < 2) return [];
  const segments: { coords: { latitude: number; longitude: number }[]; color: string }[] = [];
  let currentColor = accentColor || getSpeedColor(trail[0].speed);
  let currentCoords = [{ latitude: trail[0].latitude, longitude: trail[0].longitude }];

  for (let i = 1; i < trail.length; i++) {
    const color = accentColor || getSpeedColor(trail[i].speed);
    const point = { latitude: trail[i].latitude, longitude: trail[i].longitude };
    if (color !== currentColor) {
      // Overlap by 1 point for continuity
      currentCoords.push(point);
      segments.push({ coords: currentCoords, color: currentColor });
      currentCoords = [point];
      currentColor = color;
    } else {
      currentCoords.push(point);
    }
  }
  if (currentCoords.length >= 2) {
    segments.push({ coords: currentCoords, color: currentColor });
  }
  return segments;
}

/**
 * Post-trip review card — full-screen overlay shown briefly after a
 * manual trip is saved. Replaces the abrupt router.back() with a
 * proper "moment of completion" view: distance, AMAP £ value, the
 * auto-classification we applied (with explanation), and the routing
 * provenance. Gives drivers a clear, confidence-building summary of
 * what just happened to their data.
 */
function PostTripReviewCard({
  distanceMiles,
  classification,
  autoClassified,
  learnedMatchCount,
  routeSourceLabel,
  onDone,
}: {
  distanceMiles: number;
  classification: TripClassification;
  autoClassified: boolean;
  learnedMatchCount: number | null;
  routeSourceLabel: string | null;
  onDone: () => void;
}) {
  const accent = classification === "business" ? colors.amber : colors.green;

  // Compute AMAP value at the standard car rate. We use calculateHmrcDeduction
  // (tax-year-aware tiered car rate - 55p/25p from 2026-27, was 45p/25p
  // before) which matches the figure shown across the rest of the app for
  // business trips. Personal trips don't claim, so we hide it.
  const amapPence = classification === "business"
    ? calculateHmrcDeduction("car", distanceMiles)
    : 0;
  const amapPounds = (amapPence / 100).toFixed(2);

  const classLabel =
    classification === "business" ? "Work" :
    classification === "personal" ? "Personal" :
    "Unclassified";

  return (
    <View style={reviewCardStyles.overlay}>
      <View style={reviewCardStyles.card}>
        <View style={[reviewCardStyles.iconCircle, { backgroundColor: `${accent}22` }]}>
          <Ionicons name="checkmark-circle" size={36} color={accent} />
        </View>
        <Text style={reviewCardStyles.title}>Trip saved</Text>

        <View style={reviewCardStyles.statsRow}>
          <View style={reviewCardStyles.statItem}>
            <Text style={[reviewCardStyles.statValue, { color: accent }]}>
              {distanceMiles.toFixed(2)}
            </Text>
            <Text style={reviewCardStyles.statLabel}>MILES</Text>
          </View>
          {classification === "business" && (
            <>
              <View style={reviewCardStyles.divider} />
              <View style={reviewCardStyles.statItem}>
                <Text style={[reviewCardStyles.statValue, { color: accent }]}>
                  £{amapPounds}
                </Text>
                <Text style={reviewCardStyles.statLabel}>HMRC</Text>
              </View>
            </>
          )}
          <View style={reviewCardStyles.divider} />
          <View style={reviewCardStyles.statItem}>
            <Text style={[reviewCardStyles.statValue, { color: accent, fontSize: 18 }]}>
              {classLabel}
            </Text>
            <Text style={reviewCardStyles.statLabel}>TYPE</Text>
          </View>
        </View>

        {autoClassified && learnedMatchCount !== null && (
          <View style={[reviewCardStyles.context, { borderColor: `${accent}40` }]}>
            <Ionicons name="sparkles" size={14} color={accent} />
            <Text style={reviewCardStyles.contextText}>
              Auto-classified as {classLabel} — based on {learnedMatchCount}{" "}
              similar {learnedMatchCount === 1 ? "trip" : "trips"} you've taken.
            </Text>
          </View>
        )}

        {routeSourceLabel && (
          <View style={reviewCardStyles.context}>
            <Ionicons name="map-outline" size={14} color={colors.text3} />
            <Text style={reviewCardStyles.contextText}>{routeSourceLabel}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[reviewCardStyles.doneButton, { backgroundColor: accent }]}
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={reviewCardStyles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const reviewCardStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 1000,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 14,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.text1,
    fontSize: 22,
    fontFamily: fonts.bold,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    paddingVertical: 8,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 26,
    fontFamily: fonts.bold,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    color: colors.text3,
    fontSize: 10,
    fontFamily: fonts.semibold,
    letterSpacing: 0.8,
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 8,
  },
  context: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    width: "100%",
    borderWidth: 1,
    borderColor: "transparent",
  },
  contextText: {
    flex: 1,
    color: colors.text2,
    fontSize: 12,
    fontFamily: fonts.regular,
    lineHeight: 17,
  },
  doneButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  doneButtonText: {
    color: "#000",
    fontSize: 16,
    fontFamily: fonts.semibold,
  },
});

/**
 * Per-trip confidence badge. Renders a high/medium/low pill with
 * tap-to-expand reasons — gives users (and HMRC, if it ever comes to a
 * review) visibility into the quality of the evidence behind a trip's
 * claimed mileage.
 */
function ConfidenceBadge({
  level,
  reasons,
}: {
  level: "high" | "medium" | "low";
  reasons: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const config = (
    {
      high: { color: "#10b981", icon: "shield-checkmark", label: "High confidence" },
      medium: { color: "#f5a623", icon: "shield-half", label: "Medium confidence" },
      low: { color: "#ef4444", icon: "alert-circle", label: "Low confidence" },
    } as const
  )[level];

  return (
    <TouchableOpacity
      style={[
        styles.confidenceBadge,
        { borderColor: config.color, backgroundColor: `${config.color}15` },
      ]}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${config.label}. Tap to ${expanded ? "hide" : "see"} reasons.`}
    >
      <View style={styles.confidenceBadgeRow}>
        <Ionicons name={config.icon as never} size={16} color={config.color} />
        <Text style={[styles.confidenceBadgeLabel, { color: config.color }]}>
          {config.label}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={config.color}
          style={{ marginLeft: "auto" }}
        />
      </View>
      {expanded && reasons.length > 0 && (
        <View style={styles.confidenceReasons}>
          {reasons.map((r, i) => (
            <Text key={i} style={styles.confidenceReasonText}>
              • {r}
            </Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * User-facing label for the routing provenance. We show this so users
 * can verify the distance is auditable — important for HMRC mileage
 * claims where "where did this number come from?" is a real question.
 */
function provenanceLabel(source: RouteDistanceResult["source"]): string {
  if (source === "cache") return "Route distance via road (cached)";
  if (source === "graphhopper") return "Route distance via road";
  if (source === "google") return "Route distance via Google Maps";
  return "Route distance via road";
}

// Positive message based on trip data
function getPositiveMessage(distanceMiles: number | null, numberOfStops: number, routeEfficiency: number): string {
  const miles = distanceMiles ?? 0;
  if (miles >= 50) return "Epic journey!";
  if (miles >= 20) return "Great distance covered!";
  if (numberOfStops === 0) return "Smooth sailing - no stops!";
  if (routeEfficiency <= 1.3 && routeEfficiency > 0) return "Super direct route!";
  if (miles >= 5) return "Solid trip logged!";
  return "Trip tracked!";
}

const CLASSIFICATIONS: { value: TripClassification; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "personal", label: "Personal" },
  { value: "unclassified", label: "Classify Later" },
];

export default function TripFormScreen() {
  const router = useRouter();
  const {
    id,
    mode: modeParam,
    // Prefill from a "missed journey" proposal (the Trips-screen scanner). When
    // missedId is present we land in manual entry with the gap's endpoints +
    // times filled in; saving creates the trip and marks the proposal accepted.
    missedId,
    prefillFromLat,
    prefillFromLng,
    prefillFromAddress,
    prefillToLat,
    prefillToLng,
    prefillToAddress,
    prefillDepartedAt,
    prefillArrivedAt,
  } = useLocalSearchParams<{
    id?: string;
    mode?: string;
    missedId?: string;
    prefillFromLat?: string;
    prefillFromLng?: string;
    prefillFromAddress?: string;
    prefillToLat?: string;
    prefillToLng?: string;
    prefillToAddress?: string;
    prefillDepartedAt?: string;
    prefillArrivedAt?: string;
  }>();
  const isEditing = !!id;
  const hasMissedPrefill = !!missedId;
  const { user: currentUser } = useUser();
  const { showPaywall } = usePaywall();

  // Honor a `mode=manual` deep link (e.g. the dashboard first-trip nudge's
  // "Add a past trip" CTA) so the user lands straight in manual entry rather
  // than the live "Start Trip" flow. Live-tracking effects are gated on
  // driving/arrived, so starting in manual is inert for them.
  const [mode, setMode] = useState<TripMode>(
    isEditing ? "editing" : modeParam === "manual" || hasMissedPrefill ? "manual" : "ready"
  );
  const [loading, setLoading] = useState(true);

  // Location data
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [endLat, setEndLat] = useState<number | null>(null);
  const [endLng, setEndLng] = useState<number | null>(null);
  const [endAddress, setEndAddress] = useState<string | null>(null);

  // Time data
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [endedAt, setEndedAt] = useState<Date | null>(null);

  // Trip metadata
  const [distanceMiles, setDistanceMiles] = useState<number | null>(null);
  const [classification, setClassification] = useState<TripClassification>("unclassified");
  const [platformTag, setPlatformTag] = useState<PlatformTag | undefined>(undefined);
  const [businessPurpose, setBusinessPurpose] = useState<BusinessPurpose | undefined>(undefined);
  const [category, setCategory] = useState<TripCategory | undefined>(undefined);
  const [vehicleId, setVehicleId] = useState<string | undefined>(undefined);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  // Manual distance entry — fixes the dead-end where "enter distance manually"
  // was shown with no field to actually enter it (audit point 1).
  const [manualDistanceMode, setManualDistanceMode] = useState(false);
  const [manualDistanceText, setManualDistanceText] = useState("");
  const [notes, setNotes] = useState("");
  const [projectLabel, setProjectLabel] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // Smart suggestion
  const [suggestion, setSuggestion] = useState<ClassificationSuggestion | null>(null);
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  // One-tap recalculate
  const [recalculating, setRecalculating] = useState(false);

  // Post-save review card. Shown briefly after a manual trip is created
  // so the user gets a confident moment-of-completion view of what just
  // happened (distance, AMAP £, learned classification, provenance) —
  // before returning to the dashboard.
  const [reviewCard, setReviewCard] = useState<{
    tripId: string | null;
    distanceMiles: number;
    classification: TripClassification;
    autoClassified: boolean;
    learnedMatchCount: number | null;
    routeSourceLabel: string | null;
  } | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Timer for driving mode
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live location tracking
  const mapRef = useRef<any>(null);
  const [followUser, setFollowUser] = useState(true);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  // Breadcrumb trail (collected during driving mode)
  const breadcrumbsRef = useRef<Breadcrumb[]>([]);
  const [routeTrail, setRouteTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const [insights, setInsights] = useState<TripInsights | null>(null);
  // Per-trip confidence (only populated when loading an existing trip)
  const [confidence, setConfidence] = useState<{
    level: "high" | "medium" | "low";
    reasons: string[];
  } | null>(null);
  // Merge suggestion (server-flagged when a companion trip exists)
  const [mergeSuggestion, setMergeSuggestion] = useState<{
    otherTripId: string;
    direction: "before" | "after";
    gapMinutes: number;
    gapMeters: number;
  } | null>(null);
  const [merging, setMerging] = useState(false);
  // Split (inverse of merge): offered on tracked trips with enough
  // breadcrumbs for the server's dwell scan to work with.
  const [canSplit, setCanSplit] = useState(false);
  // Odometer (optional trust primitive).
  const [odometerOpen, setOdometerOpen] = useState(false);
  const [odometerStart, setOdometerStart] = useState("");
  const [odometerEnd, setOdometerEnd] = useState("");
  // Edit audit trail — "Edited <date>" when the trip has been changed.
  const [editedAt, setEditedAt] = useState<string | null>(null);
  // Clean Air Zone charges this trip likely incurred + which we've logged.
  const [cleanAirZones, setCleanAirZones] = useState<CazTripAssessment | null>(null);
  const [loggedCazZones, setLoggedCazZones] = useState<Set<string>>(new Set());
  const [loggingCaz, setLoggingCaz] = useState<string | null>(null);

  // Live stats during driving
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [liveDistance, setLiveDistance] = useState(0);
  const [currentArea, setCurrentArea] = useState<string | null>(null);
  const runningDistanceRef = useRef(0);
  const breadcrumbCountRef = useRef(0);
  const lastGeoTimestampRef = useRef(0);
  // Tracks the coordinates loaded from a saved trip so the OSRM auto-calc
  // useEffect can skip recalculating distance until the user actively changes
  // a location. Without this, opening a saved trip overwrites the real
  // breadcrumb-summed distance with a shorter point-to-point road route.
  const loadedCoordsRef = useRef<{
    startLat: number | null;
    startLng: number | null;
    endLat: number | null;
    endLng: number | null;
  } | null>(null);
  const [earningsPerMilePence, setEarningsPerMilePence] = useState<number | null>(null);

  // Speed-coloured driving trail segments
  const [drivingTrail, setDrivingTrail] = useState<{ latitude: number; longitude: number; speed: number }[]>([]);

  // Mode detection for business vs personal theming
  const { isPersonal, isWork } = useMode();

  // Anomaly detection
  const [anomalyDef, setAnomalyDef] = useState<TripAnomalyDef | null>(null);
  const [anomalyResponse, setAnomalyResponse] = useState<string | null>(null);
  const [anomalyCustomNote, setAnomalyCustomNote] = useState("");

  // Location-based community questions (multi-select)
  const [locationQuestions, setLocationQuestions] = useState<LocationQuestion[]>([]);
  const [locationResponses, setLocationResponses] = useState<Record<number, string[]>>({});
  const [locationCustomNotes, setLocationCustomNotes] = useState<Record<number, string>>({});

  // Celebration animations
  const celebHeaderAnim = useRef(new Animated.Value(0)).current;
  const celebStatsAnim = useRef(new Animated.Value(0)).current;
  const celebInsightsAnim = useRef(new Animated.Value(0)).current;
  const celebSlideAnim = useRef(new Animated.Value(20)).current;

  // Pre-trip community alerts and nudges
  const [communityAlerts, setCommunityAlerts] = useState<{ message: string; icon: string; color: string; severity: string }[]>([]);
  const [communityNudges, setCommunityNudges] = useState<string[]>([]);

  // Pulsing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Init: check for in-progress trip or load existing ────────────────────

  useEffect(() => {
    if (isEditing) return; // Editing loads separately
    (async () => {
      try {
        // Missed-journey prefill: drop straight into manual entry with the gap's
        // endpoints + times. No quick-trip resume / current-location lookup —
        // the start/end come from the proposal, and the start/end-change effect
        // recomputes the real road distance from the crow-flies endpoints.
        if (hasMissedPrefill) {
          const fLat = parseFloat(String(prefillFromLat));
          const fLng = parseFloat(String(prefillFromLng));
          const tLat = parseFloat(String(prefillToLat));
          const tLng = parseFloat(String(prefillToLng));
          if (Number.isFinite(fLat) && Number.isFinite(fLng)) {
            setStartLat(fLat);
            setStartLng(fLng);
            if (prefillFromAddress) setStartAddress(String(prefillFromAddress));
          }
          if (Number.isFinite(tLat) && Number.isFinite(tLng)) {
            setEndLat(tLat);
            setEndLng(tLng);
            if (prefillToAddress) setEndAddress(String(prefillToAddress));
          }
          const dep = prefillDepartedAt ? new Date(String(prefillDepartedAt)) : null;
          const arr = prefillArrivedAt ? new Date(String(prefillArrivedAt)) : null;
          if (dep && !Number.isNaN(dep.getTime())) setStartedAt(dep);
          if (arr && !Number.isNaN(arr.getTime())) setEndedAt(arr);
          setMode("manual");
          return; // finally sets loading=false
        }

        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = ?",
          [QUICK_TRIP_KEY]
        );

        // Resume guard: if the saved startedAt is absurdly old (> 12 hours),
        // the row is stale from a previous crashed/killed session. Clear it
        // and fall through to the fresh-start path below so the user does
        // not see a runaway timer like "5369:16" on a fresh drive.
        let resumeRow = row;
        if (resumeRow) {
          try {
            const saved: QuickTripStart = JSON.parse(resumeRow.value);
            const savedStartMs = new Date(saved.startedAt).getTime();
            const ageMs = Date.now() - savedStartMs;
            const MAX_QUICK_TRIP_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours
            if (!Number.isFinite(savedStartMs) || ageMs > MAX_QUICK_TRIP_AGE_MS || ageMs < 0) {
              await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [QUICK_TRIP_KEY]);
              // Also drop any orphaned background coordinates under the quick trip shift id
              await db.runAsync("DELETE FROM shift_coordinates WHERE shift_id = '__quick_trip__'").catch(() => {});
              await stopQuickTripTracking().catch(() => []);
              resumeRow = null;
            }
          } catch {
            // Malformed row - clear and start fresh
            await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [QUICK_TRIP_KEY]);
            resumeRow = null;
          }
        }

        if (resumeRow) {
          // Resume in-progress trip
          const saved: QuickTripStart = JSON.parse(resumeRow.value);
          setStartLat(saved.lat);
          setStartLng(saved.lng);
          setStartAddress(saved.address);
          setStartedAt(new Date(saved.startedAt));
          setMode("driving");
          // Re-start background tracking if it was killed
          startQuickTripTracking().catch(() => {});
          // Load any background coordinates already collected (e.g. from auto-detection transfer)
          peekBackgroundCoordinates().then((bgCoords) => {
            if (bgCoords.length >= 2) {
              const crumbs: Breadcrumb[] = bgCoords.map((c) => ({
                lat: c.lat,
                lng: c.lng,
                speed: c.speed,
                accuracy: c.accuracy,
                recordedAt: c.recorded_at,
              }));
              breadcrumbsRef.current = crumbs;

              // Safety re-anchor: if the earliest background coordinate is
              // significantly more recent than the saved startedAt (e.g.
              // promoteDetectionToQuickTrip used a stale detection buffer
              // entry that slipped past the 30-min purge), trust the GPS
              // data over the saved value. The first real movement is the
              // true trip start.
              const savedStartMs = new Date(saved.startedAt).getTime();
              const firstCoordMs = new Date(crumbs[0].recordedAt).getTime();
              if (
                Number.isFinite(firstCoordMs) &&
                firstCoordMs > savedStartMs &&
                firstCoordMs - savedStartMs > 10 * 60 * 1000
              ) {
                setStartedAt(new Date(firstCoordMs));
                // Also persist the corrected startedAt so a future resume
                // does not rediscover the old stale value.
                db.runAsync(
                  "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
                  [
                    QUICK_TRIP_KEY,
                    JSON.stringify({ ...saved, startedAt: new Date(firstCoordMs).toISOString() }),
                  ]
                ).catch(() => {});
              }

              let totalDist = 0;
              for (let i = 1; i < crumbs.length; i++) {
                totalDist += haversineDistance(crumbs[i - 1].lat, crumbs[i - 1].lng, crumbs[i].lat, crumbs[i].lng);
              }
              runningDistanceRef.current = totalDist;
              setLiveDistance(Math.round(totalDist * 100) / 100);
              setRouteTrail(crumbs.map((c) => ({ latitude: c.lat, longitude: c.lng })));
              setDrivingTrail(crumbs.map((c) => ({
                latitude: c.lat,
                longitude: c.lng,
                speed: Math.max(0, Math.round((c.speed ?? 0) * 2.23694)),
              })));
              const latest = crumbs[crumbs.length - 1];
              setUserLat(latest.lat);
              setUserLng(latest.lng);
            }
          }).catch(() => {});
        } else {
          // Get current location for the ready state map
          const loc = await getCurrentLocation();
          if (loc) {
            setStartLat(loc.lat);
            setStartLng(loc.lng);
            setStartAddress(loc.address);
          }
        }
      } catch {
        // Start fresh
      } finally {
        setLoading(false);
      }
    })();
    // Prefill params are route params — stable for the screen's lifetime, so
    // listing them never re-runs this mount-time init.
  }, [
    isEditing,
    hasMissedPrefill,
    prefillFromLat,
    prefillFromLng,
    prefillFromAddress,
    prefillToLat,
    prefillToLng,
    prefillToAddress,
    prefillDepartedAt,
    prefillArrivedAt,
  ]);

  // Load existing trip for editing
  useEffect(() => {
    if (!id) return;
    const populateTrip = (t: {
      classification: string; platformTag?: string | null; businessPurpose?: string | null;
      category?: string | null; vehicleId?: string | null;
      startAddress?: string | null; endAddress?: string | null;
      startLat: number; startLng: number; endLat?: number | null; endLng?: number | null;
      distanceMiles: number; startedAt: string; endedAt?: string | null; notes?: string | null;
      projectLabel?: string | null;
      insights?: TripInsights | null;
      confidence?: { level: "high" | "medium" | "low"; reasons: string[] } | null;
      mergeSuggestion?: {
        otherTripId: string;
        direction: "before" | "after";
        gapMinutes: number;
        gapMeters: number;
      } | null;
      cleanAirZones?: CazTripAssessment | null;
      isManualEntry?: boolean;
      coordinates?: unknown[];
    }) => {
      setClassification(t.classification as TripClassification);
      setPlatformTag((t.platformTag ?? undefined) as PlatformTag | undefined);
      setBusinessPurpose((t.businessPurpose ?? undefined) as BusinessPurpose | undefined);
      setCategory((t.category ?? undefined) as TripCategory | undefined);
      setVehicleId(t.vehicleId ?? undefined);
      setStartAddress(t.startAddress ?? null);
      setEndAddress(t.endAddress ?? null);
      setStartLat(t.startLat);
      setStartLng(t.startLng);
      setEndLat(t.endLat ?? null);
      setEndLng(t.endLng ?? null);
      loadedCoordsRef.current = {
        startLat: t.startLat,
        startLng: t.startLng,
        endLat: t.endLat ?? null,
        endLng: t.endLng ?? null,
      };
      setDistanceMiles(t.distanceMiles);
      setStartedAt(new Date(t.startedAt));
      setEndedAt(t.endedAt ? new Date(t.endedAt) : null);
      setNotes(t.notes ?? "");
      setProjectLabel(t.projectLabel ?? "");
      if (t.insights) setInsights(t.insights);
      if (t.confidence) setConfidence(t.confidence);
      if (t.mergeSuggestion) setMergeSuggestion(t.mergeSuggestion);
      if (t.cleanAirZones) setCleanAirZones(t.cleanAirZones);
      // Only the server payload carries these; the local-SQLite fallback
      // doesn't, so canSplit stays false offline (split needs the API anyway).
      setCanSplit(t.isManualEntry === false && (t.coordinates?.length ?? 0) >= 10);
      const od = t as { odometerStart?: number | null; odometerEnd?: number | null; updatedAt?: string; createdAt?: string };
      if (od.odometerStart != null) { setOdometerStart(String(od.odometerStart)); setOdometerOpen(true); }
      if (od.odometerEnd != null) { setOdometerEnd(String(od.odometerEnd)); setOdometerOpen(true); }
      // Show "edited" only when updatedAt is meaningfully after createdAt.
      if (od.updatedAt && od.createdAt && new Date(od.updatedAt).getTime() - new Date(od.createdAt).getTime() > 60_000) {
        setEditedAt(od.updatedAt);
      }
    };

    fetchTrip(id)
      .then((res) => populateTrip(res.data))
      .catch(async () => {
        const local = await getLocalTrip(id);
        if (local) populateTrip(local);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch community alerts and nudges for the ready state
  useEffect(() => {
    if (isEditing || !startLat || !startLng) return;
    fetchCommunityInsights(startLat, startLng)
      .then((res) => {
        const d = res.data;
        const alerts: typeof communityAlerts = [];
        const nudges: string[] = [];

        // Road condition alerts (severity-based, with place names)
        for (const a of d.nearbyAnomalies.slice(0, 3)) {
          if (a.severity !== "high" && a.severity !== "medium") continue;
          const reason = a.topReasons?.[0] ?? a.response;
          const location = a.placeName ?? `${a.distanceMiles} mi away`;
          const count = a.reportCount > 1 ? `${a.reportCount} drivers reported ` : "";
          const severityColors: Record<string, string> = { high: RED, medium: "#f59e0b" };
          const icons: Record<string, string> = {
            "Heavy traffic": "car-outline",
            "Traffic jam": "car-outline",
            "Roadworks": "construct-outline",
            "Accident or breakdown": "warning-outline",
            "Road closure/diversion": "close-circle-outline",
            "School traffic": "school-outline",
            "Weather conditions": "rainy-outline",
          };
          alerts.push({
            message: `${count}${reason.toLowerCase()} near ${location}`,
            icon: icons[reason] ?? "alert-circle-outline",
            color: severityColors[a.severity ?? "low"] ?? AMBER,
            severity: a.severity ?? "low",
          });
        }
        setCommunityAlerts(alerts);

        // Info nudges (non-alert, helpful tips)
        if (d.bestPlatformNearby && isWork) {
          const best = d.areaEarnings.find((e) => e.platform === d.bestPlatformNearby);
          if (best) {
            const rate = (best.earningsPerMilePence / 100).toFixed(2);
            nudges.push(`${best.platform.charAt(0).toUpperCase() + best.platform.slice(1)} drivers earn ~\u00A3${rate}/mi nearby`);
          }
        }
        if (d.bestTimeNearby && isWork) {
          nudges.push(`Busiest time nearby: ${d.bestTimeNearby}`);
        }
        if (d.fuelTipNearby) {
          nudges.push(`Cheapest fuel: ${d.fuelTipNearby}`);
        }
        setCommunityNudges(nudges.slice(0, 3));
      })
      .catch(() => {});
  }, [startLat, startLng, isEditing, isWork]);

  // Fetch earnings/mile for business mode live stats
  useEffect(() => {
    if (isWork && !isEditing) {
      fetchBusinessInsights()
        .then((res) => {
          if (res.data?.earningsPerMilePence) {
            setEarningsPerMilePence(res.data.earningsPerMilePence);
          }
        })
        .catch(() => {});
    }
  }, [isWork, isEditing]);

  // Load vehicles
  useEffect(() => {
    fetchVehicles()
      .then((res) => {
        setVehicles(res.data);
        if (!id) {
          const primary = res.data.find((v) => v.isPrimary);
          if (primary) setVehicleId(primary.id);
        }
      })
      .catch(() => {});
  }, [id]);

  // Auto-calculate distance via the server-side routing service.
  // Cache → GraphHopper → Google. Never silently falls back to crow-flies
  // (the bug Laura reported 10 May 2026). When all engines fail, we
  // surface "couldn't calculate" so the user knows to enter manually
  // rather than seeing a wrong number.
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeSource, setRouteSource] = useState<RouteDistanceResult["source"] | null>(null);
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  useEffect(() => {
    if (startLat == null || startLng == null || endLat == null || endLng == null) return;
    // In driving/arrived modes, distance is tracked via GPS breadcrumbs
    if (mode === "driving" || mode === "arrived") return;
    // When opening a saved trip, the loaded distance came from the original
    // GPS breadcrumb trail and is more accurate than a point-to-point road
    // route. Only recalc if the user has actually changed start or end coords.
    const loaded = loadedCoordsRef.current;
    if (
      loaded &&
      loaded.startLat === startLat &&
      loaded.startLng === startLng &&
      loaded.endLat === endLat &&
      loaded.endLng === endLng
    ) {
      return;
    }
    let cancelled = false;
    setCalculatingRoute(true);
    setRouteUnavailable(false);
    setRouteSource(null);
    fetchServerRouteDistance({ startLat, startLng, endLat, endLng })
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setDistanceMiles(result.distanceMiles);
          setRouteSource(result.source);
        } else {
          // Routing unavailable. Don't invent a haversine number — let the
          // user see "couldn't calculate" and enter the distance manually
          // if they want to. Honest friction beats silent under-counting.
          setDistanceMiles(null);
          setRouteUnavailable(true);
        }
      })
      .finally(() => { if (!cancelled) setCalculatingRoute(false); });
    return () => { cancelled = true; };
  }, [startLat, startLng, endLat, endLng, mode]);

  // ── Driving state: timer + location watch ────────────────────────────────

  useEffect(() => {
    if (mode === "driving" && startedAt) {
      const update = () => setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
      update();
      timerRef.current = setInterval(update, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode, startedAt]);

  useEffect(() => {
    if (mode !== "driving") return;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 },
          (loc) => {
            const { latitude, longitude, speed, accuracy } = loc.coords;
            setUserLat(latitude);
            setUserLng(longitude);

            // Live speed in mph
            const mph = Math.round((speed ?? 0) * 2.23694);
            setLiveSpeed(Math.max(0, mph));

            // Store breadcrumb with speed for trip insights
            const crumbs = breadcrumbsRef.current;
            const crumb: Breadcrumb = {
              lat: latitude,
              lng: longitude,
              speed: speed ?? null,
              accuracy: accuracy ?? null,
              recordedAt: new Date(loc.timestamp).toISOString(),
            };
            crumbs.push(crumb);

            // Accumulate running distance
            if (crumbs.length >= 2) {
              const prev = crumbs[crumbs.length - 2];
              const segDist = haversineDistance(prev.lat, prev.lng, latitude, longitude);
              runningDistanceRef.current += segDist;
            }
            breadcrumbCountRef.current++;

            // Update live distance state every 3rd point to avoid excessive rerenders
            if (breadcrumbCountRef.current % 3 === 0 || crumbs.length <= 2) {
              const dist = Math.round(runningDistanceRef.current * 100) / 100;
              setLiveDistance(dist);

              // Update Dynamic Island. Enrich with TODAY mileage + milestone
              // proximity from local SQLite — getLiveActivityContext is
              // 60s-cached so this isn't a hot-path concern.
              getLiveActivityContext({ currentTripMiles: dist })
                .then((ctx) => {
                  updateLiveActivity({
                    distanceMiles: dist,
                    speedMph: mph,
                    dailyTotalMiles: ctx.dailyTotalMiles,
                    milestoneText: ctx.milestoneText,
                  });
                })
                .catch(() => {
                  // Fall back to the basic update if context lookup fails.
                  updateLiveActivity({ distanceMiles: dist, speedMph: mph });
                });
            }

            // Build speed-coloured trail point
            setDrivingTrail((prev) => [...prev, { latitude, longitude, speed: mph }]);

            // Reverse geocode for personal mode area name (throttled to every 30s)
            const now = Date.now();
            if (now - lastGeoTimestampRef.current > 30000) {
              lastGeoTimestampRef.current = now;
              reverseGeocode(latitude, longitude)
                .then((addr) => {
                  if (addr) {
                    // Extract area name (town/city) from address
                    const parts = addr.split(",").map((p) => p.trim());
                    setCurrentArea(parts.length >= 2 ? parts[parts.length - 2] : parts[0]);
                  }
                })
                .catch(() => {});
            }

            if (followUser && mapRef.current) {
              mapRef.current.animateToRegion(
                { latitude, longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 },
                500
              );
            }
          }
        );
        locationSubRef.current = sub;
      } catch {}
    })();
    return () => { if (sub) sub.remove(); locationSubRef.current = null; };
  }, [mode, followUser]);

  // Sync live distance from background coordinates when returning from another app
  // (e.g. user was using Google Maps / Waze as SatNav)
  useEffect(() => {
    if (mode !== "driving") return;
    const handleAppState = async (nextState: string) => {
      if (nextState !== "active") return;
      try {
        const bgCoords = await peekBackgroundCoordinates();
        if (bgCoords.length < 2) return;

        // Merge background coords into breadcrumbs and recalculate distance
        const fgCrumbs = breadcrumbsRef.current;
        const bgCrumbs = bgCoords.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          speed: c.speed,
          accuracy: c.accuracy,
          recordedAt: c.recorded_at,
        }));
        const allPoints = [...fgCrumbs, ...bgCrumbs];
        allPoints.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
        // Deduplicate points within 2 seconds
        const merged: typeof allPoints = [];
        for (const p of allPoints) {
          const t = new Date(p.recordedAt).getTime();
          if (merged.length === 0 || t - new Date(merged[merged.length - 1].recordedAt).getTime() > 2000) {
            merged.push(p);
          }
        }
        breadcrumbsRef.current = merged;

        // Recalculate running distance from full merged trail
        let totalDist = 0;
        for (let i = 1; i < merged.length; i++) {
          totalDist += haversineDistance(
            merged[i - 1].lat, merged[i - 1].lng,
            merged[i].lat, merged[i].lng
          );
        }
        runningDistanceRef.current = totalDist;
        setLiveDistance(Math.round(totalDist * 100) / 100);

        // Update map position to latest known location
        const latest = merged[merged.length - 1];
        setUserLat(latest.lat);
        setUserLng(latest.lng);

        // Rebuild map trail from merged points
        setDrivingTrail(merged.map((c) => ({
          latitude: c.lat,
          longitude: c.lng,
          speed: c.speed != null ? Math.round(c.speed * 2.23694) : 0,
        })));
      } catch {
        // Non-critical - foreground watcher will resume
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [mode]);

  // Pulsing live dot
  useEffect(() => {
    if (mode !== "driving") return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [mode, pulseAnim]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const formatTimer = (secs: number): string => {
    const safeSecs = Math.max(0, Math.floor(secs));
    const h = Math.floor(safeSecs / 3600);
    const m = Math.floor((safeSecs % 3600) / 60);
    const s = safeSecs % 60;
    if (h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleStartTrip = useCallback(async (skipChecks = false) => {
    // Two-recordings guard (audit point 9): don't start a manual trip while a
    // real shift is already recording — that's two trackers writing at once.
    if (!skipChecks) {
      try {
        const db = await getDatabase();
        const shiftRow = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = 'active_shift_id'"
        );
        const sid = shiftRow?.value;
        if (sid && sid !== "__quick_trip__") {
          Alert.alert(
            "A shift is already recording",
            "You've got a shift running. Starting a trip now would record two journeys at once. End the shift first, or start anyway?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Start anyway", onPress: () => handleStartTrip(true) },
            ]
          );
          return;
        }
      } catch {
        // best-effort guard — never block a legitimate start on a read error
      }
    }

    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        Alert.alert("Location unavailable", "Couldn't read your current location. Check GPS permissions.");
        setLoading(false);
        return;
      }
      const now = new Date();
      setStartLat(loc.lat);
      setStartLng(loc.lng);
      setStartAddress(loc.address);
      setStartedAt(now);
      breadcrumbsRef.current = [];
      setInsights(null);
      setLiveSpeed(0);
      setLiveDistance(0);
      setCurrentArea(null);
      runningDistanceRef.current = 0;
      breadcrumbCountRef.current = 0;
      setDrivingTrail([]);
      setAnomalyDef(null);
      setAnomalyResponse(null);
      setAnomalyCustomNote("");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMode("driving");

      const db = await getDatabase();
      // Clear any leftover quick-trip background coordinates from a previous
      // session. If a prior trip crashed or was force-killed, its shift_coordinates
      // rows can persist and would otherwise be attributed to this fresh trip,
      // inflating the distance and distorting the start point.
      await db.runAsync(
        "DELETE FROM shift_coordinates WHERE shift_id = '__quick_trip__'"
      ).catch(() => {});

      const tripStart: QuickTripStart = { lat: loc.lat, lng: loc.lng, address: loc.address, startedAt: now.toISOString() };
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
        [QUICK_TRIP_KEY, JSON.stringify(tripStart)]
      );

      // Start background location tracking so GPS continues when app is backgrounded
      startQuickTripTracking().catch(() => {});

      // Start Dynamic Island live activity
      startLiveActivity({ activityType: "trip", isBusinessMode: isWork });
    } catch {
      Alert.alert("Couldn't get your location", "Check that location is enabled and try again.");
    } finally {
      setLoading(false);
    }
  }, [isWork]);

  const handleArrived = useCallback(async () => {
    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        Alert.alert("Location unavailable", "Couldn't read your current location. Check GPS and try again.");
        setLoading(false);
        return;
      }
      setEndLat(loc.lat);
      setEndLng(loc.lng);
      setEndAddress(loc.address);
      const now = new Date();
      setEndedAt(now);

      // Stop background tracking and retrieve background GPS coordinates
      const bgCoords = await stopQuickTripTracking().catch(() => []);

      // Merge foreground breadcrumbs with background coordinates for a complete trail.
      // Foreground gives high-res points while app is active (10m/3s intervals).
      // Background fills gaps when app was backgrounded (50m intervals).
      const fgCrumbs = breadcrumbsRef.current;
      const bgCrumbs = bgCoords.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        speed: c.speed,
        accuracy: c.accuracy,
        recordedAt: c.recorded_at,
      }));
      const allPoints = [...fgCrumbs, ...bgCrumbs];
      allPoints.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
      // Deduplicate points within 2 seconds of each other
      const crumbs: typeof allPoints = [];
      for (const p of allPoints) {
        const t = new Date(p.recordedAt).getTime();
        if (crumbs.length === 0 || t - new Date(crumbs[crumbs.length - 1].recordedAt).getTime() > 2000) {
          crumbs.push(p);
        }
      }
      breadcrumbsRef.current = crumbs;

      // Calculate distance from merged breadcrumb trail. Where a GPS gap left
      // a long straight chord between consecutive points (app backgrounded /
      // suspended, subscription stopped delivering), the chord undercounts the
      // real winding-road distance. Fill those gaps with the road route via
      // GraphHopper (server, cached) so the saved mileage is accurate
      // immediately - not only after the server's async full-trace map-match
      // lands. Offline-safe: a failed lookup falls back to the chord, and we
      // never use a routed distance shorter than what GPS already proved.
      let trailDistance = 0;
      let gapsFilled = 0;
      if (crumbs.length >= 2) {
        for (let i = 1; i < crumbs.length; i++) {
          const prev = crumbs[i - 1];
          const cur = crumbs[i];
          const seg = haversineDistance(prev.lat, prev.lng, cur.lat, cur.lng);
          if (seg >= GAP_FILL_THRESHOLD_MILES && gapsFilled < MAX_GAP_FILLS) {
            const routed = await fetchServerRouteDistance({
              startLat: prev.lat,
              startLng: prev.lng,
              endLat: cur.lat,
              endLng: cur.lng,
            }).catch(() => null);
            if (routed && routed.distanceMiles >= seg && routed.routeToHaversineRatio <= 5) {
              trailDistance += routed.distanceMiles;
              gapsFilled++;
            } else {
              trailDistance += seg;
            }
          } else {
            trailDistance += seg;
          }
        }
      }
      // Fall back to straight-line if trail is too short
      const finalDistance = trailDistance > 0.05
        ? Math.round(trailDistance * 100) / 100
        : (startLat != null && startLng != null
          ? Math.round(haversineDistance(startLat, startLng, loc.lat, loc.lng) * 100) / 100
          : null);
      setDistanceMiles(finalDistance);

      // Compute trip insights
      const durationSecs = startedAt ? Math.round((now.getTime() - startedAt.getTime()) / 1000) : 0;
      if (finalDistance != null) {
        const tripInsights = computeInsights(crumbs, finalDistance, durationSecs);
        setInsights(tripInsights);
      }

      // Snapshot merged trail for the arrived map polyline
      if (crumbs.length >= 2) {
        setRouteTrail(crumbs.map((c) => ({ latitude: c.lat, longitude: c.lng })));
      }

      // Detect anomalies for the arrived screen
      if (finalDistance != null) {
        const tripInsightsForAnomaly = computeInsights(crumbs, finalDistance, durationSecs);
        const anomalies = detectAnomalies(finalDistance, durationSecs, tripInsightsForAnomaly);
        if (anomalies.length > 0) {
          setAnomalyDef(anomalies[0]);
        }

        // Detect slow zones & stops for community intelligence
        const avgMph = durationSecs > 0 ? (finalDistance / durationSecs) * 3600 : 0;
        const zones = detectSlowZones(crumbs, avgMph);
        if (zones.length > 0) {
          const questions = buildLocationQuestions(zones);
          setLocationQuestions(questions);
          // Async reverse geocode each zone (fire-and-forget, updates UI as names arrive)
          questions.forEach((q, idx) => {
            reverseGeocode(q.lat, q.lng).then((name) => {
              if (name) {
                setLocationQuestions((prev) =>
                  prev.map((pq, pi) => pi === idx ? setLocationQuestionPlace(pq, name) : pq)
                );
              }
            }).catch(() => {});
          });
        }
      }

      // Haptic feedback on arrival
      if (Haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      // End Dynamic Island live activity with summary
      endLiveActivityWithSummary({ distanceMiles: runningDistanceRef.current });

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMode("arrived");

      // Smart classification suggestion. Prefer pair-based matching
      // (start + end coords) when both endpoints are known — much more
      // confident than single-point because A→B uniquely identifies a
      // route. Falls back to single-point on the end location otherwise.
      if (loc.lat && loc.lng) {
        const promise =
          startLat != null && startLng != null
            ? fetchClassificationSuggestionForPair({
                startLat,
                startLng,
                endLat: loc.lat,
                endLng: loc.lng,
              })
            : fetchClassificationSuggestion(loc.lat, loc.lng, "end");

        promise
          .then((res) => {
            if (res.suggestion) {
              setSuggestion(res.suggestion);
              // Auto-apply suggestion (user can override)
              setClassification(res.suggestion.classification);
              if (res.suggestion.platformTag) setPlatformTag(res.suggestion.platformTag as PlatformTag);
              if (res.suggestion.businessPurpose) setBusinessPurpose(res.suggestion.businessPurpose as BusinessPurpose);
              if (res.suggestion.category) setCategory(res.suggestion.category as TripCategory);
              setSuggestionApplied(true);
            }
          })
          .catch(() => {}); // Suggestion is best-effort
      }

      // Trigger celebration animations
      celebHeaderAnim.setValue(0);
      celebStatsAnim.setValue(0);
      celebInsightsAnim.setValue(0);
      celebSlideAnim.setValue(20);
      Animated.stagger(100, [
        Animated.parallel([
          Animated.timing(celebHeaderAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(celebSlideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(celebStatsAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(celebInsightsAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } catch {
      Alert.alert("Couldn't get your location", "Check that location is enabled and try again.");
    } finally {
      setLoading(false);
    }
  }, [startLat, startLng, startedAt, celebHeaderAnim, celebStatsAnim, celebInsightsAnim, celebSlideAnim]);

  const handleRecenter = useCallback(() => {
    setFollowUser(true);
    const lat = userLat ?? startLat;
    const lng = userLng ?? startLng;
    if (lat != null && lng != null && mapRef.current) {
      mapRef.current.animateToRegion(
        { latitude: lat, longitude: lng, latitudeDelta: 0.008, longitudeDelta: 0.008 },
        400
      );
    }
  }, [userLat, userLng, startLat, startLng]);

  const handleSwitchToManual = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode("manual");
  }, []);

  const handleSwitchToQuick = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode("ready");
  }, []);

  /**
   * Accept the server's merge suggestion. Routes through the existing
   * /trips/merge endpoint with this trip + the companion. Returns the
   * user to the previous screen on success — the merged trip lives at
   * a new ID, so we don't try to re-fetch.
   */
  const handleAcceptMerge = useCallback(async (otherTripId: string) => {
    if (!id || merging) return;
    Alert.alert(
      "Merge trips",
      "Combine these two into a single trip? The original two will be replaced by the merged trip. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Merge",
          style: "default",
          onPress: async () => {
            setMerging(true);
            try {
              await mergeTrips({
                tripIds: [id, otherTripId],
                classification,
                platformTag: platformTag ?? null,
              });
              router.back();
            } catch (err) {
              Alert.alert(
                "Couldn't merge",
                err instanceof Error ? err.message : "Try again."
              );
              setMerging(false);
            }
          },
        },
      ]
    );
  }, [id, merging, classification, platformTag, router]);

  /**
   * Log a Clean Air Zone / ULEZ daily charge as a deductible expense. Files it
   * under the existing "congestion" category (SA103S box 17), dated to the
   * trip, against this vehicle, so it flows into the user's tax tooling.
   */
  const handleLogCazCharge = useCallback(
    async (charge: { zoneId: string; name: string; chargePence: number }) => {
      if (loggingCaz) return;
      setLoggingCaz(charge.zoneId);
      try {
        await createExpense({
          category: "congestion",
          amountPence: charge.chargePence,
          date: (startedAt ?? new Date()).toISOString().slice(0, 10),
          vehicleId: vehicleId ?? undefined,
          description: `${charge.name} daily charge`,
          notes: "Logged from a recorded trip that entered the zone.",
        });
        setLoggedCazZones((prev) => new Set(prev).add(charge.zoneId));
        haptic("success");
      } catch (err) {
        const { title, message } = describeError(err, "Couldn't log the charge");
        Alert.alert(title, message);
      } finally {
        setLoggingCaz(null);
      }
    },
    [loggingCaz, startedAt, vehicleId]
  );

  /**
   * One-tap recalculate. Asks the server to re-run the routing service
   * (or map-matcher for tracked trips) against the trip's coords. Server
   * returns whether anything changed; we update local state + show a
   * toast either way so the user gets feedback.
   */
  const handleRecalculate = useCallback(async (tripId: string) => {
    setRecalculating(true);
    try {
      const res = await recalculateTrip(tripId);
      const result = res.data;
      if (result.changed) {
        setDistanceMiles(result.newMiles);
        const sourceLabel =
          result.source === "map_match"
            ? "Map-matched against road segments"
            : result.source === "routing"
            ? "Calculated via road routing"
            : "Updated";
        Alert.alert(
          "Distance updated",
          `${result.oldMiles.toFixed(2)} mi → ${result.newMiles.toFixed(2)} mi\n${sourceLabel}.`
        );
      } else {
        Alert.alert(
          "Already accurate",
          "This trip's distance already matches the road-routed value. No change needed."
        );
      }
    } catch (err) {
      Alert.alert(
        "Couldn't recalculate",
        err instanceof Error ? err.message : "Try again."
      );
    } finally {
      setRecalculating(false);
    }
  }, []);

  const handleSave = useCallback(async (skipGuards = false) => {
    if (startLat == null || startLng == null) {
      Alert.alert("Missing location", "Set a start location.");
      return;
    }

    // ── Mistake guards (gentle confirms, never hard blocks) — audit point 9.
    // Only on new trips; an edit shouldn't re-nag. Re-runs the save with
    // skipGuards once the user confirms.
    if (!skipGuards && !isEditing) {
      if (distanceMiles == null || distanceMiles <= 0) {
        Alert.alert(
          "This trip has no distance",
          "It'll be saved with 0 miles. Add a distance, or save it anyway?",
          [
            { text: "Add distance", style: "cancel" },
            { text: "Save anyway", onPress: () => handleSave(true) },
          ]
        );
        return;
      }
      // No vehicle — only nag if the user actually HAS vehicles to pick from.
      if (!vehicleId && vehicles.length > 0) {
        Alert.alert(
          "No vehicle selected",
          "This trip won't be linked to a vehicle, so it won't count towards that vehicle's mileage. Pick one, or save without?",
          [
            { text: "Pick vehicle", style: "cancel" },
            { text: "Save without", onPress: () => handleSave(true) },
          ]
        );
        return;
      }
      // GPS-vs-odometer mismatch — if both odometer readings are present and
      // the odometer distance disagrees materially with the recorded distance,
      // flag it so a typo or a wrong figure doesn't go in unnoticed.
      const odoStart = parseFloat(odometerStart);
      const odoEnd = parseFloat(odometerEnd);
      if (
        odometerStart.trim() && odometerEnd.trim() &&
        Number.isFinite(odoStart) && Number.isFinite(odoEnd) && odoEnd > odoStart &&
        distanceMiles != null && distanceMiles > 0
      ) {
        const odoMiles = odoEnd - odoStart;
        const tolerance = Math.max(2, distanceMiles * 0.2);
        if (Math.abs(odoMiles - distanceMiles) > tolerance) {
          Alert.alert(
            "Odometer doesn't match the distance",
            `Your odometer shows ${odoMiles.toFixed(1)} miles but the trip distance is ${distanceMiles.toFixed(1)}. Check the readings, or save anyway?`,
            [
              { text: "Check", style: "cancel" },
              { text: "Save anyway", onPress: () => handleSave(true) },
            ]
          );
          return;
        }
      }
    }

    setSaving(true);
    let createdTripId: string | null = null;
    let createLearnedSuggestion: ClassificationSuggestion | null = null;
    let createAutoApplied = false;
    try {
      if (isEditing) {
        await syncUpdateTrip(id!, {
          classification,
          platformTag: platformTag ?? null,
          businessPurpose: businessPurpose ?? null,
          category: category ?? null,
          notes: notes.trim() || null,
          projectLabel: projectLabel.trim() || null,
          endAddress: endAddress ?? null,
          endLat: endLat ?? null,
          endLng: endLng ?? null,
          endedAt: endedAt ? endedAt.toISOString() : null,
          // Allow correcting a wrong vehicle — was never sent, so the picker in
          // edit mode did nothing on save (audit point 5).
          vehicleId: vehicleId ?? null,
          odometerStart: odometerStart.trim() ? parseFloat(odometerStart) : null,
          odometerEnd: odometerEnd.trim() ? parseFloat(odometerEnd) : null,
        });
        // Clear "Classify Trip" CTA from any running Live Activity
        if (classification !== "unclassified") {
          markLiveActivityClassified().catch(() => {});
        }
      } else {
        // Include breadcrumb trail if we have one (from quick trip driving mode)
        const crumbs = breadcrumbsRef.current;
        const coords = crumbs.length >= 2
          ? crumbs.map((c) => ({
              lat: c.lat,
              lng: c.lng,
              speed: c.speed,
              accuracy: c.accuracy,
              recordedAt: c.recordedAt,
            }))
          : undefined;

        const data: CreateTripData = {
          startLat,
          startLng,
          startedAt: startedAt.toISOString(),
          classification,
          ...(endLat != null && endLng != null && { endLat, endLng }),
          ...(distanceMiles != null && { distanceMiles }),
          ...(startAddress && { startAddress }),
          ...(endAddress && { endAddress }),
          ...(endedAt && { endedAt: endedAt.toISOString() }),
          ...(platformTag && { platformTag }),
          ...(businessPurpose && { businessPurpose }),
          ...(category && { category }),
          ...(notes.trim() && { notes: notes.trim() }),
          ...(projectLabel.trim() && { projectLabel: projectLabel.trim() }),
          ...(vehicleId && { vehicleId }),
          ...(coords && { coordinates: coords }),
          ...(odometerStart.trim() && { odometerStart: parseFloat(odometerStart) }),
          ...(odometerEnd.trim() && { odometerEnd: parseFloat(odometerEnd) }),
        };
        const tripResult = await syncCreateTrip(data);
        haptic("success");
        createdTripId = tripResult?.data?.id ?? null;
        // Trip came from a "missed journey" proposal — mark it accepted so the
        // scanner stops surfacing it. Best-effort; the trip is already saved.
        if (missedId) {
          resolveMissedJourney(String(missedId), "accept").catch(() => {});
        }
        // Server returns the learned suggestion + autoApplied flag in
        // the create response when pattern-learning auto-classified the
        // trip. Used to power the "Auto-classified as Work — based on
        // 5 similar trips" line on the review card.
        const ls = (tripResult as unknown as {
          learnedSuggestion?: (ClassificationSuggestion & { autoApplied?: boolean }) | null;
        })?.learnedSuggestion;
        if (ls) {
          createLearnedSuggestion = ls;
          createAutoApplied = ls.autoApplied === true;
        }

        // Submit anomaly response if user answered one
        if (anomalyDef && anomalyResponse && tripResult?.data?.id) {
          submitTripAnomaly(tripResult.data.id, {
            type: anomalyDef.type,
            response: anomalyResponse,
            customNote: anomalyResponse === "Other" ? anomalyCustomNote || null : null,
          }).catch(() => {});
        }

        // Submit location question responses (community intelligence)
        if (tripResult?.data?.id) {
          for (let i = 0; i < locationQuestions.length; i++) {
            const responses = locationResponses[i];
            if (responses && responses.length > 0) {
              const q = locationQuestions[i];
              submitTripAnomaly(tripResult.data.id, {
                type: q.type,
                response: responses.join(", "),
                customNote: responses.includes("Other") ? locationCustomNotes[i] || null : null,
                lat: q.lat,
                lng: q.lng,
                placeName: q.placeName,
              }).catch(() => {});
            }
          }
        }

        // Clear persisted quick trip state
        const db = await getDatabase();
        await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [QUICK_TRIP_KEY]);
      }

      // Reset detection cooldown so the next drive triggers a notification promptly
      clearDetectionCooldown().catch(() => {});

      // Store trip info for the post-trip dashboard card AND the persistent
      // dashboard status strip (survives restarts via tracking_state).
      recordLastSavedTrip({
        distanceMiles: distanceMiles ?? 0,
        startAddress: startAddress ?? null,
        endAddress: endAddress ?? null,
        savedAt: Date.now(),
        tripId: createdTripId,
        source: "manual",
      }).catch(() => {});

      // Permission-after-value: the user just watched a trip get captured —
      // the strongest possible moment to offer Always-location ("make it
      // automatic"). When shown it wins over the rating prompt for this save;
      // the rating system has plenty of other triggers.
      if (!isEditing) {
        maybeOfferAlwaysAfterCapture(distanceMiles ?? null)
          .then((shown) => {
            if (!shown) setTimeout(() => maybeRequestReview("trip_saved"), 2000);
          })
          .catch(() => setTimeout(() => maybeRequestReview("trip_saved"), 2000));
      } else {
        // Rating prompt (fire-and-forget, 2s delay)
        setTimeout(() => maybeRequestReview("trip_saved"), 2000);
      }

      // One-time notification permission nudge for users who skipped onboarding
      askNotificationPermissionOnce().catch(() => {});

      // Paywall after 5th trip (new trips only, once ever)
      if (!isEditing) {
        try {
          const db2 = await getDatabase();
          const shown = await db2.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = 'paywall_5th_trip_shown'"
          );
          if (!shown) {
            const countRow = await db2.getFirstAsync<{ count: number }>(
              "SELECT COUNT(*) as count FROM trips"
            );
            if (countRow && countRow.count >= 5) {
              await db2.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('paywall_5th_trip_shown', 'true')"
              );
              setTimeout(() => showPaywall("5th_trip"), 1500);
            }
          }
        } catch {}
      }

      // Challenge progress tracking (new trips only)
      if (!isEditing) {
        try {
          const db3 = await getDatabase();
          const challengeStart = await db3.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = 'challenge_start_date'"
          );
          const challengeComplete = await db3.getFirstAsync<{ value: string }>(
            "SELECT value FROM tracking_state WHERE key = 'challenge_complete'"
          );
          if (challengeStart && !challengeComplete) {
            const today = new Date().toISOString().slice(0, 10);
            const lastTracked = await db3.getFirstAsync<{ value: string }>(
              "SELECT value FROM tracking_state WHERE key = 'challenge_last_tracked_date'"
            );
            const daysRow = await db3.getFirstAsync<{ value: string }>(
              "SELECT value FROM tracking_state WHERE key = 'challenge_days_completed'"
            );
            let days = daysRow ? parseInt(daysRow.value, 10) : 0;

            if (lastTracked?.value !== today) {
              // Check if consecutive (yesterday or first day)
              if (!lastTracked || isConsecutiveDay(lastTracked.value, today)) {
                days += 1;
              } else {
                days = 1; // streak broken, reset
              }
              await db3.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('challenge_days_completed', ?)",
                [String(days)]
              );
              await db3.runAsync(
                "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('challenge_last_tracked_date', ?)",
                [today]
              );

              if (days >= 3) {
                await db3.runAsync(
                  "INSERT OR REPLACE INTO tracking_state (key, value) VALUES ('challenge_complete', 'true')"
                );
                setTimeout(() => {
                  Alert.alert(
                    "Challenge Complete!",
                    "You tracked 3 days in a row. Here's your special Pro offer.",
                    [{ text: "See offer", onPress: () => showPaywall("challenge_complete") }]
                  );
                }, 2000);
              }
            }
          }
        } catch {}
      }

      // For new manual trips: show the review card before returning.
      // For edits or trips without a final distance to celebrate: fall
      // straight back to the previous screen.
      if (!isEditing && createdTripId && distanceMiles != null && distanceMiles > 0) {
        setReviewCard({
          tripId: createdTripId,
          distanceMiles,
          classification,
          autoClassified: createAutoApplied,
          learnedMatchCount: createLearnedSuggestion?.matchCount ?? null,
          routeSourceLabel: routeSource ? provenanceLabel(routeSource) : null,
        });
      } else {
        router.back();
      }
    } catch (err: unknown) {
      const { title, message } = describeError(err, "Couldn't save the trip");
      Alert.alert(title, message);
    } finally {
      setSaving(false);
    }
  }, [
    isEditing, id, classification, platformTag, businessPurpose, category, vehicleId, vehicles,
    startAddress, endAddress, startLat, startLng, endLat, endLng,
    distanceMiles, startedAt, endedAt, notes, projectLabel, router, showPaywall, routeSource,
    anomalyDef, anomalyResponse, anomalyCustomNote,
    locationQuestions, locationResponses, locationCustomNotes,
    odometerStart, odometerEnd, missedId,
  ]);

  const handleCancel = useCallback(() => {
    Alert.alert("Cancel trip?", "This will discard the current trip.", [
      { text: "Keep going", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          // Stop background tracking and clean up
          await stopQuickTripTracking().catch(() => []);
          const db = await getDatabase();
          await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [QUICK_TRIP_KEY]);
          router.back();
        },
      },
    ]);
  }, [router]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete trip", "Remove this trip? This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await syncDeleteTrip(id!);
            router.back();
          } catch (err: unknown) {
            Alert.alert("Couldn't delete the trip", err instanceof Error ? err.message : "Try again in a moment.");
            setDeleting(false);
          }
        },
      },
    ]);
  }, [id, router]);

  const handleSelectVehicle = useCallback(() => {
    const options = vehicles.map((v) => ({
      text: `${v.make} ${v.model}${v.isPrimary ? " (Primary)" : ""}`,
      onPress: () => setVehicleId(v.id),
    }));
    options.push({ text: "None", onPress: () => setVehicleId(undefined) });
    Alert.alert("Select Vehicle", undefined, [...options, { text: "Cancel", onPress: () => {} }]);
  }, [vehicles]);

  // ── Derived values ───────────────────────────────────────────────────────

  const distance =
    distanceMiles != null
      ? distanceMiles
      : startLat != null && startLng != null && endLat != null && endLng != null
        ? Math.round(haversineDistance(startLat, startLng, endLat, endLng) * 100) / 100
        : null;
  const duration =
    startedAt && endedAt
      ? Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
      : null;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const workType = currentUser?.workType ?? "gig";
  const isGigDriver = workType === "gig" || workType === "both";
  const isEmployeeDriver = workType === "employee" || workType === "both";
  const isQuickMode = mode === "ready" || mode === "driving" || mode === "arrived" || mode === "saving";
  const showMap = isQuickMode && !isEditing;

  const screenTitle = isEditing
    ? "Edit Trip"
    : mode === "driving"
    ? "Trip In Progress"
    : mode === "arrived"
    ? "Trip Complete"
    : "Add Trip";

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading && (mode === "ready" || mode === "editing")) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: screenTitle }} />
        <ActivityIndicator size="large" color={AMBER} />
        <Text style={styles.loadingText}>
          {isEditing ? "Loading trip..." : "Getting your location..."}
        </Text>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: screenTitle }} />

      {/* === Full-screen immersive driving mode === */}
      {mode === "driving" && (
        <View style={{ flex: 1 }}>
          {/* Full-screen map */}
          {MapView && startLat != null && startLng != null ? (
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              initialRegion={{
                latitude: startLat,
                longitude: startLng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              userInterfaceStyle="dark"
              showsUserLocation={false}
              scrollEnabled
              zoomEnabled
              rotateEnabled={false}
              pitchEnabled={false}
              onPanDrag={() => setFollowUser(false)}
            >
              {/* Start pin */}
              <Marker
                coordinate={{ latitude: startLat, longitude: startLng }}
                pinColor="#34c759"
              />
              {/* Speed-coloured trail */}
              {Polyline && drivingTrail.length >= 2 && (
                <>
                  {buildSpeedSegments(drivingTrail).map((seg, i) => (
                    <Polyline
                      key={`seg-${i}`}
                      coordinates={seg.coords}
                      strokeColor={seg.color}
                      strokeWidth={4}
                    />
                  ))}
                </>
              )}
              {/* Custom user dot */}
              {userLat != null && userLng != null && Marker && (
                <Marker
                  coordinate={{ latitude: userLat, longitude: userLng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  flat
                >
                  <View style={styles.userDot}>
                    <View style={styles.userDotInner} />
                  </View>
                </Marker>
              )}
            </MapView>
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.mapFallback]}>
              <Ionicons name="map-outline" size={32} color={TEXT_3} />
              <Text style={styles.mapFallbackText}>
                {startAddress ?? "Locating..."}
              </Text>
            </View>
          )}

          {/* Top floating status bar */}
          <View style={styles.drivingTopBar}>
            <View style={styles.drivingLiveRow}>
              <Animated.View
                style={[
                  styles.drivingPulse,
                  isPersonal && { backgroundColor: "rgba(16, 185, 129, 0.3)" },
                  { transform: [{ scale: pulseAnim }] },
                ]}
              />
              <View style={[styles.drivingPulseCore, isPersonal && { backgroundColor: GREEN }]} />
              <Text style={[styles.drivingLiveText, isPersonal && { color: GREEN }]}>
                {isPersonal ? "JOURNEY" : "TRACKING"}
              </Text>
            </View>
            <Text style={styles.drivingTopTimer}>{formatTimer(elapsed)}</Text>
          </View>

          {/* Recenter button */}
          {!followUser && (
            <TouchableOpacity style={styles.drivingRecenterBtn} onPress={handleRecenter} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Re-centre map on current location">
              <Ionicons name="locate-outline" size={20} color={TEXT_1} />
            </TouchableOpacity>
          )}

          {/* Bottom floating dashboard */}
          <View style={styles.drivingDash}>
            {/* Speed hero */}
            <View style={styles.speedHero}>
              <Text style={[styles.speedValue, isPersonal && { color: GREEN }]}>
                {liveSpeed}
              </Text>
              <Text style={styles.speedUnit}>mph</Text>
            </View>

            {/* Stats strip */}
            <View style={styles.dashStatsRow}>
              <View style={styles.dashStat}>
                <Text style={[styles.dashStatValue, isPersonal && { color: GREEN }]}>
                  {liveDistance.toFixed(1)}
                </Text>
                <Text style={styles.dashStatLabel}>MILES</Text>
              </View>
              <View style={styles.dashDivider} />
              <View style={styles.dashStat}>
                <Text style={styles.dashStatValue}>{formatTimer(elapsed)}</Text>
                <Text style={styles.dashStatLabel}>TIME</Text>
              </View>
              {isWork && earningsPerMilePence != null && (
                <>
                  <View style={styles.dashDivider} />
                  <View style={styles.dashStat}>
                    <Text style={styles.dashStatValue}>
                      {"\u00A3"}{(liveDistance * earningsPerMilePence / 100).toFixed(2)}
                    </Text>
                    <Text style={styles.dashStatLabel}>EST. EARN</Text>
                  </View>
                </>
              )}
              {isWork && (
                <>
                  <View style={styles.dashDivider} />
                  <View style={styles.dashStat}>
                    <Text style={styles.dashStatValue}>
                      {(liveDistance <= 10000 ? liveDistance * 45 : 10000 * 45 + (liveDistance - 10000) * 25).toFixed(0)}p
                    </Text>
                    <Text style={styles.dashStatLabel}>HMRC</Text>
                  </View>
                </>
              )}
              {isPersonal && currentArea && (
                <>
                  <View style={styles.dashDivider} />
                  <View style={[styles.dashStat, { flex: 1.5 }]}>
                    <Text style={[styles.dashStatValue, { color: GREEN, fontSize: 14 }]} numberOfLines={1}>
                      {currentArea}
                    </Text>
                    <Text style={styles.dashStatLabel}>AREA</Text>
                  </View>
                </>
              )}
            </View>

            {/* From address */}
            {startAddress && (
              <Text style={styles.dashAddress} numberOfLines={1}>
                From {startAddress}
              </Text>
            )}

            {/* Buttons */}
            <Button
              variant="hero"
              title={isPersonal ? "I'm Here" : "I've Arrived"}
              icon="flag"
              onPress={handleArrived}
              loading={loading}
              size="lg"
            />
            <TouchableOpacity onPress={handleCancel} style={styles.dashCancelBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Cancel trip">
              <Text style={styles.dashCancelText}>Cancel trip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Map - visible in ready/arrived modes */}
      {showMap && mode !== "driving" && (
        <View style={styles.mapArea}>
          {MapView && startLat != null && startLng != null ? (
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: startLat,
                longitude: startLng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              region={
                mode === "arrived" && endLat != null && endLng != null
                  ? (() => {
                      const pts = routeTrail.length >= 2
                        ? routeTrail
                        : [{ latitude: startLat, longitude: startLng }, { latitude: endLat, longitude: endLng }];
                      let minLat = pts[0].latitude, maxLat = pts[0].latitude;
                      let minLng = pts[0].longitude, maxLng = pts[0].longitude;
                      for (const p of pts) {
                        if (p.latitude < minLat) minLat = p.latitude;
                        if (p.latitude > maxLat) maxLat = p.latitude;
                        if (p.longitude < minLng) minLng = p.longitude;
                        if (p.longitude > maxLng) maxLng = p.longitude;
                      }
                      return {
                        latitude: (minLat + maxLat) / 2,
                        longitude: (minLng + maxLng) / 2,
                        latitudeDelta: Math.max((maxLat - minLat) * 1.6, 0.01),
                        longitudeDelta: Math.max((maxLng - minLng) * 1.6, 0.01),
                      };
                    })()
                  : undefined
              }
              userInterfaceStyle="dark"
              showsUserLocation={mode === "ready"}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              {mode !== "ready" && (
                <Marker
                  coordinate={{ latitude: startLat, longitude: startLng }}
                  pinColor="#34c759"
                />
              )}
              {mode === "arrived" && endLat != null && endLng != null && (
                <>
                  <Marker
                    coordinate={{ latitude: endLat, longitude: endLng }}
                    pinColor={RED}
                  />
                  <Polyline
                    coordinates={
                      routeTrail.length >= 2
                        ? routeTrail
                        : [
                            { latitude: startLat, longitude: startLng },
                            { latitude: endLat, longitude: endLng },
                          ]
                    }
                    strokeColor={isPersonal ? GREEN : AMBER}
                    strokeWidth={3}
                  />
                </>
              )}
            </MapView>
          ) : (
            <View style={[styles.map, styles.mapFallback]}>
              <Ionicons name="map-outline" size={32} color={TEXT_3} />
              <Text style={styles.mapFallbackText}>
                {startAddress ?? "Locating..."}
              </Text>
            </View>
          )}

        </View>
      )}

      {/* Bottom panel - hidden during driving (UI overlays the map) */}
      {mode !== "driving" && <ScrollView
        style={styles.panel}
        contentContainerStyle={styles.panelContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Ready State ── */}
        {mode === "ready" && (
          <>
            {startAddress && (
              <View style={styles.currentLocationRow}>
                <Ionicons name="location" size={14} color={AMBER} />
                <Text style={styles.currentLocationText} numberOfLines={1}>
                  {startAddress}
                </Text>
              </View>
            )}

            {/* Pre-trip road alerts */}
            {communityAlerts.length > 0 && (
              <View style={styles.alertCard}>
                <View style={styles.alertHeader}>
                  <Ionicons name="warning-outline" size={13} color={RED} />
                  <Text style={styles.alertHeaderText}>Heads up</Text>
                </View>
                {communityAlerts.map((alert, i) => (
                  <View key={i} style={styles.alertRow}>
                    <Ionicons name={alert.icon as any} size={14} color={alert.color} />
                    <Text style={[styles.alertText, { color: alert.color }]}>{alert.message}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Community nudges */}
            {communityNudges.length > 0 && (
              <View style={styles.nudgeCard}>
                <View style={styles.nudgeHeader}>
                  <Ionicons name="people-outline" size={13} color={AMBER} />
                  <Text style={styles.nudgeTitle}>From MileClear drivers</Text>
                </View>
                {communityNudges.map((nudge, i) => (
                  <View key={i} style={styles.nudgeRow}>
                    <Ionicons name="information-circle-outline" size={13} color={TEXT_2} />
                    <Text style={styles.nudgeText}>{nudge}</Text>
                  </View>
                ))}
              </View>
            )}

            <Button
              variant="hero"
              title="Start Trip"
              icon="navigate"
              onPress={() => handleStartTrip()}
              loading={loading}
              size="lg"
            />

            <TouchableOpacity
              style={styles.manualLink}
              onPress={handleSwitchToManual}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Log a past trip manually instead"
            >
              <Ionicons name="create-outline" size={16} color={TEXT_2} />
              <Text style={styles.manualLinkText}>Log a past trip instead</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Arrived State ── */}
        {mode === "arrived" && (
          <>
            {/* Celebration header */}
            <Animated.View style={[styles.celebrationHeader, { opacity: celebHeaderAnim, transform: [{ translateY: celebSlideAnim }] }]}>
              <View style={styles.celebCheckCircle}>
                <Ionicons name="checkmark" size={28} color="#fff" />
              </View>
              <Text style={styles.celebTitle}>Trip complete!</Text>
              <Text style={[styles.celebDistance, isPersonal && { color: GREEN }]}>
                {distance != null ? `${distance} mi` : "--"}
              </Text>
              <Text style={styles.celebDuration}>
                {duration != null ? formatTimer(duration) : ""}
              </Text>
              <Text style={styles.celebMessage}>
                {getPositiveMessage(distance, insights?.numberOfStops ?? 0, insights?.routeEfficiency ?? 0)}
              </Text>
            </Animated.View>

            {/* Route summary */}
            <Animated.View style={[styles.routeCard, { opacity: celebStatsAnim }]}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: "#34c759" }]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {startAddress ?? (startLat != null ? `${startLat.toFixed(4)}, ${startLng!.toFixed(4)}` : "Start")}
                </Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: RED }]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {endAddress ?? (endLat != null ? `${endLat.toFixed(4)}, ${endLng!.toFixed(4)}` : "End")}
                </Text>
              </View>
            </Animated.View>

            {/* Stats */}
            <Animated.View style={[styles.statsRow, { opacity: celebStatsAnim }]}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{distance != null ? `${distance}` : "--"}</Text>
                <Text style={styles.statUnit}>miles</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{duration != null ? formatTimer(duration) : "--"}</Text>
                <Text style={styles.statUnit}>duration</Text>
              </View>
            </Animated.View>

            {/* Trip Insights */}
            {insights && (
              <View style={styles.insightsCard}>
                <Text style={styles.insightsTitle}>Trip Insights</Text>
                <View style={styles.insightsGrid}>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightValue}>{insights.topSpeedMph}</Text>
                    <Text style={styles.insightLabel}>Top mph</Text>
                  </View>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightValue}>{insights.avgMovingSpeedMph}</Text>
                    <Text style={styles.insightLabel}>Avg mph</Text>
                  </View>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightValue}>
                      {insights.timeStoppedSecs >= 60
                        ? `${Math.round(insights.timeStoppedSecs / 60)}m`
                        : `${insights.timeStoppedSecs}s`}
                    </Text>
                    <Text style={styles.insightLabel}>Stopped</Text>
                  </View>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightValue}>{insights.numberOfStops}</Text>
                    <Text style={styles.insightLabel}>Stops</Text>
                  </View>
                </View>

                <View style={styles.insightNotes}>
                  {getTimeOfDayNote(startedAt.toISOString()) && (
                    <View style={styles.insightNoteRow}>
                      <Ionicons name="time-outline" size={13} color={TEXT_2} />
                      <Text style={styles.insightNote}>{getTimeOfDayNote(startedAt.toISOString())}</Text>
                    </View>
                  )}
                  {getRouteDirectnessNote(insights.routeEfficiency) && (
                    <View style={styles.insightNoteRow}>
                      <Ionicons name="compass-outline" size={13} color={TEXT_2} />
                      <Text style={styles.insightNote}>{getRouteDirectnessNote(insights.routeEfficiency)}</Text>
                    </View>
                  )}
                  {insights.longestNonStopMiles > 0.1 && (
                    <View style={styles.insightNoteRow}>
                      <Ionicons name="trending-up-outline" size={13} color={TEXT_2} />
                      <Text style={styles.insightNote}>Longest non-stop: {insights.longestNonStopMiles} mi</Text>
                    </View>
                  )}
                  {insights.timeStoppedSecs > 60 && (
                    <View style={styles.insightNoteRow}>
                      <Ionicons name="pie-chart-outline" size={13} color={TEXT_2} />
                      <Text style={styles.insightNote}>
                        {Math.round((insights.timeMovingSecs / (insights.timeMovingSecs + insights.timeStoppedSecs)) * 100)}% of your trip was moving
                      </Text>
                    </View>
                  )}
                </View>

                {(getSpeedFunFact(insights.topSpeedMph) || (distance != null && getDistanceFunFact(distance))) && (
                  <View style={styles.funFactBox}>
                    {getSpeedFunFact(insights.topSpeedMph) && (
                      <Text style={styles.insightFunFact}>{getSpeedFunFact(insights.topSpeedMph)}</Text>
                    )}
                    {distance != null && getDistanceFunFact(distance) && (
                      <Text style={styles.insightFunFact}>{getDistanceFunFact(distance)}</Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Anomaly question */}
            {anomalyDef && (
              <View style={styles.anomalyCard}>
                <Text style={styles.anomalyQuestion}>{anomalyDef.question}</Text>
                <View style={styles.anomalyOptions}>
                  {anomalyDef.options.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.anomalyChip, anomalyResponse === opt && styles.anomalyChipActive]}
                      onPress={() => setAnomalyResponse(opt)}
                      accessibilityRole="button"
                      accessibilityLabel={opt}
                      accessibilityState={{ selected: anomalyResponse === opt }}
                    >
                      <Text style={[styles.anomalyChipText, anomalyResponse === opt && styles.anomalyChipTextActive]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {anomalyResponse === "Other" && (
                  <TextInput
                    style={[styles.input, { marginTop: 8 }]}
                    value={anomalyCustomNote}
                    onChangeText={setAnomalyCustomNote}
                    placeholder="Tell us more..."
                    placeholderTextColor={TEXT_3}
                    accessibilityLabel="Custom explanation for anomaly"
                  />
                )}
              </View>
            )}

            {/* Location-based community questions (multi-select) */}
            {locationQuestions.length > 0 && (
              <View style={styles.locationQuestionsSection}>
                <View style={styles.locationQuestionsHeader}>
                  <Ionicons name="people-outline" size={14} color={AMBER} />
                  <Text style={styles.locationQuestionsTitle}>Help other drivers</Text>
                </View>
                {locationQuestions.map((q, qIdx) => {
                  const selected = locationResponses[qIdx] || [];
                  return (
                    <View key={qIdx} style={styles.locationQuestionCard}>
                      <View style={styles.locationQuestionTop}>
                        <Ionicons
                          name={q.type === "long_stop" ? "location" : "speedometer-outline"}
                          size={15}
                          color={q.type === "long_stop" ? RED : "#f59e0b"}
                        />
                        <Text style={styles.locationQuestionText}>{q.question}</Text>
                      </View>
                      <View style={styles.anomalyOptions}>
                        {q.options.map((opt) => {
                          const isSelected = selected.includes(opt);
                          return (
                            <TouchableOpacity
                              key={opt}
                              style={[styles.anomalyChip, isSelected && styles.anomalyChipActive]}
                              accessibilityRole="button"
                              accessibilityLabel={opt}
                              accessibilityState={{ selected: isSelected }}
                              onPress={() => {
                                setLocationResponses((prev) => {
                                  const current = prev[qIdx] || [];
                                  const updated = isSelected
                                    ? current.filter((r) => r !== opt)
                                    : [...current, opt];
                                  return { ...prev, [qIdx]: updated };
                                });
                              }}
                            >
                              <Text style={[styles.anomalyChipText, isSelected && styles.anomalyChipTextActive]}>
                                {opt}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {selected.includes("Other") && (
                        <TextInput
                          style={[styles.input, { marginTop: 8 }]}
                          value={locationCustomNotes[qIdx] || ""}
                          onChangeText={(text) =>
                            setLocationCustomNotes((prev) => ({ ...prev, [qIdx]: text }))
                          }
                          placeholder="Tell us more..."
                          placeholderTextColor={TEXT_3}
                          accessibilityLabel="Custom explanation for location question"
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Smart suggestion banner */}
            {suggestionApplied && suggestion && (
              <View style={styles.suggestionBanner}>
                <Ionicons name="sparkles" size={14} color={AMBER} />
                <Text style={styles.suggestionText}>
                  Suggested from {suggestion.matchCount} previous trip{suggestion.matchCount !== 1 ? "s" : ""} here
                </Text>
              </View>
            )}

            {/* Classification */}
            <View style={styles.classRow}>
              {CLASSIFICATIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.classChip, classification === opt.value && styles.classChipActive]}
                  onPress={() => {
                    setClassification(opt.value);
                    if (suggestion && opt.value !== suggestion.classification) {
                      setSuggestionApplied(false);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Classify trip as ${opt.label}`}
                  accessibilityState={{ selected: classification === opt.value }}
                >
                  <Text
                    style={[styles.classChipText, classification === opt.value && styles.classChipTextActive]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Platform quick-select for gig drivers */}
            {classification === "business" && isGigDriver && (
              <>
                {isEmployeeDriver && <Text style={styles.chipSectionLabel}>Gig Platform</Text>}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.platformRow}
                  style={{ marginBottom: isEmployeeDriver ? 8 : 16 }}
                >
                  <TouchableOpacity
                    style={[styles.platformChip, !platformTag && styles.platformChipActive]}
                    onPress={() => setPlatformTag(undefined)}
                    accessibilityRole="button"
                    accessibilityLabel="No platform"
                    accessibilityState={{ selected: !platformTag }}
                  >
                    <Text style={[styles.platformChipText, !platformTag && styles.platformChipTextActive]}>
                      None
                    </Text>
                  </TouchableOpacity>
                  {GIG_PLATFORMS.map((p) => (
                    <TouchableOpacity
                      key={p.value}
                      style={[styles.platformChip, platformTag === p.value && styles.platformChipActive]}
                      onPress={() => setPlatformTag(p.value as PlatformTag)}
                      accessibilityRole="button"
                      accessibilityLabel={`Platform: ${p.label}`}
                      accessibilityState={{ selected: platformTag === p.value }}
                    >
                      <Text
                        style={[styles.platformChipText, platformTag === p.value && styles.platformChipTextActive]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Business purpose quick-select for employee drivers */}
            {classification === "business" && isEmployeeDriver && (
              <>
                {isGigDriver && <Text style={styles.chipSectionLabel}>Business Purpose</Text>}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.platformRow}
                  style={{ marginBottom: 16 }}
                >
                  <TouchableOpacity
                    style={[styles.platformChip, !businessPurpose && styles.platformChipActive]}
                    onPress={() => setBusinessPurpose(undefined)}
                    accessibilityRole="button"
                    accessibilityLabel="No business purpose"
                    accessibilityState={{ selected: !businessPurpose }}
                  >
                    <Text style={[styles.platformChipText, !businessPurpose && styles.platformChipTextActive]}>
                      None
                    </Text>
                  </TouchableOpacity>
                  {BUSINESS_PURPOSES.map((bp) => (
                    <TouchableOpacity
                      key={bp.value}
                      style={[styles.platformChip, businessPurpose === bp.value && styles.platformChipActive]}
                      onPress={() => setBusinessPurpose(bp.value as BusinessPurpose)}
                      accessibilityRole="button"
                      accessibilityLabel={`Business purpose: ${bp.label}`}
                      accessibilityState={{ selected: businessPurpose === bp.value }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons
                          name={bp.icon as any}
                          size={14}
                          color={businessPurpose === bp.value ? BG : TEXT_2}
                        />
                        <Text
                          style={[styles.platformChipText, businessPurpose === bp.value && styles.platformChipTextActive]}
                        >
                          {bp.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Category quick-select for personal */}
            {classification === "personal" && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.platformRow}
                style={{ marginBottom: 16 }}
              >
                <TouchableOpacity
                  style={[styles.platformChip, !category && styles.platformChipActive]}
                  onPress={() => setCategory(undefined)}
                  accessibilityRole="button"
                  accessibilityLabel="Category: None"
                  accessibilityState={{ selected: !category }}
                >
                  <Text style={[styles.platformChipText, !category && styles.platformChipTextActive]}>
                    None
                  </Text>
                </TouchableOpacity>
                {TRIP_CATEGORY_META.map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.platformChip, category === c.value && styles.platformChipActive]}
                    onPress={() => setCategory(c.value as TripCategory)}
                    accessibilityRole="button"
                    accessibilityLabel={`Category: ${c.label}`}
                    accessibilityState={{ selected: category === c.value }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons
                        name={c.icon as any}
                        size={14}
                        color={category === c.value ? BG : TEXT_2}
                        accessible={false}
                      />
                      <Text
                        style={[styles.platformChipText, category === c.value && styles.platformChipTextActive]}
                      >
                        {c.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Journal note for personal trips */}
            {classification === "personal" && (
              <View style={styles.journalNoteWrap}>
                <TextInput
                  style={[styles.input, styles.notesInput, styles.journalInput]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Add a note about this journey..."
                  placeholderTextColor={TEXT_3}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  accessibilityLabel="Journey note"
                />
              </View>
            )}

            <Button title="Save Trip" icon="checkmark" onPress={() => handleSave()} loading={saving} />
            <Button variant="ghost" title="Discard" onPress={handleCancel} style={{ marginTop: 8 }} />
          </>
        )}

        {/* ── Saving State ── */}
        {mode === "saving" && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={AMBER} accessibilityLabel="Saving trip" />
            <Text style={styles.loadingText}>Saving trip...</Text>
          </View>
        )}

        {/* ── Manual Entry / Edit Mode ── */}
        {(mode === "manual" || mode === "editing") && (
          <>
            {mode === "manual" && (
              <TouchableOpacity
                style={styles.backToQuickLink}
                onPress={handleSwitchToQuick}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Track a trip live instead"
              >
                <Ionicons name="navigate-outline" size={16} color={AMBER} accessible={false} />
                <Text style={styles.backToQuickText}>Track a trip live instead</Text>
              </TouchableOpacity>
            )}

            {/* Start Location */}
            <LocationPickerField
              label="Start Location"
              lat={startLat}
              lng={startLng}
              address={startAddress}
              onLocationChange={(lat, lng, addr) => {
                setStartLat(lat);
                setStartLng(lng);
                setStartAddress(addr);
              }}
              onClear={() => {
                setStartLat(null);
                setStartLng(null);
                setStartAddress(null);
              }}
              disabled={isEditing}
            />

            {/* Distance card */}
            <View style={styles.distanceCard}>
              <Text style={styles.distanceLabel}>Distance</Text>
              <Text style={styles.distanceValue}>
                {calculatingRoute ? "Calculating..." : distanceMiles != null ? `${distanceMiles} mi` : "--"}
              </Text>
              {!calculatingRoute && distanceMiles != null && routeSource && (
                <Text style={styles.distanceHint}>{provenanceLabel(routeSource)}</Text>
              )}
              {!calculatingRoute && distanceMiles == null && routeUnavailable && (
                <Text style={[styles.distanceHint, { color: "#f59e0b" }]}>
                  Couldn't calculate route — try again or enter distance manually
                </Text>
              )}
              {!calculatingRoute && distanceMiles == null && !routeUnavailable && (
                <Text style={styles.distanceHint}>Set both locations to auto-calculate</Text>
              )}

              {/* Manual distance entry — the actual field behind "enter distance
                  manually", auto-shown when routing fails, opt-in otherwise. */}
              {(manualDistanceMode || (routeUnavailable && distanceMiles == null)) && (
                <View style={styles.manualDistanceRow}>
                  <TextInput
                    style={styles.manualDistanceInput}
                    value={manualDistanceText}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9.]/g, "");
                      setManualDistanceText(cleaned);
                      const n = parseFloat(cleaned);
                      if (Number.isFinite(n) && n > 0) {
                        setDistanceMiles(Math.round(n * 10) / 10);
                        setRouteSource(null);
                      } else if (cleaned === "") {
                        setDistanceMiles(null);
                      }
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.0"
                    placeholderTextColor="#64748b"
                    accessibilityLabel="Enter the trip distance in miles"
                  />
                  <Text style={styles.manualDistanceUnit}>miles</Text>
                </View>
              )}
              {!manualDistanceMode && !(routeUnavailable && distanceMiles == null) && (
                <TouchableOpacity
                  onPress={() => {
                    setManualDistanceMode(true);
                    setManualDistanceText(distanceMiles != null ? String(distanceMiles) : "");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Enter distance manually"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.distanceHint, { color: "#f5a623", marginTop: 6 }]}>
                    Enter distance manually
                  </Text>
                </TouchableOpacity>
              )}

              {isEditing && id && (
                <TouchableOpacity
                  style={styles.recalcButton}
                  onPress={() => handleRecalculate(id)}
                  disabled={recalculating}
                  accessibilityRole="button"
                  accessibilityLabel="Recalculate distance"
                >
                  {recalculating ? (
                    <ActivityIndicator color={AMBER} size="small" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={14} color={AMBER} />
                      <Text style={styles.recalcButtonText}>Recalculate distance</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Odometer (optional) — a trust primitive: readings corroborate the
                GPS distance and are auditable for HMRC. Collapsed by default. */}
            <View style={styles.odometerSection}>
              {!odometerOpen ? (
                <TouchableOpacity
                  onPress={() => setOdometerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add odometer readings"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.distanceHint, { color: AMBER }]}>
                    {odometerStart || odometerEnd ? "Edit odometer readings" : "+ Add odometer readings (optional)"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.odometerLabel}>Odometer (miles)</Text>
                  <View style={styles.odometerRow}>
                    <TextInput
                      style={[styles.input, styles.odometerInput]}
                      value={odometerStart}
                      onChangeText={(t) => setOdometerStart(t.replace(/[^0-9.]/g, ""))}
                      placeholder="Start"
                      placeholderTextColor="#64748b"
                      keyboardType="decimal-pad"
                      accessibilityLabel="Odometer reading at the start"
                    />
                    <Ionicons name="arrow-forward" size={16} color="#64748b" />
                    <TextInput
                      style={[styles.input, styles.odometerInput]}
                      value={odometerEnd}
                      onChangeText={(t) => setOdometerEnd(t.replace(/[^0-9.]/g, ""))}
                      placeholder="End"
                      placeholderTextColor="#64748b"
                      keyboardType="decimal-pad"
                      accessibilityLabel="Odometer reading at the end"
                    />
                  </View>
                  {odometerStart && odometerEnd && parseFloat(odometerEnd) > parseFloat(odometerStart) && (
                    <Text style={styles.odometerHint}>
                      Odometer shows {(parseFloat(odometerEnd) - parseFloat(odometerStart)).toFixed(1)} miles
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Confidence badge — auditable quality signal for HMRC defence */}
            {isEditing && confidence && (
              <ConfidenceBadge level={confidence.level} reasons={confidence.reasons} />
            )}

            {/* Edit audit trail */}
            {isEditing && editedAt && (
              <Text style={styles.editedAt}>
                Edited {new Date(editedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </Text>
            )}

            {/* Merge suggestion — adjacent trip looks like a fuel-stop continuation */}
            {isEditing && mergeSuggestion && (
              <View style={styles.mergeSuggestionCard}>
                <Ionicons name="git-merge-outline" size={18} color={AMBER} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mergeSuggestionTitle}>
                    Looks like a quick stop?
                  </Text>
                  <Text style={styles.mergeSuggestionBody}>
                    There's another trip {mergeSuggestion.direction === "after" ? "right after" : "right before"} this one
                    {" — "}only {mergeSuggestion.gapMinutes < 1 ? "<1" : mergeSuggestion.gapMinutes.toFixed(0)} min
                    {" and "}{mergeSuggestion.gapMeters < 100 ? "<100" : mergeSuggestion.gapMeters.toFixed(0)} m
                    {" "}apart. Merge them into one trip?
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.mergeSuggestionButton}
                  onPress={() => handleAcceptMerge(mergeSuggestion.otherTripId)}
                  disabled={merging}
                  accessibilityRole="button"
                  accessibilityLabel="Merge with adjacent trip"
                >
                  {merging ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Text style={styles.mergeSuggestionButtonText}>Merge</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Clean Air Zone / ULEZ charge — this trip's route crossed a
                charging zone in a non-compliant vehicle. Offer to log the
                daily charge as a deductible expense. Guidance, user confirms. */}
            {isEditing && cleanAirZones && cleanAirZones.charges.length > 0 && (
              <View style={styles.cazTripCard}>
                <View style={styles.cazTripHeader}>
                  <Ionicons name="alert-circle" size={18} color={AMBER} />
                  <Text style={styles.cazTripTitle}>Clean Air Zone charge may apply</Text>
                </View>
                <Text style={styles.cazTripBody}>
                  This trip looks like it entered a charging zone in a vehicle that may not
                  be exempt. If you paid, log it as a deductible expense.
                </Text>
                {cleanAirZones.charges.map((c) => {
                  const logged = loggedCazZones.has(c.zoneId);
                  return (
                    <View key={c.zoneId} style={styles.cazTripRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cazTripZone}>{c.name}</Text>
                        <Text style={styles.cazTripCharge}>{formatPence(c.chargePence)} daily charge</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.cazLogBtn, logged && styles.cazLogBtnDone]}
                        onPress={() => !logged && handleLogCazCharge(c)}
                        disabled={logged || loggingCaz === c.zoneId}
                        accessibilityRole="button"
                        accessibilityLabel={logged ? `${c.name} charge logged` : `Log the ${c.name} charge as an expense`}
                      >
                        {loggingCaz === c.zoneId ? (
                          <ActivityIndicator color={AMBER} size="small" />
                        ) : logged ? (
                          <>
                            <Ionicons name="checkmark" size={14} color="#10b981" />
                            <Text style={[styles.cazLogBtnText, { color: "#10b981" }]}>Logged</Text>
                          </>
                        ) : (
                          <Text style={styles.cazLogBtnText}>Log charge</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
                <Text style={styles.cazTripDisclaimer}>
                  Based on your vehicle&apos;s emissions and the zone boundary — confirm with the
                  official checker if unsure. Zone boundaries © OpenStreetMap contributors,
                  Transport for London &amp; local authorities.
                </Text>
              </View>
            )}

            {/* Trip Insights (from GPS data - editing mode) */}
            {isEditing && insights && (
              <View style={styles.insightsCard}>
                <Text style={styles.insightsTitle}>Trip Insights</Text>
                <View style={styles.insightsGrid}>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightValue}>{insights.topSpeedMph}</Text>
                    <Text style={styles.insightLabel}>Top mph</Text>
                  </View>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightValue}>{insights.avgMovingSpeedMph}</Text>
                    <Text style={styles.insightLabel}>Avg mph</Text>
                  </View>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightValue}>
                      {insights.timeStoppedSecs >= 60
                        ? `${Math.round(insights.timeStoppedSecs / 60)}m`
                        : `${insights.timeStoppedSecs}s`}
                    </Text>
                    <Text style={styles.insightLabel}>Stopped</Text>
                  </View>
                  <View style={styles.insightItem}>
                    <Text style={styles.insightValue}>{insights.numberOfStops}</Text>
                    <Text style={styles.insightLabel}>Stops</Text>
                  </View>
                </View>

                <View style={styles.insightNotes}>
                  {getTimeOfDayNote(startedAt.toISOString()) && (
                    <View style={styles.insightNoteRow}>
                      <Ionicons name="time-outline" size={13} color={TEXT_2} />
                      <Text style={styles.insightNote}>{getTimeOfDayNote(startedAt.toISOString())}</Text>
                    </View>
                  )}
                  {getRouteDirectnessNote(insights.routeEfficiency) && (
                    <View style={styles.insightNoteRow}>
                      <Ionicons name="compass-outline" size={13} color={TEXT_2} />
                      <Text style={styles.insightNote}>{getRouteDirectnessNote(insights.routeEfficiency)}</Text>
                    </View>
                  )}
                  {insights.longestNonStopMiles > 0.1 && (
                    <View style={styles.insightNoteRow}>
                      <Ionicons name="trending-up-outline" size={13} color={TEXT_2} />
                      <Text style={styles.insightNote}>Longest non-stop: {insights.longestNonStopMiles} mi</Text>
                    </View>
                  )}
                  {insights.timeStoppedSecs > 60 && (
                    <View style={styles.insightNoteRow}>
                      <Ionicons name="pie-chart-outline" size={13} color={TEXT_2} />
                      <Text style={styles.insightNote}>
                        {Math.round((insights.timeMovingSecs / (insights.timeMovingSecs + insights.timeStoppedSecs)) * 100)}% of your trip was moving
                      </Text>
                    </View>
                  )}
                </View>

                {(getSpeedFunFact(insights.topSpeedMph) || (distance != null && getDistanceFunFact(distance))) && (
                  <View style={styles.funFactBox}>
                    {getSpeedFunFact(insights.topSpeedMph) && (
                      <Text style={styles.insightFunFact}>{getSpeedFunFact(insights.topSpeedMph)}</Text>
                    )}
                    {distance != null && getDistanceFunFact(distance) && (
                      <Text style={styles.insightFunFact}>{getDistanceFunFact(distance)}</Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* End Location */}
            <LocationPickerField
              label="End Location"
              lat={endLat}
              lng={endLng}
              address={endAddress}
              onLocationChange={(lat, lng, addr) => {
                setEndLat(lat);
                setEndLng(lng);
                setEndAddress(addr);
              }}
              onClear={() => {
                setEndLat(null);
                setEndLng(null);
                setEndAddress(null);
              }}
            />

            {/* Start Time */}
            <DateTimePickerField
              label="Start Time"
              value={startedAt}
              onChange={setStartedAt}
              disabled={isEditing}
              maximumDate={new Date()}
            />

            {/* End Time */}
            <DateTimePickerField
              label="End Time"
              value={endedAt}
              onChange={setEndedAt}
              onClear={() => setEndedAt(null)}
              maximumDate={new Date()}
            />

            {/* Classification */}
            <Text style={styles.label}>Classification</Text>
            <View style={styles.classRow}>
              {CLASSIFICATIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.classChip, classification === opt.value && styles.classChipActive]}
                  onPress={() => setClassification(opt.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Classify trip as ${opt.label}`}
                  accessibilityState={{ selected: classification === opt.value }}
                >
                  <Text
                    style={[styles.classChipText, classification === opt.value && styles.classChipTextActive]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Category for personal trips */}
            {classification === "personal" && (
              <>
                <Text style={styles.label}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.platformRow}
                  style={{ marginBottom: 8 }}
                >
                  <TouchableOpacity
                    style={[styles.platformChip, !category && styles.platformChipActive]}
                    onPress={() => setCategory(undefined)}
                    accessibilityRole="button"
                    accessibilityLabel="Category: None"
                    accessibilityState={{ selected: !category }}
                  >
                    <Text style={[styles.platformChipText, !category && styles.platformChipTextActive]}>
                      None
                    </Text>
                  </TouchableOpacity>
                  {TRIP_CATEGORY_META.map((c) => (
                    <TouchableOpacity
                      key={c.value}
                      style={[styles.platformChip, category === c.value && styles.platformChipActive]}
                      onPress={() => setCategory(c.value as TripCategory)}
                      accessibilityRole="button"
                      accessibilityLabel={`Category: ${c.label}`}
                      accessibilityState={{ selected: category === c.value }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons
                          name={c.icon as any}
                          size={14}
                          color={category === c.value ? BG : TEXT_2}
                        />
                        <Text
                          style={[styles.platformChipText, category === c.value && styles.platformChipTextActive]}
                        >
                          {c.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Collapsible Details */}
            <TouchableOpacity
              style={styles.detailsToggle}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowDetails(!showDetails);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showDetails ? "Hide trip details" : "Show trip details"}
              accessibilityState={{ selected: showDetails }}
            >
              <Text style={styles.detailsToggleText}>Details</Text>
              <Ionicons
                name={showDetails ? "chevron-up" : "chevron-down"}
                size={18}
                color={TEXT_3}
                accessible={false}
              />
            </TouchableOpacity>

            {showDetails && (
              <View>
                {/* Platform (gig drivers) */}
                {isGigDriver && (
                  <>
                    <Text style={styles.label}>Platform</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.platformRow}
                    >
                      <TouchableOpacity
                        style={[styles.platformChip, !platformTag && styles.platformChipActive]}
                        onPress={() => setPlatformTag(undefined)}
                        accessibilityRole="button"
                        accessibilityLabel="Platform: None"
                        accessibilityState={{ selected: !platformTag }}
                      >
                        <Text style={[styles.platformChipText, !platformTag && styles.platformChipTextActive]}>
                          None
                        </Text>
                      </TouchableOpacity>
                      {GIG_PLATFORMS.map((p) => (
                        <TouchableOpacity
                          key={p.value}
                          style={[styles.platformChip, platformTag === p.value && styles.platformChipActive]}
                          onPress={() => setPlatformTag(p.value as PlatformTag)}
                          accessibilityRole="button"
                          accessibilityLabel={`Platform: ${p.label}`}
                          accessibilityState={{ selected: platformTag === p.value }}
                        >
                          <Text
                            style={[styles.platformChipText, platformTag === p.value && styles.platformChipTextActive]}
                          >
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {/* Business purpose (employee drivers) */}
                {isEmployeeDriver && (
                  <>
                    <Text style={styles.label}>Business Purpose</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.platformRow}
                    >
                      <TouchableOpacity
                        style={[styles.platformChip, !businessPurpose && styles.platformChipActive]}
                        onPress={() => setBusinessPurpose(undefined)}
                        accessibilityRole="button"
                        accessibilityLabel="Business purpose: None"
                        accessibilityState={{ selected: !businessPurpose }}
                      >
                        <Text style={[styles.platformChipText, !businessPurpose && styles.platformChipTextActive]}>
                          None
                        </Text>
                      </TouchableOpacity>
                      {BUSINESS_PURPOSES.map((bp) => (
                        <TouchableOpacity
                          key={bp.value}
                          style={[styles.platformChip, businessPurpose === bp.value && styles.platformChipActive]}
                          onPress={() => setBusinessPurpose(bp.value as BusinessPurpose)}
                          accessibilityRole="button"
                          accessibilityLabel={`Business purpose: ${bp.label}`}
                          accessibilityState={{ selected: businessPurpose === bp.value }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Ionicons
                              name={bp.icon as any}
                              size={14}
                              color={businessPurpose === bp.value ? BG : TEXT_2}
                              accessible={false}
                            />
                            <Text
                              style={[styles.platformChipText, businessPurpose === bp.value && styles.platformChipTextActive]}
                            >
                              {bp.label}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {/* Vehicle */}
                <Text style={styles.label}>Vehicle</Text>
                <TouchableOpacity
                  style={styles.vehiclePicker}
                  onPress={handleSelectVehicle}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={
                    selectedVehicle
                      ? `Vehicle: ${selectedVehicle.make} ${selectedVehicle.model}, tap to change`
                      : "Vehicle: None selected, tap to choose"
                  }
                >
                  <Text style={styles.vehiclePickerText}>
                    {selectedVehicle
                      ? `${selectedVehicle.make} ${selectedVehicle.model}`
                      : "None selected"}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={TEXT_3} accessible={false} />
                </TouchableOpacity>

                {/* Notes */}
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional notes about this trip"
                  placeholderTextColor={TEXT_3}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  accessibilityLabel="Notes about this trip"
                />

                {/* Project / client (optional, freeform) */}
                <Text style={styles.label}>Project / client</Text>
                <TextInput
                  style={styles.input}
                  value={projectLabel}
                  onChangeText={setProjectLabel}
                  placeholder="e.g. Theatre Royal tour, Acme Ltd"
                  placeholderTextColor={TEXT_3}
                  accessibilityLabel="Project or client name"
                />
              </View>
            )}

            {/* Save */}
            <Button
              title={isEditing ? "Save Changes" : "Add Trip"}
              icon="checkmark"
              onPress={() => handleSave()}
              loading={saving}
              disabled={deleting}
              style={{ marginTop: 28 }}
            />

            {/* Split - tracked trips with a GPS trail only. Was this "one
                trip" really several delivery drops? The split screen scans
                the trail for stops and lets the user cut it up. */}
            {isEditing && canSplit && (
              <Button
                variant="ghost"
                title="Split into multiple trips"
                icon="git-branch-outline"
                onPress={() => router.push(`/trip-split?id=${id}`)}
                disabled={saving || deleting}
                style={{ marginTop: 12 }}
              />
            )}

            {/* Delete - edit mode only */}
            {isEditing && (
              <Button
                variant="ghost"
                danger
                title="Delete Trip"
                onPress={handleDelete}
                loading={deleting}
                disabled={saving}
                style={{ marginTop: 12 }}
              />
            )}
          </>
        )}
      </ScrollView>}

      {/* Post-save review card — shown briefly after a manual trip is
          created. Synthesizes the routing + classification work into a
          single confidence-building moment of completion. */}
      {reviewCard && (
        <PostTripReviewCard
          distanceMiles={reviewCard.distanceMiles}
          classification={reviewCard.classification}
          autoClassified={reviewCard.autoClassified}
          learnedMatchCount={reviewCard.learnedMatchCount}
          routeSourceLabel={reviewCard.routeSourceLabel}
          onDone={() => {
            setReviewCard(null);
            router.back();
          }}
        />
      )}
    </View>
  );
}

const AMBER = colors.amber;
const TEXT_1 = colors.text1;
const TEXT_2 = colors.text2;
const TEXT_3 = colors.text3;
const CARD_BG = colors.surface;
const BG = colors.bg;
const GREEN = colors.green;
const RED = colors.red;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 12,
  },
  // ── Map ──────────────────────────────────────────────
  mapArea: {
    height: 240,
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    backgroundColor: CARD_BG,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  mapFallbackText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_2,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  // ── Panel ────────────────────────────────────────────
  panel: {
    flex: 1,
  },
  panelContent: {
    padding: 20,
    paddingBottom: 40,
  },
  // ── Ready state ──────────────────────────────────────
  alertCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  alertHeaderText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: RED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  alertText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    flex: 1,
  },
  nudgeCard: {
    backgroundColor: "rgba(245, 166, 35, 0.06)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.12)",
  },
  nudgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  nudgeTitle: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: AMBER,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  nudgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  nudgeText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: "#c9d1d9",
    flex: 1,
  },
  currentLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  currentLocationText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_1,
    flex: 1,
  },
  manualLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
  },
  manualLinkText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  backToQuickLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
  },
  backToQuickText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: AMBER,
  },
  // ── Full-screen driving mode ─────────────────────────
  drivingTopBar: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(3, 7, 18, 0.75)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  drivingLiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drivingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(52, 199, 89, 0.3)",
    position: "absolute",
    left: 0,
  },
  drivingPulseCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#34c759",
    position: "absolute",
    left: 0,
  },
  drivingLiveText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: "#34c759",
    letterSpacing: 1.2,
    marginLeft: 14,
  },
  drivingTopTimer: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  drivingRecenterBtn: {
    position: "absolute",
    top: 60,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(10, 17, 32, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  drivingDash: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(3, 7, 18, 0.95)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  speedHero: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
  },
  speedValue: {
    fontSize: 56,
    fontFamily: fonts.light,
    color: AMBER,
    fontVariant: ["tabular-nums"],
  },
  speedUnit: {
    fontSize: 18,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  dashStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  dashStat: {
    flex: 1,
    alignItems: "center",
  },
  dashStatValue: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: AMBER,
  },
  dashStatLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dashDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  dashAddress: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 14,
    textAlign: "center",
  },
  dashCancelBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 6,
  },
  dashCancelText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_3,
  },
  // ── Arrived / route summary ──────────────────────────
  routeCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: TEXT_1,
    flex: 1,
  },
  routeLine: {
    width: 1,
    height: 20,
    backgroundColor: "#374151",
    marginLeft: 4.5,
    marginVertical: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statValue: {
    fontSize: 22,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  statUnit: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 2,
  },
  // ── Trip Insights ──────────────────────────────────────
  insightsCard: {
    backgroundColor: "#0a1628",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    padding: 14,
    marginBottom: 16,
  },
  insightsTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: AMBER,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  insightsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  insightItem: {
    alignItems: "center",
    flex: 1,
  },
  insightValue: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: TEXT_1,
  },
  insightLabel: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightNotes: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  insightNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  insightNote: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    flex: 1,
  },
  funFactBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(245, 166, 35, 0.15)",
    gap: 4,
  },
  insightFunFact: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  // ── Smart suggestion ──────────────────────────────────
  suggestionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  suggestionText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: "#d4a053",
    flex: 1,
  },
  // ── Classification / platform chips ──────────────────
  classRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  classChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  classChipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  classChipText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  classChipTextActive: {
    color: BG,
  },
  platformRow: {
    gap: 8,
    paddingVertical: 2,
  },
  platformChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  platformChipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  chipSectionLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: TEXT_3,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  platformChipText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: TEXT_2,
  },
  platformChipTextActive: {
    color: BG,
  },
  // ── Manual form fields ───────────────────────────────
  label: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  notesInput: {
    minHeight: 80,
  },
  journalNoteWrap: {
    marginBottom: 16,
  },
  journalInput: {
    minHeight: 60,
    borderColor: "rgba(245, 166, 35, 0.12)",
  },
  distanceCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  distanceLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  distanceValue: {
    fontSize: 28,
    fontFamily: fonts.light,
    color: AMBER,
    letterSpacing: -0.5,
  },
  distanceHint: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: TEXT_3,
    marginTop: 4,
  },
  manualDistanceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  manualDistanceInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.4)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: "#e2e8f0",
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  manualDistanceUnit: {
    color: "#94a3b8",
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  odometerSection: {
    marginTop: 12,
  },
  odometerLabel: {
    color: colors.text2,
    fontFamily: fonts.semibold,
    fontSize: 13,
    marginBottom: 8,
  },
  odometerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  odometerInput: {
    flex: 1,
    marginBottom: 0,
  },
  odometerHint: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 6,
  },
  editedAt: {
    color: colors.text3,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    marginTop: 8,
    textAlign: "center",
  },
  recalcButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
    backgroundColor: "rgba(245, 166, 35, 0.10)",
    borderRadius: 8,
    minHeight: 28,
  },
  recalcButtonText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: AMBER,
  },
  confidenceBadge: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  confidenceBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  confidenceBadgeLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  confidenceReasons: {
    marginTop: 8,
    gap: 4,
  },
  confidenceReasonText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 17,
  },
  mergeSuggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(245, 166, 35, 0.10)",
    borderColor: "rgba(245, 166, 35, 0.30)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  cazTripCard: {
    backgroundColor: "rgba(245, 166, 35, 0.08)",
    borderColor: "rgba(245, 166, 35, 0.25)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  cazTripHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  cazTripTitle: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.text1 },
  cazTripBody: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.text2, lineHeight: 17, marginBottom: 8 },
  cazTripRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  cazTripZone: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text1 },
  cazTripCharge: { fontSize: 12, fontFamily: fonts.regular, color: AMBER, marginTop: 1 },
  cazLogBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cazLogBtnDone: { backgroundColor: "rgba(16,185,129,0.12)" },
  cazLogBtnText: { fontSize: 12.5, fontFamily: fonts.semibold, color: AMBER },
  cazTripDisclaimer: { fontSize: 11, fontFamily: fonts.regular, color: colors.text3, lineHeight: 15, marginTop: 8 },
  mergeSuggestionTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  mergeSuggestionBody: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: TEXT_2,
    lineHeight: 16,
    marginTop: 2,
  },
  mergeSuggestionButton: {
    backgroundColor: AMBER,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 64,
    alignItems: "center",
  },
  mergeSuggestionButtonText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: "#000",
  },
  detailsToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  detailsToggleText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: TEXT_1,
  },
  vehiclePicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  vehiclePickerText: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: "#fff",
  },
  // ── User location dot (driving mode) ──────────────────
  userDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(245, 166, 35, 0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  userDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: AMBER,
    borderWidth: 2,
    borderColor: "#fff",
  },
  // ── Celebration header ────────────────────────────────
  celebrationHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  celebCheckCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GREEN,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  celebTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: TEXT_1,
    marginBottom: 4,
  },
  celebDistance: {
    fontSize: 32,
    fontFamily: fonts.bold,
    color: AMBER,
    marginBottom: 2,
  },
  celebDuration: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: TEXT_2,
    marginBottom: 8,
  },
  celebMessage: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: GREEN,
  },
  // ── Anomaly card ──────────────────────────────────────
  anomalyCard: {
    backgroundColor: "#0a1628",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
    padding: 14,
    marginBottom: 16,
  },
  anomalyQuestion: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    marginBottom: 10,
  },
  anomalyOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  anomalyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  anomalyChipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  anomalyChipText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: TEXT_2,
  },
  anomalyChipTextActive: {
    color: BG,
  },
  // Location-based community questions
  locationQuestionsSection: {
    marginBottom: 16,
  },
  locationQuestionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  locationQuestionsTitle: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: AMBER,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  locationQuestionCard: {
    backgroundColor: "#0a1628",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.15)",
    padding: 14,
    marginBottom: 10,
  },
  locationQuestionTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  locationQuestionText: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: TEXT_1,
    flex: 1,
  },
});
