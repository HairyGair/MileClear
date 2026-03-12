import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  UIManager,
  Platform,
  Animated,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { haversineDistance, formatMiles } from "@mileclear/shared";
import type { TripDetail } from "../../lib/api/trips";

// Lazy import for Expo Go compatibility — check native module exists before requiring
let MapViewComponent: any = null;
let PolylineComponent: any = null;
let MarkerComponent: any = null;
const hasNativeMap =
  Platform.OS !== "web" &&
  UIManager.getViewManagerConfig?.("AIRMap") != null;
if (hasNativeMap) {
  try {
    const RNMaps = require("react-native-maps");
    MapViewComponent = RNMaps.default;
    PolylineComponent = RNMaps.Polyline;
    MarkerComponent = RNMaps.Marker;
  } catch {
    // Not available
  }
}

const TRIP_COLOURS = [
  "#f5a623", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#ef4444", // red
  "#eab308", // yellow
];

type TimeFilter = "today" | "week" | "month" | "all";

const FILTER_LABELS: Record<TimeFilter, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All",
};

interface MapOverviewProps {
  trips: TripDetail[];
  title?: string;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getStartOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfWeek(): Date {
  const d = getStartOfDay();
  const day = d.getDay();
  // Monday = start of week (UK)
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d;
}

function getStartOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function filterTrips(trips: TripDetail[], filter: TimeFilter): TripDetail[] {
  if (filter === "all") return trips;
  const cutoff = filter === "today" ? getStartOfDay()
    : filter === "week" ? getStartOfWeek()
    : getStartOfMonth();
  return trips.filter((t) => new Date(t.startedAt) >= cutoff);
}

export function MapOverview({ trips, title }: MapOverviewProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<number | null>(null);
  const [sheetAnim] = useState(() => new Animated.Value(250));
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const allTripsWithCoords = useMemo(
    () => trips.filter((t) => t.coordinates.length >= 2),
    [trips]
  );

  // Inline card always shows all trips; fullscreen respects the filter
  const filteredTrips = useMemo(
    () => filterTrips(allTripsWithCoords, timeFilter),
    [allTripsWithCoords, timeFilter]
  );

  const showSheet = useCallback(
    (index: number) => {
      setSelectedTrip(index);
      sheetAnim.setValue(250);
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    },
    [sheetAnim]
  );

  const dismissSheet = useCallback(() => {
    Animated.timing(sheetAnim, {
      toValue: 250,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedTrip(null));
  }, [sheetAnim]);

  if (allTripsWithCoords.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="map-outline" size={28} color="rgba(245, 166, 35, 0.3)" />
        <Text style={styles.emptyTitle}>No routes yet</Text>
        <Text style={styles.emptyText}>
          Your recent journeys will appear here as a map overlay
        </Text>
      </View>
    );
  }

  const computeRegion = (tripsToShow: TripDetail[]) => {
    const allCoords = tripsToShow.flatMap((t) => t.coordinates);
    if (allCoords.length === 0) return null;
    let minLat = allCoords[0].lat;
    let maxLat = allCoords[0].lat;
    let minLng = allCoords[0].lng;
    let maxLng = allCoords[0].lng;
    for (const c of allCoords) {
      if (c.lat < minLat) minLat = c.lat;
      if (c.lat > maxLat) maxLat = c.lat;
      if (c.lng < minLng) minLng = c.lng;
      if (c.lng > maxLng) maxLng = c.lng;
    }
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
      longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.01),
    };
  };

  const inlineRegion = computeRegion(allTripsWithCoords);
  const fullscreenRegion = computeRegion(filteredTrips) ?? inlineRegion;

  if (!MapViewComponent || !PolylineComponent || !inlineRegion) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="map-outline" size={28} color="rgba(245, 166, 35, 0.3)" />
        <Text style={styles.emptyTitle}>Map requires a development build</Text>
        <Text style={styles.emptyText}>
          Route overlay is not available in Expo Go
        </Text>
      </View>
    );
  }

  const selectedInfo = selectedTrip != null ? filteredTrips[selectedTrip] : null;
  const selectedColor = selectedTrip != null ? TRIP_COLOURS[selectedTrip % TRIP_COLOURS.length] : "#f5a623";

  const renderMapContent = (tripsToShow: TripDetail[], interactive: boolean, height: number | "full", region: any) => (
    <MapViewComponent
      style={height === "full" ? StyleSheet.absoluteFillObject : { height }}
      region={region}
      userInterfaceStyle="dark"
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      showsUserLocation={false}
      showsCompass={false}
      showsScale={false}
      showsPointsOfInterest={false}
    >
      {tripsToShow.map((trip, i) => {
        const color = TRIP_COLOURS[i % TRIP_COLOURS.length];
        const isSelected = selectedTrip === i;
        const isDimmed = selectedTrip != null && !isSelected;
        const coords = trip.coordinates.map((c) => ({
          latitude: c.lat,
          longitude: c.lng,
        }));
        const first = coords[0];
        const last = coords[coords.length - 1];

        return (
          <View key={trip.id}>
            <PolylineComponent
              coordinates={coords}
              strokeColor={isDimmed ? `${color}40` : color}
              strokeWidth={isSelected ? 5 : 3}
              tappable
              onPress={() => showSheet(i)}
            />
            {MarkerComponent && interactive && (
              <>
                <MarkerComponent
                  coordinate={first}
                  anchor={{ x: 0.5, y: 0.5 }}
                  onPress={() => showSheet(i)}
                >
                  <View style={[styles.tripDot, { backgroundColor: "#34c759", borderColor: isDimmed ? "#34c75940" : "#34c759" }]}>
                    <View style={[styles.tripDotInner, { backgroundColor: isDimmed ? "#34c75940" : "#34c759" }]} />
                  </View>
                </MarkerComponent>
                <MarkerComponent
                  coordinate={last}
                  anchor={{ x: 0.5, y: 0.5 }}
                  onPress={() => showSheet(i)}
                >
                  <View style={[styles.tripDot, { borderColor: isDimmed ? `${color}40` : color }]}>
                    <View style={[styles.tripDotInner, { backgroundColor: isDimmed ? `${color}40` : color }]} />
                  </View>
                </MarkerComponent>
              </>
            )}
          </View>
        );
      })}
    </MapViewComponent>
  );

  // Inline legend
  const legend = (
    <View style={styles.legendRow}>
      {allTripsWithCoords.map((trip, i) => {
        const color = TRIP_COLOURS[i % TRIP_COLOURS.length];
        return (
          <View key={trip.id} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {trip.distanceMiles.toFixed(1)} mi
            </Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => setFullscreen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Journey map, ${allTripsWithCoords.length} trip${allTripsWithCoords.length !== 1 ? "s" : ""}. Tap to expand`}
      >
        {title && <Text style={styles.cardTitle}>{title}</Text>}
        <View style={styles.mapContainer}>
          {renderMapContent(allTripsWithCoords, false, 240, inlineRegion)}
          <View style={styles.tapHint}>
            <Ionicons name="expand-outline" size={12} color="#8494a7" />
            <Text style={styles.tapHintText}>Tap to expand</Text>
          </View>
          <View style={styles.tripCountBadge}>
            <Text style={styles.tripCountText}>
              {allTripsWithCoords.length} trip{allTripsWithCoords.length !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        {legend}
      </TouchableOpacity>

      {/* ── Fullscreen Modal ── */}
      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => { dismissSheet(); setFullscreen(false); }}
      >
        <View style={styles.fullscreenContainer} accessibilityViewIsModal>
          {renderMapContent(filteredTrips, true, "full", fullscreenRegion)}

          {/* Time filter pills */}
          <SafeAreaView style={styles.filterBar}>
            <View style={styles.filterRow}>
              {(Object.keys(FILTER_LABELS) as TimeFilter[]).map((f) => {
                const isActive = timeFilter === f;
                const count = filterTrips(allTripsWithCoords, f).length;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterPill, isActive && styles.filterPillActive]}
                    onPress={() => {
                      setTimeFilter(f);
                      setSelectedTrip(null);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${FILTER_LABELS[f]}, ${count} trips`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                      {FILTER_LABELS[f]}
                    </Text>
                    <Text style={[styles.filterPillCount, isActive && styles.filterPillCountActive]}>
                      {count}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SafeAreaView>

          {/* Trip info bottom sheet */}
          {selectedInfo && (
            <Animated.View
              style={[
                styles.tripSheet,
                { transform: [{ translateY: sheetAnim }] },
              ]}
            >
              <TouchableOpacity
                style={styles.tripSheetDismiss}
                onPress={dismissSheet}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Dismiss trip details"
              >
                <View style={styles.sheetHandle} />
              </TouchableOpacity>
              <View style={styles.tripSheetHeader}>
                <View style={[styles.tripSheetDot, { backgroundColor: selectedColor }]} />
                <Text style={styles.tripSheetTitle}>
                  Trip {selectedTrip! + 1}
                </Text>
                <Text style={styles.tripSheetTime}>
                  {formatTime(selectedInfo.startedAt)}
                  {selectedInfo.endedAt ? ` - ${formatTime(selectedInfo.endedAt)}` : ""}
                </Text>
              </View>
              <View style={styles.tripSheetStats}>
                <View style={styles.tripSheetStat}>
                  <Text style={[styles.tripSheetStatValue, { color: selectedColor }]}>
                    {selectedInfo.distanceMiles.toFixed(1)}
                  </Text>
                  <Text style={styles.tripSheetStatLabel}>miles</Text>
                </View>
                {selectedInfo.endedAt && (
                  <View style={styles.tripSheetStat}>
                    <Text style={[styles.tripSheetStatValue, { color: selectedColor }]}>
                      {formatDuration(
                        Math.round(
                          (new Date(selectedInfo.endedAt).getTime() -
                            new Date(selectedInfo.startedAt).getTime()) /
                            1000
                        )
                      )}
                    </Text>
                    <Text style={styles.tripSheetStatLabel}>duration</Text>
                  </View>
                )}
                {selectedInfo.insights?.avgMovingSpeedMph != null && (
                  <View style={styles.tripSheetStat}>
                    <Text style={[styles.tripSheetStatValue, { color: selectedColor }]}>
                      {selectedInfo.insights.avgMovingSpeedMph}
                    </Text>
                    <Text style={styles.tripSheetStatLabel}>avg mph</Text>
                  </View>
                )}
              </View>
              <View style={styles.tripSheetRoute}>
                <View style={styles.tripSheetRouteRow}>
                  <View style={[styles.routeCircle, { backgroundColor: "#34c759" }]} />
                  <Text style={styles.tripSheetRouteText} numberOfLines={1}>
                    {selectedInfo.startAddress ?? "Start"}
                  </Text>
                </View>
                <View style={styles.tripSheetRouteLine} />
                <View style={styles.tripSheetRouteRow}>
                  <View style={[styles.routeCircle, { backgroundColor: selectedColor }]} />
                  <Text style={styles.tripSheetRouteText} numberOfLines={1}>
                    {selectedInfo.endAddress ?? "End"}
                  </Text>
                </View>
              </View>
              <View style={styles.tripSheetMeta}>
                <View style={[styles.classificationBadge, selectedInfo.classification === "business" ? styles.businessBadge : styles.personalBadge]}>
                  <Text style={styles.classificationText}>
                    {selectedInfo.classification === "business" ? "Business" : "Personal"}
                  </Text>
                </View>
                {selectedInfo.platformTag && (
                  <View style={styles.platformBadge}>
                    <Text style={styles.platformBadgeText}>{selectedInfo.platformTag}</Text>
                  </View>
                )}
              </View>
            </Animated.View>
          )}

          {/* Trip list — scrollable at bottom when no trip selected */}
          {selectedTrip == null && (
            <View style={styles.tripListContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tripListScroll}
              >
                {filteredTrips.map((trip, i) => {
                  const color = TRIP_COLOURS[i % TRIP_COLOURS.length];
                  return (
                    <TouchableOpacity
                      key={trip.id}
                      style={styles.tripListCard}
                      onPress={() => showSheet(i)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Trip ${i + 1}, ${trip.distanceMiles.toFixed(1)} miles, ${trip.startAddress ?? "Unknown"} to ${trip.endAddress ?? "Unknown"}`}
                    >
                      <View style={styles.tripListHeader}>
                        <View style={[styles.legendDot, { backgroundColor: color }]} />
                        <Text style={styles.tripListDate}>{formatDate(trip.startedAt)}</Text>
                        <Text style={[styles.tripListDistance, { color }]}>
                          {trip.distanceMiles.toFixed(1)} mi
                        </Text>
                      </View>
                      <Text style={styles.tripListAddress} numberOfLines={1}>
                        {trip.startAddress ?? "Unknown"}
                      </Text>
                      <View style={styles.tripListArrow}>
                        <Ionicons name="arrow-forward" size={10} color="#64748b" />
                      </View>
                      <Text style={styles.tripListAddress} numberOfLines={1}>
                        {trip.endAddress ?? "Unknown"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {filteredTrips.length === 0 && (
                  <View style={styles.tripListEmpty}>
                    <Text style={styles.tripListEmptyText}>No trips for this period</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}

          {/* Close button */}
          <SafeAreaView style={styles.closeBtnSafe}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                dismissSheet();
                setFullscreen(false);
                setTimeFilter("all");
              }}
              accessibilityRole="button"
              accessibilityLabel="Close journey map"
            >
              <Ionicons name="close" size={18} color="#f0f2f5" />
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "#0a1120",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mapContainer: {
    height: 240,
    position: "relative",
  },
  tapHint: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(3, 7, 18, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tapHintText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
  },
  tripCountBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(3, 7, 18, 0.8)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245, 166, 35, 0.2)",
  },
  tripCountText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#f5a623",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#c9d1d9",
  },
  emptyCard: {
    backgroundColor: "#0a1120",
    borderRadius: 16,
    padding: 32,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#8494a7",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: "#030712",
  },
  // Close button
  closeBtnSafe: {
    position: "absolute",
    top: 0,
    right: 16,
  },
  closeBtn: {
    marginTop: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(3, 7, 18, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  // Filter bar
  filterBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 56,
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
    marginLeft: 16,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(3, 7, 18, 0.8)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterPillActive: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
    borderColor: "rgba(245, 166, 35, 0.4)",
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
  },
  filterPillTextActive: {
    color: "#f5a623",
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  filterPillCount: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#64748b",
  },
  filterPillCountActive: {
    color: "#f5a623",
  },
  // Trip dot markers
  tripDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tripDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  // Trip info bottom sheet
  tripSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0a1120",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tripSheetDismiss: {
    alignItems: "center",
    paddingVertical: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tripSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  tripSheetDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tripSheetTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#f0f2f5",
  },
  tripSheetTime: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#8494a7",
    marginLeft: "auto",
  },
  tripSheetStats: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 14,
  },
  tripSheetStat: {
    alignItems: "center",
  },
  tripSheetStatValue: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  tripSheetStatLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tripSheetRoute: {
    marginBottom: 12,
  },
  tripSheetRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tripSheetRouteText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#c9d1d9",
    flex: 1,
  },
  tripSheetRouteLine: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginLeft: 3.5,
    marginVertical: 2,
  },
  tripSheetMeta: {
    flexDirection: "row",
    gap: 8,
  },
  classificationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  businessBadge: {
    backgroundColor: "rgba(245, 166, 35, 0.15)",
  },
  personalBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  classificationText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#c9d1d9",
  },
  platformBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  platformBadgeText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#93c5fd",
  },
  // Trip list (horizontal scroll at bottom of fullscreen)
  tripListContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 34,
  },
  tripListScroll: {
    paddingHorizontal: 16,
    gap: 10,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tripListCard: {
    width: 180,
    backgroundColor: "rgba(10, 17, 32, 0.92)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tripListHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  tripListDate: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#8494a7",
    flex: 1,
  },
  tripListDistance: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  tripListAddress: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#c9d1d9",
  },
  tripListArrow: {
    marginVertical: 2,
    marginLeft: 2,
  },
  tripListEmpty: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "rgba(10, 17, 32, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tripListEmptyText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: "#6b7280",
  },
});
