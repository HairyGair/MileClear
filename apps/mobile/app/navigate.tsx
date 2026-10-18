// Navigate: turn-by-turn directions on our own routes (Oct 2026 trial,
// docs/navigation-build-oct2026.md). Hidden unless /user/profile says
// navigationEnabled. Pick a place, see the route, Start, follow the voice.
//
// Guidance reads the trip recorder's GPS fixes and never changes recording:
// no trip is started, stopped or sorted from here. Arriving just ends the
// directions.

import { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  UIManager,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LocationPickerField } from "../components/LocationPickerField";
import { Button } from "../components/Button";
import { colors, fonts, radii, spacing } from "../lib/theme";
import { useUser } from "../lib/user/context";
import { useGuidance } from "../lib/navigation/useGuidance";
import {
  arrivalClock,
  arrowIcon,
  bannerSubtitle,
  bannerTitle,
  displayDistance,
  durationWords,
  milesWords,
} from "../lib/navigation/phrases";
import { voiceAvailable } from "../lib/navigation/voice";
import { safeBack } from "../lib/nav";

// ── Lazy native map import (Expo Go safe), as LiveMapTracker ─────────
let MapViewComponent: any = null;
let PolylineComponent: any = null;
let MarkerComponent: any = null;
const hasNativeMap = Platform.OS !== "web" && UIManager.getViewManagerConfig?.("AIRMap") != null;
if (hasNativeMap) {
  try {
    const RNMaps = require("react-native-maps");
    MapViewComponent = RNMaps.default;
    PolylineComponent = RNMaps.Polyline;
    MarkerComponent = RNMaps.Marker;
  } catch {
    // not available
  }
}

const UK_REGION = { latitude: 54.0, longitude: -2.5, latitudeDelta: 9, longitudeDelta: 9 };

