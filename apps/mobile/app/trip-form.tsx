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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import * as Location from "expo-location";
import { getCurrentLocation, reverseGeocode } from "../lib/location/geocoding";
import { fetchTrip, CreateTripData } from "../lib/api/trips";
import { getLocalTrip } from "../lib/db/queries";
import {
  syncCreateTrip,
  syncUpdateTrip,
  syncDeleteTrip,
} from "../lib/sync/actions";
import { fetchVehicles } from "../lib/api/vehicles";
import { GIG_PLATFORMS, haversineDistance, fetchRouteDistance } from "@mileclear/shared";
import type { TripClassification, PlatformTag, Vehicle } from "@mileclear/shared";
import { getDatabase } from "../lib/db/index";
import { LocationPickerField } from "../components/LocationPickerField";
import { DateTimePickerField } from "../components/DateTimePickerField";
import { Button } from "../components/Button";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Lazy import MapView for Expo Go compatibility
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
try {
  const Maps = require("react-native-maps");
  MapView = Maps.default;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
} catch {
  // Not available in Expo Go
}

type TripMode = "ready" | "driving" | "arrived" | "saving" | "manual" | "editing";

const QUICK_TRIP_KEY = "quick_trip_start";

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
  coordCount: number;
  speedFunFact?: string | null;
  distanceFunFact?: string | null;
}

function getSpeedFunFact(topMph: number): string | null {
  if (topMph >= 70) return "You hit motorway speed!";
  if (topMph >= 60) return "Dual carriageway pace";
  if (topMph >= 40) return "Faster than Usain Bolt (27 mph)";
  if (topMph >= 30) return "Town speed — nice and steady";
  if (topMph >= 15) return "Faster than a London cyclist";
  return null;
}

function getDistanceFunFact(miles: number): string | null {
  if (miles >= 100) return "That's London to Birmingham!";
  if (miles >= 60) return "That's London to Brighton and back";
  if (miles >= 30) return "That's London to Brighton";
  if (miles >= 10) return "That's about 528 football pitches";
  if (miles >= 5) return "That's roughly a parkrun distance";
  if (miles >= 1) return `That's about ${Math.round(miles * 20)} laps of a track`;
  return null;
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
      // End of non-stop stretch
      if (currentStretchMiles > longestNonStopMiles) {
        longestNonStopMiles = currentStretchMiles;
      }
      currentStretchMiles = 0;
    } else {
      timeMovingSecs += dt;
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
    coordCount: crumbs.length,
  };
}

const CLASSIFICATIONS: { value: TripClassification; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "personal", label: "Personal" },
];

