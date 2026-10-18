// Directions (in-app turn-by-turn, 1.4.0; docs/navigation-1.4.0/DESIGN.md).
// One full-screen modal with internal states: pick, preview, guiding,
// arrived. Shown only to drivers the server has switched it on for, on a
// binary with the native voice module (useDirectionsAvailable). Labelled a
// test while every Pro driver tries it.
//
// Directions guide; they never record. Nothing here starts, stops, ends,
// splits or sorts a trip, and nothing writes the recorder's state.

import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackHandler, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, nav, spacing } from "../lib/theme";
import { useUser } from "../lib/user/context";
import { useReducedMotion } from "../lib/accessibility";
import { haptic } from "../lib/haptics";
import { openDirections } from "../lib/location/directions";
import { safeBack } from "../lib/nav";
import { useGuidance, type Destination } from "../lib/navigation/useGuidance";
import { useRecordingChip } from "../lib/navigation/recordingStatus";
import { useDirectionsAvailable } from "../lib/navigation/useDirectionsAvailable";
import { ALTITUDE_FOR, calmFigures, isNight, nextZoom, shouldCloseAfterArrival, zoomNearManoeuvre, type CalmFigures, type ZoomState } from "../lib/navigation/rules";
import { distanceMeters } from "../lib/navigation/geo";
import { durationWords, milesShort } from "../lib/navigation/phrases";
import { GOOGLE_NIGHT_STYLE } from "../lib/navigation/mapStyle";
import { getVoice } from "../lib/navigation/voice";
import * as store from "../lib/navigation/store";
import { trackDirections } from "../lib/navigation/telemetry";
import { DestinationPicker } from "../components/directions/DestinationPicker";
import { Banner, BottomBar, MuteButton, RecentreButton, SpeedSign, StatusStrips, hud } from "../components/directions/Hud";
import { ArrivedSheet, EndSheet, FirstUseNote, PreviewSheet, StoppedSheet, StuckSheet } from "../components/directions/Sheets";
import { DestinationPin, Puck } from "../components/directions/Glyph";

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
const FOLLOW_RESUME_MS = 10_000;
const OVERVIEW_MS = 10_000;