export default function NavigateScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const g = useGuidance();
  const mapRef = useRef<any>(null);

  const line = useMemo(
    () => (g.route ? g.route.geometry.map(([latitude, longitude]) => ({ latitude, longitude })) : []),
    [g.route]
  );

  // Preview: fit the whole route on screen.
  useEffect(() => {
    if (g.phase !== "preview" || line.length < 2 || !mapRef.current) return;
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(line, {
          edgePadding: { top: 60, right: 40, bottom: 260, left: 40 },
          animated: true,
        });
      } catch {
        // best effort
      }
    }, 300);
    return () => clearTimeout(t);
  }, [g.phase, line]);

  // Guiding: follow the car, heading up.
  const position = g.view?.position ?? (g.lastFix ? { lat: g.lastFix.lat, lng: g.lastFix.lng } : null);
  const course = g.view?.courseDeg ?? null;
  useEffect(() => {
    if (g.phase !== "guiding" || !position || !mapRef.current) return;
    try {
      mapRef.current.animateCamera(
        {
          center: { latitude: position.lat, longitude: position.lng },
          heading: course ?? 0,
          pitch: 45,
          zoom: 17,
          altitude: 450,
        },
        { duration: 900 }
      );
    } catch {
      // best effort
    }
  }, [g.phase, position?.lat, position?.lng, course]); // eslint-disable-line react-hooks/exhaustive-deps

  const guiding = g.phase === "guiding";
  const header = <Stack.Screen options={{ headerShown: !guiding, gestureEnabled: !guiding }} />;

  // The server is the gate; this only stops a stale link opening an empty page.
  if (user && user.navigationEnabled !== true) {
    return (
      <View style={styles.page}>
        {header}
        <View style={styles.centred}>
          <Text style={styles.body}>Navigation isn't switched on for your account.</Text>
        </View>
      </View>
    );
  }

  // ── Pick a destination ──────────────────────────────────────────────
  if (g.phase === "pick" || g.phase === "routing") {
    return (
      <View style={styles.page}>
        {header}
        <ScrollView contentContainerStyle={styles.pickContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Where to?</Text>
          <Text style={styles.body}>
            Directions to anywhere in Great Britain, spoken as you drive. There's no live traffic yet, so times assume
            clear roads. Your trips record exactly as they always do.
          </Text>
          {g.error && (
            <View style={styles.errorCard} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={18} color={colors.red} accessible={false} />
              <Text style={styles.errorText}>{g.error.message}</Text>
            </View>
          )}
          {g.phase === "routing" ? (
            <View style={styles.routing}>
              <ActivityIndicator color={colors.amber} />
              <Text style={styles.body}>Finding a route{g.destination?.label ? ` to ${g.destination.label}` : ""}</Text>
            </View>
          ) : (
            <LocationPickerField
              label="Destination"
              lat={null}
              lng={null}
              address={null}
              bare
              initialSearchOpen
              onLocationChange={(lat, lng, address) => {
                void g.planTo({ lat, lng, label: address });
              }}
            />
          )}
        </ScrollView>
      </View>
    );
  }

  const view = g.view;
  const next = view?.next ?? null;
  const arrival = view ? new Date(Date.now() + view.remainingSeconds * 1000) : null;

  return (
    <View style={styles.page}>
      {header}
      {MapViewComponent ? (
        <MapViewComponent
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={UK_REGION}
          // Our own marker from the recorder's fixes: the map's blue dot would
          // be a second GPS source.
          showsUserLocation={false}
          showsCompass={false}
          showsTraffic={false}
          pitchEnabled={!guiding}
          rotateEnabled={!guiding}
          scrollEnabled={!guiding}
          zoomEnabled={!guiding}
          userInterfaceStyle="dark"
        >
          {line.length > 1 && (
            <PolylineComponent coordinates={line} strokeColor={colors.amber} strokeWidth={7} />
          )}
          {guiding && position && (
            <MarkerComponent
              coordinate={{ latitude: position.lat, longitude: position.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              accessibilityLabel="You"
            >
              <View style={styles.carDot}>
                <MaterialCommunityIcons name="navigation" size={22} color={colors.bg} />
              </View>
            </MarkerComponent>
          )}
          {line.length > 1 && (
            <MarkerComponent coordinate={line[line.length - 1]} tracksViewChanges={false} accessibilityLabel="Destination">
              <View style={styles.destPin}>
                <MaterialCommunityIcons name="flag-checkered" size={16} color={colors.bg} />
              </View>
            </MarkerComponent>
          )}
        </MapViewComponent>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noMap]} />
      )}

      {/* ── Preview ─────────────────────────────────────────────────── */}
      {g.phase === "preview" && g.route && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.sheetTitle} numberOfLines={2}>
            {g.destination?.label ?? "Your destination"}
          </Text>
          <Text style={styles.sheetFigures}>
            {milesWords(g.route.distanceMeters)} · {durationWords(g.route.durationSeconds)}
          </Text>
          <Text style={styles.note}>No live traffic, so this time assumes clear roads.</Text>
          {!voiceAvailable() && (
            <Text style={styles.note}>Spoken directions need the latest app update from the App Store.</Text>
          )}
          <Button title="Start" icon="navigate" onPress={g.start} fullWidth size="lg" />
          <Button title="Pick somewhere else" variant="ghost" onPress={g.back} fullWidth />
        </View>
      )}

      {/* ── Guiding ─────────────────────────────────────────────────── */}
      {guiding && (
        <>
          <View style={[styles.banner, { marginTop: insets.top + spacing.sm }]} accessibilityLiveRegion="polite">
            {next ? (
              <View style={styles.bannerRow}>
                <MaterialCommunityIcons
                  name={arrowIcon(next) as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={44}
                  color={colors.bg}
                  accessible={false}
                />
                <View style={styles.bannerText}>
                  <Text style={styles.bannerDistance}>{displayDistance(view?.distanceToNext ?? 0)}</Text>
                  <Text style={styles.bannerTitle} numberOfLines={1}>
                    {bannerTitle(next)}
                  </Text>
                  {bannerSubtitle(next) && (
                    <Text style={styles.bannerStreet} numberOfLines={1}>
                      {bannerSubtitle(next)}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <Text style={styles.bannerTitle}>Follow the route</Text>
            )}
          </View>

          {(g.waitingForGps || g.rerouting) && (
            <View style={styles.statusPill} accessibilityRole="alert">
              {g.rerouting ? (
                <ActivityIndicator size="small" color={colors.text1} />
              ) : (
                <Ionicons name="locate-outline" size={16} color={colors.text1} accessible={false} />
              )}
              <Text style={styles.statusText}>{g.rerouting ? "Rerouting" : "Waiting for GPS"}</Text>
            </View>
          )}

          {view?.speedLimitMph != null && (
            <View style={styles.speedLimit} accessibilityLabel={`Speed limit ${view.speedLimitMph} miles per hour`}>
              <Text style={styles.speedLimitText}>{view.speedLimitMph}</Text>
            </View>
          )}

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.bottomFigures}>
              <Text style={styles.arrival}>{arrival ? arrivalClock(arrival) : "--:--"}</Text>
              <Text style={styles.bottomSub}>
                {view ? `${durationWords(view.remainingSeconds)} · ${milesWords(view.remainingMeters)}` : ""}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.roundBtn}
              onPress={g.toggleMute}
              accessibilityRole="button"
              accessibilityLabel={g.muted ? "Turn voice on" : "Mute voice"}
              accessibilityState={{ selected: g.muted }}
            >
              <Ionicons name={g.muted ? "volume-mute" : "volume-high"} size={22} color={colors.text1} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.endBtn}
              onPress={g.end}
              accessibilityRole="button"
              accessibilityLabel="End directions"
            >
              <Text style={styles.endText}>End</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Arrived ─────────────────────────────────────────────────── */}
      {g.phase === "arrived" && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <MaterialCommunityIcons name="flag-checkered" size={28} color={colors.amber} />
          <Text style={styles.sheetTitle}>You have arrived</Text>
          {g.destination?.label && <Text style={styles.body}>{g.destination.label}</Text>}
          <Button title="Done" onPress={() => safeBack()} fullWidth size="lg" />
          <Button title="Go somewhere else" variant="ghost" onPress={g.end} fullWidth />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  centred: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  pickContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: 80 },
  heading: { fontFamily: fonts.bold, fontSize: 22, color: colors.text1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text2 },
  errorCard: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.redDim,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.text1 },
  routing: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  noMap: { backgroundColor: colors.surface },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.xl,
    gap: spacing.md,
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.text1 },
  sheetFigures: { fontFamily: fonts.semibold, fontSize: 17, color: colors.amber },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.text3 },
  banner: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.amber,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  bannerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bannerText: { flex: 1 },
  bannerDistance: { fontFamily: fonts.bold, fontSize: 28, color: colors.bg },
  bannerTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.bg },
  bannerStreet: { fontFamily: fonts.medium, fontSize: 15, color: colors.bg, opacity: 0.85 },
  statusPill: {
    alignSelf: "center",
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  statusText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text1 },
  speedLimit: {
    position: "absolute",
    left: spacing.lg,
    bottom: 130,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 6,
    borderColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  speedLimitText: { fontFamily: fonts.bold, fontSize: 20, color: "#000000" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.surfaceBorder,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  bottomFigures: { flex: 1 },
  arrival: { fontFamily: fonts.bold, fontSize: 22, color: colors.text1 },
  bottomSub: { fontFamily: fonts.medium, fontSize: 14, color: colors.text2 },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  endBtn: {
    height: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.red,
  },
  endText: { fontFamily: fonts.bold, fontSize: 16, color: "#ffffff" },
  carDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.amber,
    borderWidth: 3,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  destPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.text1,
    alignItems: "center",
    justifyContent: "center",
  },
});