export default function TripFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [mode, setMode] = useState<TripMode>(isEditing ? "editing" : "ready");
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
  const [classification, setClassification] = useState<TripClassification>("business");
  const [platformTag, setPlatformTag] = useState<PlatformTag | undefined>(undefined);
  const [vehicleId, setVehicleId] = useState<string | undefined>(undefined);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [notes, setNotes] = useState("");
  const [showDetails, setShowDetails] = useState(false);

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
  const [insights, setInsights] = useState<TripInsights | null>(null);

  // Pulsing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Init: check for in-progress trip or load existing ────────────────────

  useEffect(() => {
    if (isEditing) return; // Editing loads separately
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = ?",
          [QUICK_TRIP_KEY]
        );
        if (row) {
          // Resume in-progress trip
          const saved: QuickTripStart = JSON.parse(row.value);
          setStartLat(saved.lat);
          setStartLng(saved.lng);
          setStartAddress(saved.address);
          setStartedAt(new Date(saved.startedAt));
          setMode("driving");
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
  }, [isEditing]);

  // Load existing trip for editing
  useEffect(() => {
    if (!id) return;
    const populateTrip = (t: {
      classification: string; platformTag?: string | null; vehicleId?: string | null;
      startAddress?: string | null; endAddress?: string | null;
      startLat: number; startLng: number; endLat?: number | null; endLng?: number | null;
      distanceMiles: number; startedAt: string; endedAt?: string | null; notes?: string | null;
      insights?: TripInsights | null;
    }) => {
      setClassification(t.classification as TripClassification);
      setPlatformTag((t.platformTag ?? undefined) as PlatformTag | undefined);
      setVehicleId(t.vehicleId ?? undefined);
      setStartAddress(t.startAddress ?? null);
      setEndAddress(t.endAddress ?? null);
      setStartLat(t.startLat);
      setStartLng(t.startLng);
      setEndLat(t.endLat ?? null);
      setEndLng(t.endLng ?? null);
      setDistanceMiles(t.distanceMiles);
      setStartedAt(new Date(t.startedAt));
      setEndedAt(t.endedAt ? new Date(t.endedAt) : null);
      setNotes(t.notes ?? "");
      if (t.insights) setInsights(t.insights);
    };

    fetchTrip(id)
      .then((res) => populateTrip(res.data))
      .catch(async () => {
        const local = await getLocalTrip(id);
        if (local) populateTrip(local);
      })
      .finally(() => setLoading(false));
  }, [id]);

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

  // Auto-calculate distance via OSRM route (falls back to Haversine)
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  useEffect(() => {
    if (startLat == null || startLng == null || endLat == null || endLng == null) return;
    // In driving/arrived modes, distance is tracked via GPS breadcrumbs
    if (mode === "driving" || mode === "arrived") return;
    let cancelled = false;
    setCalculatingRoute(true);
    fetchRouteDistance(startLat, startLng, endLat, endLng)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setDistanceMiles(result.distanceMiles);
        } else {
          // Fallback to straight-line
          setDistanceMiles(
            Math.round(haversineDistance(startLat, startLng, endLat, endLng) * 100) / 100
          );
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

            // Store breadcrumb with speed for trip insights
            breadcrumbsRef.current.push({
              lat: latitude,
              lng: longitude,
              speed: speed ?? null,
              accuracy: accuracy ?? null,
              recordedAt: new Date(loc.timestamp).toISOString(),
            });

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
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleStartTrip = useCallback(async () => {
    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        Alert.alert("Location unavailable", "Could not get your current location. Check GPS permissions.");
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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMode("driving");

      const db = await getDatabase();
      const tripStart: QuickTripStart = { lat: loc.lat, lng: loc.lng, address: loc.address, startedAt: now.toISOString() };
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
        [QUICK_TRIP_KEY, JSON.stringify(tripStart)]
      );
    } catch {
      Alert.alert("Error", "Failed to get location.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleArrived = useCallback(async () => {
    setLoading(true);
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        Alert.alert("Location unavailable", "Could not get your current location.");
        setLoading(false);
        return;
      }
      setEndLat(loc.lat);
      setEndLng(loc.lng);
      setEndAddress(loc.address);
      const now = new Date();
      setEndedAt(now);

      // Calculate distance from breadcrumb trail (more accurate than straight-line)
      const crumbs = breadcrumbsRef.current;
      let trailDistance = 0;
      if (crumbs.length >= 2) {
        for (let i = 1; i < crumbs.length; i++) {
          trailDistance += haversineDistance(
            crumbs[i - 1].lat, crumbs[i - 1].lng,
            crumbs[i].lat, crumbs[i].lng
          );
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

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMode("arrived");
    } catch {
      Alert.alert("Error", "Failed to get location.");
    } finally {
      setLoading(false);
    }
  }, [startLat, startLng, startedAt]);

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

  const handleSave = useCallback(async () => {
    if (startLat == null || startLng == null) {
      Alert.alert("Missing location", "Set a start location.");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await syncUpdateTrip(id!, {
          classification,
          platformTag: platformTag ?? null,
          notes: notes.trim() || null,
          endAddress: endAddress ?? null,
          endLat: endLat ?? null,
          endLng: endLng ?? null,
          endedAt: endedAt ? endedAt.toISOString() : null,
        });
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
          ...(notes.trim() && { notes: notes.trim() }),
          ...(vehicleId && { vehicleId }),
          ...(coords && { coordinates: coords }),
        };
        await syncCreateTrip(data);

        // Clear persisted quick trip state
        const db = await getDatabase();
        await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [QUICK_TRIP_KEY]);
      }
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save trip");
    } finally {
      setSaving(false);
    }
  }, [
    isEditing, id, classification, platformTag, vehicleId,
    startAddress, endAddress, startLat, startLng, endLat, endLng,
    distanceMiles, startedAt, endedAt, notes, router,
  ]);

  const handleCancel = useCallback(() => {
    Alert.alert("Cancel trip?", "This will discard the current trip.", [
      { text: "Keep going", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
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
            Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete");
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
        <ActivityIndicator size="large" color="#f5a623" />
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

      {/* Map — visible in quick trip modes */}
      {showMap && (
        <View style={[styles.mapArea, mode === "driving" && styles.mapAreaDriving]}>
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
                  ? {
                      latitude: (startLat + endLat) / 2,
                      longitude: (startLng + endLng) / 2,
                      latitudeDelta: Math.abs(startLat - endLat) * 2.5 + 0.01,
                      longitudeDelta: Math.abs(startLng - endLng) * 2.5 + 0.01,
                    }
                  : undefined
              }
              userInterfaceStyle="dark"
              showsUserLocation={mode !== "arrived"}
              scrollEnabled={mode === "driving"}
              zoomEnabled={mode === "driving"}
              rotateEnabled={false}
              pitchEnabled={false}
              onPanDrag={mode === "driving" ? () => setFollowUser(false) : undefined}
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
                    pinColor="#ef4444"
                  />
                  <Polyline
                    coordinates={[
                      { latitude: startLat, longitude: startLng },
                      { latitude: endLat, longitude: endLng },
                    ]}
                    strokeColor="#f5a623"
                    strokeWidth={3}
                  />
                </>
              )}
            </MapView>
          ) : (
            <View style={[styles.map, styles.mapFallback]}>
              <Ionicons name="map-outline" size={32} color="#4b5563" />
              <Text style={styles.mapFallbackText}>
                {startAddress ?? "Locating..."}
              </Text>
            </View>
          )}

          {/* Re-center button during driving */}
          {mode === "driving" && !followUser && (
            <TouchableOpacity style={styles.recenterBtn} onPress={handleRecenter} activeOpacity={0.7}>
              <Ionicons name="locate-outline" size={20} color="#f0f2f5" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Bottom panel */}
      <ScrollView
        style={styles.panel}
        contentContainerStyle={styles.panelContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Ready State ── */}
        {mode === "ready" && (
          <>
            {startAddress && (
              <View style={styles.currentLocationRow}>
                <Ionicons name="location" size={14} color="#f5a623" />
                <Text style={styles.currentLocationText} numberOfLines={1}>
                  {startAddress}
                </Text>
              </View>
            )}

            <Button
              variant="hero"
              title="Start Trip"
              icon="navigate"
              onPress={handleStartTrip}
              loading={loading}
              size="lg"
            />

            <TouchableOpacity
              style={styles.manualLink}
              onPress={handleSwitchToManual}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={16} color="#8494a7" />
              <Text style={styles.manualLinkText}>Log a past trip instead</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Driving State ── */}
        {mode === "driving" && (
          <>
            <View style={styles.drivingHeader}>
              <View style={styles.liveIndicator}>
                <Animated.View
                  style={[
                    styles.liveDotOuter,
                    { transform: [{ scale: pulseAnim }] },
                  ]}
                />
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>TRIP IN PROGRESS</Text>
              </View>
              <Text style={styles.timerText}>{formatTimer(elapsed)}</Text>
            </View>
            {startAddress && (
              <Text style={styles.addressMuted}>From: {startAddress}</Text>
            )}

            <Button
              variant="hero"
              title="I've Arrived"
              icon="flag"
              onPress={handleArrived}
              loading={loading}
              size="lg"
            />
            <Button
              variant="ghost"
              title="Cancel trip"
              onPress={handleCancel}
              style={{ marginTop: 8 }}
            />
          </>
        )}

        {/* ── Arrived State ── */}
        {mode === "arrived" && (
          <>
            {/* Route summary */}
            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: "#34c759" }]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {startAddress ?? "Start location"}
                </Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: "#ef4444" }]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {endAddress ?? "End location"}
                </Text>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{distance != null ? `${distance}` : "--"}</Text>
                <Text style={styles.statUnit}>miles</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{duration != null ? formatTimer(duration) : "--"}</Text>
                <Text style={styles.statUnit}>duration</Text>
              </View>
            </View>

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
                    <Text style={styles.insightValue}>{insights.routeEfficiency}x</Text>
                    <Text style={styles.insightLabel}>Route</Text>
                  </View>
                </View>
                {insights.longestNonStopMiles > 0.1 && (
                  <Text style={styles.insightNote}>
                    Longest non-stop stretch: {insights.longestNonStopMiles} mi
                  </Text>
                )}
                {insights.timeStoppedSecs > 60 && (
                  <Text style={styles.insightNote}>
                    {Math.round((insights.timeMovingSecs / (insights.timeMovingSecs + insights.timeStoppedSecs)) * 100)}% of your trip was spent moving
                  </Text>
                )}
                {getSpeedFunFact(insights.topSpeedMph) && (
                  <Text style={styles.insightFunFact}>{getSpeedFunFact(insights.topSpeedMph)}</Text>
                )}
                {distance != null && getDistanceFunFact(distance) && (
                  <Text style={styles.insightFunFact}>{getDistanceFunFact(distance)}</Text>
                )}
              </View>
            )}

            {/* Classification */}
            <View style={styles.classRow}>
              {CLASSIFICATIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.classChip, classification === opt.value && styles.classChipActive]}
                  onPress={() => setClassification(opt.value)}
                >
                  <Text
                    style={[styles.classChipText, classification === opt.value && styles.classChipTextActive]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Platform quick-select for business */}
            {classification === "business" && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.platformRow}
                style={{ marginBottom: 16 }}
              >
                <TouchableOpacity
                  style={[styles.platformChip, !platformTag && styles.platformChipActive]}
                  onPress={() => setPlatformTag(undefined)}
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
                  >
                    <Text
                      style={[styles.platformChipText, platformTag === p.value && styles.platformChipTextActive]}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Button title="Save Trip" icon="checkmark" onPress={handleSave} loading={saving} />
            <Button variant="ghost" title="Discard" onPress={handleCancel} style={{ marginTop: 8 }} />
          </>
        )}

        {/* ── Saving State ── */}
        {mode === "saving" && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#f5a623" />
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
              >
                <Ionicons name="navigate-outline" size={16} color="#f5a623" />
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
              {!calculatingRoute && distanceMiles != null && (
                <Text style={styles.distanceHint}>Route distance via road</Text>
              )}
              {!calculatingRoute && distanceMiles == null && (
                <Text style={styles.distanceHint}>Set both locations to auto-calculate</Text>
              )}
            </View>

            {/* Trip Insights (from GPS data — editing mode) */}
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
                    <Text style={styles.insightValue}>{insights.routeEfficiency}x</Text>
                    <Text style={styles.insightLabel}>Route</Text>
                  </View>
                </View>
                {insights.longestNonStopMiles > 0.1 && (
                  <Text style={styles.insightNote}>
                    Longest non-stop stretch: {insights.longestNonStopMiles} mi
                  </Text>
                )}
                {insights.timeStoppedSecs > 60 && (
                  <Text style={styles.insightNote}>
                    {Math.round((insights.timeMovingSecs / (insights.timeMovingSecs + insights.timeStoppedSecs)) * 100)}% of your trip was spent moving
                  </Text>
                )}
                {getSpeedFunFact(insights.topSpeedMph) && (
                  <Text style={styles.insightFunFact}>{getSpeedFunFact(insights.topSpeedMph)}</Text>
                )}
                {distance != null && getDistanceFunFact(distance) && (
                  <Text style={styles.insightFunFact}>{getDistanceFunFact(distance)}</Text>
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
                >
                  <Text
                    style={[styles.classChipText, classification === opt.value && styles.classChipTextActive]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Collapsible Details */}
            <TouchableOpacity
              style={styles.detailsToggle}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowDetails(!showDetails);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.detailsToggleText}>Details</Text>
              <Ionicons
                name={showDetails ? "chevron-up" : "chevron-down"}
                size={18}
                color="#6b7280"
              />
            </TouchableOpacity>

            {showDetails && (
              <View>
                {/* Platform */}
                <Text style={styles.label}>Platform</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.platformRow}
                >
                  <TouchableOpacity
                    style={[styles.platformChip, !platformTag && styles.platformChipActive]}
                    onPress={() => setPlatformTag(undefined)}
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
                    >
                      <Text
                        style={[styles.platformChipText, platformTag === p.value && styles.platformChipTextActive]}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Vehicle */}
                <Text style={styles.label}>Vehicle</Text>
                <TouchableOpacity
                  style={styles.vehiclePicker}
                  onPress={handleSelectVehicle}
                  activeOpacity={0.7}
                >
                  <Text style={styles.vehiclePickerText}>
                    {selectedVehicle
                      ? `${selectedVehicle.make} ${selectedVehicle.model}`
                      : "None selected"}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                </TouchableOpacity>

                {/* Notes */}
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional notes about this trip"
                  placeholderTextColor="#6b7280"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            )}

            {/* Save */}
            <Button
              title={isEditing ? "Save Changes" : "Add Trip"}
              icon="checkmark"
              onPress={handleSave}
              loading={saving}
              disabled={deleting}
              style={{ marginTop: 28 }}
            />

            {/* Delete — edit mode only */}
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
      </ScrollView>
    </View>
  );
}