/** A guidance bug shows "Directions stopped", never a red screen. */
class GuidanceBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    trackDirections("directions.crashed", { where: "render" });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function DirectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const { user } = useUser();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; label?: string; name?: string; resume?: string }>();
  const g = useGuidance({ focused });
  const available = useDirectionsAvailable();
  const mapRef = useRef<any>(null);

  const [fromPicker, setFromPicker] = useState(false);
  const [firstTimeLine, setFirstTimeLine] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [endSheet, setEndSheet] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [followPausedAt, setFollowPausedAt] = useState<number | null>(null);
  const [overviewAt, setOverviewAt] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const zoom = useRef<ZoomState | null>(null);
  const figures = useRef<CalmFigures | null>(null);
  const trip = useRef<{ startedAt: number; meters: number } | null>(null);

  const guiding = g.phase === "guiding";
  const chip = useRecordingChip(guiding);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else safeBack();
  }, [router]);

  // Opened from a saved place or the resume row: straight to the preview.
  useEffect(() => {
    trackDirections("directions.opened", { from_place: !!params.lat, resume: params.resume === "1" });
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    if (params.lat && Number.isFinite(lat) && Number.isFinite(lng)) {
      void g.planTo(
        { lat, lng, label: params.label ?? null, name: params.name ?? null },
        { autoStart: params.resume === "1" }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One clock for the time-based rules on this screen.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // The first three previews say that the trip records on its own.
  useEffect(() => {
    if (g.phase !== "preview" || !g.route) return;
    store.getPreviewCount().then((n) => {
      setFirstTimeLine(n < 3);
      if (n < 3) void store.bumpPreviewCount();
    });
  }, [g.phase, g.route]);

  // Android with no UK English voice: say so once.
  useEffect(() => {
    if (Platform.OS !== "android" || g.phase !== "preview" || !g.route) return;
    void (async () => {
      if (await store.getUkVoiceNoteSeen()) return;
      if (!(await getVoice().hasUkVoice())) {
        setVoiceNote("Your phone has no UK English voice installed, so directions use its default voice.");
        void store.setUkVoiceNoteSeen();
      }
    })();
  }, [g.phase, g.route]);

  useEffect(() => {
    if (guiding && !trip.current && g.route) trip.current = { startedAt: Date.now(), meters: g.route.distanceMeters };
    if (g.phase === "pick") trip.current = null;
  }, [guiding, g.phase, g.route]);

  // Android back while guiding opens the End sheet (DESIGN 2.16).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (guiding) {
        setEndSheet(true);
        return true;
      }
      if (g.phase !== "pick" && fromPicker) {
        g.back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [guiding, g, fromPicker]);

  // Arrived: close by itself after 60 s, or when the car drives 300 m off.
  useEffect(() => {
    if (g.phase !== "arrived" || g.arrivedAtMs == null || !g.destination) return;
    const off = g.lastFix ? distanceMeters(g.lastFix, g.destination) : null;
    if (shouldCloseAfterArrival({ arrivedAtMs: g.arrivedAtMs, nowMs: now, distanceFromDestination: off })) close();
  }, [g.phase, g.arrivedAtMs, g.lastFix, g.destination, now, close]);

  const startPressed = useCallback(async () => {
    if (!(await store.getSafetySeen())) {
      setShowNote(true);
      return;
    }
    g.start();
  }, [g]);

  const openMaps = useCallback(() => {
    if (!g.destination) return;
    trackDirections("directions.open_in_maps", { phase: g.phase });
    void openDirections(g.destination.lat, g.destination.lng, g.destination.label ?? undefined);
  }, [g.destination, g.phase]);

  const report = useCallback(() => {
    const ref = [g.sessionId, g.route?.routeId].filter(Boolean).join(":");
    router.push(`/report-problem?topic=directions${ref ? `&ref=${encodeURIComponent(ref)}` : ""}` as never);
  }, [g.sessionId, g.route, router]);

  const toggleMute = useCallback(() => {
    haptic("light");
    setToast(g.muted ? "Voice on" : "Voice off");
    setTimeout(() => setToast(null), 2000);
    g.toggleMute();
  }, [g]);

  const bannerTap = useCallback(() => {
    if (!g.repeat()) haptic("light");
  }, [g]);

  // ── Map geometry ─────────────────────────────────────────────────────
  const view = g.view;
  const fullLine = useMemo(
    () => (g.route ? g.route.geometry.map(([latitude, longitude]) => ({ latitude, longitude })) : []),
    [g.route]
  );
  const ahead = useMemo(() => {
    if (!guiding || !view) return fullLine;
    const i = Math.max(0, view.segIndex);
    const rest = fullLine.slice(i + 1);
    return view.position ? [{ latitude: view.position.lat, longitude: view.position.lng }, ...rest] : rest;
  }, [fullLine, guiding, view]);
  const nextPoint =
    guiding && view?.next && g.route ? g.route.geometry[Math.min(view.next.startIndex, g.route.geometry.length - 1)] : null;
  const position = view?.position ?? (g.lastFix ? { lat: g.lastFix.lat, lng: g.lastFix.lng } : null);
  const night = useMemo(() => (position ? isNight(position, new Date(now)) : false), [position?.lat, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale = g.reroute.kind !== "idle";

  // Preview: north-up, the whole route.
  useEffect(() => {
    if (g.phase !== "preview" || fullLine.length < 2 || !mapRef.current) return;
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(fullLine, { edgePadding: { top: 80, right: 48, bottom: 360, left: 48 }, animated: true });
      } catch {
        // best effort
      }
    }, 300);
    return () => clearTimeout(t);
  }, [g.phase, fullLine]);

  const following =
    guiding &&
    (followPausedAt == null || now - followPausedAt > FOLLOW_RESUME_MS) &&
    (overviewAt == null || now - overviewAt > OVERVIEW_MS);

  // Guiding: heading-up, tilted, zoom by speed.
  useEffect(() => {
    if (!guiding || !following || !position || !mapRef.current || g.gps !== "ok") return;
    zoom.current = reduceMotion ? zoom.current ?? { level: 16, changedAtMs: now } : nextZoom(zoom.current, view?.speedMps ?? null, Date.now());
    const level = reduceMotion ? zoom.current.level : zoomNearManoeuvre(zoom.current.level, view?.distanceToNext ?? Infinity);
    const altitude = ALTITUDE_FOR[Math.max(15, Math.min(17, Math.round(level))) as 15 | 16 | 17] / (level > 17 ? 1.6 : 1);
    try {
      mapRef.current.animateCamera(
        {
          center: { latitude: position.lat, longitude: position.lng },
          heading: view?.courseDeg ?? 0,
          pitch: reduceMotion ? 0 : 45,
          zoom: level,
          altitude,
        },
        { duration: reduceMotion ? 300 : 1000 }
      );
    } catch {
      // best effort
    }
  }, [guiding, following, position?.lat, position?.lng, view?.courseDeg, g.gps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Whole-route overview for 10 s.
  useEffect(() => {
    if (overviewAt == null || fullLine.length < 2) return;
    try {
      mapRef.current?.fitToCoordinates(fullLine, { edgePadding: { top: 220, right: 48, bottom: 200, left: 48 }, animated: true });
    } catch {
      // best effort
    }
  }, [overviewAt, fullLine]);

  // Not switched on (old link, or the flag went off): never mid-guidance.
  if (user && !available && !guiding && g.phase !== "arrived") {
    return (
      <View style={[s.page, s.centred, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={s.heading}>Directions aren't available yet</Text>
        <Text style={s.body}>We're testing directions with a small group first.</Text>
        <TouchableOpacity style={s.ok} onPress={close} accessibilityRole="button">
          <Text style={s.okText}>OK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (g.phase === "pick") {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <DestinationPicker
          here={g.lastFix}
          movingMps={g.movingMps}
          onPick={(d: Destination) => {
            setFromPicker(true);
            void g.planTo(d);
          }}
          onClose={close}
        />
      </>
    );
  }

  const live = view ? { remainingSeconds: view.remainingSeconds, remainingMeters: view.remainingMeters } : null;
  if (live) figures.current = calmFigures(figures.current, live, now);
  const fig = figures.current;
  const arrivedSummary = trip.current
    ? `${milesShort(trip.current.meters)} in ${durationWords((now - trip.current.startedAt) / 1000)}`
    : null;
  const stoppedFallback = <StoppedSheet bottomInset={insets.bottom} onOpenMaps={openMaps} onEnd={g.end} />;

  return (
    <View style={s.page}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !guiding }} />
      {MapViewComponent ? (
        <MapViewComponent
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={UK_REGION}
          // Our own puck from the fixes: the map's blue dot would be another GPS user.
          showsUserLocation={false}
          showsCompass={false}
          showsTraffic={false}
          showsPointsOfInterest={false}
          toolbarEnabled={false}
          userInterfaceStyle={night ? "dark" : "light"}
          customMapStyle={Platform.OS === "android" && night ? GOOGLE_NIGHT_STYLE : undefined}
          // Keeps Apple's "Legal" and Google's logo above the bottom bar.
          mapPadding={{ top: 0, right: 0, bottom: guiding ? 110 + insets.bottom : 0, left: 0 }}
          onPanDrag={() => {
            if (guiding) setFollowPausedAt(Date.now());
          }}
        >
          {ahead.length > 1 && (
            <>
              <PolylineComponent
                coordinates={ahead}
                strokeColor={stale ? "transparent" : nav.routeCasing}
                strokeWidth={guiding ? nav.routeCasingWidth : nav.previewRouteWidth + 3}
                lineCap="round"
                lineJoin="round"
              />
              <PolylineComponent
                coordinates={ahead}
                strokeColor={stale ? nav.staleRoute : nav.routeLine}
                strokeWidth={guiding ? nav.routeWidth : nav.previewRouteWidth}
                lineCap="round"
                lineJoin="round"
                zIndex={2}
              />
            </>
          )}
          {nextPoint && !stale && (
            <MarkerComponent coordinate={{ latitude: nextPoint[0], longitude: nextPoint[1] }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={s.nextDot} />
            </MarkerComponent>
          )}
          {fullLine.length > 1 && (
            <MarkerComponent coordinate={fullLine[fullLine.length - 1]} anchor={{ x: 0.5, y: 0.97 }} tracksViewChanges={false} accessibilityLabel="Destination">
              <DestinationPin width={36} />
            </MarkerComponent>
          )}
          {(guiding || g.phase === "preview") && position && (
            <MarkerComponent
              coordinate={{ latitude: position.lat, longitude: position.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              rotation={guiding ? 0 : view?.courseDeg ?? 0}
              tracksViewChanges={false}
              zIndex={10}
              accessibilityLabel="You"
            >
              <View style={{ opacity: g.gps === "ok" ? 1 : 0.5 }}>
                <Puck heading={(view?.speedMps ?? g.movingMps ?? 0) > 0.9 && view?.courseDeg != null} size={48} />
              </View>
            </MarkerComponent>
          )}
        </MapViewComponent>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
      )}

      {!guiding && g.phase !== "arrived" && (
        <TouchableOpacity style={[s.closeOver, { top: insets.top + spacing.sm }]} onPress={close} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={colors.text1} />
        </TouchableOpacity>
      )}

      {(g.phase === "preview" || g.phase === "locating" || g.phase === "routing") && (
        <PreviewSheet
          bottomInset={insets.bottom}
          destinationLabel={g.destination?.label ?? null}
          phase={g.phase}
          route={g.route}
          error={g.previewError}
          alreadyThere={g.alreadyThere}
          fromPicker={fromPicker}
          showFirstTimeLine={firstTimeLine}
          voiceNote={voiceNote}
          onStart={() => void startPressed()}
          onRetry={() => g.destination && void g.planTo(g.destination)}
          onChooseElse={g.back}
          onOpenMaps={openMaps}
          onClose={close}
          onReport={report}
        />
      )}

      {guiding && (
        <GuidanceBoundary fallback={stoppedFallback}>
          <View style={{ paddingTop: insets.top + 8 }} pointerEvents="box-none">
            <Banner
              next={view?.next ?? null}
              distance={view?.distanceToNext ?? 0}
              speedMps={view?.speedMps ?? null}
              then={view?.then ?? null}
              gps={g.gps}
              reroute={g.reroute}
              arriveName={g.destination?.name ?? null}
              onPress={bannerTap}
            />
            <StatusStrips gps={g.gps} chip={chip} />
          </View>
          <View style={[hud.controlsRow, { bottom: 110 + insets.bottom + 12 }]} pointerEvents="box-none">
            <SpeedSign mph={view?.speedLimitMph ?? null} />
            {!following && <RecentreButton onPress={() => { setFollowPausedAt(null); setOverviewAt(null); }} />}
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              {toast && <Text style={s.toast}>{toast}</Text>}
              <MuteButton muted={g.muted} onPress={toggleMute} />
            </View>
          </View>
          {fig && (
            <BottomBar
              arrivalMs={fig.arrivalMs}
              remainingSeconds={fig.remainingSeconds}
              remainingMeters={fig.remainingMeters}
              bottomInset={insets.bottom}
              onOverview={() => setOverviewAt(Date.now())}
              onEnd={() => setEndSheet(true)}
            />
          )}
          <EndSheet
            visible={endSheet}
            bottomInset={insets.bottom}
            onKeep={() => setEndSheet(false)}
            onEnd={() => {
              setEndSheet(false);
              g.end();
              close();
            }}
          />
          <StuckSheet
            visible={g.stuck}
            bottomInset={insets.bottom}
            onOpenMaps={openMaps}
            onKeepTrying={g.keepTrying}
            onEnd={() => {
              g.end();
              close();
            }}
          />
          {g.crashed && stoppedFallback}
        </GuidanceBoundary>
      )}

      {g.phase === "arrived" && (
        <>
          <View style={[s.arrivedBanner, { marginTop: insets.top + 8 }]} accessibilityRole="header">
            <View style={s.arrivedTile}>
              <Ionicons name="checkmark" size={44} color={colors.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.arrivedTitle}>You've arrived</Text>
              {(g.destination?.name ?? g.destination?.label) && (
                <Text style={s.arrivedName} numberOfLines={2}>
                  {g.destination?.name ?? g.destination?.label}
                </Text>
              )}
            </View>
          </View>
          <ArrivedSheet bottomInset={insets.bottom} summary={arrivedSummary} onDone={close} onReport={report} />
        </>
      )}

      <FirstUseNote
        visible={showNote}
        bottomInset={insets.bottom}
        onOk={() => {
          setShowNote(false);
          void store.setSafetySeen();
          g.start();
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  centred: { alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  heading: { fontFamily: fonts.bold, fontSize: 20, color: colors.text1, textAlign: "center" },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text2, textAlign: "center" },
  ok: {
    marginTop: spacing.lg,
    minHeight: nav.control,
    minWidth: 160,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  okText: { fontFamily: fonts.bold, fontSize: 16, color: colors.bg },
  closeOver: {
    position: "absolute",
    right: spacing.md,
    width: nav.control,
    height: nav.control,
    borderRadius: nav.control / 2,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  nextDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#ffffff", borderWidth: 3, borderColor: colors.bg },
  toast: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
  },
  arrivedBanner: {
    marginHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  arrivedTile: {
    width: nav.glyphSize,
    height: nav.glyphSize,
    borderRadius: 16,
    backgroundColor: colors.greenDim,
    alignItems: "center",
    justifyContent: "center",
  },
  arrivedTitle: { fontFamily: fonts.bold, fontSize: 28, color: colors.text1 },
  arrivedName: { fontFamily: fonts.medium, fontSize: 18, color: colors.text2 },
});
