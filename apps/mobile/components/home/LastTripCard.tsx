// The Last trip card (SPEC-VISUAL 5.5): the most recent trip and the one-tap
// Business / Personal choice, so a driver can sort it without opening Trips.
//
// Looks (chosen in lib/home/lastTrip.ts): "full" with the choice, "compact"
// for an older sorted trip, and "Your first trip" for a new driver. The choice
// writes straight to this phone and the sync queue, so it works offline and
// shows on Trips at once. The card does not jump to the next trip after a tap.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { MiniRoute } from "./MiniRoute";
import { classifyTripFromHome, type ClassifyResult } from "../../lib/home/classifyTrip";
import type { LastTripFooter, LastTripView, SyncChip, TripChoice } from "../../lib/home/lastTrip";
import { trackHomeTap } from "../../lib/home/trackHomeTap";
import { haptic } from "../../lib/haptics";
import { colors, fonts, fontScaleCap, radii } from "../../lib/theme";

type Full = Extract<LastTripView, { look: "full" | "compact" }>;

interface Props {
  view: LastTripView;
  mode: "work" | "personal";
  /** The status line's kind, recorded with each tap. */
  state: string;
  /** Re-read the trip and the counts after a choice. */
  onChanged: () => void;
}

function ChipView({ chip, text, onPress }: { chip: SyncChip; text: string; onPress?: () => void }) {
  const failed = chip === "failed";
  const icon: keyof typeof Ionicons.glyphMap | null =
    chip === "synced" ? "checkmark" : chip === "waiting" ? "cloud-outline" : failed ? "alert-circle" : null;
  const color = failed ? colors.red : colors.text2;
  const body = (
    <View style={s.chip}>
      {icon ? <Ionicons name={icon} size={12} color={color} accessible={false} /> : null}
      <Text style={[s.chipText, { color }]} maxFontSizeMultiplier={fontScaleCap.body}>{text}</Text>
    </View>
  );
  if (failed && onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Needs attention. Open sync status"
      >
        {body}
      </Pressable>
    );
  }
  return body;
}