const AMBER = "#f5a623";
const TEXT_1 = "#f0f2f5";
const TEXT_2 = "#8494a7";
const CARD_BG = "#0a1120";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 12,
  },
  // ── Map ──────────────────────────────────────────────
  mapArea: {
    height: 240,
  },
  mapAreaDriving: {
    height: 280,
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  mapFallbackText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  recenterBtn: {
    position: "absolute",
    bottom: 12,
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
  // ── Panel ────────────────────────────────────────────
  panel: {
    flex: 1,
  },
  panelContent: {
    padding: 20,
    paddingBottom: 40,
  },
  // ── Ready state ──────────────────────────────────────
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
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
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
    fontFamily: "PlusJakartaSans_500Medium",
    color: AMBER,
  },
  // ── Driving state ────────────────────────────────────
  drivingHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#34c759",
    position: "absolute",
    left: 0,
  },
  liveDotOuter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(52, 199, 89, 0.3)",
    position: "absolute",
    left: 0,
  },
  liveText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#34c759",
    letterSpacing: 1.5,
    marginLeft: 14,
  },
  timerText: {
    fontSize: 48,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    fontVariant: ["tabular-nums"],
    letterSpacing: 3,
  },
  addressMuted: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginBottom: 16,
    textAlign: "center",
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
    fontFamily: "PlusJakartaSans_500Medium",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  statUnit: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_700Bold",
    color: TEXT_1,
  },
  insightLabel: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  insightNote: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginTop: 8,
  },
  insightFunFact: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: AMBER,
    marginTop: 6,
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
    backgroundColor: "#111827",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  classChipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  classChipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  classChipTextActive: {
    color: "#030712",
  },
  platformRow: {
    gap: 8,
    paddingVertical: 2,
  },
  platformChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  platformChipActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  platformChipText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#9ca3af",
  },
  platformChipTextActive: {
    color: "#030712",
  },
  // ── Manual form fields ───────────────────────────────
  label: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#d1d5db",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  notesInput: {
    minHeight: 80,
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  distanceValue: {
    fontSize: 28,
    fontFamily: "PlusJakartaSans_300Light",
    color: AMBER,
    letterSpacing: -0.5,
  },
  distanceHint: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#4a5568",
    marginTop: 4,
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: TEXT_1,
  },
  vehiclePicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  vehiclePickerText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#fff",
  },
});
