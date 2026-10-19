// The guidance screen's panels (DESIGN 2.3 to 2.6): next-turn banner, the
// "Then" strip, the recording chip, GPS and reroute strips, speed sign,
// mute, the bottom bar. Solid panels (no blur over the moving map), every
// control at least 56 pt.

import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NavigationStep } from "@mileclear/shared";
import { colors, fonts, fontScaleCap, nav, radii, spacing } from "../../lib/theme";
import {
  arrivalClock,
  bannerAccessibilityLabel,
  bannerAction,
  bannerStreet,
  displayDistance,
  durationWords,
  glyphFor,
  milesShort,
  shortPhrase,
} from "../../lib/navigation/phrases";
import { rerouteFailureBody } from "../../lib/navigation/errorCopy";
import type { RecordingChip } from "../../lib/navigation/rules";
import type { GpsState, RerouteStatus } from "../../lib/navigation/useGuidance";
import { ManoeuvreGlyph } from "./Glyph";

export function Banner(props: {
  next: NavigationStep | null;
  distance: number;
  speedMps: number | null;
  then: NavigationStep | null;
  gps: GpsState;
  reroute: RerouteStatus;
  arriveName: string | null;
  onPress: () => void;
}) {
  const { next, reroute } = props;
  const searching = reroute.kind === "searching";
  const failed = reroute.kind === "failed";
  const gpsLost = props.gps === "waiting" || props.gps === "still_waiting" || props.gps === "gone";

  let tile: ReactNode;
  let distance: string;
  let action: string;
  let street: string | null;
  let label: string;
  if (searching) {
    tile = <ActivityIndicator color={colors.text1} size="large" />;
    distance = "New route";
    action = "Finding a new route";
    street = null;
    label = "Finding a new route";
  } else if (failed) {
    tile = <Ionicons name="warning" size={40} color={colors.amber} accessible={false} />;
    distance = "Off route";
    action = rerouteFailureBody(reroute.reason);
    street = null;
    label = `Off route. ${action}`;
  } else if (next) {
    tile = <ManoeuvreGlyph name={glyphFor(next)} size={56} color={colors.text1} />;
    distance = gpsLost ? "-" : displayDistance(props.distance, props.speedMps);
    action = bannerAction(next);
    street = bannerStreet(next, props.arriveName);
    label = bannerAccessibilityLabel(next, props.distance, props.then, props.arriveName);
  } else {
    tile = <Ionicons name="arrow-up" size={40} color={colors.text1} accessible={false} />;
    distance = "";
    action = "Follow the route";
    street = null;
    label = "Follow the route";
  }

  return (
    <View>
      <Pressable
        onPress={props.onPress}
        style={s.banner}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Double-tap to hear it again."
      >
        <View style={s.tile}>{tile}</View>
        <View style={s.bannerText}>
          {distance ? (
            <Text style={s.distance} maxFontSizeMultiplier={fontScaleCap.display} numberOfLines={1}>
              {distance}
            </Text>
          ) : null}
          <Text style={s.action} maxFontSizeMultiplier={fontScaleCap.display} numberOfLines={failed ? 2 : 1}>
            {action}
          </Text>
          {street ? (
            <Text style={s.street} maxFontSizeMultiplier={fontScaleCap.display} numberOfLines={2}>
              {street}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {props.then && !searching && !failed && (
        <View style={s.thenStrip} accessible={false}>
          <Text style={s.thenLabel}>Then</Text>
          <ManoeuvreGlyph name={glyphFor(props.then)} size={24} color={colors.text1} />
          <Text style={s.thenText}>{shortPhrase(props.then)}</Text>
        </View>
      )}
    </View>
  );
}

export function StatusStrips({ gps, chip, onEnd }: { gps: GpsState; chip: RecordingChip; onEnd: () => void }) {
  if (gps === "gone") {
    // Two minutes with no GPS and not moving (parked, or the phone has lost
    // its fix for good): say so plainly and offer the way out.
    return (
      <View style={s.strips}>
        <View style={[s.strip, s.goneStrip]} accessibilityRole="alert">
          <View style={s.goneTop}>
            <Ionicons name="warning-outline" size={18} color={colors.amber} />
            <Text style={s.stripText}>No GPS for 2 minutes. Directions can't follow you.</Text>
          </View>
          <TouchableOpacity style={s.goneEnd} onPress={onEnd} accessibilityRole="button" accessibilityLabel="End directions">
            <Text style={s.goneEndText}>End directions</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  const gpsText =
    gps === "waiting"
      ? "Waiting for GPS"
      : gps === "still_waiting"
        ? "Still waiting for GPS. Directions carry on when your phone finds you."
        : gps === "start_driving"
          ? "Start driving and directions begin."
          : null;
  return (
    <View style={s.strips}>
      {gpsText && (
        <View style={s.strip} accessibilityRole="alert">
          <Ionicons name={gps === "start_driving" ? "car-outline" : "warning-outline"} size={18} color={colors.amber} />
          <Text style={s.stripText}>{gpsText}</Text>
        </View>
      )}
      {chip && (
        <View style={s.chip} accessibilityLabel="Trip recording">
          <View style={[s.dot, { backgroundColor: chip === "recording" ? colors.green : colors.text3 }]} />
          <Text style={s.chipText}>{chip === "recording" ? "Recording" : "Recording is off"}</Text>
        </View>
      )}
    </View>
  );
}

export function SpeedSign({ mph }: { mph: number | null }) {
  // Keep the space when there is no limit, so the controls row (space-between)
  // does not move Mute across to the left over the map's Legal label.
  if (mph == null) return <View style={s.speedPlaceholder} accessible={false} />;
  return (
    <View style={s.speed} accessibilityLabel={`Speed limit ${mph} miles per hour`}>
      <Text style={s.speedText} maxFontSizeMultiplier={fontScaleCap.none}>
        {mph}
      </Text>
    </View>
  );
}

export function MuteButton({ muted, onPress }: { muted: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={s.round}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={muted ? "Voice off. Double-tap to turn on" : "Voice on. Double-tap to turn off"}
    >
      <Ionicons name={muted ? "volume-mute" : "volume-high"} size={26} color={colors.text1} />
    </TouchableOpacity>
  );
}

export function RecentreButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={s.recentre} onPress={onPress} accessibilityRole="button" accessibilityLabel="Re-centre">
      <Ionicons name="locate" size={18} color={colors.amber} />
      <Text style={s.recentreText}>Re-centre</Text>
    </TouchableOpacity>
  );
}

export function BottomBar(props: {
  arrivalMs: number;
  remainingSeconds: number;
  remainingMeters: number;
  bottomInset: number;
  onOverview: () => void;
  onEnd: () => void;
}) {
  const clock = arrivalClock(new Date(props.arrivalMs));
  const mins = durationWords(props.remainingSeconds);
  const miles = milesShort(props.remainingMeters);
  return (
    <View style={[s.bar, { paddingBottom: props.bottomInset + spacing.md }]}>
      <Pressable
        style={s.barLeft}
        onPress={props.onOverview}
        accessibilityRole="button"
        accessibilityLabel={`Arrive about ${clock}. ${mins}, ${miles} left. Double-tap to show the whole route.`}
      >
        <View>
          <Text style={s.clock} maxFontSizeMultiplier={fontScaleCap.heading}>
            {clock}
          </Text>
          <Text style={s.caption}>arrival</Text>
        </View>
        <View>
          <Text style={s.barFig} maxFontSizeMultiplier={fontScaleCap.heading}>
            {mins}
          </Text>
          <Text style={s.barFig} maxFontSizeMultiplier={fontScaleCap.heading}>
            {miles}
          </Text>
        </View>
      </Pressable>
      <TouchableOpacity style={s.end} onPress={props.onEnd} accessibilityRole="button" accessibilityLabel="End directions">
        <Text style={s.endText}>End</Text>
      </TouchableOpacity>
    </View>
  );
}

export const hud = StyleSheet.create({
  controlsRow: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
});

const s = StyleSheet.create({
  banner: {
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
  tile: {
    width: nav.glyphSize,
    height: nav.glyphSize,
    borderRadius: 16,
    backgroundColor: nav.glyphTile,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: { flex: 1 },
  distance: { fontFamily: fonts.bold, fontSize: nav.bannerDistance, color: colors.text1 },
  action: { fontFamily: fonts.semibold, fontSize: nav.bannerLine, color: colors.text1 },
  street: { fontFamily: fonts.medium, fontSize: nav.bannerLine, color: colors.text2 },
  thenStrip: {
    marginLeft: 12,
    marginTop: 6,
    alignSelf: "flex-start",
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  thenLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.text2 },
  thenText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text1 },
  strips: { marginLeft: 12, marginTop: 6, gap: 6, alignItems: "flex-start" },
  strip: {
    maxWidth: "92%",
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stripText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text1 },
  goneStrip: { flexDirection: "column", alignItems: "stretch", gap: spacing.sm, paddingVertical: spacing.md },
  goneTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  goneEnd: {
    minHeight: nav.control,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  goneEndText: { fontFamily: fonts.bold, fontSize: 16, color: colors.red },
  chip: {
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text1 },
  speed: {
    width: nav.speedSign,
    height: nav.speedSign,
    borderRadius: nav.speedSign / 2,
    backgroundColor: "#ffffff",
    borderWidth: 6,
    borderColor: nav.speedRing,
    alignItems: "center",
    justifyContent: "center",
  },
  speedText: { fontFamily: fonts.bold, fontSize: 20, color: "#000000" },
  speedPlaceholder: { width: nav.speedSign, height: nav.speedSign },
  round: {
    width: nav.control,
    height: nav.control,
    borderRadius: nav.control / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  recentre: {
    height: nav.control,
    borderRadius: nav.control / 2,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recentreText: { fontFamily: fonts.bold, fontSize: 16, color: colors.amber },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  barLeft: { flex: 1, minHeight: nav.control, flexDirection: "row", alignItems: "center", gap: spacing.xxl },
  clock: { fontFamily: fonts.bold, fontSize: 22, color: colors.text1 },
  caption: { fontFamily: fonts.regular, fontSize: 12, color: colors.text3 },
  barFig: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text1 },
  end: {
    minWidth: nav.control,
    height: nav.control,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  endText: { fontFamily: fonts.bold, fontSize: 16, color: colors.red },
});
