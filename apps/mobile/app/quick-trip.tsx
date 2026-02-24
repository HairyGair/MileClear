import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { getCurrentLocation, reverseGeocode } from "../lib/location/geocoding";
import { syncCreateTrip } from "../lib/sync/actions";
import { haversineDistance } from "@mileclear/shared";
import type { TripClassification, PlatformTag } from "@mileclear/shared";
import { getDatabase } from "../lib/db/index";
import { Button } from "../components/Button";

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

type QuickTripState = "ready" | "driving" | "arrived" | "saving";

interface QuickTripStart {
  lat: number;
  lng: number;
  address: string | null;
  startedAt: string; // ISO string
}

const QUICK_TRIP_KEY = "quick_trip_start";

export default function QuickTripScreen() {
  const router = useRouter();
  const [state, setState] = useState<QuickTripState>("ready");
  const [loading, setLoading] = useState(true);

  // Start data
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);

  // End data
  const [endLat, setEndLat] = useState<number | null>(null);
  const [endLng, setEndLng] = useState<number | null>(null);
  const [endAddress, setEndAddress] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);

  // Confirmation options
  const [classification, setClassification] = useState<TripClassification>("business");
  const [platformTag, setPlatformTag] = useState<PlatformTag | undefined>(undefined);

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check for in-progress quick trip on mount
  useEffect(() => {
    (async () => {
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = ?",
          [QUICK_TRIP_KEY]
        );
        if (row) {
          const saved: QuickTripStart = JSON.parse(row.value);
          setStartLat(saved.lat);
          setStartLng(saved.lng);
          setStartAddress(saved.address);
          setStartTime(new Date(saved.startedAt));
          setState("driving");
        } else {
          // Get current location for ready state
          const loc = await getCurrentLocation();
          if (loc) {
            setStartLat(loc.lat);
            setStartLng(loc.lng);
            setStartAddress(loc.address);
          }
        }
      } catch {
        // Ignore — start fresh
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Elapsed timer for driving state
  useEffect(() => {
    if (state === "driving" && startTime) {
      const update = () => {
        setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
      };
      update();
      timerRef.current = setInterval(update, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state, startTime]);

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
      setStartTime(now);
      setState("driving");

      // Persist in-progress state
      const db = await getDatabase();
      const tripStart: QuickTripStart = {
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address,
        startedAt: now.toISOString(),
      };
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
      setEndTime(new Date());
      setState("arrived");
    } catch {
      Alert.alert("Error", "Failed to get location.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (startLat == null || startLng == null || !startTime) return;
    setState("saving");
    try {
      const distance =
        endLat != null && endLng != null
          ? Math.round(haversineDistance(startLat, startLng, endLat, endLng) * 100) / 100
          : 0;

      await syncCreateTrip({
        startLat,
        startLng,
        startAddress: startAddress ?? undefined,
        endLat: endLat ?? undefined,
        endLng: endLng ?? undefined,
        endAddress: endAddress ?? undefined,
        distanceMiles: distance,
        startedAt: startTime.toISOString(),
        endedAt: endTime ? endTime.toISOString() : undefined,
        classification,
        platformTag,
      });

      // Clear persisted state
      const db = await getDatabase();
      await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [QUICK_TRIP_KEY]);

      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save trip");
      setState("arrived");
    }
  }, [startLat, startLng, startAddress, endLat, endLng, endAddress, startTime, endTime, classification, platformTag, router]);

  const handleCancel = useCallback(() => {
    Alert.alert("Cancel trip?", "This will discard the current quick trip.", [
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

  if (loading && state === "ready") {
    return (
      <View style={[styles.container, styles.centered]}>
        <Stack.Screen options={{ title: "Quick Trip" }} />
        <ActivityIndicator size="large" color="#f5a623" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  const distance =
    startLat != null && startLng != null && endLat != null && endLng != null
      ? Math.round(haversineDistance(startLat, startLng, endLat, endLng) * 100) / 100
      : null;

  const duration =
    startTime && endTime
      ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
      : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Quick Trip" }} />

      {/* Map area */}
      <View style={styles.mapArea}>
        {MapView && startLat != null && startLng != null ? (
          <MapView
            style={styles.map}
            region={{
              latitude: state === "arrived" && endLat != null
                ? (startLat + endLat) / 2
                : startLat,
              longitude: state === "arrived" && endLng != null
                ? (startLng + endLng) / 2
                : startLng,
              latitudeDelta: state === "arrived" && endLat != null
                ? Math.abs(startLat - endLat) * 2.5 + 0.01
                : 0.01,
              longitudeDelta: state === "arrived" && endLng != null
                ? Math.abs(startLng - endLng) * 2.5 + 0.01
                : 0.01,
            }}
            userInterfaceStyle="dark"
            showsUserLocation={state !== "arrived"}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            {/* Start marker */}
            <Marker
              coordinate={{ latitude: startLat, longitude: startLng }}
              pinColor="#34c759"
            />
            {/* End marker */}
            {state === "arrived" && endLat != null && endLng != null && (
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
            <Text style={styles.mapFallbackText}>
              {startAddress ?? "Locating..."}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom panel */}
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {/* ── Ready State ── */}
        {state === "ready" && (
          <>
            <Text style={styles.stateTitle}>Ready to go</Text>
            {startAddress && (
              <Text style={styles.addressText}>{startAddress}</Text>
            )}
            <Button
              variant="hero"
              title="I'm at my start"
              icon="locate"
              onPress={handleStartTrip}
              loading={loading}
              size="lg"
            />
          </>
        )}

        {/* ── Driving State ── */}
        {state === "driving" && (
          <>
            <View style={styles.drivingHeader}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>IN PROGRESS</Text>
              </View>
              <Text style={styles.timerText}>{formatTimer(elapsed)}</Text>
            </View>
            {startAddress && (
              <Text style={styles.addressMuted}>From: {startAddress}</Text>
            )}
            <Button
              variant="hero"
              title="I've arrived"
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
        {state === "arrived" && (
          <>
            <Text style={styles.stateTitle}>Trip complete</Text>

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
                <Text style={styles.statValue}>
                  {distance != null ? `${distance}` : "--"}
                </Text>
                <Text style={styles.statUnit}>miles</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {duration != null ? formatTimer(duration) : "--"}
                </Text>
                <Text style={styles.statUnit}>duration</Text>
              </View>
            </View>

            {/* Classification */}
            <View style={styles.classRow}>
              <TouchableOpacity
                style={[
                  styles.classChip,
                  classification === "business" && styles.classChipActive,
                ]}
                onPress={() => setClassification("business")}
              >
                <Text
                  style={[
                    styles.classChipText,
                    classification === "business" && styles.classChipTextActive,
                  ]}
                >
                  Business
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.classChip,
                  classification === "personal" && styles.classChipActive,
                ]}
                onPress={() => setClassification("personal")}
              >
                <Text
                  style={[
                    styles.classChipText,
                    classification === "personal" && styles.classChipTextActive,
                  ]}
                >
                  Personal
                </Text>
              </TouchableOpacity>
            </View>

            {/* Save */}
            <Button
              title="Save Trip"
              icon="checkmark"
              onPress={handleSave}
            />
            <Button
              variant="ghost"
              title="Discard"
              onPress={handleCancel}
              style={{ marginTop: 8 }}
            />
          </>
        )}

        {/* ── Saving State ── */}
        {state === "saving" && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#f5a623" />
            <Text style={styles.loadingText}>Saving trip...</Text>
          </View>
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
  // Map
  mapArea: {
    height: 280,
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  mapFallbackText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_500Medium",
    color: TEXT_2,
  },
  // Panel
  panel: {
    flex: 1,
    backgroundColor: "#030712",
  },
  panelContent: {
    padding: 20,
    paddingBottom: 40,
  },
  // State titles
  stateTitle: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    marginBottom: 8,
  },
  addressText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginBottom: 20,
  },
  addressMuted: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: TEXT_2,
    marginBottom: 16,
  },
  // Driving
  drivingHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
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
  timerText: {
    fontSize: 48,
    fontFamily: "PlusJakartaSans_300Light",
    color: TEXT_1,
    fontVariant: ["tabular-nums"],
    letterSpacing: 3,
  },
  // Route card
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
  // Stats
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
  // Classification
  classRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#030712",
  },
});