function ChoiceControl({
  choice,
  autoTag,
  onChoose,
  label,
}: {
  choice: TripChoice;
  autoTag: boolean;
  onChoose: (c: "business" | "personal") => void;
  label: string;
}) {
  const unsorted = choice === "unclassified";
  const business = choice === "business";
  const personal = choice === "personal";
  return (
    <View
      style={[s.track, unsorted && { borderColor: colors.amberGlow }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      <Pressable
        onPress={() => onChoose("business")}
        style={[s.half, business && s.halfBusiness]}
        hitSlop={{ top: 2, bottom: 2 }}
        accessibilityRole="radio"
        accessibilityLabel="Business"
        accessibilityState={{ selected: business, checked: business }}
      >
        <Ionicons
          name={business ? "briefcase" : "briefcase-outline"}
          size={16}
          color={business ? colors.bg : colors.text2}
          accessible={false}
        />
        <Text style={[s.halfText, business && s.halfTextBusiness]} maxFontSizeMultiplier={fontScaleCap.body}>
          Business
        </Text>
        {business && autoTag ? <Text style={s.auto}>Auto</Text> : null}
      </Pressable>
      <Pressable
        onPress={() => onChoose("personal")}
        style={[s.half, personal && s.halfPersonal]}
        hitSlop={{ top: 2, bottom: 2 }}
        accessibilityRole="radio"
        accessibilityLabel="Personal"
        accessibilityState={{ selected: personal, checked: personal }}
      >
        <Ionicons
          name={personal ? "person" : "person-outline"}
          size={16}
          color={personal ? colors.text1 : colors.text2}
          accessible={false}
        />
        <Text style={[s.halfText, personal && s.halfTextPersonal]} maxFontSizeMultiplier={fontScaleCap.body}>
          Personal
        </Text>
        {personal && autoTag ? <Text style={[s.auto, { color: colors.text1 }]}>Auto</Text> : null}
      </Pressable>
    </View>
  );
}

function Footer({ footer, onPress }: { footer: NonNullable<LastTripFooter>; onPress: () => void }) {
  return (
    <>
      <View style={s.footerLine} />
      <Pressable
        onPress={onPress}
        style={s.footer}
        accessibilityRole="button"
        accessibilityLabel={footer.text}
        accessibilityHint="Opens Trips"
      >
        <Text style={s.footerText} maxFontSizeMultiplier={fontScaleCap.body}>{footer.text}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
      </Pressable>
    </>
  );
}

export function LastTripCard({ view, mode, state, onChanged }: Props) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  // The driver's tap, shown at once; cleared when the stored trip catches up.
  const [chosen, setChosen] = useState<TripChoice | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const tripId = view.look === "full" || view.look === "compact" ? view.trip.id : null;
  const stored = view.look === "full" || view.look === "compact" ? view.choice : null;
  // One save at a time, in tap order (as trip-form's quick changes do): two
  // quick taps must not race each other into SQLite and the sync queue, or
  // the server could end up with the first choice instead of the last.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  // What the screen shows right now, read inside the chain (state is stale there).
  const shownRef = useRef<TripChoice | null>(null);

  // A different trip: start clean.
  useEffect(() => {
    setChosen(null);
    setNote(null);
    shownRef.current = null;
  }, [tripId]);
  // The stored trip caught up with the tap: drop the override. (Not on any
  // change, or a later tap still saving would flick back to an earlier one.)
  useEffect(() => {
    if (stored !== null && stored === shownRef.current) {
      shownRef.current = null;
      setChosen(null);
    } else if (shownRef.current === null) {
      // Changed somewhere else (the trip screen): the old note no longer applies.
      setNote(null);
    }
  }, [stored]);

  const choose = useCallback(
    (v: Full, c: "business" | "personal") => {
      const current = shownRef.current ?? v.choice;
      if (current === c) return;
      trackHomeTap(c === "business" ? "classify_business" : "classify_personal", mode, state);
      haptic("selection");
      const seq = ++seqRef.current;
      const before = current;
      shownRef.current = c;
      setChosen(c);
      chainRef.current = chainRef.current.then(async () => {
        const result = await classifyTripFromHome(v.trip.id, c).catch((): ClassifyResult => "failed");
        if (result === "failed" || result === "missing") {
          if (seq === seqRef.current) {
            shownRef.current = before === v.choice ? null : before;
            setChosen(shownRef.current);
          }
          if (result === "missing") {
            Alert.alert("Trip not found", "This trip has been deleted or merged. Your trips list has the latest.");
            onChanged();
          } else {
            Alert.alert("Couldn't save that", "Try again in a moment.");
          }
          return;
        }
        if (seq !== seqRef.current) return;
        const label = c === "business" ? "Business" : "Personal";
        setNote(result === "queued" ? `Saved as ${label}. It will upload when you have signal.` : `Saved as ${label}`);
        AccessibilityInfo.announceForAccessibility(`Saved as ${label}`);
        onChanged();
      });
    },
    [mode, state, onChanged]
  );

  if (view.look === "none") return null;

  const openTrips = (target: "last_trip_footer") => {
    trackHomeTap(target, mode, state);
    router.navigate("/(tabs)/trips" as never);
  };

  if (view.look === "first") {
    return (
      <View style={s.card}>
        <View style={s.firstRow}>
          <View style={s.firstIcon}>
            <Ionicons name="car-outline" size={26} color={colors.text2} accessible={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.firstTitle} maxFontSizeMultiplier={fontScaleCap.heading} accessibilityRole="header">
              Your first trip
            </Text>
            <Text style={s.firstBody} maxFontSizeMultiplier={fontScaleCap.body}>
              Just drive. MileClear starts recording when you pass 15 mph.
            </Text>
          </View>
        </View>
        <View style={s.footerLine} />
        <Pressable
          onPress={() => {
            trackHomeTap("first_trip_add_past", mode, state);
            router.push({ pathname: "/trip-form", params: { mode: "manual" } } as never);
          }}
          style={s.linkRow}
          accessibilityRole="button"
          accessibilityLabel="Add a past trip"
        >
          <Text style={s.linkText} maxFontSizeMultiplier={fontScaleCap.body}>Add a past trip</Text>
        </Pressable>
      </View>
    );
  }

  const v = view;
  const shownChoice = chosen ?? v.choice;
  const mapSize = v.look === "full" ? 56 : 40;
  const mapAbove = fontScale > 1.3 && v.look === "full";
  const openTrip = () => {
    trackHomeTap("last_trip", mode, state);
    router.push(`/trip-form?id=${v.trip.id}` as never);
  };

  const map = (
    <MiniRoute
      route={v.trip.route}
      start={v.trip.startPoint}
      end={v.trip.endPoint}
      size={mapSize}
      dashed={v.trip.isManual && v.trip.route.length < 2}
    />
  );

  const chipEl = (
    <ChipView
      chip={v.chip}
      text={v.chipText}
      onPress={() => router.push("/sync-status" as never)}
    />
  );

  if (v.look === "compact") {
    const isBusiness = shownChoice === "business";
    return (
      <View style={s.card}>
        <Pressable
          onPress={openTrip}
          style={s.compactRow}
          accessibilityRole="button"
          accessibilityLabel={v.a11yLabel}
          accessibilityHint="Opens the trip"
        >
          {map}
          <View style={{ flex: 1 }}>
            <Text style={s.compactTitle} maxFontSizeMultiplier={fontScaleCap.body} numberOfLines={2}>
              {v.eyebrow}
            </Text>
          </View>
          {v.chip !== "synced" ? chipEl : null}
          <View style={[s.pill, isBusiness ? s.pillBusiness : s.pillPersonal]}>
            <Ionicons
              name={isBusiness ? "briefcase" : "person"}
              size={12}
              color={isBusiness ? colors.amber : colors.text1}
              accessible={false}
            />
            <Text style={[s.pillText, { color: isBusiness ? colors.amber : colors.text1 }]} maxFontSizeMultiplier={fontScaleCap.body}>
              {isBusiness ? "Business" : "Personal"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text3} accessible={false} />
        </Pressable>
        {v.footer ? <Footer footer={v.footer} onPress={() => openTrips("last_trip_footer")} /> : null}
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={mapAbove ? undefined : s.fullRow}>
        {mapAbove ? <View style={{ marginBottom: 10 }}>{map}</View> : null}
        <Pressable
          onPress={openTrip}
          style={mapAbove ? undefined : s.fullTop}
          accessibilityRole="button"
          accessibilityLabel={v.a11yLabel}
          accessibilityHint="Opens the trip"
        >
          {!mapAbove ? map : null}
          <View style={s.fullText}>
            <View style={s.eyebrowRow}>
              <Text style={s.eyebrow} maxFontSizeMultiplier={fontScaleCap.display} numberOfLines={2}>
                {v.eyebrow}
              </Text>
              {v.shiftChip ? (
                <View style={s.shiftChip}>
                  <Text style={s.shiftChipText} maxFontSizeMultiplier={fontScaleCap.body}>Shift</Text>
                </View>
              ) : null}
              {chipEl}
            </View>
            <Text style={s.route} maxFontSizeMultiplier={fontScaleCap.body} numberOfLines={2}>
              {v.route}
            </Text>
          </View>
        </Pressable>
      </View>
      {v.showChoice ? (
        <View style={s.choiceWrap}>
          <ChoiceControl
            choice={shownChoice}
            autoTag={v.showAutoTag && chosen === null}
            onChoose={(c) => choose(v, c)}
            label={`Classify trip, ${v.route}, ${v.eyebrow}`}
          />
          <Text style={s.note} accessibilityLiveRegion="polite" maxFontSizeMultiplier={fontScaleCap.body}>
            {note ?? " "}
          </Text>
        </View>
      ) : null}
      {v.footer ? <Footer footer={v.footer} onPress={() => openTrips("last_trip_footer")} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: 16,
  },
  fullRow: {},
  fullTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  fullText: { flex: 1 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  eyebrow: { fontSize: 12, fontFamily: fonts.semibold, color: colors.text2, flexShrink: 1, flexGrow: 1 },
  route: { marginTop: 4, fontSize: 16, lineHeight: 22, fontFamily: fonts.semibold, color: colors.text1 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4 },
  chipText: { fontSize: 12, fontFamily: fonts.semibold },
  shiftChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  shiftChipText: { fontSize: 11, fontFamily: fonts.semibold, color: colors.text2 },
  choiceWrap: { marginTop: 10 },
  track: {
    flexDirection: "row",
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
    padding: 2,
    gap: 2,
  },
  half: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  halfBusiness: { backgroundColor: colors.amber, borderColor: colors.amber },
  halfPersonal: { backgroundColor: colors.personal, borderColor: colors.personalEdge },
  halfText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  halfTextBusiness: { color: colors.bg, fontFamily: fonts.bold },
  halfTextPersonal: { color: colors.text1, fontFamily: fonts.bold },
  auto: { fontSize: 11, fontFamily: fonts.bold, color: colors.bg },
  note: { marginTop: 6, fontSize: 12, fontFamily: fonts.regular, color: colors.text2, minHeight: 16 },
  footerLine: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginTop: 12, marginHorizontal: -16 },
  footer: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: -8,
  },
  footerText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1, flex: 1 },
  compactRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 40 },
  compactTitle: { fontSize: 14, fontFamily: fonts.semibold, color: colors.text1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  pillBusiness: { backgroundColor: colors.amberDim },
  pillPersonal: { backgroundColor: colors.personal },
  pillText: { fontSize: 12, fontFamily: fonts.bold },
  firstRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  firstIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#191f2d",
    alignItems: "center",
    justifyContent: "center",
  },
  firstTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.text1 },
  firstBody: { marginTop: 4, fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.text2 },
  linkRow: { minHeight: 44, justifyContent: "center", marginBottom: -8 },
  linkText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.amber },
});
